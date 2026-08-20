import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { and } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildVacancyListConditions, dedupeVacancyRows, parseVacancyListFilters, resolveSourceFilter, showsRejected, type VacancyListFilters } from "./vacancy-list";

const dialect = new PgDialect();
const toSql = (filters: Partial<VacancyListFilters>) => dialect.sqlToQuery(and(...buildVacancyListConditions({ sort: "newest", ...filters }))!);

const row = (id: number, url: string, source: string) => ({
  id, url, source, title: `Vacature ${id}`, employer: "NPO", location: "Hilversum",
  hoursMin: 32, hoursMax: 36, salaryMin: null, salaryMax: null, salaryOriginal: null,
  deadline: null, feedback: null, aiScore: null, aiVerdict: null,
});

describe("dedupeVacancyRows", () => {
  it("toont een vacature met meerdere actieve vindplaatsen precies één keer", () => {
    const items = dedupeVacancyRows([
      row(1, "https://villamedia.nl/vacature/1", "Villamedia"),
      row(1, "https://npo.nl/vacature/1", "Claude discovery"),
      row(2, "https://villamedia.nl/vacature/2", "Villamedia"),
    ]);
    expect(items.map((item) => item.id)).toEqual([1, 2]);
    expect(items[0].occurrences).toEqual([
      { url: "https://villamedia.nl/vacature/1", source: "Villamedia" },
      { url: "https://npo.nl/vacature/1", source: "Claude discovery" },
    ]);
  });

  it("telt unieke vacatures in plaats van vindplaatsen", () => {
    const rows = [
      row(1, "https://a.nl/1", "Villamedia"),
      row(1, "https://b.nl/1", "Claude discovery"),
      row(1, "https://c.nl/1", "OneWorld"),
      row(2, "https://a.nl/2", "Villamedia"),
    ];
    expect(rows).toHaveLength(4);
    expect(dedupeVacancyRows(rows)).toHaveLength(2);
  });

  it("bewaart de volgorde van de query en ontdubbelt identieke vindplaatsen", () => {
    const items = dedupeVacancyRows([row(9, "https://a.nl/9", "Villamedia"), row(3, "https://a.nl/3", "OneWorld"), row(9, "https://a.nl/9", "Villamedia")]);
    expect(items.map((item) => item.id)).toEqual([9, 3]);
    expect(items[0].occurrences).toHaveLength(1);
  });

  it("laat de overige vacaturevelden ongemoeid", () => {
    const [item] = dedupeVacancyRows([row(1, "https://a.nl/1", "Villamedia")]);
    expect(item.title).toBe("Vacature 1");
    expect(item.employer).toBe("NPO");
  });
});

describe("parseVacancyListFilters", () => {
  it("laat geldige filters ongewijzigd door", () => {
    expect(parseVacancyListFilters({ city: "Amsterdam", employer: "NPO", source: "villamedia", salary: "known", feedback: "interesting", ai: "promising", sort: "ai-score", page: "1" }))
      .toEqual({ query: undefined, city: "Amsterdam", employer: "NPO", source: "villamedia", salary: "known", feedback: "interesting", ai: "promising", rejected: undefined, sort: "ai-score", page: 1 });
  });

  it("accepteert de bijzondere waarden unreviewed en unassessed", () => {
    const filters = parseVacancyListFilters({ feedback: "unreviewed", ai: "unassessed" });
    expect(filters.feedback).toBe("unreviewed");
    expect(filters.ai).toBe("unassessed");
  });

  it("valt bij onbekende feedback- en ai-waarden terug op geen filter", () => {
    const filters = parseVacancyListFilters({ feedback: "xyz", ai: "'; drop table vacancies; --" });
    expect(filters.feedback).toBeUndefined();
    expect(filters.ai).toBeUndefined();
  });

  it("valt bij een onbekende sortering en salarisfilter terug op de standaard", () => {
    const filters = parseVacancyListFilters({ sort: "random", salary: "misschien" });
    expect(filters.sort).toBe("newest");
    expect(filters.salary).toBeUndefined();
  });

  it("negeert lege waarden en gebruikt de eerste waarde van herhaalde parameters", () => {
    const filters = parseVacancyListFilters({ city: "  ", employer: ["Villamedia", "NPO"], feedback: ["maybe", "xyz"] });
    expect(filters.city).toBeUndefined();
    expect(filters.employer).toBe("Villamedia");
    expect(filters.feedback).toBe("maybe");
  });

  it("werkt zonder searchParams", () => {
    expect(parseVacancyListFilters({})).toEqual({ city: undefined, employer: undefined, source: undefined, salary: undefined, feedback: undefined, ai: undefined, sort: "newest", query: undefined, page: 1 });
  });
});

