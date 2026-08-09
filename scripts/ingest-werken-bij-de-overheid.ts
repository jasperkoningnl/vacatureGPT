import { and, eq } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../lib/db";
import { sourceRuns, sources, vacancies, vacancyOccurrences } from "../lib/db/schema";
import { batchFailureReason, OVERHEID_BASE_URL, fetchOverheid, mergeReliable, type OverheidVacancy } from "../lib/ingestion/werken-bij-de-overheid-parser";
import { createIngestionWarning, parseIngestionWarning, runStatusForWarnings, warningCounts, warningsMarkdown } from "../lib/ingestion/shared/ingestion-warnings";

const db = getDb();
const [source] = await db.insert(sources).values({ slug: "werken-bij-de-overheid", name: "Werken bij de Overheid", baseUrl: OVERHEID_BASE_URL, enabled: true })
  .onConflictDoUpdate({ target: sources.slug, set: { name: "Werken bij de Overheid", baseUrl: OVERHEID_BASE_URL, enabled: true } }).returning();
const [run] = await db.insert(sourceRuns).values({ sourceId: source.id }).returning();

function values(item: OverheidVacancy) {
  return { canonicalKey: item.canonicalKey, title: item.title, employer: item.employer, location: item.location, hoursMin: item.hoursMin, hoursMax: item.hoursMax,
    hoursOriginal: item.hoursOriginal, salaryMin: item.salaryMin, salaryMax: item.salaryMax, salaryPeriod: item.salaryPeriod,
    salaryBasisHours: item.salaryBasisHours, salaryOriginal: item.salaryOriginal, deadline: item.deadline, description: item.originalText,
    originalText: item.originalText, contentHash: item.contentHash, active: true };
}

async function writeSummary(counts: { pages: number; discovered: number; parsed: number; added: number; updated: number; unchanged: number; deduplicated: number; failed: number; warnings: string[] }) {
  const severity = warningCounts(counts.warnings);
  const rows = [["Pages fetched", counts.pages], ["Vacancies discovered", counts.discovered], ["Parsed", counts.parsed], ["Added", counts.added],
    ["Updated", counts.updated], ["Unchanged", counts.unchanged], ["Deduplicated", counts.deduplicated], ["Failed", counts.failed],
    ["Info", severity.info], ["Warning", severity.warning], ["Critical", severity.critical]] as const;
  const text = ["## Werken bij de Overheid ingestion summary", "", "| Result | Count |", "| --- | ---: |", ...rows.map(([label, count]) => `| ${label} | ${count} |`), "",
    warningsMarkdown(counts.warnings), ""].join("\n");
  console.log(`Werken bij de Overheid summary: ${rows.map(([label, count]) => `${label}=${count}`).join(", ")}`);
  counts.warnings.forEach((warning) => console.warn(`Werken bij de Overheid warning: ${warning}`));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text, "utf8");
}

try {
  const fetched = await fetchOverheid();
  const warnings = [...fetched.warnings, ...fetched.results.flatMap((item) => item.warnings.map((warning) => createIngestionWarning({ ...parseIngestionWarning(warning), url: item.sourceUrl })))];
  const failure = batchFailureReason(fetched.entries.length, fetched.results, fetched.failedCount);
  if (failure) {
    warnings.push(createIngestionWarning({ severity: "critical", category: "batch", message: `${failure} Er zijn geen vacatures bijgewerkt.` }));
    await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), resultCount: fetched.results.length, warnings, error: `${failure} Geen vacaturewrites uitgevoerd.` }).where(eq(sourceRuns.id, run.id));
    await writeSummary({ pages: fetched.pagesFetched, discovered: fetched.entries.length, parsed: fetched.results.length, added: 0, updated: 0, unchanged: 0, deduplicated: 0, failed: fetched.failedCount, warnings });
    throw new Error("Werken bij de Overheid-ingestie afgebroken vóór vacaturewrites.");
  }
  let added = 0; let updated = 0; let unchanged = 0; let deduplicated = 0;
  for (const item of fetched.results) {
    const [byExternal] = await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences }).from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id))
      .where(and(eq(vacancyOccurrences.sourceId, source.id), eq(vacancyOccurrences.externalId, item.externalId!))).limit(1);
    const [byUrl] = byExternal ? [] : await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences }).from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id))
      .where(and(eq(vacancyOccurrences.sourceId, source.id), eq(vacancyOccurrences.sourceUrl, item.sourceUrl))).limit(1);
    const [byCanonical] = byExternal || byUrl ? [] : await db.select().from(vacancies).where(eq(vacancies.canonicalKey, item.canonicalKey)).limit(1);
    const matched = byExternal?.vacancy ?? byUrl?.vacancy ?? byCanonical; const occurrence = byExternal?.occurrence ?? byUrl?.occurrence;
    let vacancyId: number;
    if (!matched) { const [created] = await db.insert(vacancies).values(values(item)).returning({ id: vacancies.id }); vacancyId = created.id; added++; }
    else {
      vacancyId = matched.id;
      if (byCanonical) {
        deduplicated++;
        const safe = mergeReliable(matched, values(item));
        await db.update(vacancies).set({ ...safe, lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(vacancies.id, vacancyId));
        if (Object.keys(safe).length > 0) updated++; else unchanged++;
      } else if (matched.contentHash === item.contentHash) { unchanged++; await db.update(vacancies).set({ lastSeenAt: new Date() }).where(eq(vacancies.id, vacancyId)); }
      else { updated++; await db.update(vacancies).set({ ...values(item), lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(vacancies.id, vacancyId)); }
    }
    if (occurrence) await db.update(vacancyOccurrences).set({ sourceRunId: run.id, externalId: item.externalId, sourceUrl: item.sourceUrl, lastSeenAt: new Date(), rawData: item.rawData }).where(eq(vacancyOccurrences.id, occurrence.id));
    else await db.insert(vacancyOccurrences).values({ vacancyId, sourceId: source.id, sourceRunId: run.id, externalId: item.externalId, sourceUrl: item.sourceUrl, rawData: item.rawData })
      .onConflictDoUpdate({ target: [vacancyOccurrences.sourceId, vacancyOccurrences.sourceUrl], set: { vacancyId, sourceRunId: run.id, externalId: item.externalId, lastSeenAt: new Date(), rawData: item.rawData } });
  }
  await db.update(sourceRuns).set({ status: runStatusForWarnings(warnings), finishedAt: new Date(), resultCount: fetched.results.length, newCount: added, changedCount: updated, warnings }).where(eq(sourceRuns.id, run.id));
  await writeSummary({ pages: fetched.pagesFetched, discovered: fetched.entries.length, parsed: fetched.results.length, added, updated, unchanged, deduplicated, failed: fetched.failedCount, warnings });
} catch (error) {
  await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), error: error instanceof Error ? error.message : "Onbekende fout" }).where(eq(sourceRuns.id, run.id)); throw error;
}
