import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REVIEW_ROUTE, funnelLinks, isActivePath, manageLinks } from "./site-navigation";
import { funnelTerms } from "./funnel-terms";
import { activePresetKey, listPresets, parseVacancyListFilters, presetSearch } from "./vacancy-list";

const home = readFileSync("app/page.tsx", "utf8");
const nav = readFileSync("app/components/site-nav.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const list = readFileSync("app/vacatures/page.tsx", "utf8");
const shortlist = readFileSync("app/shortlist/page.tsx", "utf8");
const digest = readFileSync("lib/email/weekly-digest.ts", "utf8");

describe("de weekroutine is de hoofdweg door de app", () => {
  it("volgt de routine: deze week, beoordelen, shortlist, zelf bladeren", () => {
    expect(funnelLinks.map(({ href }) => href)).toEqual(["/", REVIEW_ROUTE, "/shortlist", "/vacatures"]);
    expect(funnelLinks.map(({ label }) => label)).toEqual(["Deze week", "Beoordelen", "Shortlist", "Alle vacatures"]);
  });

  it("zet de blinde test en het beheer apart in een tweede, secundaire groep", () => {
    expect(manageLinks.map(({ href }) => href)).toEqual(["/kalibreren", "/voorkeuren", "/bronnen"]);
    expect(manageLinks[0].label).toBe("Blinde test");
    expect(nav).toContain('className="nav-group nav-manage"');
    expect(nav).toContain('className="nav-secondary"');
    expect(nav).toContain('<span className="nav-group-label" aria-hidden="true">Beheer</span>');
  });

  it("laat de weekpagina, de weekmail en de navigatie naar dezelfde beoordeelroute wijzen", () => {
    expect(REVIEW_ROUTE).toBe("/beoordelen");
    expect(existsSync("app/beoordelen/page.tsx")).toBe(true);
    expect(home).toContain('href={REVIEW_ROUTE}>{tips === 0 ? "Toch iets beoordelen" : "Beoordeel ze één voor één"}</Link>');
    expect(home).toContain("Zelfde stapel als in je weekmail");
    expect(digest).toContain("${root}/beoordelen");
    expect(digest).toContain("Beoordeel ze één voor één");
  });

  it("markeert de actieve pagina visueel én voor een schermlezer", () => {
    expect(nav).toContain('aria-current={active ? "page" : undefined}');
    expect(nav).toContain('active ? "nav-active" : undefined');
    expect(readFileSync("app/styles/layout.css", "utf8")).toContain(".site-nav a.nav-active");
  });

  it("laat alleen de homepage actief zijn op '/' en subroutes op hun eigen tak", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/vacatures", "/")).toBe(false);
    expect(isActivePath("/vacatures/12", "/vacatures")).toBe(true);
    expect(isActivePath("/vacatures", "/vacatures")).toBe(true);
    expect(isActivePath("/vacaturesXL", "/vacatures")).toBe(false);
    expect(isActivePath("/shortlist", REVIEW_ROUTE)).toBe(false);
  });

  it("laat de sollicitatiestatus op de shortlist zelf bijwerken", () => {
    expect(home).toContain('href="/shortlist">Bekijk hele shortlist →</Link>');
    expect(shortlist).toContain("<StatusControl vacancyId={row.id} current={row.applicationStatus}/>");
    expect(shortlist).toContain("Werk de status hier direct bij.");
    expect(readFileSync("app/shortlist/shortlist-controls.tsx", "utf8")).toContain("updateApplicationStatus");
  });

  it("laat de weekpagina naar dezelfde ingang linken die de lijst als actief herkent", () => {
    expect(home).toContain('const passedOver = `/vacatures${presetSearch(listPresets.find(({ key }) => key === "passed-over")!)}`;');
    expect(home).toContain("href={passedOver}>Bekijk wat de AI wegliet →</Link>");
    expect(activePresetKey(parseVacancyListFilters(Object.fromEntries(new URLSearchParams(presetSearch(listPresets.find(({ key }) => key === "passed-over")!).slice(1)))))).toBe("passed-over");
  });

  it("biedt vanuit de lijst dezelfde beoordeelroute aan voor één zelfgekozen vacature", () => {
    expect(list).toContain("href={`${REVIEW_ROUTE}?ids=${r.id}`}");
    expect(list).toContain('{r.feedback ? "Opnieuw beoordelen" : "Beoordelen"}');
  });
});

