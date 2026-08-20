import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { latestFeedbackPerVacancy } from "@/lib/db/latest-feedback";
import { aiAssessments, vacancies } from "@/lib/db/schema";
import { orderCalibrationBatch, selectCalibrationBatch } from "@/lib/calibration";

export async function getCalibrationBatch() {
  const db = getDb();
  const feedback = latestFeedbackPerVacancy(db);
  const rows = await db.select({ id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, hoursOriginal: vacancies.hoursOriginal, salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax, salaryOriginal: vacancies.salaryOriginal, deadline: vacancies.deadline, description: vacancies.description, originalText: vacancies.originalText, aiVerdict: aiAssessments.verdict })
    .from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id))
    .where(and(eq(vacancies.active, true), isNull(feedback.id)));
  return selectCalibrationBatch(rows);
}

/** Reloads an already selected batch in its URL-defined order, even after votes were saved. */
export async function getCalibrationBatchByIds(ids: number[]) {
  if (!ids.length) return [];
  const db = getDb();

  const rows = await db.select({ id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, hoursOriginal: vacancies.hoursOriginal, salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax, salaryOriginal: vacancies.salaryOriginal, deadline: vacancies.deadline, description: vacancies.description, originalText: vacancies.originalText })
    .from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id))
    .where(and(eq(vacancies.active, true), inArray(vacancies.id, ids)));
  return orderCalibrationBatch(rows, ids);
}
