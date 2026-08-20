import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { eligibleFeedbackValues, feedbackDecisions, isFeedbackDecision, NO_DECISION_MESSAGE } from "./feedback-learning";

describe("a non-decision is never an opinion", () => {
  it("recognises only the three explicit verdicts", () => {
    expect(feedbackDecisions).toEqual(["interesting", "maybe", "not_suitable"]);
    for (const decision of feedbackDecisions) expect(isFeedbackDecision(decision)).toBe(true);
    for (const value of [undefined, null, "", "misschien", "unknown", 0]) expect(isFeedbackDecision(value)).toBe(false);
  });

  it("refuses to build learning-eligible values without an explicit verdict", () => {
    expect(() => eligibleFeedbackValues({ vacancyId: 1, value: undefined as never }, "maybe")).toThrow(NO_DECISION_MESSAGE);
    expect(() => eligibleFeedbackValues({ vacancyId: 1, value: "" as never }, null)).toThrow(NO_DECISION_MESSAGE);
    expect(eligibleFeedbackValues({ vacancyId: 1, value: "maybe" }, "interesting")).toMatchObject({ learningEligible: true, value: "maybe" });
  });
});

describe("the detail form never preselects a verdict", () => {
  const form = readFileSync("app/components/feedback-form.tsx", "utf8");

  it("starts an unreviewed vacancy without any checked option", () => {
    expect(form).toContain("useState<Value | undefined>(current?.value)");
    expect(form).toContain("checked={choice === option.value}");
    expect(form).not.toContain('?? "maybe"');
    expect(form).not.toMatch(/defaultChecked/);
  });

  it("keeps Opslaan disabled until a verdict is chosen", () => {
    expect(form).toContain("<SubmitButton disabled={!choice}/>");
    expect(form).toContain("disabled={pending || disabled}");
  });

  it("says plainly that nothing is stored yet", () => {
    expect(form).toContain("Nog geen oordeel opgeslagen.");
  });
});

describe("the server refuses to store a decision that was not taken", () => {
  const actions = readFileSync("app/actions.ts", "utf8");

  it("rejects a submit without a verdict before touching the database", () => {
    expect(actions).toContain('if(!isFeedbackDecision(form.get("value")))return{status:"error",message:NO_DECISION_MESSAGE}');
    expect(actions.indexOf("isFeedbackDecision(form")).toBeLessThan(actions.indexOf("persistFeedback(x"));
  });

  it("guards the calibration action with exactly the same rule", () => {
    expect(actions).toContain("if(!isFeedbackDecision(input?.value))throw new Error(NO_DECISION_MESSAGE)");
    expect(actions.match(/z\.enum\(feedbackDecisions\)/g)?.length).toBe(2);
  });

  it("routes both flows through the single eligibility boundary", () => {
    expect(actions.match(/persistFeedback\(/g)?.length).toBe(3);
    expect(actions).toContain("eligibleFeedbackValues");
  });
});

describe("detail page and calibration flow follow the same rules", () => {
  const calibration = readFileSync("app/kalibreren/calibration-flow.tsx", "utf8");

  it("saves in the calibration flow only after an explicit click", () => {
    expect(calibration).toContain("!isFeedbackDecision(value)");
    expect(calibration).toContain("onChange={() => choose(value)}");
    expect(calibration).not.toMatch(/defaultChecked|checked=\{value/);
  });

  it("shares one list of verdicts between both routes", () => {
    expect(calibration).toContain('from "@/app/components/feedback-form"');
    expect(readFileSync("app/components/feedback-form.tsx", "utf8")).toContain('from "@/lib/feedback-learning"');
  });
});
