import { describe, expect, it, vi } from "vitest";
import { assessVacancy, assessmentIsCurrent, assessmentOutputSchema, ASSESSMENT_CONFIG, scoreToVerdict } from "./vacancy-assessment";
import { buildAssessmentProfile } from "./profile";

describe("scoreToVerdict", () => {
  it.each([[0, "not_suitable"], [49, "not_suitable"], [50, "maybe"], [74, "maybe"], [75, "interesting"], [100, "interesting"]] as const)("maps %i to %s", (score, verdict) => expect(scoreToVerdict(score)).toBe(verdict));
});

describe("assessment freshness", () => {
  const current = { vacancyContentHash: "vacancy-1", profileHash: "profile-1", ...ASSESSMENT_CONFIG };
  it("skips an unchanged vacancy and profile", () => expect(assessmentIsCurrent(current, "vacancy-1", "profile-1")).toBe(true));
  it("reassesses changed vacancy content", () => expect(assessmentIsCurrent(current, "vacancy-2", "profile-1")).toBe(false));
  it("reassesses a changed profile", () => expect(assessmentIsCurrent(current, "vacancy-1", "profile-2")).toBe(false));
});

describe("structured assessment", () => {
  it("rejects malformed Structured Output", () => expect(() => assessmentOutputSchema.parse({ score: 101, summary: "x", positives: [], concerns: [] })).toThrow());

  it("does not return an assessment when the AI response is malformed", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: null, usage: null });
    const profile = buildAssessmentProfile({ hoursMin: 32, hoursMax: 36, salaryMin: null, primaryCities: [], secondaryCities: [], travelOrigin: "Amersfoort", maxTravelMinutes: 30, roleFamilies: [], positiveIndicators: [], negativeIndicators: [] }, []);
    await expect(assessVacancy({ parse } as never, { title: "Editor", employer: "A", location: null, hoursMin: null, hoursMax: null, salaryMin: null, salaryMax: null, salaryPeriod: null, deadline: null, description: null, originalText: "data" }, profile)).rejects.toThrow("no valid structured assessment");
    expect(parse).toHaveBeenCalledOnce();
  });
  it("requests concise, concrete Dutch explanations in one call", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: { score: 75, summary: "Concrete match.", positives: [], concerns: [] }, usage: null });
    const profile = buildAssessmentProfile({ hoursMin: 32, hoursMax: 36, salaryMin: null, primaryCities: [], secondaryCities: [], travelOrigin: "Amersfoort", maxTravelMinutes: 30, roleFamilies: [], positiveIndicators: [], negativeIndicators: [] }, []);
    await assessVacancy({ parse } as never, { title: "Editor", employer: "A", location: null, hoursMin: null, hoursMax: null, salaryMin: null, salaryMax: null, salaryPeriod: null, deadline: null, description: "Redigeert artikelen", originalText: "Redigeert artikelen" }, profile);
    const instructions = parse.mock.calls[0][0].instructions;
    expect(ASSESSMENT_CONFIG.promptVersion).toBe("vacancy-fit-v2");
    expect(instructions).toContain("clear Dutch");
    expect(instructions).toContain("1–2 short sentences");
    expect(instructions).toContain("concrete");
    expect(parse).toHaveBeenCalledOnce();
  });
});
