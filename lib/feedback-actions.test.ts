import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("feedback submission safety", () => {
  const actions = readFileSync("app/actions.ts", "utf8");
  const feedbackStore = readFileSync("lib/db/feedback.ts", "utf8");

  it("marks detail and calibration feedback through one contract without calling OpenAI", () => {
    expect(actions.match(/storeFeedback/g)?.length).toBeGreaterThanOrEqual(2);
    expect(feedbackStore).toContain("validateFeedback");
    expect(actions).not.toMatch(/from ["']openai["']|new OpenAI|responses\.create|chat\.completions/);
  });

  it("returns the database-returned calibration value rather than the submitted input", () => {
    expect(feedbackStore).toContain(".returning({ value: feedback.value, learningEligible: feedback.learningEligible })");
    expect(actions).toContain("calibrationResponse(ai,stored.value)");
  });

  it("ververst zowel de dagelijkse funnel als de volledige lijst na een oordeel", () => {
    expect(actions).toContain('function refreshFunnelRoutes(vacancyId:number){revalidatePath(`/vacatures/${vacancyId}`);revalidatePath("/");revalidatePath("/vacatures");}');
    expect(actions.match(/refreshFunnelRoutes\(/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
