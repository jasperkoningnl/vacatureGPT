import { describe, expect, it } from "vitest";
import { buildCalibrationContext, MAX_CALIBRATION_EXAMPLES, type CalibrationFeedback } from "./calibration-context";

const row = (id: number, overrides: Partial<CalibrationFeedback> = {}): CalibrationFeedback => ({
  id, learningEligible: true, aiVerdict: "interesting", userVerdict: "not_suitable",
  reasonCode: "role", note: null, vacancyTitle: `Vacature ${id}`, employer: "Werkgever",
  updatedAt: new Date(`2026-08-${String(id).padStart(2, "0")}T12:00:00Z`), ...overrides,
});

describe("calibration context", () => {
  it("ignores old feedback and requires three eligible reviews", () => {
    expect(buildCalibrationContext([row(1), row(2), row(3, { learningEligible: false })])).toBeNull();
  });

  it("aggregates eligible disagreement reasons and agreements", () => {
    const context = buildCalibrationContext([row(1), row(2, { reasonCode: "location" }), row(3, { userVerdict: "interesting", reasonCode: null })]);
    expect(context).toMatchObject({ eligibleReviews: 3, agreements: 1, disagreements: 2, disagreementReasons: [{ reasonCode: "location", count: 1 }, { reasonCode: "role", count: 1 }] });
  });

  it("is deterministic, bounded, and limits notes", () => {
    const rows = Array.from({ length: 8 }, (_, index) => row(index + 1, { note: "x".repeat(500) }));
    const first = buildCalibrationContext(rows)!;
    const second = buildCalibrationContext([...rows].reverse())!;
    expect(first).toEqual(second);
    expect(first.recentExamples).toHaveLength(MAX_CALIBRATION_EXAMPLES);
    expect(first.recentExamples[0].note).toHaveLength(240);
  });
});
