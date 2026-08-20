import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasWarning, preferenceNotices } from "./preference-notices";

const base = { hoursMin: 32, hoursMax: 36, salaryMin: null };

describe("meldingen op de voorkeurenpagina", () => {
  it("waarschuwt niet permanent over een niet-ingevuld minimumsalaris", () => {
    const notices = preferenceNotices(base);
    expect(hasWarning(notices)).toBe(false);
    expect(notices).toEqual([{ level: "info", field: "salaryMin", message: expect.stringContaining("niet ingesteld") }]);
  });

  it("zwijgt zodra er wel een echt bedrag staat", () => {
    expect(preferenceNotices({ ...base, salaryMin: 3500 })).toEqual([]);
  });

  it("waarschuwt wel bij een opgeslagen waarde die niet kan kloppen", () => {
    expect(hasWarning(preferenceNotices({ ...base, salaryMin: 0 }))).toBe(true);
    expect(hasWarning(preferenceNotices({ ...base, hoursMin: 40, hoursMax: 36 }))).toBe(true);
  });

  it("verzint nergens een salarisbedrag vanuit code", () => {
    for (const file of ["lib/preference-notices.ts", "app/voorkeuren/page.tsx", "scripts/seed.ts"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/salaryMin\s*[:=]\s*[1-9]\d{2,}/);
    }
    expect(readFileSync("scripts/seed.ts", "utf8")).toContain("salaryMin:null");
  });
});
