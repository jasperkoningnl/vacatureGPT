import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vacancy detail review page", () => {
  const page = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
  const shared = readFileSync("app/components/vacancy-review-detail.tsx", "utf8");
  const form = readFileSync("app/components/feedback-form.tsx", "utf8");
  const actions = readFileSync("app/actions.ts", "utf8");
  it("confirms feedback only after the database write", () => { expect(actions).toContain(".returning({value:feedback.value})"); expect(actions).toContain('status:"success",message:"Opgeslagen",value:storedValue'); });
  it("renders pending and failure states", () => { expect(actions).toContain('status:"error"'); expect(form).toContain('state.status === "error"'); expect(form).toContain("disabled={pending || disabled}"); });
  it("loads existing feedback", () => { expect(page).toContain("current={result.feedback"); expect(form).toContain("Huidig opgeslagen oordeel:"); });
  it("retains the standard section order", () => { expect(shared.indexOf('id="my-review-title"')).toBeLessThan(shared.indexOf('id="details-title"')); expect(shared.indexOf('id="details-title"')).toBeLessThan(shared.indexOf('id="ai-title"')); expect(shared).toContain("Vacaturetekst"); });
});
