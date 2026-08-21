import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vacancy detail review page", () => {
  const page = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
  const shared = readFileSync("app/components/vacancy-review-detail.tsx", "utf8");
  const form = readFileSync("app/components/feedback-form.tsx", "utf8");
  const actions = readFileSync("app/actions.ts", "utf8");
  const feedbackStore = readFileSync("lib/db/feedback.ts", "utf8");
  it("confirms feedback only after the database write", () => { expect(feedbackStore).toContain(".returning({ value: feedback.value, learningEligible: feedback.learningEligible })"); expect(actions).toContain('status:"success",message:"Opgeslagen",value:stored.value'); });
  it("renders pending and failure states", () => { expect(actions).toContain('status:"error"'); expect(form).toContain('state.status === "error"'); expect(form).toContain("disabled={pending || disabled}"); });
  it("loads existing feedback", () => { expect(page).toContain("current={result.feedback"); expect(form).toContain("Huidig opgeslagen oordeel:"); });
  it("leest van boven naar beneden: feiten, AI-advies, vacaturetekst, en pas dan oordelen", () => {
    // Oordelen vóórdat je iets hebt kunnen zien is de verkeerde volgorde; snel beoordelen doe je in de rij.
    const order = ['<VacancyFacts vacancy={vacancy} className="fact-chips"/>', 'id="ai-title"', 'id="vacancy-text-title"', 'id="my-review-title"', 'id="tracking-title"'];
    const positions = order.map((marker) => shared.indexOf(marker));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("toont de vacaturetekst zonder venster of scrollbalk eromheen", () => {
    const css = readFileSync("app/styles/review.css", "utf8");
    expect(css).not.toMatch(/\.queue-text \.vacancy-content \{[^}]*overflow-y/);
    expect(css).toContain(".vacancy-content { max-width: 100%; }");
  });
});
