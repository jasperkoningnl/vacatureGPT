import { describe, expect, it } from "vitest";
import { eligibleFeedbackValues } from "./feedback-learning";

describe("feedback eligibility on user writes", () => {
  it("marks a new feedback submission eligible", () => expect(eligibleFeedbackValues({ vacancyId: 1, value: "interesting" }, "maybe")).toMatchObject({ learningEligible: true, aiVerdict: "maybe" }));
  it("marks values used to update an old row eligible", () => expect(eligibleFeedbackValues({ value: "not_suitable" }, "interesting").learningEligible).toBe(true));
});
