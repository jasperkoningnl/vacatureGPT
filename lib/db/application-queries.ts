import { and, asc, countDistinct, eq, inArray } from "drizzle-orm";
import { getDb } from ".";
import { aiAssessments, sources, vacancies, vacancyOccurrences } from "./schema";
import { latestFeedbackPerVacancy } from "./latest-feedback";
import { MIN_FULL_VACANCY_TEXT } from "../vacancy-depth";
import { rejectedVerdict } from "../vacancy-funnel";
import { buildVacancyListConditions, dedupeVacancyRows, PAGE_SIZE, parseVacancyListFilters, resolveSourceFilter, vacancyListOrdering, type RawSearchParams, type VacancyListFilters } from "../vacancy-list";
import { sql } from "drizzle-orm";
export type Database = ReturnType<typeof getDb>;

export async function queryVacancyList(db: Database, rawFilters: RawSearchParams) {
  const sourceOptions = await db.select({ slug: sources.slug, name: sources.name }).from(sources).orderBy(asc(sources.name));
  const parsed = parseVacancyListFilters(rawFilters);
  const filters = { ...parsed, source: resolveSourceFilter(parsed.source, sourceOptions.map(({ slug }) => slug)) };
  const latest = latestFeedbackPerVacancy(db);
  const conditions = buildVacancyListConditions(filters, latest);
  const [countRow] = await db.select({ n: countDistinct(vacancies.id) }).from(vacancies)
    .innerJoin(vacancyOccurrences, and(eq(vacancies.id, vacancyOccurrences.vacancyId), eq(vacancyOccurrences.active, true)))
    .innerJoin(sources, eq(vacancyOccurrences.sourceId, sources.id)).leftJoin(latest, eq(vacancies.id, latest.vacancyId))
    .leftJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId)).where(and(...conditions));
  const total = countRow?.n ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(filters.page ?? 1, pageCount);
  const normalizedFilters = { ...filters, page };
  const ids = await db.select({ id: vacancies.id }).from(vacancies)
    .innerJoin(vacancyOccurrences, and(eq(vacancies.id, vacancyOccurrences.vacancyId), eq(vacancyOccurrences.active, true)))
    .innerJoin(sources, eq(vacancyOccurrences.sourceId, sources.id)).leftJoin(latest, eq(vacancies.id, latest.vacancyId))
    .leftJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId)).where(and(...conditions))
    .groupBy(vacancies.id, aiAssessments.id).orderBy(vacancyListOrdering(filters.sort)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const selectedIds = ids.map(({ id }) => id);
  const rows = selectedIds.length ? await db.select({
    id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location,
    hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax,
    salaryOriginal: vacancies.salaryOriginal, deadline: vacancies.deadline, url: vacancyOccurrences.sourceUrl, source: sources.name,
    feedback: latest.value, aiScore: aiAssessments.score, aiVerdict: aiAssessments.verdict,
    metadataOnly: sql<boolean>`length(btrim(${vacancies.originalText})) < ${MIN_FULL_VACANCY_TEXT}`,
  }).from(vacancies).innerJoin(vacancyOccurrences, and(eq(vacancies.id, vacancyOccurrences.vacancyId), eq(vacancyOccurrences.active, true)))
    .innerJoin(sources, eq(vacancyOccurrences.sourceId, sources.id)).leftJoin(latest, eq(vacancies.id, latest.vacancyId))
    .leftJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId)).where(inArray(vacancies.id, selectedIds)).orderBy(asc(vacancyOccurrences.id)) : [];
  const byId = new Map(dedupeVacancyRows(rows).map((item) => [item.id, item]));
  return { sourceOptions, filters: normalizedFilters, items: selectedIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []), total, pageCount, rejectedCount: await countRejected(db, filters) };
}

export async function countRejected(db: Database, filters: VacancyListFilters) {
  const latest = latestFeedbackPerVacancy(db);
  const conditions = buildVacancyListConditions({ ...filters, feedback: undefined, rejected: "show" }, latest);
  const [row] = await db.select({ n: countDistinct(vacancies.id) }).from(vacancies)
    .innerJoin(vacancyOccurrences, and(eq(vacancies.id, vacancyOccurrences.vacancyId), eq(vacancyOccurrences.active, true)))
    .innerJoin(sources, eq(vacancyOccurrences.sourceId, sources.id)).innerJoin(latest, eq(vacancies.id, latest.vacancyId))
    .leftJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId)).where(and(...conditions, eq(latest.value, rejectedVerdict)));
  return row?.n ?? 0;
}
export async function setSourceEnabled(db: Database, id: number, enabled: boolean) { const [stored] = await db.update(sources).set({ enabled }).where(eq(sources.id, id)).returning({ enabled: sources.enabled }); if (!stored) throw new Error("Bron niet gevonden"); return stored; }
