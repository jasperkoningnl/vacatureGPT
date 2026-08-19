import { eq } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../lib/db";
import { sources, sourceRuns, vacancies, vacancyOccurrences } from "../lib/db/schema";
import { companyTitleKey, discoveryUrlsInRawData, fetchDiscoveryFeed, isDiscoveryDuplicate, normalizeDiscoveryUrl, type DiscoveryVacancy } from "../lib/ingestion/discovery-feed";
import { recomputeVacancyActivity, reconcileSuccessfulSourceRun } from "../lib/vacancy-lifecycle";

const repository = process.env.GITHUB_REPOSITORY || "jasperkoningnl/vacatureGPT";
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN ontbreekt; de discovery-feed kan niet worden gelezen.");

const db = getDb();
const [source] = await db.insert(sources).values({ slug: "github-discovery", name: "GitHub discovery feed", baseUrl: `https://github.com/${repository}/tree/discovery-data`, enabled: true })
  .onConflictDoUpdate({ target: sources.slug, set: { name: "GitHub discovery feed", baseUrl: `https://github.com/${repository}/tree/discovery-data`, enabled: true } }).returning();
const [run] = await db.insert(sourceRuns).values({ sourceId: source.id }).returning();

async function writeSummary(found: number, imported: number, duplicates: number, errors: string[]) {
  const lines = ["## GitHub discovery import", "", "| Resultaat | Aantal |", "| --- | ---: |", `| Discovery postings gevonden | ${found} |`,
    `| Nieuw geïmporteerd | ${imported} |`, `| Overgeslagen als duplicate | ${duplicates} |`, `| Fouten | ${errors.length} |`];
  if (errors.length) lines.push("", "### Fouten", ...errors.map((error) => `- ${error}`));
  console.log(`Discovery summary: found=${found}, imported=${imported}, duplicates=${duplicates}, errors=${errors.length}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `found=${found}\nimported=${imported}\nduplicates=${duplicates}\nerrors=${errors.length}\n`, "utf8");
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, "utf8");
}

function values(item: DiscoveryVacancy) {
  return { canonicalKey: item.canonicalKey, title: item.title, employer: item.employer, location: item.location,
    hoursMin: item.hoursMin, hoursMax: item.hoursMax, hoursOriginal: item.hoursOriginal,
    salaryMin: item.salaryMin, salaryMax: item.salaryMax, salaryPeriod: item.salaryPeriod, salaryOriginal: item.salaryOriginal,
    description: item.originalText, originalText: item.originalText, contentHash: item.contentHash,
    firstSeenAt: item.firstSeenAt, lastSeenAt: new Date(), active: true };
}

let found = 0; let imported = 0; let duplicates = 0; let errors: string[] = [];
try {
  const feed = await fetchDiscoveryFeed(repository, token);
  found = feed.postingsFound; errors = feed.errors;
  const existingVacancies = await db.select({ id: vacancies.id, employer: vacancies.employer, title: vacancies.title }).from(vacancies);
  const existingOccurrences = await db.select({ id: vacancyOccurrences.id, vacancyId: vacancyOccurrences.vacancyId, sourceId: vacancyOccurrences.sourceId, sourceUrl: vacancyOccurrences.sourceUrl, rawData: vacancyOccurrences.rawData }).from(vacancyOccurrences);
  const urlToVacancy = new Map<string, number>();
  for (const row of existingOccurrences) {
    const occurrenceUrl = normalizeDiscoveryUrl(row.sourceUrl);
    if (occurrenceUrl) urlToVacancy.set(occurrenceUrl, row.vacancyId);
    for (const rawUrl of discoveryUrlsInRawData(row.rawData)) urlToVacancy.set(rawUrl, row.vacancyId);
  }
  const knownUrls = new Set(urlToVacancy.keys());
  const knownCompanyTitles = new Set(existingVacancies.map((row) => companyTitleKey(row.employer, row.title)));
  const companyTitleToVacancy = new Map(existingVacancies.map((row) => [companyTitleKey(row.employer, row.title), row.id]));

  for (const item of feed.vacancies) {
    const duplicate = isDiscoveryDuplicate(item, knownUrls, knownCompanyTitles);
    if (duplicate) {
      duplicates++;
      const vacancyId = (item.normalizedDirectUrl ? urlToVacancy.get(item.normalizedDirectUrl) : undefined)
        ?? (item.normalizedSourceUrl ? urlToVacancy.get(item.normalizedSourceUrl) : undefined)
        ?? companyTitleToVacancy.get(item.companyTitleKey);
      if (!vacancyId) throw new Error(`Duplicate kon niet aan een bestaande vacature worden gekoppeld: ${item.employer} / ${item.title}`);
      const occurrence = existingOccurrences.find((row) => row.sourceId === source.id && normalizeDiscoveryUrl(row.sourceUrl) === normalizeDiscoveryUrl(item.sourceUrl));
      if (occurrence) await db.update(vacancyOccurrences).set({ sourceRunId: run.id, lastSeenAt: new Date(), active: true, rawData: item.rawData }).where(eq(vacancyOccurrences.id, occurrence.id));
      else await db.insert(vacancyOccurrences).values({ vacancyId, sourceId: source.id, sourceRunId: run.id, sourceUrl: item.sourceUrl, rawData: item.rawData, active: true })
        .onConflictDoUpdate({ target: [vacancyOccurrences.sourceId, vacancyOccurrences.sourceUrl], set: { vacancyId, sourceRunId: run.id, lastSeenAt: new Date(), active: true, rawData: item.rawData } });
      await recomputeVacancyActivity([vacancyId]);
      continue;
    }
    const [created] = await db.insert(vacancies).values(values(item)).returning({ id: vacancies.id });
    await db.insert(vacancyOccurrences).values({ vacancyId: created.id, sourceId: source.id, sourceRunId: run.id, sourceUrl: item.sourceUrl, rawData: item.rawData, active: true });
    imported++;
    if (item.normalizedDirectUrl) knownUrls.add(item.normalizedDirectUrl);
    if (item.normalizedSourceUrl) knownUrls.add(item.normalizedSourceUrl);
    knownCompanyTitles.add(item.companyTitleKey);
    urlToVacancy.set(item.sourceUrl, created.id);
    companyTitleToVacancy.set(item.companyTitleKey, created.id);
  }
  await reconcileSuccessfulSourceRun(source.id, run.id);
  await db.update(sourceRuns).set({ status: errors.length ? "warning" : "success", finishedAt: new Date(), resultCount: found, newCount: imported, warnings: errors }).where(eq(sourceRuns.id, run.id));
  await writeSummary(found, imported, duplicates, errors);
} catch (error) {
  const message = error instanceof Error ? error.message : "Onbekende discovery-importfout";
  await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), resultCount: found, newCount: imported, warnings: errors, error: message }).where(eq(sourceRuns.id, run.id));
  await writeSummary(found, imported, duplicates, [...errors, message]);
  throw error;
}
