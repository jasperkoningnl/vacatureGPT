import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shortlist views", () => {
  const dashboard = readFileSync("app/page.tsx", "utf8");
  const detail = readFileSync("app/components/tracking-form.tsx", "utf8");

  it("selects only active, explicitly shortlisted vacancies for the dashboard", () => {
    expect(dashboard).toContain("eq(vacancies.active, true)");
    expect(dashboard).toContain("isNotNull(vacancyTracking.shortlistedAt)");
    expect(dashboard).toContain(".limit(5)");
  });

  it("offers explicit add and remove actions independently of feedback", () => {
    expect(detail).toContain("Op shortlist zetten");
    expect(detail).toContain("Van shortlist verwijderen");
    expect(detail).not.toContain("saveFeedback");
  });
});