describe("resolveSourceFilter", () => {
  it("houdt een bestaande bronslug vast en negeert een onbekende", () => {
    expect(resolveSourceFilter("villamedia", ["villamedia", "oneworld"])).toBe("villamedia");
    expect(resolveSourceFilter("verzonnen", ["villamedia", "oneworld"])).toBeUndefined();
  });
});

describe("buildVacancyListConditions", () => {
  it("filtert altijd op actieve vacatures en legt afgewezen vacatures standaard weg", () => {
    expect(toSql({}).sql).toContain('"vacancies"."active" = $1');
    expect(toSql({}).params).toEqual([true, "not_suitable"]);
  });

  it("vertaalt geldige filters naar de verwachte condities", () => {
    const promising = toSql({ ai: "promising" });
    expect(promising.sql).toContain('"ai_assessments"."verdict" in');
    expect(promising.params).toEqual([true, "not_suitable", "interesting", "maybe"]);
    const reviewed = toSql({ feedback: "not_suitable", salary: "known", city: "Utrecht", source: "villamedia" });
    expect(reviewed.params).toEqual([true, "%Utrecht%", "villamedia", "not_suitable"]);
    expect(reviewed.sql).toContain('"vacancies"."salary_min" is not null');
    expect(toSql({ feedback: "unreviewed", ai: "unassessed" }).sql).toContain('"feedback"."id" is null');
  });

  it("stuurt onbekende filterwaarden nooit door naar Postgres", () => {
    const query = toSql(parseVacancyListFilters({ feedback: "xyz", ai: "kaboom", rejected: "kapot" }));
    expect(query.params).toEqual([true, "not_suitable"]);
    expect(query.sql).not.toContain("verdict");
    expect(query.sql).not.toContain('"feedback"."value" = ');
  });
});

describe("/vacatures gebruikt de gevalideerde querylaag", () => {
  const page = readFileSync("app/vacatures/page.tsx", "utf8");
  it("bouwt de query met de gedeelde helpers en telt ontdubbelde vacatures", () => {
    expect(page).toContain("queryVacancyList(getDb(), await searchParams)");
    expect(page).toContain("{total}");
    expect(page).not.toContain("as keyof typeof verdictLabels");
  });
  it("toont alle vindplaatsen van dezelfde vacature", () => {
    expect(page).toContain("r.occurrences.map");
  });
});

describe("parseVacancyListFilters is crashbestendig", () => {
  it("valt terug op de standaardfilters bij onbruikbare invoer", () => {
    const filters = parseVacancyListFilters({ city: 42, feedback: { value: "interesting" } } as unknown as Record<string, string | string[] | undefined>);
    expect(filters).toEqual({ city: undefined, employer: undefined, source: undefined, salary: undefined, feedback: undefined, ai: undefined, sort: "newest", query: undefined, page: 1 });
  });
});

describe("afgewezen vacatures staan standaard buiten de lijst", () => {
  it("sluit 'niet passend' uit zolang je er niet zelf om vraagt", () => {
    const { sql } = toSql({});
    expect(sql).toContain('"feedback"."value" is null or "feedback"."value" <> $');
  });

  it("laat ze terugkomen met de expliciete schakelaar", () => {
    expect(showsRejected({ rejected: "show" })).toBe(true);
    expect(toSql({ rejected: "show" }).sql).not.toContain('"feedback"."value" <>');
  });

  it("laat ze ook terugkomen als je er expliciet op filtert", () => {
    expect(showsRejected({ feedback: "not_suitable" })).toBe(true);
    expect(toSql({ feedback: "not_suitable" }).sql).not.toContain('"feedback"."value" <>');
  });

  it("blijft ze verbergen bij elk ander oordeelfilter", () => {
    for (const feedback of ["unreviewed", "interesting", "maybe"] as const) {
      expect(showsRejected({ feedback })).toBe(false);
      expect(toSql({ feedback }).sql).toContain('"feedback"."value" <>');
    }
  });

  it("accepteert alleen de waarde 'show' en negeert gerommel in de queryparameter", () => {
    expect(parseVacancyListFilters({ rejected: "show" }).rejected).toBe("show");
    expect(parseVacancyListFilters({ rejected: "true" }).rejected).toBeUndefined();
    expect(parseVacancyListFilters({ rejected: "'; drop table feedback; --" }).rejected).toBeUndefined();
  });
});


describe("vrije tekstzoek en paginering", () => {
  it("valideert zoektekst en positieve paginanummers", () => { expect(parseVacancyListFilters({ query: "  hoofdredacteur ", page: "3" })).toMatchObject({ query: "hoofdredacteur", page: 3 }); expect(parseVacancyListFilters({ page: "-1" }).page).toBe(1); });
  it("zoekt in titel, werkgever, beschrijving en oorspronkelijke tekst", () => { const query=toSql({ query: "cultuur" }); expect(query.sql.match(/ilike/g)).toHaveLength(4); expect(query.params.filter((x) => x === "%cultuur%")).toHaveLength(4); });
});
