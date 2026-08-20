import { eq } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../lib/db";
import { sources, sourceRuns, vacancies, vacancyOccurrences } from "../lib/db/schema";
import { DISCOVERY_SOURCES, formatDiscoverySummary, planDiscoveryImport, readDiscoveryFeeds, type DiscoverySourceKey } from "../lib/ingestion/discovery-import";
import { normalizeDiscoveryUrl, type DiscoveryVacancy } from "../lib/ingestion/discovery-feed";
import { recomputeVacancyActivity, reconcileSuccessfulSourceRun } from "../lib/vacancy-lifecycle";

const repository = process.env.GITHUB_REPOSITORY || "jasperkoningnl/vacatureGPT";
const db = getDb();
const feedResults = await readDiscoveryFeeds();
const sourceState = new Map<DiscoverySourceKey, { sourceId: number; runId: number }>();

for (const config of DISCOVERY_SOURCES) {
  const baseUrl = `https://github.com/${repository}/blob/main/${config.path}`;
  const [source] = await db.insert(sources).values({ slug: config.slug, name: config.name, baseUrl, enabled: true })
    .onConflictDoUpdate({ target: sources.slug, set: { name: config.name, baseUrl, enabled: true } }).returning();
  const [run] = await db.insert(sourceRuns).values({ sourceId: source.id }).returning();
  sourceState.set(config.key, { sourceId: source.id, runId: run.id });
}

function values(item: DiscoveryVacancy) {
  return { canonicalKey: item.canonicalKey, title: item.title, employer: item.employer, location: item.location,
    hoursMin: item.hoursMin, hoursMax: item.hoursMax, hoursOriginal: item.hoursOriginal,
    salaryMin: item.salaryMin, salaryMax: item.salaryMax, salaryPeriod: item.salaryPeriod, salaryOriginal: item.salaryOriginal,
    description: item.originalText, originalText: item.originalText, contentHash: item.contentHash,
    firstSeenAt: item.firstSeenAt, lastSeenAt: new Date(), active: true };
}

const existingVacancies = await db.select({ id: vacancies.id, employer: vacancies.employer, title: vacancies.title }).from(vacancies);
const existingOccurrences = await db.select({ id: vacancyOccurrences.id, vacancyId: vacancyOccurrences.vacancyId, sourceId: vacancyOccurrences.sourceId, sourceUrl: vacancyOccurrences.sourceUrl, rawData: vacancyOccurrences.rawData }).from(vacancyOccurrences);
const plan = planDiscoveryImport(feedResults, existingVacancies, existingOccurrences);
const createdVacancies = new Map<string, number>();
const stats = new Map(DISCOVERY_SOURCES.map(({ key }) => [key, { imported: 0, duplicates: 0 }]));

for (const planned of plan) {
  const state = sourceState.get(planned.source)!;
  let vacancyId = planned.existingVacancyId ?? (planned.newVacancyKey ? createdVacancies.get(planned.newVacancyKey) : undefined);
  if (!planned.duplicate) {
    const [created] = await db.insert(vacancies).values(values(planned.item)).returning({ id: vacancies.id });
    vacancyId = created.id;
    createdVacancies.set(planned.newVacancyKey!, vacancyId);
    stats.get(planned.source)!.imported++;
  } else stats.get(planned.source)!.duplicates++;
  if (!vacancyId) throw new Error(`Geplande discovery-vacature kon niet worden gekoppeld: ${planned.item.employer} / ${planned.item.title}`);

  const occurrence = existingOccurrences.find((row) => row.sourceId === state.sourceId && normalizeDiscoveryUrl(row.sourceUrl) === normalizeDiscoveryUrl(planned.item.sourceUrl));
  if (occurrence) await db.update(vacancyOccurrences).set({ vacancyId, sourceRunId: state.runId, lastSeenAt: new Date(), active: true, rawData: planned.item.rawData }).where(eq(vacancyOccurrences.id, occurrence.id));
  else await db.insert(vacancyOccurrences).values({ vacancyId, sourceId: state.sourceId, sourceRunId: state.runId, sourceUrl: planned.item.sourceUrl, rawData: planned.item.rawData, active: true })
    .onConflictDoUpdate({ target: [vacancyOccurrences.sourceId, vacancyOccurrences.sourceUrl], set: { vacancyId, sourceRunId: state.runId, lastSeenAt: new Date(), active: true, rawData: planned.item.rawData } });
  await recomputeVacancyActivity([vacancyId]);
}

for (const result of feedResults) {
  const state = sourceState.get(result.source.key)!;
  const counts = stats.get(result.source.key)!;
  const errors = [...result.errors, ...(result.fatalError ? [result.fatalError] : [])];
  if (!result.fatalError) await reconcileSuccessfulSourceRun(state.sourceId, state.runId);
  await db.update(sourceRuns).set({ status: result.fatalError ? "error" : errors.length ? "warning" : "success", finishedAt: new Date(),
    resultCount: result.found, newCount: counts.imported, warnings: result.errors, error: result.fatalError }).where(eq(sourceRuns.id, state.runId));
}

const totalImported = [...stats.values()].reduce((sum, value) => sum + value.imported, 0);
for (const result of feedResults) {
  const counts = stats.get(result.source.key)!;
  const errors = [...result.errors, ...(result.fatalError ? [result.fatalError] : [])];
  console.log(`${result.source.name}: found=${result.found}, imported=${counts.imported}, duplicates=${counts.duplicates}, errors=${errors.length}`);
}
const output = feedResults.map((result) => {
  const counts = stats.get(result.source.key)!;
  const errorCount = result.errors.length + (result.fatalError ? 1 : 0);
  return `${result.source.key}_found=${result.found}\n${result.source.key}_imported=${counts.imported}\n${result.source.key}_duplicates=${counts.duplicates}\n${result.source.key}_errors=${errorCount}`;
});
output.push(`imported=${totalImported}`, `found=${feedResults.reduce((sum, item) => sum + item.found, 0)}`, `duplicates=${[...stats.values()].reduce((sum, item) => sum + item.duplicates, 0)}`, `errors=${feedResults.reduce((sum, item) => sum + item.errors.length + (item.fatalError ? 1 : 0), 0)}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${output.join("\n")}\n`, "utf8");
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${formatDiscoverySummary(feedResults, stats)}\n`, "utf8");

if (feedResults.every((result) => result.fatalError)) throw new Error("Geen enkele discovery-feed kon worden verwerkt.");
