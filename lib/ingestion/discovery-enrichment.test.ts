import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MIN_FULL_VACANCY_TEXT } from "../vacancy-depth";
import { enrichDiscoveryVacancy, enrichmentTarget, ENRICHMENT_USER_AGENT, extractVacancyText, fetchVacancyText, type EnrichmentFetch } from "./discovery-enrichment";
import { discoveryUrlsInRawData, isDiscoveryDuplicate, parseDiscoveryFeed } from "./discovery-feed";

const posting = (overrides: Record<string, unknown> = {}) => JSON.stringify({ run_date: "2026-08-19", postings: [{
  company: "Voorbeeld Organisatie", title: "Communicatieadviseur", location: "Utrecht", remote_policy: "Hybride", hours: "32-36 uur",
  salary: "€ 4.000 per maand", posted_date: "2026-08-17", source: "linkedin", source_url: "https://linkedin.example/jobs/123",
  direct_url: "https://jobs.werkgever.nl/vacature/communicatieadviseur", first_seen: "2026-08-18", ...overrides,
}] });
const item = (overrides: Record<string, unknown> = {}) => parseDiscoveryFeed(posting(overrides)).vacancies[0];
const body = `<html><body><nav>Menu</nav><main><h1>Communicatieadviseur</h1><p>${"Je schrijft en redigeert. ".repeat(40)}</p></main><footer>Cookies</footer></body></html>`;
const respond = (html: string, init: { ok?: boolean; status?: number; type?: string; url?: string } = {}) => vi.fn().mockResolvedValue({
  ok: init.ok ?? true, status: init.status ?? 200, url: init.url ?? "https://jobs.werkgever.nl/vacature/communicatieadviseur",
  headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? init.type ?? "text/html; charset=utf-8" : null) },
  text: async () => html,
}) as unknown as EnrichmentFetch;

describe("discovery enrichment targeting", () => {
  it("uses the employer's direct vacancy URL", () => {
    expect(enrichmentTarget(item())).toBe("https://jobs.werkgever.nl/vacature/communicatieadviseur");
  });

  it("never opens LinkedIn or another vacancy network itself", () => {
    for (const host of ["https://www.linkedin.com/jobs/view/123", "https://nl.indeed.com/viewjob?jk=1", "https://www.glassdoor.com/job/1"]) {
      expect(enrichmentTarget({ normalizedDirectUrl: host })).toBeNull();
    }
    expect(enrichmentTarget(item({ direct_url: null }))).toBeNull();
  });

  it("refuses non-web protocols, unusable URLs and generic career landing pages, and always fetches over https", () => {
    expect(enrichmentTarget({ normalizedDirectUrl: "http://jobs.werkgever.nl/vacature/x" })).toBe("https://jobs.werkgever.nl/vacature/x");
    expect(enrichmentTarget({ normalizedDirectUrl: "ftp://jobs.werkgever.nl/vacature/x" })).toBeNull();
    expect(enrichmentTarget({ normalizedDirectUrl: "https://werkgever.nl/vacatures" })).toBeNull();
    expect(enrichmentTarget({ normalizedDirectUrl: "geen-url" })).toBeNull();
  });
});

