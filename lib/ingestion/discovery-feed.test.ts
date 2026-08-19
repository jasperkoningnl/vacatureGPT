import { describe, expect, it, vi } from "vitest";
import { selectAssessmentCandidates } from "../ai/assessment-run";
import { discoveryUrlsInRawData, fetchDiscoveryFeed, isDiscoveryDuplicate, normalizeDiscoveryUrl, parseDiscoveryFeed } from "./discovery-feed";

const posting = {
  company: "Voorbeeld Organisatie", title: "Communicatieadviseur", location: "Utrecht", remote_policy: "Hybride",
  hours: "32-36 uur", salary: "€ 4.000 - € 5.500 per maand", posted_date: "2026-08-17", source: "LinkedIn",
  source_url: "https://linkedin.example/jobs/123?utm_source=feed", direct_url: "https://jobs.example/vacancy/communicatieadviseur#apply", first_seen: "2026-08-18",
};

const json = (overrides: Record<string, unknown> = {}) => JSON.stringify({ run_date: "2026-08-19", postings: [{ ...posting, ...overrides }] });

describe("GitHub discovery feed", () => {
  it("reads and normalizes the feed through the GitHub branch API", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(json(), { status: 200 }));
    const result = await fetchDiscoveryFeed("jasperkoningnl/vacatureGPT", "token", fetcher);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.github.com/repos/jasperkoningnl/vacatureGPT/contents/data/vacaturegpt_discovery_latest.json?ref=discovery-data");
    expect(result.postingsFound).toBe(1);
    expect(result.vacancies[0]).toMatchObject({ employer: "Voorbeeld Organisatie", hoursMin: 32, hoursMax: 36, salaryMin: 4000, salaryMax: 5500 });
  });

  it("gives a specific direct_url priority and normalizes tracking and fragments", () => {
    expect(parseDiscoveryFeed(json()).vacancies[0].sourceUrl).toBe("https://jobs.example/vacancy/communicatieadviseur");
  });

  it("falls back to source_url when direct_url is absent", () => {
    expect(parseDiscoveryFeed(json({ direct_url: "" })).vacancies[0].sourceUrl).toBe("https://linkedin.example/jobs/123");
  });

  it("does not import a duplicate normalized direct or source URL", () => {
    const item = parseDiscoveryFeed(json()).vacancies[0];
    expect(isDiscoveryDuplicate(item, new Set([normalizeDiscoveryUrl("http://JOBS.example/vacancy/communicatieadviseur/?utm_campaign=x")!]), new Set())).toBe(true);
    expect(isDiscoveryDuplicate(item, new Set(["https://linkedin.example/jobs/123"]), new Set())).toBe(true);
  });

  it("retains both discovery URLs in raw provenance for later deduplication", () => {
    const item = parseDiscoveryFeed(json()).vacancies[0];
    expect(discoveryUrlsInRawData(item.rawData)).toEqual(expect.arrayContaining(["https://jobs.example/vacancy/communicatieadviseur", "https://linkedin.example/jobs/123"]));
  });

  it("uses normalized company and title as the final duplicate fallback", () => {
    const item = parseDiscoveryFeed(json()).vacancies[0];
    expect(isDiscoveryDuplicate(item, new Set(), new Set(["voorbeeld organisatie|communicatieadviseur"]))).toBe(true);
  });

  it("allows missing hours and salary", () => {
    const item = parseDiscoveryFeed(json({ hours: "", salary: "" })).vacancies[0];
    expect(item).toMatchObject({ hoursMin: null, hoursMax: null, salaryMin: null, salaryMax: null });
  });

  it("fails malformed JSON and malformed feed shapes in a controlled way", () => {
    expect(() => parseDiscoveryFeed("{broken")).toThrow("malformed JSON");
    expect(() => parseDiscoveryFeed(JSON.stringify({ run_date: "2026-08-19" }))).toThrow("postings-array");
  });

  it("makes a newly imported active vacancy a normal AI-assessment candidate", () => {
    const item = parseDiscoveryFeed(json()).vacancies[0];
    const vacancy = { id: 42, active: true, contentHash: item.contentHash };
    expect(selectAssessmentCandidates([vacancy], [], "profile-hash", "normal")).toEqual([vacancy]);
  });

  it("rejects generic career landing pages", () => {
    const result = parseDiscoveryFeed(json({ direct_url: "https://jobs.example/careers", source_url: "https://source.example/jobs" }));
    expect(result.vacancies).toHaveLength(0);
    expect(result.errors[0]).toContain("geen specifieke vacature-URL");
  });
});
