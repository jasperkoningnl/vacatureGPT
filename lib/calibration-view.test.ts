import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shared vacancy review", () => {
  const detailPage = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
  const calibration = readFileSync("app/kalibreren/calibration-flow.tsx", "utf8");
  const shared = readFileSync("app/components/vacancy-review-detail.tsx", "utf8");
  const actions = readFileSync("app/actions.ts", "utf8");

  it("uses the same full detail component in both routes", () => {
    expect(detailPage).toContain("<VacancyReviewDetail");
    expect(calibration).toContain("<VacancyReviewDetail");
    expect(shared).toContain('<VacancyContent text={vacancy.originalText}');
  });
  it("shows AI normally and conceals it in a batch until a successful saved response", () => {
    expect(detailPage).toContain("assessment={result.assessment}");
    expect(calibration).toContain("concealAssessment={!reveal}");
    expect(calibration).toContain("setReveal(await submitCalibrationChoice");
    expect(shared).toContain("AI-beoordeling wordt zichtbaar nadat je zelf hebt beoordeeld");
  });
  it("keeps disagreement persistence before advancing", () => {
    expect(calibration).toContain("saveCalibrationReason");
    expect(calibration).toContain("!reveal.agreed && !reasonSaved");
    expect(calibration).toContain("reveal.agreed || reasonSaved");
    expect(actions).toContain("storeFeedbackReason(getDb(),x)");
  });

  it("slaat een blind oordeel op zonder reden, maar pas als leersignaal na de aanvulling", () => {
    const store = readFileSync("lib/db/feedback.ts", "utf8");
    expect(actions).toContain("storeFeedback(db,{vacancyId:x.vacancyId,value:x.value},{requireReason:false})");
    expect(store).toContain("if (requireReason) assertFeedbackIsComplete(validated);");
    expect(store).toContain("export async function storeFeedbackReason");
  });

  it("rondt de batch af met een route naar Mijn selectie naast een nieuwe ronde", () => {
    expect(calibration).toContain('<Link className="button" href="/">Naar mijn selectie</Link>');
    expect(calibration).toContain('<a className="button secondary" href="/kalibreren">Nog 5 beoordelen</a>');
    expect(calibration).toContain("Je zojuist als interessant beoordeelde vacatures staan nu in Mijn selectie.");
  });

  it("geeft de voortgangsbalk echte progressbar-semantiek", () => {
    expect(calibration).toContain('role="progressbar"');
    expect(calibration).toContain("aria-valuenow={index + 1}");
    expect(calibration).toContain("aria-valuemax={vacancies.length}");
    expect(calibration).toContain("aria-valuemin={0}");
  });
  it("removes the obsolete calibration detail route and read-more flow", () => {
    expect(existsSync("app/kalibreren/vacatures/[id]/page.tsx")).toBe(false);
    expect(calibration).not.toContain("Lees volledige vacature");
  });
});
