import { describe, expect, it } from "vitest";
import { selectAssessmentCandidates } from "../ai/assessment-run";
import { DISCOVERY_SOURCES, formatDiscoverySummary, planDiscoveryImport, readDiscoveryFeeds, type FeedResult } from "./discovery-import";
import { parseDiscoveryFeed } from "./discovery-feed";

const posting = (company: string, title: string, url: string) => ({ company, title, direct_url: url, source_url: `${url}?utm_source=search`, first_seen: "2026-08-20" });
const json = (...postings: ReturnType<typeof posting>[]) => JSON.stringify({ run_date: "2026-08-20", postings });
const result = (key: "chatgpt" | "claude", input: string): FeedResult => {
  const source = DISCOVERY_SOURCES.find((item) => item.key === key)!;
  const feed = parseDiscoveryFeed(input);
  return { source, found: feed.postingsFound, vacancies: feed.vacancies, errors: feed.errors };
};

describe("multi-source discovery import", () => {
  it("reads and parses both feeds with the shared parser", async () => {
    const seen: string[] = [];
    const feeds = await readDiscoveryFeeds(async (path) => { seen.push(path); return parseDiscoveryFeed(json(posting(path, "Editor", `https://example.nl/${seen.length}`))); });
    expect(seen).toEqual(DISCOVERY_SOURCES.map((source) => source.path));
    expect(feeds.map((feed) => feed.found)).toEqual([1, 1]);
  });

  it.each([
    ["only ChatGPT", DISCOVERY_SOURCES[1].path],
    ["only Claude", DISCOVERY_SOURCES[0].path],
  ])("continues with %s when the other feed is absent", async (_label, missing) => {
    const feeds = await readDiscoveryFeeds(async (path) => {
      if (path === missing) throw new Error("ENOENT");
      return parseDiscoveryFeed(json(posting("NOS", "Redacteur", "https://nos.nl/vacatures/redacteur")));
    });
    expect(feeds.filter((feed) => !feed.fatalError)).toHaveLength(1);
    expect(planDiscoveryImport(feeds, [], [])).toHaveLength(1);
  });

  it.each([
    ["ChatGPT", DISCOVERY_SOURCES[0].path, "claude"],
    ["Claude", DISCOVERY_SOURCES[1].path, "chatgpt"],
  ])("malformed %s does not block the other feed", async (_label, malformed, validKey) => {
    const feeds = await readDiscoveryFeeds(async (path) => path === malformed
      ? parseDiscoveryFeed("not json")
      : parseDiscoveryFeed(json(posting("NRC", "Chef", "https://nrc.nl/jobs/chef"))));
    expect(feeds.find((feed) => feed.source.key !== validKey)?.fatalError).toContain("malformed JSON");
    expect(planDiscoveryImport(feeds, [], []).map((item) => item.source)).toEqual([validKey]);
  });

  it("creates one vacancy but retains an occurrence for each producer", () => {
    const feeds = [result("chatgpt", json(posting("VPRO", "Editor", "https://vpro.nl/jobs/editor"))), result("claude", json(posting("VPRO", "Editor", "https://vpro.nl/jobs/editor?utm_source=claude")))];
    const plan = planDiscoveryImport(feeds, [], []);
    expect(plan.filter((item) => !item.duplicate)).toHaveLength(1);
    expect(plan[1].newVacancyKey).toBe(plan[0].newVacancyKey);
    expect(plan.map((item) => item.source)).toEqual(["chatgpt", "claude"]);
  });

  it("does not recreate a database vacancy and links the new source occurrence to it", () => {
    const feeds = [result("claude", json(posting("VPRO", "Editor", "https://vpro.nl/jobs/editor")))];
    const plan = planDiscoveryImport(feeds, [{ id: 42, employer: "VPRO", title: "Editor" }], []);
    expect(plan[0]).toMatchObject({ duplicate: true, existingVacancyId: 42, source: "claude" });
  });

  it("reports both producers separately and the combined imported total", () => {
    const feeds = [result("chatgpt", json(posting("A", "Editor", "https://a.nl/jobs/1"))), result("claude", json(posting("B", "Maker", "https://b.nl/jobs/2")))];
    const summary = formatDiscoverySummary(feeds, new Map([["chatgpt", { imported: 1, duplicates: 0 }], ["claude", { imported: 0, duplicates: 1 }]]));
    expect(summary).toContain("| ChatGPT | 1 | 1 | 0 | 0 |");
    expect(summary).toContain("| Claude | 1 | 0 | 1 | 0 |");
    expect(summary).toContain("Totaal nieuw geïmporteerd: 1");
  });

  it("keeps a newly planned vacancy eligible for normal AI assessment", () => {
    const [planned] = planDiscoveryImport([result("claude", json(posting("VPRO", "Editor", "https://vpro.nl/jobs/editor")))], [], []);
    const candidates = selectAssessmentCandidates([{ id: 1, active: true, contentHash: planned.item.contentHash }], [], "profile", "normal");
    expect(candidates.map((candidate) => candidate.id)).toEqual([1]);
  });
});
