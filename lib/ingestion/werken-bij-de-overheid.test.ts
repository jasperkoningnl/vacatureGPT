import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canonicalKey, discoverAsyncComponentUrls, discoverOverheid, mergeReliable, parseOverheidDetail, parseOverheidResults } from "./werken-bij-de-overheid-parser";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const entry = (sourceUrl: string) => ({ sourceUrl });

describe("Werken bij de Overheid parser", () => {
  it("leest de gegenereerde async-componentendpoint uit het echte overzicht en behoudt CSD.02", () => {
    const urls = discoverAsyncComponentUrls(fixture("werken-bij-de-overheid-overview.html"));
    expect(urls).toHaveLength(2); expect(urls[0]).toContain("_hn%3Atype=component-rendering"); expect(urls[0]).toContain("dienstverband=CSD.02");
  });

  it("ontdekt paginering dynamisch, filtert op CSD.02 en dedupliceert URLs", async () => {
    const card = `<ul id="vacancies-list"><li><h2 class="vacancy__title"><a href="/vacatures/test-ABC-1">Test</a></h2></li></ul>`;
    const component = `${card}<nav aria-label="Paginering navigatie"><a href="/vacatures?pagina=3&amp;dienstverband=CSD.02">3</a><a href="/vacatures?pagina=99&amp;dienstverband=OTHER">99</a></nav>`;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input); if (!url.includes("component-rendering")) return new Response(fixture("werken-bij-de-overheid-overview.html"));
      if (url.includes("r20_r1_r8")) return new Response(""); return new Response(component);
    }) as unknown as typeof fetch;
    const result = await discoverOverheid(fetcher);
    expect(result.entries).toHaveLength(1); expect(result.pagesFetched).toBe(4); expect(fetcher).toHaveBeenCalledTimes(4);
    for (const call of (fetcher as ReturnType<typeof vi.fn>).mock.calls.slice(1)) expect(String(call[0])).toContain("dienstverband=CSD.02");
    expect(parseOverheidResults(component).totalPages).toBe(3);
  });

  it.each([
    ["werken-bij-de-overheid-senior-communicatieadviseur.html", "https://www.werkenbijdeoverheid.nl/vacatures/senior-communicatieadviseur-WHD-2026-0001", { title: "Senior Communicatieadviseur", employer: "Waterschap Hollandse Delta", location: "Ridderkerk", hoursMin: 32, hoursMax: 32, salaryMin: 3685, salaryMax: 5145, salaryPeriod: "month", salaryBasisHours: null, deadline: null, externalId: "TICC-WH-100" }],
    ["werken-bij-de-overheid-digitale-informatiehuishouding.html", "https://www.werkenbijdeoverheid.nl/vacatures/junior-medewerker-digitale-informatiehuishouding-TK-2026-0002", { title: "(Junior) Medewerker Digitale Informatiehuishouding", employer: "Tweede Kamer der Staten Generaal", location: "Den Haag", hoursMin: 36, hoursMax: 36, salaryMin: 3334, salaryMax: 4458, salaryPeriod: "month", salaryBasisHours: 36, deadline: "2026-08-17", externalId: "TICC-TK-200" }],
    ["werken-bij-de-overheid-woordvoerder-knaw.html", "https://www.werkenbijdeoverheid.nl/vacatures/woordvoerder-communicatieadviseur-akademie-van-kunsten-KNAW-2026-0003", { title: "Woordvoerder/communicatieadviseur Akademie van Kunsten - Bureau - KNAW", employer: "KNAW", location: "Amsterdam", hoursMin: 30, hoursMax: 30, salaryMin: 4728, salaryMax: 6433, salaryPeriod: "month", salaryBasisHours: null, deadline: null, externalId: "KNAW-300" }],
  ])("parseert fixture %s", (file, url, expected) => {
    const result = parseOverheidDetail(fixture(file), entry(url)); const deadline = result.deadline?.toISOString().slice(0, 10) ?? null;
    expect({ ...result, deadline }).toMatchObject(expected); expect(result.salaryOriginal).not.toMatch(/6\.000|21%|vakantiegeld|eindejaarsuitkering|vergoeding/i);
  });

  it("kiest TICC, dan vacaturenummer en ten slotte canonical URL als externe ID", () => {
    const html = fixture("werken-bij-de-overheid-digitale-informatiehuishouding.html"); const url = "https://www.werkenbijdeoverheid.nl/vacatures/junior-medewerker-digitale-informatiehuishouding-TK-2026-0002";
    expect(parseOverheidDetail(html, entry(url)).externalId).toBe("TICC-TK-200");
    expect(parseOverheidDetail(html.replace("'TICC-nummer': 'TICC-TK-200'", "'TICC-nummer': ''"), entry(url)).externalId).toBe("TK-200");
    expect(parseOverheidDetail(html.replace("'TICC-nummer': 'TICC-TK-200'", "'TICC-nummer': ''").replace("'Vacaturenummer': 'TK-200'", "'Vacaturenummer': ''"), entry(url)).externalId).toBe(url);
  });

  it("gebruikt dezelfde conservatieve canonical match en vult alleen null-velden aan", () => {
    expect(canonicalKey("Online Marketeer", "Rijksmuseum", "Amsterdam")).toBe(canonicalKey("Online Marketeer", "Rijksmuseum", "Amsterdam"));
    expect(mergeReliable({ salaryMin: null, location: "Amsterdam", firstSeenAt: "old", feedback: "interesting" }, { salaryMin: 3000, location: null, firstSeenAt: "new", feedback: null }))
      .toEqual({ salaryMin: 3000 });
  });
});
