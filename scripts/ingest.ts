import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { sources, sourceRuns, vacancies, vacancyOccurrences } from "../lib/db/schema";
import { fetchOneWorld, type NormalizedVacancy } from "../lib/ingestion/oneworld";

const db = getDb();
const [source] = await db.select().from(sources).where(eq(sources.slug, "oneworld"));
if (!source) throw new Error("Voer eerst pnpm db:seed uit");
const [run] = await db.insert(sourceRuns).values({ sourceId: source.id }).returning();

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
  const { results, warnings } = await fetchOneWorld();
  let added = 0;
  let changed = 0;
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
    let vacancyId: number;
    if (!old) {
      const [created] = await db.insert(vacancies).values(vacancyValues(item)).returning({ id: vacancies.id });
      vacancyId = created.id;
      added++;
    } else {
      vacancyId = old.id;
      if (old.contentHash !== item.contentHash || old.canonicalKey !== item.canonicalKey) changed++;
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
  console.log(`${results.length} vacatures; ${added} nieuw; ${changed} gewijzigd; ${warnings.length} waarschuwingen.`);
} catch (error) {
  await db.update(sourceRuns).set({ status: "error", finishedAt: new Date(), error: error instanceof Error ? error.message : "Onbekende fout" }).where(eq(sourceRuns.id, run.id));
  throw error;
}
