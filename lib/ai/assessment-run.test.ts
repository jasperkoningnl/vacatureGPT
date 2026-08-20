import { describe, expect, it, vi } from "vitest";
import { ASSESSMENT_CONFIG } from "./vacancy-assessment";
import { parseAssessmentMode, selectAssessmentCandidates } from "./assessment-run";
import { buildCalibrationContext, type CalibrationFeedback } from "./calibration-context";
import { MIN_FULL_VACANCY_TEXT } from "../vacancy-depth";

const fullText = "V".repeat(MIN_FULL_VACANCY_TEXT);
const vacancies = [
  { id: 1, active: true, contentHash: "same", originalText: fullText },
  { id: 2, active: true, contentHash: "changed", originalText: fullText },
  { id: 3, active: false, contentHash: "same", originalText: fullText },
];
const current = (vacancyId: number) => ({ vacancyId, vacancyContentHash: "same", profileHash: "profile", promptVersion: ASSESSMENT_CONFIG.promptVersion, model: ASSESSMENT_CONFIG.model });

describe("assessment run modes", () => {
  it("keeps normal mode incremental", () => {
    expect(selectAssessmentCandidates(vacancies, [current(1), current(2)], "profile", "normal").map(({ id }) => id)).toEqual([2]);
  });

  it("forces every active vacancy but never an inactive vacancy", () => {
    expect(selectAssessmentCandidates(vacancies, [current(1), current(2), current(3)], "profile", "reassess").map(({ id }) => id)).toEqual([1, 2]);
  });

  it("makes preview a read-only plan without calling assessment or write dependencies", () => {
    const openAiCall = vi.fn();
    const databaseWrite = vi.fn();
    const candidates = selectAssessmentCandidates(vacancies, [current(1)], "profile", parseAssessmentMode(["--mode=preview"]));
    expect(candidates).toHaveLength(2);
    expect(openAiCall).not.toHaveBeenCalled();
    expect(databaseWrite).not.toHaveBeenCalled();
  });

  it("uses only learning-eligible feedback in the unchanged calibration builder", () => {
    const base = { aiVerdict: "maybe", userVerdict: "interesting", reasonCode: "role", note: null, vacancyTitle: "Titel", employer: "Werkgever", contentDepth: "full", updatedAt: new Date() } satisfies Omit<CalibrationFeedback, "id" | "learningEligible">;
    const context = buildCalibrationContext([
      { ...base, id: 1, learningEligible: true }, { ...base, id: 2, learningEligible: true },
      { ...base, id: 3, learningEligible: true }, { ...base, id: 4, learningEligible: false },
    ]);
    expect(context?.eligibleReviews).toBe(3);
  });

  it("does not expose feedback or tracking as mutable assessment state", () => {
    const feedback = { value: "interesting", note: "bewaren" };
    const tracking = { shortlistedAt: new Date(), applicationStatus: "applied", note: "opvolgen" };
    selectAssessmentCandidates(vacancies, [current(1)], "profile", "reassess");
    expect(feedback).toEqual({ value: "interesting", note: "bewaren" });
    expect(tracking).toMatchObject({ applicationStatus: "applied", note: "opvolgen" });
  });
});
