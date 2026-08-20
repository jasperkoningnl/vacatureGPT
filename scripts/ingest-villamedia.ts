import { activeForDiscoveredOccurrence, expireKnownGoneUrls } from "../lib/vacancy-lifecycle";
import { batchFailureReason, fetchVillamedia, type VillamediaVacancy, VILLAMEDIA_BASE_URL } from "../lib/ingestion/villamedia-parser";
import { createIngestionWarning, parseIngestionWarning, runStatusForWarnings } from "../lib/ingestion/shared/ingestion-warnings";
import { runIngestSource, upsertIngestVacancy } from "../lib/ingestion/ingest-runner";

function values(item: VillamediaVacancy) {
  return { canonicalKey: item.canonicalKey, title: item.title, employer: item.employer, location: item.location, hoursMin: item.hoursMin, hoursMax: item.hoursMax,
    hoursOriginal: item.hoursOriginal, salaryMin: item.salaryMin, salaryMax: item.salaryMax, salaryPeriod: item.salaryPeriod, salaryBasisHours: item.salaryBasisHours,
    salaryOriginal: item.salaryOriginal, deadline: item.deadline, description: item.originalText, originalText: item.originalText, contentHash: item.contentHash, active: !item.isStage };
}

await runIngestSource({ slug: "villamedia", name: "Villamedia", baseUrl: VILLAMEDIA_BASE_URL }, async ({ source, run }) => {
  const fetched = await fetchVillamedia();
  await expireKnownGoneUrls(source.id, fetched.goneUrls);
  const warnings = [...fetched.warnings, ...fetched.results.flatMap((item) => item.warnings.map((warning) => createIngestionWarning({ ...parseIngestionWarning(warning), url: item.sourceUrl })))];
  const failure = batchFailureReason(fetched.entries.length, fetched.results, fetched.failedCount);
  if (failure) throw new Error(`${failure} Geen vacaturewrites uitgevoerd.`);
  let added = 0; let updated = 0; let unchanged = 0; let duplicates = 0;
  for (const item of fetched.results) {
    const result = await upsertIngestVacancy({ sourceId: source.id, runId: run.id, item, values: values(item), active: activeForDiscoveredOccurrence(item), refreshUnchanged: true });
    if (result.outcome === "added") added++; else if (result.outcome === "updated") updated++; else unchanged++;
    if (result.duplicate) duplicates++;
  }
  return { resultCount: fetched.results.length, newCount: added, changedCount: updated, unchanged, duplicates, failed: fetched.failedCount, warnings,
    trustworthy: fetched.failedCount === 0, status: runStatusForWarnings(warnings), summaryRows: [["Overview pages fetched", fetched.overviewPagesFetched], ["Unique vacancy URLs discovered", fetched.entries.length], ["Parsed", fetched.results.length], ["Added", added], ["Updated", updated], ["Unchanged", unchanged], ["Duplicates prevented", duplicates], ["Failed", fetched.failedCount], ["Warnings", warnings.length]] };
});
