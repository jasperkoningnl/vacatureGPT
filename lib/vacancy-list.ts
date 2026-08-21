import type { AnyColumn } from "drizzle-orm";
import { asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, SQL } from "drizzle-orm";
import { z } from "zod";
import { aiAssessments, feedback, sources, vacancies } from "./db/schema";
import { promisingAiVerdicts, rejectedVerdict, type VacancyVerdict } from "./vacancy-funnel";

export const verdictFilterValues = ["interesting", "maybe", "not_suitable"] as const satisfies readonly VacancyVerdict[];
export const feedbackFilterValues = ["unreviewed", ...verdictFilterValues] as const;
export const aiFilterValues = ["unassessed", "promising", ...verdictFilterValues] as const;
export const salaryFilterValues = ["known", "unknown"] as const;
export const sortValues = ["newest", "deadline", "ai-score"] as const;
export const PAGE_SIZE = 25;
export const rejectedFilterValues = ["show"] as const;

export type FeedbackFilter = (typeof feedbackFilterValues)[number];
export type AiFilter = (typeof aiFilterValues)[number];
export type SalaryFilter = (typeof salaryFilterValues)[number];
export type SortOption = (typeof sortValues)[number];
export type RejectedFilter = (typeof rejectedFilterValues)[number];

export type VacancyListFilters = {
  query?: string;
  city?: string;
  employer?: string;
  source?: string;
  salary?: SalaryFilter;
  feedback?: FeedbackFilter;
  ai?: AiFilter;
  /** Alleen een expliciete keuze haalt afgewezen vacatures terug in beeld. */
  rejected?: RejectedFilter;
  sort: SortOption;
  page?: number;
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
  query: text,
  city: text,
  employer: text,
  source: text,
  salary: optionalEnum(salaryFilterValues),
  feedback: optionalEnum(feedbackFilterValues),
  ai: optionalEnum(aiFilterValues),
  rejected: optionalEnum(rejectedFilterValues),
  sort: text.pipe(z.enum(sortValues).catch("newest")),
  page: z.preprocess((value) => Array.isArray(value) ? value[0] : value, z.coerce.number().int().positive().catch(1)),
});

const emptyFilters: VacancyListFilters = { query: undefined, city: undefined, employer: undefined, source: undefined, salary: undefined, feedback: undefined, ai: undefined, rejected: undefined, sort: "newest", page: 1 };

/** Faalt nooit: elke onbruikbare queryparameter levert "geen filter" op in plaats van een fout. */
export function parseVacancyListFilters(params: RawSearchParams): VacancyListFilters {
  const result = searchParamsSchema.safeParse(params ?? {});
  return result.success ? { ...emptyFilters, ...result.data } : { ...emptyFilters };
}

/** Een bronslug die niet (meer) bestaat levert geen lege pagina op maar simpelweg geen bronfilter. */
export function resolveSourceFilter(slug: string | undefined, knownSlugs: readonly string[]) {
  return slug && knownSlugs.includes(slug) ? slug : undefined;
}

/**
 * Afgewezen vacatures zijn standaard weggelegd. Ze komen alleen terug als je de schakelaar
 * aanzet of als je er expliciet op filtert — dan vraag je er immers zelf om.
 */
export function showsRejected(filters: Pick<VacancyListFilters, "rejected" | "feedback">) {
  return filters.rejected === "show" || filters.feedback === rejectedVerdict;
}

export function buildVacancyListConditions(filters: VacancyListFilters, currentFeedback: { id: AnyColumn; value: AnyColumn } = feedback): SQL[] {
  const conditions: SQL[] = [eq(vacancies.active, true)];
  if (filters.query) conditions.push(or(ilike(vacancies.title, `%${filters.query}%`), ilike(vacancies.employer, `%${filters.query}%`), ilike(vacancies.description, `%${filters.query}%`), ilike(vacancies.originalText, `%${filters.query}%`))!);
  if (filters.city) conditions.push(ilike(vacancies.location, `%${filters.city}%`));
  if (filters.employer) conditions.push(ilike(vacancies.employer, `%${filters.employer}%`));
  if (filters.source) conditions.push(eq(sources.slug, filters.source));
  if (filters.salary === "known") conditions.push(isNotNull(vacancies.salaryMin));
  if (filters.salary === "unknown") conditions.push(isNull(vacancies.salaryMin));
  if (filters.feedback === "unreviewed") conditions.push(isNull(currentFeedback.id));
  else if (filters.feedback) conditions.push(eq(currentFeedback.value, filters.feedback));
  if (!showsRejected(filters)) conditions.push(or(isNull(currentFeedback.value), ne(currentFeedback.value, rejectedVerdict))!);
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

/**
 * Bladeren begint zelden bij een leeg formulier. Deze vaste ingangen dekken de vragen die je
 * echt stelt — wat wachtte er nog, wat liet de AI liggen, wat vond ik zelf goed — en zetten
 * precies dezelfde filters als het formulier eronder, zodat er geen tweede waarheid ontstaat.
 */
export type ListPreset = { key: string; label: string; description: string; params: Partial<Record<"feedback" | "ai" | "sort" | "rejected", string>> };

export const listPresets: ListPreset[] = [
  { key: "promising", label: "Kansrijk volgens AI", description: "Wat nu in je beoordeelrij staat.", params: { feedback: "unreviewed", ai: "promising", sort: "ai-score" } },
  { key: "passed-over", label: "Door AI weggelaten", description: "Wat de selectie niet haalde en dus nooit in je mail kwam.", params: { feedback: "unreviewed", ai: "not_suitable", sort: "newest" } },
  { key: "unreviewed", label: "Nog niet beoordeeld", description: "Alles zonder eigen oordeel, ongeacht wat de AI vond.", params: { feedback: "unreviewed", sort: "newest" } },
  { key: "interesting", label: "Door mij interessant", description: "Je eigen positieve oordelen.", params: { feedback: "interesting", sort: "newest" } },
  { key: "rejected", label: "Door mij afgewezen", description: "Wat je hebt weggelegd; standaard verborgen.", params: { feedback: "not_suitable", rejected: "show", sort: "newest" } },
  { key: "all", label: "Alles", description: "De volledige actieve lijst.", params: { sort: "newest" } },
];

export function presetSearch(preset: ListPreset): string {
  const params = new URLSearchParams(preset.params as Record<string, string>);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Een preset is actief als elk veld dat hij zet ook echt zo staat, en er geen ander oordeelfilter tussen zit. */
export function activePresetKey(filters: VacancyListFilters): string | null {
  const current = { feedback: filters.feedback, ai: filters.ai, rejected: filters.rejected };
  for (const preset of listPresets) {
    const wanted = { feedback: preset.params.feedback, ai: preset.params.ai, rejected: preset.params.rejected };
    if (current.feedback === wanted.feedback && current.ai === wanted.ai && current.rejected === wanted.rejected) return preset.key;
  }
  return null;
}
