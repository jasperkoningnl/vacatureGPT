import { asc, desc, eq, ilike, inArray, isNotNull, isNull, sql, SQL } from "drizzle-orm";
import { z } from "zod";
import { aiAssessments, feedback, sources, vacancies } from "./db/schema";
import { promisingAiVerdicts, type VacancyVerdict } from "./vacancy-funnel";

export const verdictFilterValues = ["interesting", "maybe", "not_suitable"] as const satisfies readonly VacancyVerdict[];
export const feedbackFilterValues = ["unreviewed", ...verdictFilterValues] as const;
export const aiFilterValues = ["unassessed", "promising", ...verdictFilterValues] as const;
export const salaryFilterValues = ["known", "unknown"] as const;
export const sortValues = ["newest", "deadline", "ai-score"] as const;

export type FeedbackFilter = (typeof feedbackFilterValues)[number];
export type AiFilter = (typeof aiFilterValues)[number];
export type SalaryFilter = (typeof salaryFilterValues)[number];
export type SortOption = (typeof sortValues)[number];

export type VacancyListFilters = {
  city?: string;
  employer?: string;
  source?: string;
  salary?: SalaryFilter;
  feedback?: FeedbackFilter;
  ai?: AiFilter;
  sort: SortOption;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Next kan elke queryparameter als array aanleveren; alleen de eerste niet-lege waarde telt. */
const text = z.preprocess((value) => {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof first === "string" ? first.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}, z.string().optional());

/** Onbekende of gemanipuleerde waarden vallen terug op "geen filter" in plaats van een enum-fout in Postgres. */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => text.pipe(z.enum(values).optional().catch(undefined));

const searchParamsSchema = z.object({
  city: text,
  employer: text,
  source: text,
  salary: optionalEnum(salaryFilterValues),
  feedback: optionalEnum(feedbackFilterValues),
  ai: optionalEnum(aiFilterValues),
  sort: text.pipe(z.enum(sortValues).catch("newest")),
});

const emptyFilters: VacancyListFilters = { city: undefined, employer: undefined, source: undefined, salary: undefined, feedback: undefined, ai: undefined, sort: "newest" };

/** Faalt nooit: elke onbruikbare queryparameter levert "geen filter" op in plaats van een fout. */
export function parseVacancyListFilters(params: RawSearchParams): VacancyListFilters {
  const result = searchParamsSchema.safeParse(params ?? {});
  return result.success ? result.data : { ...emptyFilters };
}

/** Een bronslug die niet (meer) bestaat levert geen lege pagina op maar simpelweg geen bronfilter. */
export function resolveSourceFilter(slug: string | undefined, knownSlugs: readonly string[]) {
  return slug && knownSlugs.includes(slug) ? slug : undefined;
}

export function buildVacancyListConditions(filters: VacancyListFilters): SQL[] {
  const conditions: SQL[] = [eq(vacancies.active, true)];
  if (filters.city) conditions.push(ilike(vacancies.location, `%${filters.city}%`));
  if (filters.employer) conditions.push(ilike(vacancies.employer, `%${filters.employer}%`));
  if (filters.source) conditions.push(eq(sources.slug, filters.source));
  if (filters.salary === "known") conditions.push(isNotNull(vacancies.salaryMin));
  if (filters.salary === "unknown") conditions.push(isNull(vacancies.salaryMin));
  if (filters.feedback === "unreviewed") conditions.push(isNull(feedback.id));
  else if (filters.feedback) conditions.push(eq(feedback.value, filters.feedback));
  if (filters.ai === "unassessed") conditions.push(isNull(aiAssessments.id));
  else if (filters.ai === "promising") conditions.push(inArray(aiAssessments.verdict, promisingAiVerdicts));
  else if (filters.ai) conditions.push(eq(aiAssessments.verdict, filters.ai));
  return conditions;
}

export function vacancyListOrdering(sort: SortOption) {
  if (sort === "deadline") return asc(vacancies.deadline);
  if (sort === "ai-score") return sql`case when ${aiAssessments.verdict} = 'interesting' then 0 when ${aiAssessments.verdict} = 'maybe' then 1 else 2 end, ${aiAssessments.score} desc nulls last, ${vacancies.firstSeenAt} desc`;
  return desc(vacancies.firstSeenAt);
}

export type VacancyOccurrenceLink = { url: string; source: string };
export type VacancyListItem<Row> = Row & { occurrences: VacancyOccurrenceLink[] };

/**
 * De lijstquery levert één rij per actieve vindplaats. Eén vacature hoort één keer in de lijst
 * te staan, met alle vindplaats-URL's erbij; de occurrence-data zelf blijft ongemoeid.
 */
export function dedupeVacancyRows<Row extends { id: number; url: string; source: string }>(rows: Row[]): VacancyListItem<Row>[] {
  const items = new Map<number, VacancyListItem<Row>>();
  for (const row of rows) {
    const existing = items.get(row.id);
    const item = existing ?? { ...row, occurrences: [] };
    if (!existing) items.set(row.id, item);
    if (!item.occurrences.some((occurrence) => occurrence.url === row.url && occurrence.source === row.source)) {
      item.occurrences.push({ url: row.url, source: row.source });
    }
  }
  return [...items.values()];
}