describe("fetching the real vacancy text", () => {
  it("identifies itself and keeps only readable vacancy text", async () => {
    const fetchImpl = respond(body);
    const { text, outcome } = await fetchVacancyText("https://jobs.werkgever.nl/vacature/communicatieadviseur", fetchImpl);
    expect(outcome.status).toBe("enriched");
    expect(text).toContain("Je schrijft en redigeert.");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("Cookies");
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].headers["User-Agent"]).toBe(ENRICHMENT_USER_AGENT);
  });

  it("drops a redirect that lands on a blocked network", async () => {
    const { text, outcome } = await fetchVacancyText("https://jobs.werkgever.nl/vacature/communicatieadviseur", respond(body, { url: "https://www.linkedin.com/jobs/view/9" }));
    expect(text).toBeUndefined();
    expect(outcome.status).toBe("blocked");
  });

  it("degrades on an error, on non-HTML and on a page without usable text", async () => {
    expect((await fetchVacancyText("https://jobs.werkgever.nl/vacature/x", respond("", { ok: false, status: 404 }))).outcome.status).toBe("unavailable");
    expect((await fetchVacancyText("https://jobs.werkgever.nl/vacature/x", respond(body, { type: "application/pdf" }))).outcome.status).toBe("unavailable");
    expect((await fetchVacancyText("https://jobs.werkgever.nl/vacature/x", respond("<html><body><p>Korte pagina</p></body></html>"))).outcome.status).toBe("too_thin");
    expect((await fetchVacancyText("https://jobs.werkgever.nl/vacature/x", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")) as unknown as EnrichmentFetch)).outcome.status).toBe("failed");
  });

  it("keeps the vacancy metadata-only when the text cannot be retrieved", async () => {
    const original = item();
    const { item: result, outcome } = await enrichDiscoveryVacancy(original, respond("", { ok: false, status: 500 }));
    expect(outcome.status).toBe("unavailable");
    expect(result).toEqual(original);
    expect(result.contentDepth).toBe("metadata_only");
  });

  it("does not fetch at all when there is no safe employer URL", async () => {
    const fetchImpl = respond(body);
    const { outcome } = await enrichDiscoveryVacancy(item({ direct_url: "https://www.linkedin.com/jobs/view/123" }), fetchImpl);
    expect(outcome.status).toBe("blocked");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("an enriched vacancy keeps its discovery identity", () => {
  it("becomes a full vacancy text while metadata and provenance survive", async () => {
    const original = item();
    const { item: enriched, outcome } = await enrichDiscoveryVacancy(original, respond(body));
    expect(outcome.status).toBe("enriched");
    expect(enriched.contentDepth).toBe("full");
    expect(enriched.description).toContain("Je schrijft en redigeert.");
    expect(enriched.originalText.startsWith(original.originalText)).toBe(true);
    expect(enriched.originalText.length).toBeGreaterThanOrEqual(MIN_FULL_VACANCY_TEXT);
    expect(enriched.rawData.posting).toEqual(original.rawData.posting);
    expect(enriched.rawData.enrichment?.fetchedFrom).toBe("https://jobs.werkgever.nl/vacature/communicatieadviseur");
  });

  it("preserves deduplication keys, occurrence URL and lifecycle fields", async () => {
    const original = item();
    const { item: enriched } = await enrichDiscoveryVacancy(original, respond(body));
    expect(enriched.canonicalKey).toBe(original.canonicalKey);
    expect(enriched.companyTitleKey).toBe(original.companyTitleKey);
    expect(enriched.sourceUrl).toBe(original.sourceUrl);
    expect(enriched.firstSeenAt).toEqual(original.firstSeenAt);
    expect(discoveryUrlsInRawData(enriched.rawData)).toEqual(discoveryUrlsInRawData(original.rawData));
    expect(isDiscoveryDuplicate(enriched, new Set([original.normalizedDirectUrl!]), new Set())).toBe(true);
  });

  it("changes the content hash so the retrieved text triggers a reassessment", async () => {
    const original = item();
    const { item: enriched } = await enrichDiscoveryVacancy(original, respond(body));
    expect(enriched.contentHash).not.toBe(original.contentHash);
    const { item: again } = await enrichDiscoveryVacancy(original, respond(body));
    expect(again.contentHash).toBe(enriched.contentHash);
  });
});

describe("discovery import wiring", () => {
  const script = readFileSync("scripts/ingest-discovery.ts", "utf8");

  it("enriches only new vacancies and stores the enriched item", () => {
    expect(script).toContain("planned.duplicate ? { item: planned.item, outcome: null } : await enrichDiscoveryVacancy(planned.item)");
    expect(script).toContain("values(item)");
    expect(script).toContain("description: item.description");
  });

  it("keeps a failed enrichment out of the run warnings that alarm the pipeline", () => {
    expect(script).toContain("warnings: selected.errors");
    expect(script).toContain("[\"Alleen metadata\", depth.metadataOnly]");
  });
});

describe("readable text extraction", () => {
  it("prefers the main content and never returns script or style content", () => {
    const text = extractVacancyText("<html><body><script>var x=1</script><style>p{}</style><main><p>Wat ga je doen?</p></main></body></html>");
    expect(text).toBe("Wat ga je doen?");
  });
});
