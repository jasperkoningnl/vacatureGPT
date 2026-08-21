import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { latestFeedbackPerVacancy } from "@/lib/db/latest-feedback";
import { aiAssessments, sources, vacancies, vacancyOccurrences, vacancyTracking } from "@/lib/db/schema";
import type { AssessmentData, VacancyDetailData } from "@/app/components/vacancy-parts";
import type { FeedbackDecision } from "./feedback-validation";
import { REVIEW_QUEUE_LIMIT, reviewQueueAiVerdicts } from "./review-queue";
import { rejectedVerdict } from "./vacancy-funnel";

export type ReviewQueueItem = {
  vacancy: VacancyDetailData;
  assessment: AssessmentData | null;
  sourceUrl: string | null;
  sourceName: string | null;
  shortlisted: boolean;
  currentFeedback: FeedbackDecision | null;
};

const vacancyColumns = {
  id: vacancies.id, title: vacancies.title, employer: vacancies.employer, active: vacancies.active,
  location: vacancies.location, hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, hoursOriginal: vacancies.hoursOriginal,
  salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax, salaryOriginal: vacancies.salaryOriginal,
  salaryPeriod: vacancies.salaryPeriod, salaryBasisHours: vacancies.salaryBasisHours, deadline: vacancies.deadline,
  originalText: vacancies.originalText,
};

const assessmentColumns = { verdict: aiAssessments.verdict, score: aiAssessments.score, summary: aiAssessments.summary, positives: aiAssessments.positives, concerns: aiAssessments.concerns };

/** De beste vindplaats per vacature: bij voorkeur een actieve, en dan de meest recent geziene. */
async function bestOccurrences(db: ReturnType<typeof getDb>, ids: number[]) {
  if (!ids.length) return new Map<number, { url: string; name: string }>();
  const rows = await db.selectDistinctOn([vacancyOccurrences.vacancyId], { vacancyId: vacancyOccurrences.vacancyId, url: vacancyOccurrences.sourceUrl, name: sources.name })
    .from(vacancyOccurrences).innerJoin(sources, eq(sources.id, vacancyOccurrences.sourceId)).where(inArray(vacancyOccurrences.vacancyId, ids))
    .orderBy(vacancyOccurrences.vacancyId, desc(vacancyOccurrences.active), desc(vacancyOccurrences.lastSeenAt), asc(vacancyOccurrences.id));
  return new Map(rows.map((row) => [row.vacancyId, { url: row.url, name: row.name }]));
}

/** Een left join levert een assessment met lege kolommen; dat is geen oordeel en wordt hier null. */
type RawAssessment = { verdict: AssessmentData["verdict"] | null; score: number | null; summary: string | null; positives: string[] | null; concerns: string[] | null } | null;

function toAssessment(raw: RawAssessment): AssessmentData | null {
  if (!raw || raw.verdict === null || raw.score === null || raw.summary === null) return null;
  return { verdict: raw.verdict, score: raw.score, summary: raw.summary, positives: raw.positives ?? [], concerns: raw.concerns ?? [] };
}

function toItems(rows: { vacancy: VacancyDetailData; assessment: RawAssessment; shortlistedAt: Date | null; feedback: FeedbackDecision | null }[], occurrences: Map<number, { url: string; name: string }>): ReviewQueueItem[] {
  return rows.map((row) => ({
    vacancy: row.vacancy,
    assessment: toAssessment(row.assessment),
    sourceUrl: occurrences.get(row.vacancy.id)?.url ?? null,
    sourceName: occurrences.get(row.vacancy.id)?.name ?? null,
    shortlisted: row.shortlistedAt !== null,
    currentFeedback: row.feedback,
  }));
}

/**
 * De rij van deze week: actieve vacatures die de AI kansrijk noemt en waar jij nog niets van vond.
 * Dezelfde selectie als de weekmail, zodat de mail en de site precies dezelfde stapel tonen.
 */
export async function getReviewQueue(limit = REVIEW_QUEUE_LIMIT): Promise<ReviewQueueItem[]> {
  const db = getDb();
  const feedback = latestFeedbackPerVacancy(db);
  const rows = await db.select({ vacancy: vacancyColumns, assessment: assessmentColumns, shortlistedAt: vacancyTracking.shortlistedAt, feedback: feedback.value })
    .from(vacancies)
    .innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id))
    .leftJoin(feedback, eq(feedback.vacancyId, vacancies.id))
    .leftJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id))
    .where(and(eq(vacancies.active, true), isNull(feedback.id), or(isNull(feedback.value), ne(feedback.value, rejectedVerdict)), inArray(aiAssessments.verdict, reviewQueueAiVerdicts)))
    .orderBy(sql`case when ${aiAssessments.verdict} = 'interesting' then 0 else 1 end`, desc(aiAssessments.score), desc(vacancies.firstSeenAt))
    .limit(limit);
  return toItems(rows, await bestOccurrences(db, rows.map((row) => row.vacancy.id)));
}

/**
 * Eén of meer vacatures die je zelf aanwijst — bijvoorbeeld vanuit Alle vacatures. Hier telt jouw
 * keuze, niet het AI-oordeel: ook een al beoordeelde of door de AI afgeschreven vacature mag mee.
 */
export async function getReviewQueueByIds(ids: number[]): Promise<ReviewQueueItem[]> {
  if (!ids.length) return [];
  const db = getDb();
  const feedback = latestFeedbackPerVacancy(db);
  const rows = await db.select({ vacancy: vacancyColumns, assessment: assessmentColumns, shortlistedAt: vacancyTracking.shortlistedAt, feedback: feedback.value })
    .from(vacancies)
    .leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id))
    .leftJoin(feedback, eq(feedback.vacancyId, vacancies.id))
    .leftJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id))
    .where(inArray(vacancies.id, ids));
  const items = toItems(rows, await bestOccurrences(db, rows.map((row) => row.vacancy.id)));
  const byId = new Map(items.map((item) => [item.vacancy.id, item]));
  return ids.flatMap((id) => { const item = byId.get(id); return item ? [item] : []; });
}

/** Hoeveel er nog in de rij staan, zonder de hele rij op te halen. */
export async function countReviewQueue() {
  const db = getDb();
  const feedback = latestFeedbackPerVacancy(db);
  const [row] = await db.select({ n: sql<number>`count(*)::int` })
    .from(vacancies)
    .innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id))
    .leftJoin(feedback, eq(feedback.vacancyId, vacancies.id))
    .where(and(eq(vacancies.active, true), isNull(feedback.id), or(isNull(feedback.value), ne(feedback.value, rejectedVerdict)), inArray(aiAssessments.verdict, reviewQueueAiVerdicts)));
  return row?.n ?? 0;
}
