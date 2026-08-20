import { describe, expect, it } from "vitest";
import { isInDailyFunnel, isRejected, isSuitable, isToReview, isUnreviewed } from "./vacancy-funnel";

describe("vacancy funnel", () => {
  it("shows only active, promising AI assessments without own feedback as to review", () => {
    expect(isToReview({ active: true, aiVerdict: "interesting", feedback: null })).toBe(true);
    expect(isToReview({ active: true, aiVerdict: "maybe", feedback: null })).toBe(true);
    expect(isToReview({ active: true, aiVerdict: "not_suitable", feedback: null })).toBe(false);
    expect(isToReview({ active: false, aiVerdict: "interesting", feedback: null })).toBe(false);
    expect(isToReview({ active: true, aiVerdict: "interesting", feedback: "maybe" })).toBe(false);
  });

  it("uses the user's interesting feedback, rather than the AI verdict, for suitable vacancies", () => {
    expect(isSuitable({ active: true, aiVerdict: "not_suitable", feedback: "interesting" })).toBe(true);
    expect(isSuitable({ active: true, aiVerdict: "interesting", feedback: null })).toBe(false);
    expect(isSuitable({ active: false, aiVerdict: "interesting", feedback: "interesting" })).toBe(false);
  });
});

describe("expliciet afgewezen vacatures vallen uit de dagelijkse funnel", () => {
  const rejected = { active: true, aiVerdict: "interesting", feedback: "not_suitable" } as const;

  it("herkent alleen 'niet passend' als afwijzing", () => {
    expect(isRejected(rejected)).toBe(true);
    expect(isRejected({ feedback: "maybe" })).toBe(false);
    expect(isRejected({ feedback: "interesting" })).toBe(false);
    expect(isRejected({ feedback: null })).toBe(false);
  });

  it("houdt een afgewezen vacature buiten de dagelijkse funnel, ook als de AI hem kansrijk vindt", () => {
    expect(isInDailyFunnel(rejected)).toBe(false);
    expect(isToReview(rejected)).toBe(false);
    expect(isUnreviewed(rejected)).toBe(false);
    expect(isInDailyFunnel({ active: true, aiVerdict: "not_suitable", feedback: null })).toBe(true);
  });

  it("scheidt 'nog niet door mij beoordeeld' van 'kansrijk volgens AI'", () => {
    const notPromising = { active: true, aiVerdict: "not_suitable", feedback: null } as const;
    expect(isUnreviewed(notPromising)).toBe(true);
    expect(isToReview(notPromising)).toBe(false);
    const unassessed = { active: true, aiVerdict: null, feedback: null } as const;
    expect(isUnreviewed(unassessed)).toBe(true);
    expect(isToReview(unassessed)).toBe(false);
  });

  it("laat 'geschikt bevonden' ongemoeid: dat is een ander oordeel", () => {
    expect(isSuitable({ active: true, aiVerdict: "maybe", feedback: "interesting" })).toBe(true);
    expect(isInDailyFunnel({ active: true, aiVerdict: "maybe", feedback: "interesting" })).toBe(true);
  });
});
