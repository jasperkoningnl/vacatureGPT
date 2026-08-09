import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { RSS_URL, fetchOneWorldUrls, matchRepairOccurrence, parseDetail, parseHours, parseRss, parseSalary, qualityWarnings, repairFailureReason } from "./oneworld-parser";
import { parseIngestionWarning } from "./shared/ingestion-warnings";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("OneWorld parser", () => {
  it("leest de publieke RSS zonder netwerk", () => {
    const jobs = parseRss(fixture("oneworld-rss.xml"));
    expect(jobs.length).toBeGreaterThan(1);
    expect(jobs[0].url).toMatch(/^https:\/\/www\.oneworld\.nl\/job\//);
  });

  it("geeft gelabelde locatie en uren prioriteit en houdt salarisbasis apart", () => {
    const result = parseDetail(fixture("oneworld-coordinator.html"), "https://www.oneworld.nl/job/coordinator-project-office/");
    expect(result).toMatchObject({ title: "Coordinator Project Office", employer: "KIT", location: "Amsterdam, Nederland", hoursMin: 36, hoursMax: 40, hoursOriginal: "36–40 uur", salaryMin: 5133, salaryMax: 6000, salaryPeriod: "month", salaryBasisHours: 38 });
    expect(result.salaryOriginal).toContain("salary between");
    expect(result.originalText).toContain("KIT & support");
    expect(result.warnings).toContain("Tijd per week (36–40 uur) conflicteert met JSON-LD (38 hours).");
  });

  it("parseert Filantropie Expert metadata onafhankelijk", () => {
    expect(parseDetail(fixture("oneworld-filantropie.html"), "https://www.oneworld.nl/job/filantropie-expert/")).toMatchObject({ location: "Den Haag", hoursMin: 32, hoursMax: 36 });
  });

  it("leest de werkgever uit de huidige OneWorld vacaturekop als JSON-LD die naam leeg laat", () => {
    const html = `
      <h1>Digital Growth Marketeer</h1>
      <div class="wpjb-top-header"><span class="wpjb-top-header-title"><a href="/company/actionaid/">ActionAid</a></span></div>
      <div class="wpjb-grid-row"><div class="wpjb-grid-col">Tijd per week</div><div class="wpjb-grid-col">32-36 uur</div></div>
      <div class="wpjb-text-box">Een betekenisvolle vacaturetekst.</div>
      <script type="application/ld+json">{"@type":"JobPosting","title":"Digital Growth Marketeer","hiringOrganization":{"@type":"Organization","name":""}}</script>`;
    expect(parseDetail(html, "https://www.oneworld.nl/job/digital-growth-marketeer/").employer).toBe("ActionAid");
  });

  it("begrenst lange urenconflicten in waarschuwingen", () => {
    const longDescription = `Deze ${"uitgebreide tekst ".repeat(30)}noemt uiteindelijk 38 uur per week.`;
    const html = `<h1>Rol</h1><div class="wpjb-top-header-title">Werkgever</div><dl><dt>Tijd per week</dt><dd>32-36 uur</dd></dl><script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Rol", description: longDescription })}</script>`;
    const [warning] = parseDetail(html, "https://example.test/rol").warnings;
    expect(warning).toContain("conflicteert met beschrijving");
    expect(warning.length).toBeLessThan(250);
  });

  it("decodeert entiteiten en parseert Nederlands salaris", () => {
    const result = parseDetail(fixture("oneworld-college53.html"), "https://www.oneworld.nl/job/programmaleider-educatief-jongerencentrum-college53/");
    expect(result).toMatchObject({ title: "Programmaleider Educatief Jongerencentrum College53 & Partners", employer: "Stichting & College53", location: "Rotterdam", hoursMin: 24, hoursMax: 30, salaryMin: 4200, salaryMax: 5000 });
  });

  it.each([
    ["32–36 uur", 32, 36], ["32 - 36 uur", 32, 36], ["32 tot 36 uur", 32, 36],
    ["32 uur", 32, 32], ["36 uur per week", 36, 36], ["36–40 hours", 36, 40],
    ["5 days per week (8 hours per day)", 40, 40],
  ])("normaliseert uren: %s", (text, min, max) => expect(parseHours(text)).toMatchObject({ min, max, original: text }));

  it.each([
    ["between € 5,133 and € 6,000 per month", 5133, 6000],
    ["€ 5,133 to € 6,000 per month", 5133, 6000],
    ["van € 5.133 tot € 6.000 per maand", 5133, 6000],
    ["€ 5.133 - € 6.000", 5133, 6000],
    ["€ 5133 – 6000", 5133, 6000],
  ])("normaliseert salaris: %s", (text, min, max) => expect(parseSalary(text)).toMatchObject({ min, max }));

  it("ondersteunt expliciete salarisgrenzen zonder de andere grens te verzinnen", () => {
    expect(parseSalary("minimum € 4.200 per maand")).toMatchObject({ min: 4200, max: null });
    expect(parseSalary("up to € 75,000 per year")).toMatchObject({ min: null, max: 75000 });
  });

  it("maakt batchbrede kwaliteitswaarschuwingen", () => {
    const base = parseDetail(fixture("oneworld-filantropie.html"), "https://example.test/1");
    expect(qualityWarnings([{ ...base, employer: "Onbekende werkgever", hoursMin: null }, { ...base, employer: "Onbekende werkgever", hoursMin: null }, base])).toEqual(expect.arrayContaining([expect.stringContaining("onbekende werkgever"), expect.stringContaining("onbekende uren")]));
  });

  it("haalt aangeleverde repair-URL's op zonder de RSS-endpoint te gebruiken", async () => {
    const url = "https://www.oneworld.nl/job/filantropie-expert/";
    const fetcher = vi.fn(async () => new Response(fixture("oneworld-filantropie.html"), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchOneWorldUrls([url], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(url, expect.any(Object));
    expect(fetcher).not.toHaveBeenCalledWith(RSS_URL, expect.anything());
    expect(result).toMatchObject({ requestedCount: 1, failedCount: 0 });
    expect(result.results[0]).toMatchObject({ sourceUrl: url, employer: "Goede Doelen Nederland" });
  });

  it("behoudt geslaagde repair-pagina's als één detailpagina faalt", async () => {
    const goodUrl = "https://www.oneworld.nl/job/filantropie-expert/";
    const badUrl = "https://www.oneworld.nl/job/verwijderd/";
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input) === badUrl
      ? new Response("missing", { status: 404 })
      : new Response(fixture("oneworld-filantropie.html"), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchOneWorldUrls([goodUrl, badUrl], fetcher);
    expect(result.results).toHaveLength(1);
    expect(result).toMatchObject({ requestedCount: 2, failedCount: 1 });
    expect(result.warnings.map(parseIngestionWarning)).toContainEqual(expect.objectContaining({ severity: "warning", category: "fetch", url: badUrl, message: expect.stringContaining("HTTP 404") }));
    expect(repairFailureReason(result.requestedCount, result.results.length, result.failedCount, result.warnings)).toBeNull();
  });

  it("weigert een repair als alle detailpagina's mislukken", async () => {
    const result = await fetchOneWorldUrls(["https://www.oneworld.nl/job/verwijderd/"], async () => new Response("missing", { status: 500 }));
    expect(result.results).toHaveLength(0);
    expect(repairFailureReason(result.requestedCount, result.results.length, result.failedCount, result.warnings)).toContain("Geen enkele");
  });

  it("maakt bij repair geen nieuwe vacature voor een onverwacht niet-gematchte pagina", () => {
    const item = parseDetail(fixture("oneworld-filantropie.html"), "https://www.oneworld.nl/job/nieuw/");
    expect(matchRepairOccurrence(item, [{ externalId: "ander-id", sourceUrl: "https://www.oneworld.nl/job/bestaand/" }])).toBeUndefined();
  });

  it("haalt dubbele aangeleverde repair-URL's maar één keer op", async () => {
    const url = "https://www.oneworld.nl/job/filantropie-expert/";
    const fetcher = vi.fn(async () => new Response(fixture("oneworld-filantropie.html"), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchOneWorldUrls([url, url], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ requestedCount: 1, failedCount: 0 });
  });
});
