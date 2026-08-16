import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vacancy detail review page", () => {
  const page = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
  const form = readFileSync("app/vacatures/[id]/feedback-form.tsx", "utf8");
  const actions = readFileSync("app/actions.ts", "utf8");

  it("confirms feedback only with the value returned after the database write", () => {
    expect(actions).toContain(".returning({value:feedback.value})");
    expect(actions).toContain('status:"success",message:"Opgeslagen",value:stored.value');
    expect(actions.indexOf(".returning({value:feedback.value})")).toBeLessThan(actions.indexOf('status:"success",message:"Opgeslagen"'));
  });

  it("can render a save failure and disables repeat submission while pending", () => {
    expect(actions).toContain('status:"error"');
    expect(form).toContain('state.status === "error"');
    expect(form).toContain("disabled={pending}");
    expect(form).toContain("Bezig met opslaan…");
  });

  it("loads and displays existing feedback", () => {
    expect(page).toContain("current={result.feedback");
    expect(form).toContain("Huidig opgeslagen oordeel:");
    expect(form).toContain("current?.value");
  });

  it("uses one content column and retains AI advice and vacancy text", () => {
    expect(page).not.toMatch(/className=["']split["']|<aside/);
    expect(page).toContain("AI-beoordeling");
    expect(page).toContain("<VacancyContent");
    expect(page.indexOf('id="my-review-title"')).toBeLessThan(page.indexOf('id="details-title"'));
    expect(page.indexOf('id="details-title"')).toBeLessThan(page.indexOf('id="ai-title"'));
  });
});
