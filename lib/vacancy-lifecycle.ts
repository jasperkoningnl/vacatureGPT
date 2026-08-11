import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "./db";
import { vacancies, vacancyOccurrences } from "./db/schema";

export const STALE_AFTER_DAYS = 14;
export function isStaleOccurrence(lastSeenAt: Date, now = new Date()) {
  return lastSeenAt.getTime() < now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export function deriveVacancyActive(occurrences: Array<{ active: boolean }>) {
  return occurrences.some((occurrence) => occurrence.active);
}

export function activeForDiscoveredOccurrence(item: { isStage?: boolean }) {
  return item.isStage !== true;
}

export type ReconciledOccurrence = { id: number; sourceId: number; sourceRunId: number | null; active: boolean; lastSeenAt: Date };
/** Pure lifecycle model used to document and test the safety boundary around reconciliation. */
export function reconcileOccurrenceStates(rows: ReconciledOccurrence[], sourceId: number, runId: number, trustworthy: boolean, now = new Date()) {
  return rows.map((row) => {
    if (row.sourceId !== sourceId || !trustworthy) return row;
    return row.sourceRunId === runId ? { ...row, active: true, lastSeenAt: now } : { ...row, active: false };
  });
}

export async function recomputeVacancyActivity(vacancyIds: number[]) {
  if (!vacancyIds.length) return 0;
  const db = getDb();
  await db.update(vacancies).set({
    active: sql<boolean>`exists (select 1 from ${vacancyOccurrences} o where o.vacancy_id = ${vacancies.id} and o.active = true)`,
    updatedAt: new Date(),
  }).where(inArray(vacancies.id, vacancyIds));
  return vacancyIds.length;
}

/** Called only after the source's existing batch-safety checks have passed. */
export async function reconcileSuccessfulSourceRun(sourceId: number, sourceRunId: number) {
  const db = getDb();
  const missing = await db.update(vacancyOccurrences).set({ active: false })
    .where(and(eq(vacancyOccurrences.sourceId, sourceId), eq(vacancyOccurrences.active, true), or(isNull(vacancyOccurrences.sourceRunId), ne(vacancyOccurrences.sourceRunId, sourceRunId))))
    .returning({ vacancyId: vacancyOccurrences.vacancyId });
  const affected = [...new Set(missing.map((row) => row.vacancyId))];
  await recomputeVacancyActivity(affected);
  return { expiredOccurrences: missing.length, affectedVacancies: affected.length };
}

export async function expireKnownGoneUrls(sourceId: number, urls: string[]) {
  if (!urls.length) return { expiredOccurrences: 0, affectedVacancies: 0 };
  const gone = await getDb().update(vacancyOccurrences).set({ active: false })
    .where(and(eq(vacancyOccurrences.sourceId, sourceId), eq(vacancyOccurrences.active, true), inArray(vacancyOccurrences.sourceUrl, urls)))
    .returning({ vacancyId: vacancyOccurrences.vacancyId });
  const affected = [...new Set(gone.map((row) => row.vacancyId))];
  await recomputeVacancyActivity(affected);
  return { expiredOccurrences: gone.length, affectedVacancies: affected.length };
}

export async function cleanupStaleOccurrences(now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db.update(vacancyOccurrences).set({ active: false })
    .where(and(eq(vacancyOccurrences.active, true), lt(vacancyOccurrences.lastSeenAt, cutoff)))
    .returning({ vacancyId: vacancyOccurrences.vacancyId });
  const affected = [...new Set(stale.map((row) => row.vacancyId))];
  await recomputeVacancyActivity(affected);
  return { expiredOccurrences: stale.length, affectedVacancies: affected.length, cutoff };
}
