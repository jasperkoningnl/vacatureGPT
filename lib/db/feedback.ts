import { and, desc, eq } from "drizzle-orm";
import { assertFeedbackIsComplete, feedbackColumns, validateFeedback, type FeedbackDecision, type ReasonCode } from "../feedback-validation";
import { type Database } from "./application-queries";
import { aiAssessments, feedback } from "./schema";

export type FeedbackInput = { vacancyId: number; value: FeedbackDecision; reasonCode?: string | null; note?: string | null };

async function aiVerdictFor(db: Database, vacancyId: number) {
  const [ai] = await db.select({ verdict: aiAssessments.verdict }).from(aiAssessments).where(eq(aiAssessments.vacancyId, vacancyId)).limit(1);
  return ai?.verdict ?? null;
}

/** Iedere expliciete beoordeling is een nieuw, append-only feedback-event. */
export async function storeFeedback(db: Database, input: FeedbackInput, { requireReason = true } = {}) {
  const validated = validateFeedback({ ...input, aiVerdict: await aiVerdictFor(db, input.vacancyId) });
  if (requireReason) assertFeedbackIsComplete(validated);
  const [stored] = await db.insert(feedback).values({ vacancyId: input.vacancyId, ...feedbackColumns(validated) }).returning({ id: feedback.id, value: feedback.value, learningEligible: feedback.learningEligible });
  if (!stored) throw new Error("Feedback kon niet worden opgeslagen");
  return stored;
}

/** Vult alleen het zojuist opgeslagen/latest event uit de blinde kalibratieronde aan. */
export async function storeFeedbackReason(db: Database, input: { vacancyId: number; reasonCode: ReasonCode; note?: string | null }) {
  const [current] = await db.select({ id: feedback.id, value: feedback.value }).from(feedback)
    .where(eq(feedback.vacancyId, input.vacancyId)).orderBy(desc(feedback.createdAt), desc(feedback.id)).limit(1);
  if (!current) throw new Error("Er is nog geen oordeel om een reden bij te bewaren");
  const validated = assertFeedbackIsComplete(validateFeedback({ value: current.value, aiVerdict: await aiVerdictFor(db, input.vacancyId), reasonCode: input.reasonCode, note: input.note }));
  const [stored] = await db.update(feedback).set({ ...feedbackColumns(validated), updatedAt: new Date() })
    .where(and(eq(feedback.id, current.id), eq(feedback.vacancyId, input.vacancyId))).returning({ value: feedback.value, learningEligible: feedback.learningEligible });
  if (!stored) throw new Error("Reden kon niet worden opgeslagen");
  return stored;
}
