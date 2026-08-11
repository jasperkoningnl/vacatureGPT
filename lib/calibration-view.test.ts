import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("blind calibration full-text view", () => {
  it("links to a calibration-only route that neither queries nor renders AI fields", () => {
    const flow = readFileSync("app/kalibreren/calibration-flow.tsx", "utf8");
    const blindPage = readFileSync("app/kalibreren/vacatures/[id]/page.tsx", "utf8");
    expect(flow).toContain('href={`/kalibreren/vacatures/${vacancy.id}`}');
    expect(blindPage).not.toMatch(/aiAssessments|AI-beoordeling|score|verdict|summary|positives|concerns/);
  });

  it("keeps the AI assessment on the ordinary vacancy detail page", () => {
    const detail = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
    expect(detail).toContain("AI-beoordeling");
    expect(detail).toContain("aiAssessments");
  });
});
