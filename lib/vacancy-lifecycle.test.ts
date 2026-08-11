import { describe, expect, it } from "vitest";
import { activeForDiscoveredOccurrence, deriveVacancyActive, isStaleOccurrence, reconcileOccurrenceStates, type ReconciledOccurrence } from "./vacancy-lifecycle";

describe("vacancy occurrence lifecycle", () => {
  const old = new Date("2026-07-01T00:00:00Z");
  const now = new Date("2026-08-11T12:00:00Z");
  const rows: ReconciledOccurrence[] = [
    { id: 1, sourceId: 10, sourceRunId: 22, active: false, lastSeenAt: old },
    { id: 2, sourceId: 10, sourceRunId: 21, active: true, lastSeenAt: old },
  ];
  it("marks a discovered occurrence active and reactivates it without duplication", () => {
    const result = reconcileOccurrenceStates(rows, 10, 22, true, now);
    expect(result).toHaveLength(rows.length);
    expect(result[0]).toMatchObject({ id: 1, active: true, lastSeenAt: now });
  });
  it("deactivates a previously-active occurrence missing from a trustworthy run", () => expect(reconcileOccurrenceStates(rows, 10, 22, true, now)[1].active).toBe(false));
  it("does not deactivate or otherwise mutate rows after an unsafe run", () => expect(reconcileOccurrenceStates(rows, 10, 22, false, now)).toEqual(rows));
  it("keeps a parent active while any source occurrence is active", () => expect(deriveVacancyActive([{ active: false }, { active: true }])).toBe(true));
  it("makes a parent inactive when all occurrences are inactive", () => expect(deriveVacancyActive([{ active: false }, { active: false }])).toBe(false));
  it("never reactivates an occurrence identified as a Villamedia stage", () => {
    expect(activeForDiscoveredOccurrence({ isStage: true })).toBe(false);
    expect(deriveVacancyActive([{ active: activeForDiscoveredOccurrence({ isStage: true }) }])).toBe(false);
  });
  it("uses lastSeenAt with a strict 14-day cutoff", () => {
    expect(isStaleOccurrence(new Date("2026-07-28T11:59:59Z"), now)).toBe(true);
    expect(isStaleOccurrence(new Date("2026-07-28T12:00:00Z"), now)).toBe(false);
    // firstSeenAt is intentionally not an input: rediscovery resets lastSeenAt.
    expect(isStaleOccurrence(new Date("2026-08-11T11:00:00Z"), now)).toBe(false);
  });
});
