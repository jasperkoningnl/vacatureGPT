import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { vacancies, vacancyOccurrences } from "../lib/db/schema";
import { expireKnownGoneUrls, recomputeVacancyActivity } from "../lib/vacancy-lifecycle";
import { fetchOneWorld, fetchOneWorldUrls, matchRepairOccurrence, repairFailureReason, type NormalizedVacancy } from "../lib/ingestion/oneworld-parser";
import { createIngestionWarning, runStatusForWarnings } from "../lib/ingestion/shared/ingestion-warnings";
import { runIngestSource, upsertIngestVacancy } from "../lib/ingestion/ingest-runner";

const db = getDb();
const isRepair = process.argv.includes("--repair");

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

await runIngestSource({ slug: "oneworld", name: "OneWorld", baseUrl: "https://www.oneworld.nl" }, async ({ source, run }) => {
  const repairOccurrences = isRepair ? await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences })
    .from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id))
    .where(eq(vacancyOccurrences.sourceId, source.id)) : [];
  const repairUrls = repairOccurrences.map(({ occurrence }) => occurrence.sourceUrl);
  const fetched = isRepair ? await fetchOneWorldUrls(repairUrls) : await fetchOneWorld();
  const { results, failedCount, requestedCount } = fetched;
  await expireKnownGoneUrls(source.id, fetched.goneUrls);
  const warnings = [...fetched.warnings];
  const repairFailure = repairFailureReason(requestedCount, results.length + fetched.goneUrls.length, failedCount, warnings);
  // Validate the complete batch before changing any vacancy or occurrence.
  if (repairFailure) {
    warnings.push(createIngestionWarning({ severity: "critical", category: "batch", message: `${repairFailure} Er zijn geen vacatures gewijzigd.` }));
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
      await db.update(vacancyOccurrences).set({ active: true, sourceRunId: run.id, externalId: item.externalId, lastSeenAt: new Date(), rawData: item.rawData }).where(eq(vacancyOccurrences.id, matched.id));
      await recomputeVacancyActivity([existing.vacancy.id]);
      continue;
    }
    const result = await upsertIngestVacancy({ sourceId: source.id, runId: run.id, item, values: vacancyValues(item), refreshUnchanged: true });
    if (result.outcome === "added") added++; else if (result.outcome === "updated") changed++; else unchanged++;
    if (result.duplicate) duplicates++;
  }
  return { resultCount: results.length, newCount: added, changedCount: changed, unchanged, duplicates, failed: failedCount, warnings,
    trustworthy: !isRepair && fetched.failedCount === 0, status: runStatusForWarnings(warnings), summaryRows: [["Requested URLs", requestedCount], ["Parsed pages", results.length], ["Updated", changed], ["Unchanged", unchanged], ["Failed", failedCount], ["Duplicates prevented", duplicates], ["Newly imported", added]] };
});
