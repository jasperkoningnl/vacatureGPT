import { describe, expect, it } from "vitest";
import { buildWeeklyDigest, deliveryAction, digestBoundary, selectWeeklyVacancies, weeklyRunKey, type DigestVacancy } from "./weekly-digest";

const now = new Date("2026-08-11T07:00:00Z");
function vacancy(overrides: Partial<DigestVacancy> = {}): DigestVacancy {
  return { id: 1, title: "Redacteur", employer: "Omroep", location: "Hilversum", active: true, hoursMin: 32, hoursMax: 36, hoursOriginal: null, salaryMin: 3500, salaryMax: 4500, salaryPeriod: "per maand", salaryOriginal: null, deadline: new Date("2026-08-25T21:59:00Z"), firstSeenAt: new Date("2026-08-10T10:00:00Z"), score: 80, verdict: "interesting", feedbackValue: null, ...overrides };
}

describe("weekly candidate selection", () => {
  it("limits the first digest to vacancies first seen in the previous seven days", () => {
    const boundary = digestBoundary(now, null);
    expect(selectWeeklyVacancies([vacancy(), vacancy({ id: 2, firstSeenAt: new Date("2026-08-04T06:59:59Z") })], boundary, new Set()).map((item) => item.id)).toEqual([1]);
  });

  it("only selects vacancies first seen after the last successful digest", () => {
    const boundary = digestBoundary(now, new Date("2026-08-09T12:00:00Z"));
    expect(boundary).toEqual(new Date("2026-08-09T12:00:00Z"));
    expect(selectWeeklyVacancies([vacancy(), vacancy({ id: 2, firstSeenAt: new Date("2026-08-01T11:00:00Z") })], boundary, new Set())).toEqual([vacancy()]);
  });

  it("excludes inactive, unsuitable, and successfully emailed vacancies", () => {
    const rows = [vacancy(), vacancy({ id: 2, active: false }), vacancy({ id: 3, verdict: "not_suitable", score: 20 }), vacancy({ id: 4, verdict: "maybe", score: 49 })];
    expect(selectWeeklyVacancies(rows, new Date(0), new Set([1]))).toEqual([]);
  });

  it("prefers unreviewed vacancies and respects the maximum size while ranking internally", () => {
    const rows = Array.from({ length: 18 }, (_, index) => vacancy({ id: index + 1, score: 50 + index, feedbackValue: index === 17 ? "interesting" : null }));
    const selected = selectWeeklyVacancies(rows, new Date(0), new Set(), 15);
    expect(selected).toHaveLength(15);
    expect(selected.map((item) => item.id)).not.toContain(18);
    expect(selected[0].score).toBe(66);
  });

  it("excludes Jasper's not-suitable feedback while allowing other reviewed values later in ranking", () => {
    const rows = [vacancy({ id: 1, feedbackValue: "not_suitable" }), vacancy({ id: 2, feedbackValue: "maybe" }), vacancy({ id: 3 })];
    expect(selectWeeklyVacancies(rows, null, new Set()).map(({ id }) => id)).toEqual([3, 2]);
  });
});

describe("delivery decisions", () => {
  it("does not send when there are no candidates", () => expect(deliveryAction({ candidateCount: 0, enabled: true })).toBe("no_candidates"));
  it("previews without sent markers when ENABLE_EMAIL is false", () => expect(deliveryAction({ candidateCount: 2, enabled: false })).toBe("preview"));
  it("does not duplicate a successfully sent weekly retry", () => expect(deliveryAction({ candidateCount: 2, enabled: true, existingStatus: "sent" })).toBe("already_sent"));
  it("allows failed runs to retry", () => expect(deliveryAction({ candidateCount: 2, enabled: true, existingStatus: "failed" })).toBe("send"));
});

describe("weekly email content", () => {
  it("contains internal detail and overview links in HTML and text", () => {
    const message = buildWeeklyDigest([vacancy()], "https://vacatures.example/");
    for (const body of [message.html, message.text]) {
      expect(body).toContain("https://vacatures.example/vacatures/1");
      expect(body).toContain("https://vacatures.example/vacatures");
    }
  });

  it("shows factual fields but no AI score, verdict, reasoning, calibration, or secret", () => {
    const secret = "re_super_secret";
    const message = buildWeeklyDigest([vacancy()], "https://vacatures.example");
    const output = JSON.stringify(message);
    expect(output).toContain("Redacteur");
    expect(output).toContain("Omroep");
    expect(output).toContain("Hilversum");
    expect(output).toContain("25 augustus 2026");
    expect(output).not.toContain("80");
    expect(output).not.toMatch(/interesting|verdict|reason|score|kalibr/i);
    expect(output).not.toContain(secret);
  });

  it("begint met dezelfde handeling als de site: de tips één voor één langslopen", () => {
    const message = buildWeeklyDigest([vacancy(), vacancy({ id: 2, title: "Eindredacteur" })], "https://vacatures.example", now);
    expect(message.subject).toBe("VacatureGPT — 2 nieuwe vacatures deze week");
    expect(message.html).toContain("2 kansrijke vacatures deze week");
    for (const body of [message.html, message.text]) {
      expect(body).toContain("https://vacatures.example/beoordelen");
      expect(body).toContain("Beoordeel ze één voor één");
      expect(body).toContain("https://vacatures.example/shortlist");
      // De oproep staat vóór de kaarten: eerst de handeling, dan de opsomming.
      expect(body.indexOf("/beoordelen")).toBeLessThan(body.indexOf("/vacatures/1"));
    }
  });

  it("zegt bij één vacature ook 'vacature' en niet 'vacatures'", () => {
    const message = buildWeeklyDigest([vacancy()], "https://vacatures.example", now);
    expect(message.subject).toBe("VacatureGPT — 1 nieuwe vacature deze week");
    expect(message.html).toContain("1 kansrijke vacature deze week");
  });

  it("draagt dezelfde deadline-urgentie als de site, ook zonder kleur", () => {
    const message = buildWeeklyDigest([vacancy({ deadline: new Date("2026-08-12T21:59:00Z") })], "https://vacatures.example", now);
    expect(message.text).toContain("Sluit morgen · 12 augustus 2026");
    expect(buildWeeklyDigest([vacancy({ deadline: null })], "https://vacatures.example", now).text).not.toContain("Sluit");
  });

  it("ontsnapt tekst uit de vacature in plaats van hem als HTML te plaatsen", () => {
    const message = buildWeeklyDigest([vacancy({ title: '<script>alert("x")</script>' })], "https://vacatures.example", now);
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
  });

  it("uses a stable ISO week retry key", () => {
    expect(weeklyRunKey(now)).toBe("2026-W33");
    expect(weeklyRunKey(new Date("2026-08-12T23:00:00Z"))).toBe("2026-W33");
  });
});
