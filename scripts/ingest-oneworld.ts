import { and, eq } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../lib/db";
import { sources, sourceRuns, vacancies, vacancyOccurrences } from "../lib/db/schema";
import { fetchOneWorld, fetchOneWorldUrls, matchRepairOccurrence, repairFailureReason, type NormalizedVacancy } from "../lib/ingestion/oneworld-parser";
import { createIngestionWarning, runStatusForWarnings, warningsMarkdown } from "../lib/ingestion/shared/ingestion-warnings";

const db = getDb();
const [source] = await db.select().from(sources).where(eq(sources.slug, "oneworld"));
if (!source) throw new Error("Voer eerst pnpm db:seed uit");
const [run] = await db.insert(sourceRuns).values({ sourceId: source.id }).returning();
const isRepair = process.argv.includes("--repair");

async function writeSummary(values: { requested: number; parsed: number; updated: number; unchanged: number; failed: number; duplicates: number; added: number; warnings: string[] }) {
  const lines = [
    "## OneWorld repair summary",
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Requested URLs | ${values.requested} |`,
    `| Parsed pages | ${values.parsed} |`,
    `| Updated | ${values.updated} |`,
    `| Unchanged | ${values.unchanged} |`,
    `| Failed | ${values.failed} |`,
    `| Duplicates prevented | ${values.duplicates} |`,
    `| Newly imported | ${values.added} |`,
    "",
    warningsMarkdown(values.warnings),
    "",
  ];
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"), "utf8");
  console.log(`OneWorld summary: requested=${values.requested}, parsed=${values.parsed}, updated=${values.updated}, unchanged=${values.unchanged}, failed=${values.failed}, duplicates=${values.duplicates}, added=${values.added}`);
  for (const warning of values.warnings) console.warn(`OneWorld warning: ${warning}`);
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
  const repairOccurrences = isRepair ? await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences })
    .from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id))
    .where(eq(vacancyOccurrences.sourceId, source.id)) : [];
  const repairUrls = repairOccurrences.map(({ occurrence }) => occurrence.sourceUrl);
  const fetched = isRepair ? await fetchOneWorldUrls(repairUrls) : await fetchOneWorld();
  const { results, failedCount, requestedCount } = fetched;
  const warnings = [...fetched.warnings];
  const repairFailure = isRepair ? repairFailureReason(requestedCount, results.length, failedCount, warnings) : null;
  // Validate the complete batch before changing any vacancy or occurrence.
  if (repairFailure) {
    warnings.push(createIngestionWarning({ severity: "critical", category: "batch", message: `${repairFailure} Er zijn geen vacatures gewijzigd.` }));
    await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), resultCount: results.length, warnings, error: `${repairFailure} Er zijn geen vacatures gewijzigd.` }).where(eq(sourceRuns.id, run.id));
    await writeSummary({ requested: requestedCount, parsed: results.length, updated: 0, unchanged: 0, failed: failedCount, duplicates: repairUrls.length - requestedCount, added: 0, warnings });
    throw new Error("OneWorld-reparatie afgebroken vóór databasewijzigingen. Bekijk het workflowoverzicht.");
  }
  let added = 0;
  let changed = 0;
  let unchanged = 0;
  let duplicates = isRepair ? repairUrls.length - requestedCount : 0;
  for (const item of results) {
    if (isRepair) {
      const matched = matchRepairOccurrence(item, repairOccurrences.map(({ occurrence }) => occurrence));
      if (!matched) {
        warnings.push(createIngestionWarning({ severity: "warning", category: "identity", url: item.sourceUrl, message: "Bestaande vacature niet veilig teruggevonden — deze occurrence is overgeslagen en er is geen nieuwe vacature aangemaakt." }));
        continue;
      }
      const existing = repairOccurrences.find(({ occurrence }) => occurrence.id === matched.id)!;
      if (existing.vacancy.contentHash !== item.contentHash || existing.vacancy.canonicalKey !== item.canonicalKey) changed++;
      else unchanged++;
      await db.update(vacancies).set({ ...vacancyValues(item), lastSeenAt: new Date(), updatedAt: new Date() }).where(eq(vacancies.id, existing.vacancy.id));
      await db.update(vacancyOccurrences).set({ sourceRunId: run.id, externalId: item.externalId, lastSeenAt: new Date(), rawData: item.rawData }).where(eq(vacancyOccurrences.id, matched.id));
      continue;
    }
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
  await db.update(sourceRuns).set({ status: runStatusForWarnings(warnings), finishedAt: new Date(), resultCount: results.length, newCount: added, changedCount: changed, warnings }).where(eq(sourceRuns.id, run.id));
  await writeSummary({ requested: requestedCount, parsed: results.length, updated: changed, unchanged, failed: failedCount, duplicates, added, warnings });
} catch (error) {
  await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), error: error instanceof Error ? error.message : "Onbekende fout" }).where(eq(sourceRuns.id, run.id));
  throw error;
}
