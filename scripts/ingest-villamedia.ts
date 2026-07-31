import { and, eq } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../lib/db";
import { sources, sourceRuns, vacancies, vacancyOccurrences } from "../lib/db/schema";
import { batchFailureReason, fetchVillamedia, type VillamediaVacancy, VILLAMEDIA_BASE_URL } from "../lib/ingestion/villamedia-parser";

const db = getDb();
const [source] = await db.insert(sources).values({ slug: "villamedia", name: "Villamedia", baseUrl: VILLAMEDIA_BASE_URL, enabled: true })
  .onConflictDoUpdate({ target: sources.slug, set: { name: "Villamedia", baseUrl: VILLAMEDIA_BASE_URL, enabled: true } }).returning();
const [run] = await db.insert(sourceRuns).values({ sourceId: source.id }).returning();

function vacancyValues(item: VillamediaVacancy) {
  return { canonicalKey: item.canonicalKey, title: item.title, employer: item.employer, location: item.location, hoursMin: item.hoursMin, hoursMax: item.hoursMax,
    hoursOriginal: item.hoursOriginal, salaryMin: item.salaryMin, salaryMax: item.salaryMax, salaryPeriod: item.salaryPeriod, salaryBasisHours: item.salaryBasisHours,
    salaryOriginal: item.salaryOriginal, deadline: item.deadline, description: item.originalText, originalText: item.originalText, contentHash: item.contentHash, active: true };
}
async function summary(values: { pages: number; discovered: number; parsed: number; added: number; updated: number; unchanged: number; duplicates: number; failed: number; warnings: string[] }) {
  const lines = ["## Villamedia ingestion summary", "", "| Result | Count |", "| --- | ---: |", `| Overview pages fetched | ${values.pages} |`,
    `| Unique vacancy URLs discovered | ${values.discovered} |`, `| Parsed | ${values.parsed} |`, `| Added | ${values.added} |`, `| Updated | ${values.updated} |`,
    `| Unchanged | ${values.unchanged} |`, `| Duplicates prevented | ${values.duplicates} |`, `| Failed | ${values.failed} |`, `| Warnings | ${values.warnings.length} |`, "",
    values.warnings.length ? `### Warnings\n${values.warnings.map((warning) => `- ${warning}`).join("\n")}` : "No warnings.", ""];
  console.log(`Villamedia summary: pages=${values.pages}, discovered=${values.discovered}, parsed=${values.parsed}, added=${values.added}, updated=${values.updated}, unchanged=${values.unchanged}, duplicates=${values.duplicates}, failed=${values.failed}, warnings=${values.warnings.length}`);
  values.warnings.forEach((warning) => console.warn(`Villamedia warning: ${warning}`));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"), "utf8");
}

let fetched: Awaited<ReturnType<typeof fetchVillamedia>> | undefined;
try {
  fetched = await fetchVillamedia();
  const warnings = [...fetched.warnings, ...fetched.results.flatMap((item) => item.warnings.map((warning) => `${item.sourceUrl}: ${warning}`))];
  const failure = batchFailureReason(fetched.entries.length, fetched.results, fetched.failedCount);
  if (failure) {
    warnings.push(failure);
    await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), resultCount: fetched.results.length, warnings, error: `${failure} Geen vacaturewrites uitgevoerd.` }).where(eq(sourceRuns.id, run.id));
    await summary({ pages: fetched.overviewPagesFetched, discovered: fetched.entries.length, parsed: fetched.results.length, added: 0, updated: 0, unchanged: 0, duplicates: 0, failed: fetched.failedCount, warnings });
    throw new Error("Villamedia-ingestie afgebroken vóór vacaturewrites.");
  }
  let added = 0; let updated = 0; let unchanged = 0; let duplicates = 0;
  for (const item of fetched.results) {
    const [byExternal] = item.externalId ? await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences }).from(vacancyOccurrences)
      .innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id)).where(and(eq(vacancyOccurrences.sourceId, source.id), eq(vacancyOccurrences.externalId, item.externalId))).limit(1) : [];
    const [byUrl] = byExternal ? [] : await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences }).from(vacancyOccurrences)
      .innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id)).where(and(eq(vacancyOccurrences.sourceId, source.id), eq(vacancyOccurrences.sourceUrl, item.sourceUrl))).limit(1);
    const [byCanonical] = byExternal || byUrl ? [] : await db.select().from(vacancies).where(eq(vacancies.canonicalKey, item.canonicalKey)).limit(1);
    const old = byExternal?.vacancy ?? byUrl?.vacancy ?? byCanonical;
    if (byCanonical) duplicates++;
    let vacancyId: number;
    if (!old) { const [created] = await db.insert(vacancies).values(vacancyValues(item)).returning({ id: vacancies.id }); vacancyId = created.id; added++; }
    else { vacancyId = old.id; if (old.contentHash === item.contentHash && old.canonicalKey === item.canonicalKey) unchanged++; else updated++;
      await db.update(vacancies).set({ ...vacancyValues(item), lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(vacancies.id, vacancyId)); }
    const occurrence = byExternal?.occurrence ?? byUrl?.occurrence;
    if (occurrence) await db.update(vacancyOccurrences).set({ sourceRunId: run.id, externalId: item.externalId, sourceUrl: item.sourceUrl, lastSeenAt: new Date(), rawData: item.rawData }).where(eq(vacancyOccurrences.id, occurrence.id));
    else await db.insert(vacancyOccurrences).values({ vacancyId, sourceId: source.id, sourceRunId: run.id, externalId: item.externalId, sourceUrl: item.sourceUrl, rawData: item.rawData })
      .onConflictDoUpdate({ target: [vacancyOccurrences.sourceId, vacancyOccurrences.sourceUrl], set: { vacancyId, sourceRunId: run.id, externalId: item.externalId, lastSeenAt: new Date(), rawData: item.rawData } });
  }
  await db.update(sourceRuns).set({ status: warnings.length ? "warning" : "success", finishedAt: new Date(), resultCount: fetched.results.length, newCount: added, changedCount: updated, warnings }).where(eq(sourceRuns.id, run.id));
  await summary({ pages: fetched.overviewPagesFetched, discovered: fetched.entries.length, parsed: fetched.results.length, added, updated, unchanged, duplicates, failed: fetched.failedCount, warnings });
} catch (error) {
  await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), error: error instanceof Error ? error.message : "Onbekende fout" }).where(eq(sourceRuns.id, run.id));
  throw error;
}