describe('"te beoordelen" betekent overal hetzelfde', () => {
  it("gebruikt drie onderscheiden begrippen in plaats van één dubbelzinnige term", () => {
    expect(funnelTerms.unreviewed.label).toBe("Nog niet beoordeeld");
    expect(funnelTerms.promising.label).toBe("Kansrijk volgens AI");
    expect(funnelTerms.calibrationBatch.label).toBe("Kalibratiebatch van 5");
    expect(new Set(Object.values(funnelTerms).map(({ label }) => label)).size).toBe(Object.keys(funnelTerms).length);
  });

  it("laat geen enkele pagina nog 'te beoordelen' als teller of kop gebruiken", () => {
    for (const source of [home, list, readFileSync("app/kalibreren/calibration-flow.tsx", "utf8"), readFileSync("app/beoordelen/review-queue.tsx", "utf8")]) {
      expect(source.toLowerCase()).not.toContain("te beoordelen");
    }
  });

  it("telt de drie weekmetrics met verschillende namen en verschillende filters", () => {
    expect(home).toContain("<span>{funnelTerms.promising.label}</span><strong>{tips}</strong>");
    expect(home).toContain("<span>Op shortlist</span><strong>{shortlistCount.n}</strong>");
    expect(home).toContain("<span>Bewaard voor later</span><strong>{maybeCount.n}</strong>");
    expect(home).toContain("const unreviewedFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected);");
    expect(home).toContain("const promisingFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected, inArray(aiAssessments.verdict, promisingAiVerdicts));");
    expect(home).toContain('const maybeFilter = and(eq(vacancies.active, true), eq(feedback.value, "maybe"));');
  });

  it("gebruikt dezelfde begrippen in de filters van Alle vacatures", () => {
    expect(list).toContain('<option value="unreviewed">{funnelTerms.unreviewed.label}</option>');
    expect(list).toContain('<option value="promising">{funnelTerms.promising.label}</option>');
  });
});

describe("toegankelijkheid van het raamwerk", () => {
  const css = ["tokens", "base", "layout", "components", "review", "pages"].map((name) => readFileSync(`app/styles/${name}.css`, "utf8")).join("\n");

  it("biedt een skip-link naar de hoofdinhoud", () => {
    expect(layout).toContain('<a className="skip-link" href="#hoofdinhoud">Naar de hoofdinhoud</a>');
    expect(layout).toContain('id="hoofdinhoud"');
    expect(css).toMatch(/\.skip-link:focus \{ left: 0; \}/);
  });

  it("geeft de navigatie een semantische nav met een naam", () => {
    expect(nav).toContain('<nav className="shell site-nav" aria-label="Hoofdnavigatie">');
    expect(list).toContain('<nav className="preset-bar" aria-label="Snelle ingangen">');
  });

  it("labelt elk filter in plaats van alleen een placeholder te tonen", () => {
    expect(list.match(/className="filter-field"/g)?.length).toBe(8);
    expect(list).toContain('<label className="filter-toggle">');
    expect(list).not.toMatch(/<input name="city" placeholder="Stad"\/>/);
  });

  it("geeft de tabel een caption en scope op elke kop", () => {
    expect(list).toContain('<caption className="sr-only">');
    expect(list.match(/scope="col"/g)?.length).toBe(6);
    expect(list).toContain('<th scope="row">');
  });

  it("geeft de beoordeelrij progressbar-semantiek en een benoemde knopgroep", () => {
    const queue = readFileSync("app/beoordelen/review-queue.tsx", "utf8");
    expect(queue).toContain('role="progressbar"');
    expect(queue).toContain("aria-valuenow={index + 1}");
    expect(queue).toContain('role="group" aria-label="Jouw oordeel over deze vacature"');
    expect(queue).toContain('<legend className="sr-only">Reden voor je afwijkende oordeel</legend>');
  });

  it("behoudt de focus-states en definieert ze op één plek", () => {
    expect(css).toContain(":focus-visible");
    expect(readFileSync("app/globals.css", "utf8")).toContain('@import "./styles/base.css";');
  });
});

describe("basisroutes voor laden, fouten en niet gevonden", () => {
  it("levert een loading-, error- en not-found-route", () => {
    for (const file of ["app/loading.tsx", "app/error.tsx", "app/not-found.tsx"]) expect(existsSync(file)).toBe(true);
    expect(readFileSync("app/error.tsx", "utf8")).toContain('"use client"');
    expect(readFileSync("app/error.tsx", "utf8")).toContain("reset");
    expect(readFileSync("app/not-found.tsx", "utf8")).toContain("Deze pagina bestaat niet");
  });
});

describe("geen hardgecodeerde naam in generieke interfacetekst", () => {
  it("noemt de gebruiker nergens meer bij naam in de UI-copy", () => {
    for (const file of ["app/page.tsx", "app/vacatures/page.tsx", "app/shortlist/page.tsx", "app/layout.tsx", "app/components/site-nav.tsx", "app/voorkeuren/page.tsx", "app/beoordelen/review-queue.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("Jasper");
    }
    expect(list).toContain("<span>Jouw oordeel</span>");
  });
});
