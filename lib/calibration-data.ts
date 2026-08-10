import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiAssessments, feedback, vacancies } from "@/lib/db/schema";
import { selectCalibrationBatch } from "@/lib/calibration";

export async function getCalibrationBatch() {
  const rows = await getDb().select({ id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, hoursOriginal: vacancies.hoursOriginal, salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax, salaryOriginal: vacancies.salaryOriginal, deadline: vacancies.deadline, description: vacancies.description, originalText: vacancies.originalText, aiVerdict: aiAssessments.verdict })
    .from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id))
    .where(and(eq(vacancies.active, true), isNull(feedback.id)));
  return selectCalibrationBatch(rows);
}
