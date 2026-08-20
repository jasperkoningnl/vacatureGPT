import { expireKnownGoneUrls } from "../lib/vacancy-lifecycle";
import { CULTURELE_BASE_URL, batchFailureReason, fetchCulturele, mergeReliable, type CultureleVacancy } from "../lib/ingestion/culturele-vacatures-parser";
import { createIngestionWarning, parseIngestionWarning, runStatusForWarnings } from "../lib/ingestion/shared/ingestion-warnings";
import { runIngestSource, upsertIngestVacancy } from "../lib/ingestion/ingest-runner";

function values(item: CultureleVacancy) {
  return { canonicalKey: item.canonicalKey, title: item.title, employer: item.employer, location: item.location, hoursMin: item.hoursMin, hoursMax: item.hoursMax,
    hoursOriginal: item.hoursOriginal, salaryMin: item.salaryMin, salaryMax: item.salaryMax, salaryPeriod: item.salaryPeriod, salaryBasisHours: item.salaryBasisHours,
    salaryOriginal: item.salaryOriginal, deadline: item.deadline, description: item.originalText, originalText: item.originalText, contentHash: item.contentHash, active: true };
}

await runIngestSource({ slug: "culturele-vacatures", name: "Culturele Vacatures", baseUrl: CULTURELE_BASE_URL }, async ({ source, run, activity }) => {
  const fetched = await fetchCulturele();
  await expireKnownGoneUrls(source.id, fetched.goneUrls);
  const warnings = [...fetched.warnings, ...fetched.results.flatMap((item) => item.warnings.map((warning) => createIngestionWarning({ ...parseIngestionWarning(warning), url: item.sourceUrl })))];
  const failure = batchFailureReason(fetched.entries.length, fetched.results, fetched.failedCount);
  if (failure) throw new Error(`${failure} Geen vacaturewrites uitgevoerd.`);
  let added = 0; let updated = 0; let unchanged = 0; let deduplicated = 0;
  for (const item of fetched.results) {
    const result = await upsertIngestVacancy({ sourceId: source.id, runId: run.id, activity, item, values: values(item), mergeCanonical: (existing, incoming) => mergeReliable(existing, incoming) });
    if (result.outcome === "added") added++; else if (result.outcome === "updated") updated++; else unchanged++;
    if (result.duplicate) deduplicated++;
  }
  return { resultCount: fetched.results.length, newCount: added, changedCount: updated, unchanged, duplicates: deduplicated, failed: fetched.failedCount,
    warnings, trustworthy: fetched.failedCount === 0, status: runStatusForWarnings(warnings), summaryRows: [["Overview pages fetched", fetched.overviewPagesFetched], ["Paid vacancies discovered", fetched.entries.length], ["Parsed", fetched.results.length], ["Added", added], ["Updated", updated], ["Unchanged", unchanged], ["Deduplicated", deduplicated], ["Failed", fetched.failedCount], ["Warnings", warnings.length]] };
});
