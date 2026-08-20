import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INVALID_REASON_MESSAGE, NOTE_REQUIRED_MESSAGE, NO_DECISION_MESSAGE, REASON_REQUIRED_MESSAGE,
  assertFeedbackIsComplete, feedbackDecisions, feedbackValidationMessage, isFeedbackDecision,
  reasonCodes, reasonIsRequired, validateFeedback,
} from "./feedback-validation";

describe("a non-decision is never an opinion", () => {
  it("recognises only the three explicit verdicts", () => {
    expect(feedbackDecisions).toEqual(["interesting", "maybe", "not_suitable"]);
    for (const decision of feedbackDecisions) expect(isFeedbackDecision(decision)).toBe(true);
    for (const value of [undefined, null, "", "misschien", "unknown", 0]) expect(isFeedbackDecision(value)).toBe(false);
  });

  it("refuses to build learning-eligible values without an explicit verdict", () => {
    expect(() => validateFeedback({ value: undefined, aiVerdict: "maybe" })).toThrow(NO_DECISION_MESSAGE);
    expect(() => validateFeedback({ value: "", aiVerdict: null })).toThrow(NO_DECISION_MESSAGE);
    expect(validateFeedback({ value: "maybe", aiVerdict: "maybe" })).toMatchObject({ learningEligible: true, value: "maybe" });
  });
});

describe("één feedbackcontract voor detailpagina en kalibratieflow", () => {
  it("vraagt alleen een reden wanneer het eigen oordeel van het AI-oordeel afwijkt", () => {
    expect(reasonIsRequired("interesting", "not_suitable")).toBe(true);
    expect(reasonIsRequired("interesting", "interesting")).toBe(false);
    expect(reasonIsRequired("interesting", null)).toBe(false);
  });

  it("markeert een afwijking zonder reden wel als oordeel, maar niet als leersignaal", () => {
    const validated = validateFeedback({ value: "interesting", aiVerdict: "not_suitable" });
    expect(validated).toMatchObject({ reasonRequired: true, reasonCode: null, learningEligible: false });
    expect(() => assertFeedbackIsComplete(validated)).toThrow(REASON_REQUIRED_MESSAGE);
  });

  it("maakt dezelfde afwijking mét reden wel leersignaal", () => {
    const validated = validateFeedback({ value: "interesting", aiVerdict: "not_suitable", reasonCode: "role" });
    expect(validated).toMatchObject({ reasonCode: "role", learningEligible: true });
    expect(assertFeedbackIsComplete(validated)).toBe(validated);
  });

  it("eist overal een toelichting bij 'Iets anders'", () => {
    expect(() => validateFeedback({ value: "maybe", aiVerdict: "interesting", reasonCode: "other" })).toThrow(NOTE_REQUIRED_MESSAGE);
    expect(() => validateFeedback({ value: "maybe", aiVerdict: "interesting", reasonCode: "other", note: "   " })).toThrow(NOTE_REQUIRED_MESSAGE);
    expect(validateFeedback({ value: "maybe", aiVerdict: "interesting", reasonCode: "other", note: " te ver weg " })).toMatchObject({ note: "te ver weg", learningEligible: true });
  });

  it("weigert een verzonnen reden en kent alleen de gedeelde lijst", () => {
    expect(reasonCodes).toEqual(["role", "seniority", "location", "hours", "salary", "employer", "other"]);
    expect(() => validateFeedback({ value: "maybe", aiVerdict: "maybe", reasonCode: "verzonnen" })).toThrow(INVALID_REASON_MESSAGE);
  });

  it("laat een lege reden een echte lege waarde zijn in plaats van een lege string", () => {
    expect(validateFeedback({ value: "maybe", aiVerdict: "maybe", reasonCode: "", note: "" })).toMatchObject({ reasonCode: null, note: null, learningEligible: true });
  });

  it("geeft contractfouten als bruikbare uitleg door en houdt andere fouten generiek", () => {
    expect(feedbackValidationMessage(new Error(REASON_REQUIRED_MESSAGE))).toBe(REASON_REQUIRED_MESSAGE);
    expect(feedbackValidationMessage(new Error("connection reset"))).toBeNull();
    expect(feedbackValidationMessage("kapot")).toBeNull();
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

  it("keeps Opslaan disabled until the submission satisfies the shared contract", () => {
    expect(form).toContain("const needsReason = reasonIsRequired(choice, aiVerdict);");
    expect(form).toContain("const blocked = !choice || (needsReason && !reasonCode) || (needsNote && !note.trim());");
    expect(form).toContain("<SubmitButton disabled={blocked}/>");
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
    expect(actions.indexOf("isFeedbackDecision(form")).toBeLessThan(actions.indexOf("storeFeedback(getDb()"));
  });

  it("guards the calibration action with exactly the same rule", () => {
    expect(actions).toContain("if(!isFeedbackDecision(input?.value))throw new Error(NO_DECISION_MESSAGE)");
    expect(actions.match(/z\.enum\(feedbackDecisions\)/g)?.length).toBe(2);
  });

  it("routes both flows through the single eligibility boundary", () => {
    expect(actions.match(/storeFeedback\(/g)?.length).toBe(2);
    const store = readFileSync("lib/db/feedback.ts", "utf8");
    expect(store).toContain("validateFeedback");
    expect(store).toContain("assertFeedbackIsComplete");
    expect(store).toContain("feedbackColumns");
  });

  it("laat de kalibratiereden dezelfde validatie doorlopen in plaats van learningEligible hard te zetten", () => {
    expect(actions).toContain("storeFeedbackReason(getDb(),x)");
    expect(actions).not.toContain("learningEligible");
    expect(actions).toContain("z.enum(reasonCodes)");
  });

  it("geeft de contractfout terug aan de gebruiker in plaats van een generieke melding", () => {
    expect(actions).toContain("const message=feedbackValidationMessage(error);if(message)return{status:\"error\",message}");
  });
});

describe("detail page and calibration flow follow the same rules", () => {
  const calibration = readFileSync("app/kalibreren/calibration-flow.tsx", "utf8");

  it("saves in the calibration flow only after an explicit click", () => {
    expect(calibration).toContain("!isFeedbackDecision(value)");
    expect(calibration).toContain("onChange={() => choose(value)}");
    expect(calibration).not.toMatch(/defaultChecked|checked=\{value/);
  });

  it("shares one list of verdicts and reasons between both routes", () => {
    expect(calibration).toContain('from "@/app/components/feedback-form"');
    expect(calibration).toContain('from "@/lib/feedback-validation"');
    expect(calibration).toContain("reasonCodes.map");
    expect(calibration).toContain("reasonLabels[value]");
    expect(readFileSync("app/components/feedback-form.tsx", "utf8")).toContain('from "@/lib/feedback-validation"');
  });

  it("gebruikt dezelfde meldingen bij een ontbrekende reden of toelichting", () => {
    expect(calibration).toContain("setError(REASON_REQUIRED_MESSAGE)");
    expect(calibration).toContain('reason === "other" && !note.trim()');
    expect(calibration).toContain("setError(NOTE_REQUIRED_MESSAGE)");
  });
});
