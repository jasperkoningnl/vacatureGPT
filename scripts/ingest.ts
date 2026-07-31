import { and, eq } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../lib/db";
import { sources, sourceRuns, vacancies, vacancyOccurrences } from "../lib/db/schema";
import { fetchOneWorld, isCriticalQualityWarning, type NormalizedVacancy } from "../lib/ingestion/oneworld";

const db = getDb();
const [source] = await db.select().from(sources).where(eq(sources.slug, "oneworld"));
if (!source) throw new Error("Voer eerst pnpm db:seed uit");
const [run] = await db.insert(sourceRuns).values({ sourceId: source.id }).returning();
const isRepair = process.argv.includes("--repair");

async function writeSummary(values: { updated: number; unchanged: number; failed: number; duplicates: number; added: number; warnings: string[] }) {
  const lines = [
    "## OneWorld repair summary",
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Updated | ${values.updated} |`,
    `| Unchanged | ${values.unchanged} |`,
    `| Failed | ${values.failed} |`,
    `| Duplicates prevented | ${values.duplicates} |`,
    `| Newly imported | ${values.added} |`,
    "",
    values.warnings.length ? `### Warnings\n${values.warnings.map((warning) => `- ${warning}`).join("\n")}` : "No warnings.",
    "",
  ];
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"), "utf8");
  console.log(`OneWorld summary: updated=${values.updated}, unchanged=${values.unchanged}, failed=${values.failed}, duplicates=${values.duplicates}, added=${values.added}`);
}

function vacancyValues(item: NormalizedVacancy) {
  return {
    canonicalKey: item.canonicalKey,
    title: item.title,
    employer: item.employer,
    location: item.location,
    hoursMin: item.hoursMin,
    hoursMax: item.hoursMax,
    hoursOriginal: item.hoursOriginal,
    salaryMin: item.salaryMin,
    salaryMax: item.salaryMax,
    salaryPeriod: item.salaryPeriod,
    salaryBasisHours: item.salaryBasisHours,
    salaryOriginal: item.salaryOriginal,
    deadline: item.deadline,
    description: item.originalText,
    originalText: item.originalText,
    contentHash: item.contentHash,
    active: true,
  };
}

try {
  const { results, warnings, failedCount } = await fetchOneWorld();
  const failedQualityChecks = failedCount > 0 || warnings.some(isCriticalQualityWarning);
  // A manually triggered repair is all-or-nothing with respect to extraction quality:
  // validate the complete fetch before changing any vacancy or occurrence.
  if (isRepair && failedQualityChecks) {
    await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), resultCount: results.length, warnings, error: "OneWorld-kwaliteitscontrole mislukt; er zijn geen vacatures gewijzigd." }).where(eq(sourceRuns.id, run.id));
    await writeSummary({ updated: 0, unchanged: 0, failed: failedCount, duplicates: 0, added: 0, warnings });
    throw new Error("OneWorld-reparatie afgebroken vóór databasewijzigingen. Bekijk het workflowoverzicht.");
  }
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  let duplicates = 0;
  for (const item of results) {
    // Identity is deliberately resolved before canonical data: corrected employer/title must
    // repair the vacancy attached to the source occurrence rather than create a duplicate.
    const [byExternalId] = item.externalId ? await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences })
      .from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id))
      .where(and(eq(vacancyOccurrences.sourceId, source.id), eq(vacancyOccurrences.externalId, item.externalId))).limit(1) : [];
    const [byUrl] = byExternalId ? [] : await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences })
      .from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id))
      .where(and(eq(vacancyOccurrences.sourceId, source.id), eq(vacancyOccurrences.sourceUrl, item.sourceUrl))).limit(1);
    const [byCanonical] = byExternalId || byUrl ? [] : await db.select().from(vacancies)
      .where(eq(vacancies.canonicalKey, item.canonicalKey)).limit(1);
    const old = byExternalId?.vacancy ?? byUrl?.vacancy ?? byCanonical;
    if (byCanonical) duplicates++;
    let vacancyId: number;
    if (!old) {
      const [created] = await db.insert(vacancies).values(vacancyValues(item)).returning({ id: vacancies.id });
      vacancyId = created.id;
      added++;
    } else {
      vacancyId = old.id;
      if (old.contentHash !== item.contentHash || old.canonicalKey !== item.canonicalKey) changed++;
      else unchanged++;
      await db.update(vacancies).set({ ...vacancyValues(item), lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(vacancies.id, old.id));
    }

    const occurrence = byExternalId?.occurrence ?? byUrl?.occurrence;
    if (occurrence) {
      await db.update(vacancyOccurrences).set({ sourceRunId: run.id, externalId: item.externalId, sourceUrl: item.sourceUrl, lastSeenAt: new Date(), rawData: item.rawData }).where(eq(vacancyOccurrences.id, occurrence.id));
    } else {
      await db.insert(vacancyOccurrences).values({ vacancyId, sourceId: source.id, sourceRunId: run.id, externalId: item.externalId, sourceUrl: item.sourceUrl, rawData: item.rawData })
        .onConflictDoUpdate({ target: [vacancyOccurrences.sourceId, vacancyOccurrences.sourceUrl], set: { vacancyId, sourceRunId: run.id, externalId: item.externalId, lastSeenAt: new Date(), rawData: item.rawData } });
    }
  }
  await db.update(sourceRuns).set({ status: warnings.length ? "warning" : "success", finishedAt: new Date(), resultCount: results.length, newCount: added, changedCount: changed, warnings }).where(eq(sourceRuns.id, run.id));
  await writeSummary({ updated: changed, unchanged, failed: failedCount, duplicates, added, warnings });
} catch (error) {
  await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), error: error instanceof Error ? error.message : "Onbekende fout" }).where(eq(sourceRuns.id, run.id));
  throw error;
}
