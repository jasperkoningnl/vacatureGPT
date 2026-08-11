import { readFileSync } from "node:fs";
import { extractSalary } from "./shared/salary-parser";
import { activeForDiscoveredOccurrence } from "../vacancy-lifecycle";
import { describe, expect, it, vi } from "vitest";
import { discoverVillamedia, matchVillamediaOccurrence, parseOverview, parseVillamediaDetail, parseVillamediaHours, VILLAMEDIA_OVERVIEW_URL, type OverviewVacancy } from "./villamedia-parser";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const overview = parseOverview(fixture("villamedia-overview.html"));
const entry = (id: string) => overview.vacancies.find((item) => item.externalId === id)!;

describe("Villamedia parser", () => {
  it("leest overzichtsmetadata, relatieve URLs en paginering", () => {
    expect(overview.vacancies.length).toBeGreaterThan(3);
    expect(entry("233750")).toMatchObject({ sourceUrl: "https://www.villamedia.nl/vacatures/functie/regioverslaggever-achterhoek-1", title: "Regioverslaggever Achterhoek", employer: "Omroep Gelderland", city: "Arnhem" });
    expect(overview.nextUrl).toBe("https://www.villamedia.nl/vacatures/P25");
  });
  it("negeert ongeldige detailpaden en categorielabels", () => {
    const page = parseOverview(`<li class="vacature"><div class="txt"><h2><a href="/nieuws" data-entry_id="1">Nieuws</a></h2><p>Topvacatures, Werkgever, Utrecht</p></div></li>`);
    expect(page.vacancies).toHaveLength(0);
  });
  it("volgt pagina's, voorkomt loops en dedupliceert URL en extern ID", async () => {
    const first = `<li class="vacature"><div class="txt"><h2><a href="/vacatures/functie/a" data-entry_id="1">A</a></h2><p>Werkgever, Stad</p></div></li><a class="next" rel="next" href="/vacatures/P25">next</a>`;
    const second = `${first}<li class="vacature"><div class="txt"><h2><a href="/vacatures/functie/b" data-entry_id="1">B</a></h2><p>Ander, Stad</p></div></li><a class="next" rel="next" href="${VILLAMEDIA_OVERVIEW_URL}">loop</a>`;
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(String(url).endsWith("P25") ? second : first)) as unknown as typeof fetch;
    const result = await discoverVillamedia(fetcher);
    expect(result).toMatchObject({ overviewPagesFetched: 2 }); expect(result.entries).toHaveLength(1); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("weigert een leeg eerste overzicht veilig", async () => await expect(discoverVillamedia(async () => new Response("<html/>"))).rejects.toThrow("nul geldige"));

  it.each([
    ["villamedia-regioverslaggever.html", "233750", { title: "Regioverslaggever Achterhoek", employer: "Omroep Gelderland", hoursMin: 32, hoursMax: 36, salaryMin: 3450, salaryMax: 5057, salaryPeriod: "month" }],
    ["villamedia-online-marketeer.html", "233922", { title: "Online Marketeer", employer: "Rijksmuseum", hoursMin: 36, hoursMax: 36, salaryMin: 3768, salaryMax: 4897, salaryPeriod: "month", salaryBasisHours: 36 }],
    ["villamedia-junior-redacteur.html", "233899", { title: "Junior Redacteur Buitenland", employer: "ANP", hoursMin: null, hoursMax: null, salaryMin: null, salaryMax: null }],
  ])("parseert echte fixture %s", (file, id, expected) => {
    const result = parseVillamediaDetail(fixture(file), entry(id));
    expect(result).toMatchObject({ externalId: id, ...expected });
    expect(result.location).toMatch(id === "233750" ? /Arnhem/ : id === "233922" ? /Amsterdam/ : /Den Haag/);
    expect(result.deadline?.toISOString().slice(0, 10)).toBe(id === "233750" ? "2026-08-19" : id === "233922" ? "2026-08-05" : "2026-08-03");
    expect(result.originalText).not.toContain("Deel via Facebook");
  });
  it("verkiest Rijksmuseum boven VONQ en negeert vergoedingen", () => {
    const result = parseVillamediaDetail(fixture("villamedia-online-marketeer.html"), entry("233922"));
    expect(result.employer).toBe("Rijksmuseum"); expect(result.employer).not.toBe("VONQ BV"); expect(result.salaryMin).toBe(3768); expect(result.salaryOriginal).not.toMatch(/367[,.]50|0[,.]21/);
  });
  it("decodeert HTML-entiteiten in de vacaturetekst", () => expect(parseVillamediaDetail(fixture("villamedia-online-marketeer.html"), entry("233922")).originalText).toContain("digitaal & marketing"));
  it("parseert expliciete uren maar raadt dagen niet", () => {
    expect(parseVillamediaHours("een contract van 36 uur")).toMatchObject({ min: 36, max: 36 });
    expect(parseVillamediaHours("32 – 36 uur per week")).toMatchObject({ min: 32, max: 36 });
    expect(parseVillamediaHours("vier of vijf dagen per week")).toEqual({ min: null, max: null, original: "vier of vijf dagen per week" });
  });
  it("kiest een precieze salariszin en rondt centen", () => expect(extractSalary(["€ 3.768 - € 4.897 per maand", "Het salaris bedraagt € 3.768,00 tot € 4.897,00 bij 36 uur", "reiskostenvergoeding € 367,50"])).toMatchObject({ min: 3768, max: 4897, basisHours: 36 }));
  it.each([
    ["villamedia-zakelijk-medewerker-productiehuis.html", "zakelijk-medewerker-productiehuis-9dw2", { status: "numeric", salaryMin: 3075, salaryMax: 3610, salaryPeriod: "month", salaryBasisHours: null, isStage: false }],
    ["villamedia-directeur-bestuurder-omr.html", "directeur-bestuurder-omr-lekstroom", { status: "none", salaryMin: null, salaryMax: null, salaryOriginal: null, isStage: false }],
    ["villamedia-stage-creatieve-student.html", "stage-creatieve-student-journalistiek-0d2", { status: "none", salaryMin: null, salaryMax: null, isStage: true }],
    ["villamedia-buitenlandredacteuren.html", "buitenlandredacteuren-algemeen-en-midden-oosten", { status: "numeric", salaryMin: 3449, salaryMax: 5056, salaryPeriod: "month", isStage: false }],
    ["villamedia-hoofdredacteur-centraal.html", "hoofdredacteur-centraal", { status: "qualitative", salaryMin: null, salaryMax: null, isStage: false }],
  ])("regressie voor live fixture %s", (file, slug, expected) => {
    const sourceUrl = `https://www.villamedia.nl/vacatures/functie/${slug}`;
    const result = parseVillamediaDetail(fixture(file), { sourceUrl, title: "", employer: "", city: null });
    const { status, ...fields } = expected;
    expect(result).toMatchObject(fields);
    expect((result.rawData as { extracted: { salaryStatus: string } }).extracted.salaryStatus).toBe(status);
    if (expected.isStage) expect(activeForDiscoveredOccurrence(result)).toBe(false);
    if (expected.status === "qualitative") {
      expect(result.salaryOriginal).toContain("Salaris afhankelijk van kennis");
      expect(result.salaryOriginal).toContain("Salarisindicatie: Arbeidsvoorwaarden");
    }
    if (slug.startsWith("zakelijk")) expect(result.salaryOriginal).toContain("op basis van fulltime");
    if (slug.startsWith("buitenland")) expect(result.salaryOriginal).not.toContain("€52");
  });

  it("matcht veilig in identiteitsvolgorde en een rerun blijft dezelfde vacature", () => {
    const item = { externalId: "42", sourceUrl: "https://www.villamedia.nl/vacatures/functie/nieuw", canonicalKey: "new" };
    const rows = [{ externalId: "42", sourceUrl: "https://www.villamedia.nl/vacatures/functie/oud", vacancyId: 7, canonicalKey: "old" }];
    expect(matchVillamediaOccurrence(item, rows)?.vacancyId).toBe(7); expect(matchVillamediaOccurrence(item, rows)?.vacancyId).toBe(7);
  });
  it("gebruikt zichtbare overzichtswerkgever ook bij langere JSON-LD naam", () => {
    const meta: OverviewVacancy = { ...entry("233899"), employer: "ANP" };
    expect(parseVillamediaDetail(fixture("villamedia-junior-redacteur.html"), meta).employer).toBe("ANP");
  });
});
