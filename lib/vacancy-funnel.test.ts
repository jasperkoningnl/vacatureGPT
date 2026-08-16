import { describe, expect, it } from "vitest";
import { isSuitable, isToReview } from "./vacancy-funnel";

describe("vacancy funnel", () => {
  it("shows only active, promising AI assessments without Jasper feedback as to review", () => {
    expect(isToReview({ active: true, aiVerdict: "interesting", feedback: null })).toBe(true);
    expect(isToReview({ active: true, aiVerdict: "maybe", feedback: null })).toBe(true);
    expect(isToReview({ active: true, aiVerdict: "not_suitable", feedback: null })).toBe(false);
    expect(isToReview({ active: false, aiVerdict: "interesting", feedback: null })).toBe(false);
    expect(isToReview({ active: true, aiVerdict: "interesting", feedback: "maybe" })).toBe(false);
  });

  it("uses Jasper's interesting feedback, rather than the AI verdict, for suitable vacancies", () => {
    expect(isSuitable({ active: true, aiVerdict: "not_suitable", feedback: "interesting" })).toBe(true);
    expect(isSuitable({ active: true, aiVerdict: "interesting", feedback: null })).toBe(false);
    expect(isSuitable({ active: false, aiVerdict: "interesting", feedback: "interesting" })).toBe(false);
  });
});
