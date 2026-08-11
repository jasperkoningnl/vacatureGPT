import type { CalibrationVerdict } from "./ai/calibration-context";

/** Every user-initiated create or re-save crosses the deployment eligibility boundary. */
export function eligibleFeedbackValues<T extends { value: CalibrationVerdict }>(values: T, aiVerdict: CalibrationVerdict | null) {
  return { ...values, learningEligible: true as const, aiVerdict };
}
