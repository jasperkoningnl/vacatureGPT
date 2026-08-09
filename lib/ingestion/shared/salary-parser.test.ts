import { describe, expect, it } from "vitest";
import { detectStage, extractSalary } from "./salary-parser";
import { parseIngestionWarning } from "./ingestion-warnings";

const numeric = (text: string) => extractSalary([text]);

describe("shared salary parser", () => {
  it.each([
    ["€3.075", 3075], ["€ 3.075", 3075], ["€3.075,-", 3075], ["€ 3.075,00", 3075],
    ["€3 075", 3075], ["€3075", 3075], ["3.075 euro", 3075], ["€ 3.075,51", 3076],
  ])("normaliseert %s", (formatted, expected) => expect(numeric(`Het salaris is ${formatted} per maand`)).toMatchObject({ status: "numeric", min: expected, max: expected }));

  it.each([
    "tussen €3.075 en €3.610", "tussen €3.075 tot €3.610", "van €3.075 tot €3.610",
    "€3.075 - €3.610", "€3.075 – €3.610", "€3.075 en €3.610", "minimaal €3.075 en maximaal €3.610",
  ])("leest bereik %s", (range) => expect(numeric(`Het salaris ligt ${range} per maand`)).toMatchObject({ min: 3075, max: 3610 }));

  it("leest expliciete onder- en bovengrenzen", () => {
    expect(numeric("Het salaris is minimaal €3.075 per maand")).toMatchObject({ min: 3075, max: null });
    expect(numeric("Het salaris is maximaal €3.610 per maand")).toMatchObject({ min: null, max: 3610 });
  });

  it.each([["per maand", "month"], ["per jaar", "year"], ["op jaarbasis", "year"], ["per uur", "hour"], ["uurloon", "hour"]] as const)("herkent %s", (words, period) => {
    expect(numeric(`Het salaris is ${period === "hour" ? "€25,50" : "€3.075"} ${words}`).period).toBe(period);
  });

  it("neemt alleen een expliciete urengrondslag over", () => {
    expect(numeric("Het brutosalaris is €3.075 op basis van fulltime").basisHours).toBeNull();
    expect(numeric("Het salaris is €3.075 op basis van 36 uur").basisHours).toBe(36);
    expect(numeric("Het salaris is €3.075 bij een 38-urige werkweek").basisHours).toBe(38);
    expect(numeric("Het salaris is €3.075 voor 40 uur per week").basisHours).toBe(40);
  });

  it("negeert vergoedingen, percentages en stagevergoeding", () => {
    expect(extractSalary(["Reiskosten €500", "€52 bruto bijdrage zorgverzekering, 8% vakantiegeld", "stagevergoeding van €300 per maand"])).toMatchObject({ status: "none", min: null });
  });

  it("behoudt kwalitatieve salarisinformatie", () => expect(extractSalary(["Salaris afhankelijk van kennis en ervaring."])).toMatchObject({ status: "qualitative", original: "Salaris afhankelijk van kennis en ervaring." }));

  it("weigert concurrerende bereiken", () => expect(extractSalary(["Salaris €3.000 - €4.000 per maand", "Salaris €5.000 - €6.000 per maand"])).toMatchObject({ status: "ambiguous", min: null, max: null }));

  it("verkiest een precies, corroborerend bereik boven een afgeronde samenvatting", () => expect(extractSalary(["Salaris circa €3.400 - €5.100 per maand", "Brutosalaris €3.449 - €5.056 per maand"])).toMatchObject({ status: "numeric", min: 3449, max: 5056 }));

  it("laat numeriek salaris winnen van kwalitatieve tekst", () => expect(extractSalary(["Salaris afhankelijk van ervaring", "Brutomaandsalaris €3.449 - €5.056"])).toMatchObject({ status: "numeric", min: 3449 }));

  it("herkent een salarisklasse als herbruikbare salariscontext", () => expect(extractSalary(["Gehonoreerd binnen salarisklasse F (€ 3.032,79 – € 4.241,24)"])).toMatchObject({ status: "numeric", min: 3033, max: 4241, period: "month" }));

  it("classificeert afleiding als info en concurrerende bereiken als waarschuwing", () => {
    expect(parseIngestionWarning(numeric("Salarisklasse F €3.000 - €4.000").warnings[0]).severity).toBe("info");
    expect(parseIngestionWarning(extractSalary(["Salaris €3.000 - €4.000 per maand", "Salaris €5.000 - €6.000 per maand"]).warnings[0]).severity).toBe("warning");
  });

  it("detecteert stages op hele woorden en niet op letterreeksen", () => {
    expect(detectStage("Stage: journalistiek", [])).toBe(true);
    expect(detectStage("Creatieve student", ["Je ontvangt een stagevergoeding."])).toBe(true);
    expect(detectStage("Stagecoördinator", ["Een gewone arbeidsovereenkomst."])).toBe(false);
  });
});
