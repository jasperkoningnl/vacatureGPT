import { describe, expect, it } from "vitest";
import { SALARY_FIELD_LIMIT, compactSalaryOriginal } from "./salary-display";

describe("een niet-gekwantificeerd salaris in het feitenblok", () => {
  it("laat een korte brontekst ongemoeid", () => {
    expect(compactSalaryOriginal("In overleg")).toBe("In overleg");
    expect(compactSalaryOriginal("Schaal 11 CAO Rijk")).toBe("Schaal 11 CAO Rijk");
  });

  it("levert niets bij een lege of ontbrekende waarde", () => {
    for (const value of [null, undefined, "", "   "]) expect(compactSalaryOriginal(value)).toBeNull();
  });

  it("houdt het bedrag over uit een halve alinea met een meta-regel ervoor", () => {
    const blob = "(Hilversum | fulltime (36 uur) | salaris max. € 7.491) Een brutomaandsalaris tussen € 4.629 en € 7.491 (schaal J van de CAO voor het Omroeppersoneel*) gebaseerd op een werkweek van 36 uur. Inschaling hangt af van je ervaring;";
    const result = compactSalaryOriginal(blob)!;
    expect(result.startsWith("Een brutomaandsalaris tussen € 4.629 en € 7.491")).toBe(true);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(SALARY_FIELD_LIMIT + 1);
    expect(result).not.toContain("Hilversum");
  });

  it("kort af op een woordgrens en nooit midden in een woord", () => {
    const result = compactSalaryOriginal(`€ 4.000 per maand ${"salarisindicatie ".repeat(20)}`)!;
    expect(result.endsWith("…")).toBe(true);
    expect(result.replace("…", "").endsWith("salarisindicatie")).toBe(true);
  });

  it("valt terug op de hele tekst wanneer er nergens een bedrag staat", () => {
    const wordy = `Het salaris wordt bepaald in overleg met de kandidaat. ${"Nadere details volgen later. ".repeat(6)}`;
    expect(compactSalaryOriginal(wordy)!.startsWith("Het salaris wordt bepaald in overleg")).toBe(true);
  });
});
