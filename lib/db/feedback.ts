import { eq } from "drizzle-orm";
import { assertFeedbackIsComplete, feedbackColumns, validateFeedback, type FeedbackDecision, type ReasonCode } from "../feedback-validation";
import { type Database } from "./application-queries";
import { aiAssessments, feedback } from "./schema";

export type FeedbackInput = { vacancyId: number; value: FeedbackDecision; reasonCode?: string | null; note?: string | null };

async function aiVerdictFor(db: Database, vacancyId: number) {
  const [ai] = await db.select({ verdict: aiAssessments.verdict }).from(aiAssessments).where(eq(aiAssessments.vacancyId, vacancyId)).limit(1);
  return ai?.verdict ?? null;
}

/**
 * De enige schrijfweg voor een eigen oordeel. `requireReason` staat alleen uit waar de
 * gebruiker het AI-oordeel nog niet kan zien (de blinde kalibratieronde); de reden wordt daar
 * direct na de onthulling met `storeFeedbackReason` aangevuld en pas dán leersignaal.
 */
export async function storeFeedback(db: Database, input: FeedbackInput, { requireReason = true } = {}) {
  const validated = validateFeedback({ ...input, aiVerdict: await aiVerdictFor(db, input.vacancyId) });
  if (requireReason) assertFeedbackIsComplete(validated);
  const values = feedbackColumns(validated);
  const [stored] = await db.insert(feedback).values({ vacancyId: input.vacancyId, ...values }).onConflictDoUpdate({ target: feedback.vacancyId, set: { ...values, updatedAt: new Date() } }).returning({ value: feedback.value, learningEligible: feedback.learningEligible });
  if (!stored) throw new Error("Feedback kon niet worden opgeslagen");
  return stored;
}

/** Vult de reden aan bij een al opgeslagen oordeel en laat dezelfde validatie bepalen of het leersignaal wordt. */
export async function storeFeedbackReason(db: Database, input: { vacancyId: number; reasonCode: ReasonCode; note?: string | null }) {
  const [current] = await db.select({ value: feedback.value }).from(feedback).where(eq(feedback.vacancyId, input.vacancyId)).limit(1);
  if (!current) throw new Error("Er is nog geen oordeel om een reden bij te bewaren");
  const validated = assertFeedbackIsComplete(validateFeedback({ value: current.value, aiVerdict: await aiVerdictFor(db, input.vacancyId), reasonCode: input.reasonCode, note: input.note }));
  const values = feedbackColumns(validated);
  const [stored] = await db.update(feedback).set({ ...values, updatedAt: new Date() }).where(eq(feedback.vacancyId, input.vacancyId)).returning({ value: feedback.value, learningEligible: feedback.learningEligible });
  if (!stored) throw new Error("Reden kon niet worden opgeslagen");
  return stored;
}
