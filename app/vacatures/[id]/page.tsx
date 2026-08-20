import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { latestFeedbackPerVacancy } from "@/lib/db/latest-feedback";
import { aiAssessments, sources, vacancies, vacancyOccurrences, vacancyTracking } from "@/lib/db/schema";
import { VacancyReviewDetail } from "@/app/components/vacancy-review-detail";
import { FeedbackForm } from "@/app/components/feedback-form";
import { TrackingForm } from "@/app/components/tracking-form";

export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const feedback = latestFeedbackPerVacancy(db);
  const [result] = await db.select({ vacancy: vacancies, sourceUrl: vacancyOccurrences.sourceUrl, source: sources.name, feedback: { value: feedback.value, reasonCode: feedback.reasonCode, note: feedback.note }, assessment: aiAssessments, tracking: vacancyTracking })
    .from(vacancies).innerJoin(vacancyOccurrences, eq(vacancies.id, vacancyOccurrences.vacancyId)).innerJoin(sources, eq(sources.id, vacancyOccurrences.sourceId))
    .leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id)).where(eq(vacancies.id, Number(id)))
    .orderBy(desc(vacancyOccurrences.active), desc(vacancyOccurrences.lastSeenAt), asc(vacancyOccurrences.id)).limit(1);
  if (!result) notFound();
  return <VacancyReviewDetail vacancy={result.vacancy} assessment={result.assessment} sourceUrl={result.sourceUrl} sourceName={result.source} backLink={{ href: "/vacatures", label: "Terug naar vacatures" }} tracking={<TrackingForm vacancyId={result.vacancy.id} tracking={result.tracking}/>} review={
    <FeedbackForm vacancyId={result.vacancy.id} aiVerdict={result.assessment?.verdict ?? null} current={result.feedback && { value: result.feedback.value, reasonCode: result.feedback.reasonCode, note: result.feedback.note }}/>
  }/>;
}
