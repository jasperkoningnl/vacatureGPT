import { describe, expect, it } from "vitest";
import { daysUntil, deadlineNotice, deadlineSentence } from "./deadline";

// Een woensdagmiddag in Amsterdam; ruim binnen de dag, zodat de test niet op een randgeval leunt.
const now = new Date("2026-08-19T10:00:00Z");

describe("deadlines dragen urgentie, niet alleen een datum", () => {
  it("rekent in hele kalenderdagen in Amsterdam, ongeacht het tijdstip", () => {
    expect(daysUntil(new Date("2026-08-19T21:59:00Z"), now)).toBe(0);
    expect(daysUntil(new Date("2026-08-20T00:30:00Z"), now)).toBe(1);
    expect(daysUntil(new Date("2026-08-18T23:00:00Z"), now)).toBe(0);
    expect(daysUntil(new Date("2026-08-26T08:00:00Z"), now)).toBe(7);
  });

  it("telt een late avond in UTC als de volgende Nederlandse dag", () => {
    // 22:30 UTC is in de zomertijd al 00:30 de volgende dag in Amsterdam.
    expect(daysUntil(new Date("2026-08-19T22:30:00Z"), new Date("2026-08-19T10:00:00Z"))).toBe(1);
  });

  it("benoemt vandaag, morgen, deze week en verlopen elk anders", () => {
    expect(deadlineNotice(new Date("2026-08-19T15:00:00Z"), now)).toMatchObject({ level: "urgent", label: "Sluit vandaag" });
    expect(deadlineNotice(new Date("2026-08-20T15:00:00Z"), now)).toMatchObject({ level: "urgent", label: "Sluit morgen" });
    expect(deadlineNotice(new Date("2026-08-24T15:00:00Z"), now)).toMatchObject({ level: "soon", label: "Sluit over 5 dagen" });
    expect(deadlineNotice(new Date("2026-09-20T15:00:00Z"), now)).toMatchObject({ level: "later" });
    expect(deadlineNotice(new Date("2026-08-18T15:00:00Z"), now)).toMatchObject({ level: "expired", label: "Deadline verlopen" });
  });

  it("zet de grens tussen 'deze week' en 'later' op zeven dagen", () => {
    expect(deadlineNotice(new Date("2026-08-26T15:00:00Z"), now).level).toBe("soon");
    expect(deadlineNotice(new Date("2026-08-27T15:00:00Z"), now).level).toBe("later");
  });

  it("levert geen zin op zonder deadline, en anders urgentie plus datum", () => {
    expect(deadlineNotice(null, now)).toMatchObject({ level: "unknown", days: null });
    expect(deadlineSentence(null, now)).toBeNull();
    expect(deadlineSentence(new Date("2026-08-24T15:00:00Z"), now)).toBe("Sluit over 5 dagen · 24 augustus 2026");
  });
});
