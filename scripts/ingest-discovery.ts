import { and, eq, ilike, or, sql } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../lib/db";
import { vacancies, vacancyOccurrences } from "../lib/db/schema";
import { DISCOVERY_SOURCES, planDiscoveryImport, readDiscoverySource, type DiscoveryCounts, type FeedResult } from "../lib/ingestion/discovery-import";
import { normalizeDiscoveryUrl, type DiscoveryVacancy } from "../lib/ingestion/discovery-feed";
import { enrichDiscoveryVacancy } from "../lib/ingestion/discovery-enrichment";
import { runIngestSource } from "../lib/ingestion/ingest-runner";

const repository = process.env.GITHUB_REPOSITORY || "jasperkoningnl/vacatureGPT";
const db = getDb();
const completed: Array<{ result: FeedResult; counts: DiscoveryCounts; skipped: boolean }> = [];

function values(item: DiscoveryVacancy) {
  return { canonicalKey: item.canonicalKey, title: item.title, employer: item.employer, location: item.location, hoursMin: item.hoursMin, hoursMax: item.hoursMax,
    hoursOriginal: item.hoursOriginal, salaryMin: item.salaryMin, salaryMax: item.salaryMax, salaryPeriod: item.salaryPeriod, salaryOriginal: item.salaryOriginal,
    description: item.description, originalText: item.originalText, contentHash: item.contentHash, firstSeenAt: item.firstSeenAt, lastSeenAt: new Date(), active: true };
}

for (const config of DISCOVERY_SOURCES) {
  const baseUrl = `https://github.com/${repository}/blob/main/${config.path}`;
  const execution = await runIngestSource({ slug: config.slug, name: config.name, baseUrl }, async ({ source, run, activity }) => {
    // Read only this feed after the central enabled check has admitted the source.
    const selected = await readDiscoverySource(config);
    const vacancyMatches = selected.vacancies.map((item) => { const [employer, title] = item.companyTitleKey.split("|"); return and(sql`lower(regexp_replace(trim(${vacancies.employer}), '\s+', ' ', 'g')) = ${employer}`, sql`lower(regexp_replace(trim(${vacancies.title}), '\s+', ' ', 'g')) = ${title}`); });
    const candidateUrls = [...new Set(selected.vacancies.flatMap((item) => [item.normalizedDirectUrl, item.normalizedSourceUrl]).filter((url): url is string => Boolean(url)))];
    const escaped = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const occurrenceMatches = candidateUrls.flatMap((url) => { const parsed = new URL(url); const marker = escaped(`//${parsed.host}${parsed.pathname}`); return [ilike(vacancyOccurrences.sourceUrl, `%${marker}%`), sql`${vacancyOccurrences.rawData}::text ilike ${`%${marker}%`}`]; });
    const existingVacancies = vacancyMatches.length ? await db.select({ id: vacancies.id, employer: vacancies.employer, title: vacancies.title }).from(vacancies).where(or(...vacancyMatches)) : [];
    const existingOccurrences = occurrenceMatches.length ? await db.select({ id: vacancyOccurrences.id, vacancyId: vacancyOccurrences.vacancyId, sourceId: vacancyOccurrences.sourceId, sourceUrl: vacancyOccurrences.sourceUrl, rawData: vacancyOccurrences.rawData }).from(vacancyOccurrences).where(or(...occurrenceMatches)) : [];
    const plan = planDiscoveryImport([selected], existingVacancies, existingOccurrences);
    const createdVacancies = new Map<string, number>(); const counts = { imported: 0, duplicates: 0 }; const depth = { enriched: 0, metadataOnly: 0 };
    for (const planned of plan) {
      // Alleen nieuwe vacatures worden verrijkt; duplicaten hebben hun tekst al via de eigen bron.
      const { item, outcome } = planned.duplicate ? { item: planned.item, outcome: null } : await enrichDiscoveryVacancy(planned.item);
      if (!planned.duplicate) { if (item.contentDepth === "full") depth.enriched++; else { depth.metadataOnly++; console.log(`Metadata-only: ${item.employer} / ${item.title} (${outcome?.status}${outcome?.reason ? `: ${outcome.reason}` : ""})`); } }
      let vacancyId = planned.existingVacancyId ?? (planned.newVacancyKey ? createdVacancies.get(planned.newVacancyKey) : undefined);
      if (!planned.duplicate) { const [created] = await db.insert(vacancies).values(values(item)).returning({ id: vacancies.id }); vacancyId = created.id; createdVacancies.set(planned.newVacancyKey!, vacancyId); counts.imported++; }
      else counts.duplicates++;
      if (!vacancyId) throw new Error(`Geplande discovery-vacature kon niet worden gekoppeld: ${item.employer} / ${item.title}`);
      const occurrence = existingOccurrences.find((row) => row.sourceId === source.id && normalizeDiscoveryUrl(row.sourceUrl) === normalizeDiscoveryUrl(item.sourceUrl));
      if (occurrence) await db.update(vacancyOccurrences).set({ vacancyId, sourceRunId: run.id, lastSeenAt: new Date(), active: true, rawData: item.rawData }).where(eq(vacancyOccurrences.id, occurrence.id));
      else await db.insert(vacancyOccurrences).values({ vacancyId, sourceId: source.id, sourceRunId: run.id, sourceUrl: item.sourceUrl, rawData: item.rawData, active: true }).onConflictDoUpdate({ target: [vacancyOccurrences.sourceId, vacancyOccurrences.sourceUrl], set: { vacancyId, sourceRunId: run.id, lastSeenAt: new Date(), active: true, rawData: item.rawData } });
      activity.touch(vacancyId);
    }
    completed.push({ result: selected, counts, skipped: false });
    const errors = [...selected.errors, ...(selected.fatalError ? [selected.fatalError] : [])];
    return { resultCount: selected.found, newCount: counts.imported, changedCount: 0, duplicates: counts.duplicates, warnings: selected.errors, trustworthy: !selected.fatalError,
      status: selected.fatalError ? "error" as const : errors.length ? "warning" as const : "success" as const, error: selected.fatalError,
      summaryRows: [["Found", selected.found], ["Imported", counts.imported], ["Duplicates", counts.duplicates], ["Met volledige vacaturetekst", depth.enriched], ["Alleen metadata", depth.metadataOnly], ["Errors", errors.length]] };
  });
  if (execution.status === "skipped") completed.push({ result: { source: config, found: 0, vacancies: [], errors: [] }, counts: { imported: 0, duplicates: 0 }, skipped: true });
}

const output = completed.flatMap(({ result, counts, skipped }) => [`${result.source.key}_found=${result.found}`, `${result.source.key}_imported=${counts.imported}`, `${result.source.key}_duplicates=${counts.duplicates}`, `${result.source.key}_errors=${result.errors.length + (result.fatalError ? 1 : 0)}`, `${result.source.key}_skipped=${skipped}`]);
output.push(`imported=${completed.reduce((sum, item) => sum + item.counts.imported, 0)}`, `found=${completed.reduce((sum, item) => sum + item.result.found, 0)}`, `duplicates=${completed.reduce((sum, item) => sum + item.counts.duplicates, 0)}`, `errors=${completed.reduce((sum, item) => sum + item.result.errors.length + (item.result.fatalError ? 1 : 0), 0)}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${output.join("\n")}\n`, "utf8");
const attempted = completed.filter((item) => !item.skipped);
if (attempted.length > 0 && attempted.every((item) => item.result.fatalError)) throw new Error("Geen enkele ingeschakelde discovery-feed kon worden verwerkt.");
