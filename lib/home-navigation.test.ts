import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { funnelLinks, isActivePath, manageLinks } from "./site-navigation";
import { funnelTerms } from "./funnel-terms";

const home = readFileSync("app/page.tsx", "utf8");
const nav = readFileSync("app/components/site-nav.tsx", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const list = readFileSync("app/vacatures/page.tsx", "utf8");

describe("primary vacancy review navigation", () => {
  it("starts the quick review flow from the homepage primary CTA", () => {
    expect(home).toMatch(/className="button button-large" href="\/kalibreren">Beoordeel \{CALIBRATION_BATCH_SIZE\} vacatures<\/Link>/);
    expect(home).toContain("die je nog niet beoordeelde");
  });

  it("volgt de funnel: beoordelen, mijn selectie, shortlist", () => {
    expect(funnelLinks.map(({ href }) => href)).toEqual(["/kalibreren", "/", "/shortlist"]);
    expect(funnelLinks.map(({ label }) => label)).toEqual(["Beoordelen", "Mijn selectie", "Shortlist"]);
  });

  it("zet beheerfuncties apart in een tweede, secundaire groep", () => {
    expect(manageLinks.map(({ href }) => href)).toEqual(["/vacatures", "/voorkeuren", "/bronnen"]);
    expect(nav).toContain('className="nav-group nav-manage"');
    expect(nav).toContain('className="nav-secondary"');
    expect(nav).toContain('<span className="nav-group-label" aria-hidden="true">Beheer</span>');
  });

  it("markeert de actieve pagina visueel én voor een schermlezer", () => {
    expect(nav).toContain('aria-current={active ? "page" : undefined}');
    expect(nav).toContain('active ? "nav-active" : undefined');
    expect(readFileSync("app/globals.css", "utf8")).toContain("nav a.nav-active");
  });

  it("laat alleen de homepage actief zijn op '/' en subroutes op hun eigen tak", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/vacatures", "/")).toBe(false);
    expect(isActivePath("/vacatures/12", "/vacatures")).toBe(true);
    expect(isActivePath("/vacatures", "/vacatures")).toBe(true);
    expect(isActivePath("/vacaturesXL", "/vacatures")).toBe(false);
    expect(isActivePath("/shortlist", "/kalibreren")).toBe(false);
  });

  it("maakt sollicitatiestatus bereikbaar vanuit shortlist en selectie", () => {
    const shortlist = readFileSync("app/shortlist/page.tsx", "utf8");
    expect(home).toContain('href="/shortlist">Bekijk hele shortlist →</Link>');
    expect(shortlist).toContain("Sollicitatiestatus bijwerken →");
    expect(shortlist).toContain("Open een vacature om de sollicitatiestatus bij te werken.");
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
    for (const source of [home, list, readFileSync("app/kalibreren/calibration-flow.tsx", "utf8")]) {
      expect(source.toLowerCase()).not.toContain("te beoordelen");
    }
  });

  it("telt de twee homepage-metrics met verschillende namen en verschillende filters", () => {
    expect(home).toContain("<span>{funnelTerms.unreviewed.label}</span><strong>{unreviewedCount.n}</strong>");
    expect(home).toContain("<span>{funnelTerms.promising.label}</span><strong>{promisingCount.n}</strong>");
    expect(home).toContain("const unreviewedFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected);");
    expect(home).toContain("const promisingFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected, inArray(aiAssessments.verdict, promisingAiVerdicts));");
  });

  it("legt uit waar de kalibratiebatch vandaan komt, inclusief de niet-kansrijke kant", () => {
    expect(home).toContain("{funnelTerms.calibrationBatch.label} uit de {unreviewedCount.n}");
    expect(funnelTerms.calibrationBatch.description).toContain("niet-kansrijke kant");
  });

  it("gebruikt dezelfde begrippen in de filters van Alle vacatures", () => {
    expect(list).toContain('<option value="unreviewed">{funnelTerms.unreviewed.label}</option>');
    expect(list).toContain('<option value="promising">{funnelTerms.promising.label}</option>');
  });
});

describe("toegankelijkheid van het raamwerk", () => {
  it("biedt een skip-link naar de hoofdinhoud", () => {
    expect(layout).toContain('<a className="skip-link" href="#hoofdinhoud">Naar de hoofdinhoud</a>');
    expect(layout).toContain('id="hoofdinhoud"');
    expect(readFileSync("app/globals.css", "utf8")).toContain(".skip-link:focus{left:0}");
  });

  it("geeft de navigatie een semantische nav met een naam", () => {
    expect(nav).toContain('<nav className="shell site-nav" aria-label="Hoofdnavigatie">');
  });

  it("labelt elk filter in plaats van alleen een placeholder te tonen", () => {
    expect(list.match(/className="filter-field"/g)?.length).toBe(7);
    expect(list).toContain('<label className="filter-toggle">');
    expect(list).not.toMatch(/<input name="city" placeholder="Stad"\/>/);
  });

  it("geeft de tabel een caption en scope op elke kop", () => {
    expect(list).toContain('<caption className="sr-only">');
    expect(list.match(/scope="col"/g)?.length).toBe(7);
    expect(list).toContain('<th scope="row">');
  });

  it("behoudt de bestaande focus-states", () => {
    expect(readFileSync("app/globals.css", "utf8")).toContain(":focus-visible");
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
    for (const file of ["app/page.tsx", "app/vacatures/page.tsx", "app/shortlist/page.tsx", "app/layout.tsx", "app/components/site-nav.tsx", "app/voorkeuren/page.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("Jasper");
    }
    expect(home).toContain("Jouw oordeel: Interessant");
    expect(list).toContain("<span>Jouw oordeel</span>");
  });
});
