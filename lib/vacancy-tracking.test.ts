import { describe, expect, it } from "vitest";
import { applicationStatusLabels, applicationStatuses, trackingPatch } from "./vacancy-tracking";

describe("vacancy tracking", () => {
  it("uses the expected status labels", () => {
    expect(applicationStatuses.map(status => applicationStatusLabels[status])).toEqual(["Wil solliciteren", "Gesolliciteerd", "Gesprek", "Afgewezen", "Niet meer interessant"]);
  });

  it("changes shortlist without coupling it to status, note, or feedback", () => {
    const added = trackingPatch({ shortlistedAt: new Date("2026-01-02") });
    const removed = trackingPatch({ shortlistedAt: null });
    expect(added).not.toHaveProperty("applicationStatus");
    expect(added).not.toHaveProperty("note");
    expect(added).not.toHaveProperty("feedback");
    expect(removed.shortlistedAt).toBeNull();
  });

  it("changes status independently and preserves omitted tracking fields", () => {
    const status = trackingPatch({ applicationStatus: "interview" });
    expect(status.applicationStatus).toBe("interview");
    expect(status).not.toHaveProperty("shortlistedAt");
    expect(status).not.toHaveProperty("note");
  });
});
