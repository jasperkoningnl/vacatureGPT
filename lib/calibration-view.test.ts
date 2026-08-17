import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shared vacancy review", () => {
  const detailPage = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
  const calibration = readFileSync("app/kalibreren/calibration-flow.tsx", "utf8");
  const shared = readFileSync("app/components/vacancy-review-detail.tsx", "utf8");
  const actions = readFileSync("app/actions.ts", "utf8");

  it("uses the same full detail component in both routes", () => {
    expect(detailPage).toContain("<VacancyReviewDetail");
    expect(calibration).toContain("<VacancyReviewDetail");
    expect(shared).toContain('<VacancyContent text={vacancy.originalText}');
  });
  it("shows AI normally and conceals it in a batch until a successful saved response", () => {
    expect(detailPage).toContain("assessment={result.assessment}");
    expect(calibration).toContain("concealAssessment={!reveal}");
    expect(calibration).toContain("setReveal(await submitCalibrationChoice");
    expect(shared).toContain("AI-beoordeling wordt zichtbaar nadat je zelf hebt beoordeeld");
  });
  it("keeps disagreement persistence before advancing", () => {
    expect(calibration).toContain("saveCalibrationReason");
    expect(calibration).toContain("!reveal.agreed && !reasonSaved");
    expect(calibration).toContain("reveal.agreed || reasonSaved");
    expect(actions).toContain("learningEligible:true");
  });
  it("removes the obsolete calibration detail route and read-more flow", () => {
    expect(existsSync("app/kalibreren/vacatures/[id]/page.tsx")).toBe(false);
    expect(calibration).not.toContain("Lees volledige vacature");
  });
});
