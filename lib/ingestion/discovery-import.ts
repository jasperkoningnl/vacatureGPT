import {
  companyTitleKey,
  discoveryUrlsInRawData,
  isDiscoveryDuplicate,
  normalizeDiscoveryUrl,
  readDiscoveryFeed,
  type DiscoveryVacancy,
} from "./discovery-feed";

export const DISCOVERY_SOURCES = [
  { key: "chatgpt", slug: "discovery-chatgpt", name: "ChatGPT discovery feed", path: "data/discovery/chatgpt/latest.json" },
  { key: "claude", slug: "discovery-claude", name: "Claude discovery feed", path: "data/discovery/claude/latest.json" },
] as const;

export type DiscoverySourceKey = typeof DISCOVERY_SOURCES[number]["key"];
export type FeedResult = {
  source: typeof DISCOVERY_SOURCES[number];
  found: number;
  vacancies: DiscoveryVacancy[];
  errors: string[];
  fatalError?: string;
};

export async function readDiscoveryFeeds(
  reader: (path: string) => ReturnType<typeof readDiscoveryFeed> = (path) => readDiscoveryFeed(path),
): Promise<FeedResult[]> {
  return Promise.all(DISCOVERY_SOURCES.map(async (source) => {
    try {
      const feed = await reader(source.path);
      return { source, found: feed.postingsFound, vacancies: feed.vacancies, errors: feed.errors };
    } catch (error) {
      return { source, found: 0, vacancies: [], errors: [], fatalError: error instanceof Error ? error.message : "Onbekende feedfout" };
    }
  }));
}

export type ExistingDiscoveryVacancy = { id: number; employer: string; title: string };
export type ExistingDiscoveryOccurrence = { vacancyId: number; sourceUrl: string; rawData: unknown };
export type PlannedDiscoveryItem = {
  source: DiscoverySourceKey;
  item: DiscoveryVacancy;
  duplicate: boolean;
  existingVacancyId?: number;
  /** Points at the earlier new item when two feeds discover the same vacancy. */
  newVacancyKey?: string;
};

export type DiscoveryCounts = { imported: number; duplicates: number };

export function formatDiscoverySummary(feeds: FeedResult[], stats: ReadonlyMap<DiscoverySourceKey, DiscoveryCounts>) {
  const lines = ["## Supplemental discovery import", "", "| Bron | Gevonden | Geïmporteerd | Duplicates | Fouten |", "| --- | ---: | ---: | ---: | ---: |"];
  for (const result of feeds) {
    const counts = stats.get(result.source.key) ?? { imported: 0, duplicates: 0 };
    const errors = [...result.errors, ...(result.fatalError ? [result.fatalError] : [])];
    lines.push(`| ${result.source.name.replace(" discovery feed", "")} | ${result.found} | ${counts.imported} | ${counts.duplicates} | ${errors.length} |`);
    if (errors.length) lines.push("", `### ${result.source.name} fouten`, ...errors.map((error) => `- ${error}`));
  }
  const totalImported = [...stats.values()].reduce((sum, value) => sum + value.imported, 0);
  lines.push("", `**Totaal nieuw geïmporteerd: ${totalImported}**`);
  return lines.join("\n");
}

export function planDiscoveryImport(
  feeds: FeedResult[],
  existingVacancies: ExistingDiscoveryVacancy[],
  existingOccurrences: ExistingDiscoveryOccurrence[],
): PlannedDiscoveryItem[] {
  const urlTargets = new Map<string, { existingVacancyId?: number; newVacancyKey?: string }>();
  for (const row of existingOccurrences) {
    const target = { existingVacancyId: row.vacancyId };
    const occurrenceUrl = normalizeDiscoveryUrl(row.sourceUrl);
    if (occurrenceUrl) urlTargets.set(occurrenceUrl, target);
    for (const url of discoveryUrlsInRawData(row.rawData)) urlTargets.set(url, target);
  }
  const companyTargets = new Map<string, { existingVacancyId?: number; newVacancyKey?: string }>(
    existingVacancies.map((row) => [companyTitleKey(row.employer, row.title), { existingVacancyId: row.id }]),
  );
  const knownUrls = new Set(urlTargets.keys());
  const knownCompanyTitles = new Set(companyTargets.keys());
  const plan: PlannedDiscoveryItem[] = [];

  for (const feed of feeds) for (const item of feed.vacancies) {
    const duplicate = isDiscoveryDuplicate(item, knownUrls, knownCompanyTitles);
    const target = (item.normalizedDirectUrl ? urlTargets.get(item.normalizedDirectUrl) : undefined)
      ?? (item.normalizedSourceUrl ? urlTargets.get(item.normalizedSourceUrl) : undefined)
      ?? companyTargets.get(item.companyTitleKey);
    if (duplicate && !target) throw new Error(`Duplicate kon niet aan een vacature worden gekoppeld: ${item.employer} / ${item.title}`);
    const newVacancyKey = target?.newVacancyKey ?? (duplicate ? undefined : `${feed.source.key}:${plan.length}`);
    plan.push({ source: feed.source.key, item, duplicate, existingVacancyId: target?.existingVacancyId, newVacancyKey });
    if (!duplicate) {
      const newTarget = { newVacancyKey };
      if (item.normalizedDirectUrl) { knownUrls.add(item.normalizedDirectUrl); urlTargets.set(item.normalizedDirectUrl, newTarget); }
      if (item.normalizedSourceUrl) { knownUrls.add(item.normalizedSourceUrl); urlTargets.set(item.normalizedSourceUrl, newTarget); }
      knownCompanyTitles.add(item.companyTitleKey);
      companyTargets.set(item.companyTitleKey, newTarget);
    }
  }
  return plan;
}
