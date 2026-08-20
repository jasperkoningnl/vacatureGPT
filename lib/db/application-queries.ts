import { and, asc, countDistinct, eq, sql } from "drizzle-orm";
import { getDb } from ".";
import { aiAssessments, feedback, sources, vacancies, vacancyOccurrences } from "./schema";
import { MIN_FULL_VACANCY_TEXT } from "../vacancy-depth";
import { rejectedVerdict } from "../vacancy-funnel";
import { buildVacancyListConditions, dedupeVacancyRows, parseVacancyListFilters, resolveSourceFilter, vacancyListOrdering, type RawSearchParams, type VacancyListFilters } from "../vacancy-list";

export type Database = ReturnType<typeof getDb>;

export async function queryVacancyList(db: Database, rawFilters: RawSearchParams) {
  const sourceOptions = await db.select({ slug: sources.slug, name: sources.name }).from(sources).orderBy(asc(sources.name));
  const parsed = parseVacancyListFilters(rawFilters);
  const filters = { ...parsed, source: resolveSourceFilter(parsed.source, sourceOptions.map(({ slug }) => slug)) };
  const [rows, rejectedCount] = await Promise.all([db.select({
    id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location,
    hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, salaryMin: vacancies.salaryMin,
    salaryMax: vacancies.salaryMax, salaryOriginal: vacancies.salaryOriginal, deadline: vacancies.deadline,
    url: vacancyOccurrences.sourceUrl, source: sources.name, feedback: feedback.value,
    aiScore: aiAssessments.score, aiVerdict: aiAssessments.verdict,
    // Dezelfde diepteregel als lib/vacancy-depth, maar in SQL zodat de lijst geen volledige vacatureteksten hoeft op te halen.
    metadataOnly: sql<boolean>`length(btrim(${vacancies.originalText})) < ${MIN_FULL_VACANCY_TEXT}`,
  }).from(vacancies)
    .innerJoin(vacancyOccurrences, and(eq(vacancies.id, vacancyOccurrences.vacancyId), eq(vacancyOccurrences.active, true)))
    .innerJoin(sources, eq(vacancyOccurrences.sourceId, sources.id))
    .leftJoin(feedback, eq(vacancies.id, feedback.vacancyId))
    .leftJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId))
    .where(and(...buildVacancyListConditions(filters)))
    .orderBy(vacancyListOrdering(filters.sort), asc(vacancyOccurrences.id)), countRejected(db, filters)]);

  return { sourceOptions, filters, items: dedupeVacancyRows(rows), rejectedCount };
}

/**
 * Hoeveel vacatures binnen dezelfde filters jij als niet passend hebt beoordeeld. De schakelaar
 * op de lijst noemt dit aantal, zodat verbergen zichtbaar blijft in plaats van stilzwijgend.
 */
export async function countRejected(db: Database, filters: VacancyListFilters) {
  const conditions = buildVacancyListConditions({ ...filters, feedback: undefined, rejected: "show" });
  const [row] = await db.select({ n: countDistinct(vacancies.id) }).from(vacancies)
    .innerJoin(vacancyOccurrences, and(eq(vacancies.id, vacancyOccurrences.vacancyId), eq(vacancyOccurrences.active, true)))
    .innerJoin(sources, eq(vacancyOccurrences.sourceId, sources.id))
    .innerJoin(feedback, eq(vacancies.id, feedback.vacancyId))
    .leftJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId))
    .where(and(...conditions, eq(feedback.value, rejectedVerdict)));
  return row?.n ?? 0;
}

export async function setSourceEnabled(db: Database, id: number, enabled: boolean) {
  const [stored] = await db.update(sources).set({ enabled }).where(eq(sources.id, id)).returning({ enabled: sources.enabled });
  if (!stored) throw new Error("Bron niet gevonden");
  return stored;
}

