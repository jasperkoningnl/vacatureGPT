import type { CalibrationVerdict } from "./ai/calibration-context";

export const feedbackDecisions = ["interesting", "maybe", "not_suitable"] as const satisfies readonly CalibrationVerdict[];
export const NO_DECISION_MESSAGE = "Kies eerst Interessant, Misschien of Niet passend.";

/** Alleen een expliciet gekozen oordeel is een beslissing; een niet-ingevuld formulier is er geen. */
export function isFeedbackDecision(value: unknown): value is CalibrationVerdict {
  return typeof value === "string" && (feedbackDecisions as readonly string[]).includes(value);
}

/**
 * Every user-initiated create or re-save crosses the deployment eligibility boundary.
 * Een niet-genomen beslissing komt er nooit doorheen: zonder expliciet oordeel wordt er niets
 * opgeslagen en wordt niets als leersignaal gemarkeerd.
 */
export function eligibleFeedbackValues<T extends { value: CalibrationVerdict }>(values: T, aiVerdict: CalibrationVerdict | null) {
  if (!isFeedbackDecision(values.value)) throw new Error(NO_DECISION_MESSAGE);
  return { ...values, learningEligible: true as const, aiVerdict };
}
