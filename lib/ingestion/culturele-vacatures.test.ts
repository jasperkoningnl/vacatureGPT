import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { discoverCulturele, mergeReliable, parseCultureleDetail, parseCultureleOverview } from "./culturele-vacatures-parser";
import { parseOverview as parseVillamediaOverview, parseVillamediaDetail } from "./villamedia-parser";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const overview = parseCultureleOverview(fixture("culturele-vacatures-overview.html"));
const byTitle = (title: string) => overview.vacancies.find((item) => item.title === title)!;
const rijksmuseumOverview = { sourceUrl: "https://www.culturele-vacatures.nl/2026/08/rijksmuseum-online-marketeer/", title: "Online Marketeer", employer: "Rijksmuseum", location: "Amsterdam",
  hoursMin: 36, hoursMax: 36, hoursOriginal: "36 uur", deadline: new Date("2026-08-09T00:00:00Z"), vacancyTypes: ["Betaalde functie", "Fulltime"], isPaid: true };

describe("Culturele Vacatures parser", () => {
  it("leest de echte FacetWP-configuratie en gestructureerde samenvattingen", () => {
    expect(overview.totalPages).toBe(37);
    expect(byTitle("Redacteur Levensbeschouwing")).toMatchObject({ employer: "NTR", location: "Hilversum", hoursMin: 32, hoursMax: 32, isPaid: true });
    expect(byTitle("Interim-adviseur Marketing & Communicatie").vacancyTypes).toContain("Freelance/ZZP");
  });

  it("haalt het dynamische aantal pagina's op en dedupliceert URLs", async () => {
    const resultHtml = `<div class="facetwp-template"><div class="fwpl-result"><h3 class="entry-title"><a href="https://www.culturele-vacatures.nl/2026/08/a/">A: B</a></h3><div class="fwpl-item el-d5z59j">A in Utrecht zoekt een B voor 32 uur per week | Vacature voor een Betaalde functie | Sluitingsdatum: 12-08-2026</div></div></div>`;
    const page = (number: number) => `${resultHtml}<script>window.FWP_JSON = {"preload_data":{"settings":{"pager":{"page":${number},"total_pages":3}}}};</script>`;
    const fetcher = vi.fn(async (url: string | URL | Request) => new Response(page(Number(new URL(String(url)).searchParams.get("fwp_paged") ?? 1)))) as unknown as typeof fetch;
    const result = await discoverCulturele(fetcher);
    expect(result).toMatchObject({ overviewPagesFetched: 3 }); expect(result.entries).toHaveLength(1); expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["culturele-vacatures-ntr.html", "Redacteur Levensbeschouwing", { employer: "NTR", location: "Hilversum", hoursMin: 32, hoursMax: 32, salaryMin: 3033, salaryMax: 4241, salaryPeriod: "month", salaryBasisHours: null, deadline: "2026-08-12" }],
    ["culturele-vacatures-westland.html", "Interim-adviseur Marketing & Communicatie", { employer: "Westland Cultuurweb", location: "Naaldwijk", hoursMin: 24, hoursMax: 24, salaryMin: null, salaryMax: 4888, salaryPeriod: "month", salaryBasisHours: 36, deadline: "2026-08-23" }],
    ["culturele-vacatures-rijksmuseum.html", "Online Marketeer", { employer: "Rijksmuseum", location: "Amsterdam", hoursMin: 36, hoursMax: 36, salaryMin: 3768, salaryMax: 4897, salaryPeriod: "month", salaryBasisHours: 36, deadline: "2026-08-09" }],
  ])("parseert fixture %s", (file, title, expected) => {
    const result = parseCultureleDetail(fixture(file), title === "Online Marketeer" ? rijksmuseumOverview : byTitle(title));
    const { deadline, ...fields } = expected; expect(result).toMatchObject({ ...fields, title }); expect(result.deadline?.toISOString().slice(0, 10)).toBe(deadline);
    expect(result.externalId).toMatch(/^\d+$/);
  });

  it("gebruikt de expliciete NTR-sluitingsdatum en negeert latere prozatekst", () => {
    expect(parseCultureleDetail(fixture("culturele-vacatures-ntr.html"), byTitle("Redacteur Levensbeschouwing")).deadline?.toISOString().slice(0, 10)).toBe("2026-08-12");
  });

  it("matcht de Rijksmuseum-fixture met de bestaande Villamedia canonical vacancy", () => {
    const villamediaOverview = parseVillamediaOverview(fixture("villamedia-overview.html"));
    const villamediaEntry = villamediaOverview.vacancies.find((item) => item.externalId === "233922")!;
    const villamedia = parseVillamediaDetail(fixture("villamedia-online-marketeer.html"), villamediaEntry);
    const culturele = parseCultureleDetail(fixture("culturele-vacatures-rijksmuseum.html"), rijksmuseumOverview);
    expect(culturele.canonicalKey).toBe(villamedia.canonicalKey);
  });

  it("vult bij cross-source deduplicatie alleen ontbrekende of identieke waarden aan", () => {
    expect(mergeReliable({ title: "Bestaand", salaryMin: null, location: "Amsterdam" }, { title: "Anders", salaryMin: 3000, location: null }))
      .toEqual({ salaryMin: 3000 });
  });
});
