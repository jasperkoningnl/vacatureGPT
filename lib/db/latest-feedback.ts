import { desc } from "drizzle-orm";
import { feedback } from "./schema";
import type { Database } from "./application-queries";

/**
 * Eén gedeelde definitie van het actuele oordeel: het nieuwste event op createdAt en,
 * bij gelijke timestamps, het hoogste id. Consumers joinen uitsluitend deze subquery.
 */
export function latestFeedbackPerVacancy(db: Database) {
  return db.selectDistinctOn([feedback.vacancyId], {
      id: feedback.id, vacancyId: feedback.vacancyId, value: feedback.value,
      aiVerdict: feedback.aiVerdict, reasonCode: feedback.reasonCode, note: feedback.note,
      learningEligible: feedback.learningEligible, createdAt: feedback.createdAt, updatedAt: feedback.updatedAt,
    })
    .from(feedback)
    .orderBy(feedback.vacancyId, desc(feedback.createdAt), desc(feedback.id))
    .as("latest_feedback");
}
