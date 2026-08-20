import { eq } from "drizzle-orm";
import { eligibleFeedbackValues } from "../feedback-learning";
import { type Database } from "./application-queries";
import { aiAssessments, feedback } from "./schema";

export type FeedbackInput = { vacancyId: number; value: "interesting" | "maybe" | "not_suitable"; reasonCode?: string | null; note?: string | null };

export async function storeFeedback(db: Database, input: FeedbackInput) {
  const [ai] = await db.select({ verdict: aiAssessments.verdict }).from(aiAssessments).where(eq(aiAssessments.vacancyId, input.vacancyId)).limit(1);
  const values = eligibleFeedbackValues({ ...input, reasonCode: input.reasonCode || null, note: input.note || null }, ai?.verdict ?? null);
  const [stored] = await db.insert(feedback).values(values).onConflictDoUpdate({ target: feedback.vacancyId, set: { ...values, updatedAt: new Date() } }).returning({ value: feedback.value });
  if (!stored) throw new Error("Feedback kon niet worden opgeslagen");
  return stored.value;
}
