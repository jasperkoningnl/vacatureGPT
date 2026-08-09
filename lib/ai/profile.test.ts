import { describe, expect, it } from "vitest";
import { buildAssessmentProfile, hashProfile } from "./profile";

const preferences = {
  hoursMin: 32, hoursMax: 36, salaryMin: 4000, primaryCities: ["Utrecht"], secondaryCities: ["Amsterdam"],
  travelOrigin: "Amersfoort Centraal", maxTravelMinutes: 30, roleFamilies: ["redactie"],
  positiveIndicators: ["autonomie"], negativeIndicators: ["sales"],
};

describe("profile hashing", () => {
  it("is deterministic, including when watched employers arrive in another order", () => {
    const first = hashProfile(buildAssessmentProfile(preferences, ["B", "A"]));
    const second = hashProfile(buildAssessmentProfile({ ...preferences }, ["A", "B"]));
    expect(first).toBe(second);
  });

  it("changes for relevant preferences and explicit candidate context", () => {
    const original = hashProfile(buildAssessmentProfile(preferences, ["A"]));
    expect(hashProfile(buildAssessmentProfile({ ...preferences, hoursMin: 28 }, ["A"]))).not.toBe(original);
    expect(hashProfile(buildAssessmentProfile(preferences, ["A"], "Changed candidate context"))).not.toBe(original);
    expect(hashProfile(buildAssessmentProfile(preferences, ["A", "B"]))).not.toBe(original);
  });
});
