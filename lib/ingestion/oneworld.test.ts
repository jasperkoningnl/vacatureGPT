import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDetail, parseHours, parseRss, parseSalary, qualityWarnings } from "./oneworld";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("OneWorld parser", () => {
  it("leest de publieke RSS zonder netwerk", () => {
    const jobs = parseRss(fixture("oneworld-rss.xml"));
    expect(jobs.length).toBeGreaterThan(1);
    expect(jobs[0].url).toMatch(/^https:\/\/www\.oneworld\.nl\/job\//);
  });

  it("geeft gelabelde locatie en uren prioriteit en houdt salarisbasis apart", () => {
    const result = parseDetail(fixture("oneworld-coordinator.html"), "https://www.oneworld.nl/job/coordinator-project-office/");
    expect(result).toMatchObject({ title: "Coordinator Project Office", employer: "KIT", location: "Amsterdam, Nederland", hoursMin: 36, hoursMax: 40, hoursOriginal: "36–40 uur", salaryMin: 5133, salaryMax: 6000, salaryPeriod: "month", salaryBasisHours: 38 });
    expect(result.salaryOriginal).toContain("salary between");
    expect(result.originalText).toContain("KIT & support");
    expect(result.warnings).toContain("Tijd per week (36–40 uur) conflicteert met JSON-LD (38 hours).");
  });

  it("parseert Filantropie Expert metadata onafhankelijk", () => {
    expect(parseDetail(fixture("oneworld-filantropie.html"), "https://www.oneworld.nl/job/filantropie-expert/")).toMatchObject({ location: "Den Haag", hoursMin: 32, hoursMax: 36 });
  });

  it("decodeert entiteiten en parseert Nederlands salaris", () => {
    const result = parseDetail(fixture("oneworld-college53.html"), "https://www.oneworld.nl/job/programmaleider-educatief-jongerencentrum-college53/");
    expect(result).toMatchObject({ title: "Programmaleider Educatief Jongerencentrum College53 & Partners", employer: "Stichting & College53", location: "Rotterdam", hoursMin: 24, hoursMax: 30, salaryMin: 4200, salaryMax: 5000 });
  });

  it.each([
    ["32–36 uur", 32, 36], ["32 - 36 uur", 32, 36], ["32 tot 36 uur", 32, 36],
    ["32 uur", 32, 32], ["36 uur per week", 36, 36], ["36–40 hours", 36, 40],
    ["5 days per week (8 hours per day)", 40, 40],
  ])("normaliseert uren: %s", (text, min, max) => expect(parseHours(text)).toMatchObject({ min, max, original: text }));

  it.each([
    ["between € 5,133 and € 6,000 per month", 5133, 6000],
    ["€ 5,133 to € 6,000 per month", 5133, 6000],
    ["van € 5.133 tot € 6.000 per maand", 5133, 6000],
    ["€ 5.133 - € 6.000", 5133, 6000],
    ["€ 5133 – 6000", 5133, 6000],
  ])("normaliseert salaris: %s", (text, min, max) => expect(parseSalary(text)).toMatchObject({ min, max }));

  it("ondersteunt expliciete salarisgrenzen zonder de andere grens te verzinnen", () => {
    expect(parseSalary("minimum € 4.200 per maand")).toMatchObject({ min: 4200, max: null });
    expect(parseSalary("up to € 75,000 per year")).toMatchObject({ min: null, max: 75000 });
  });

  it("maakt batchbrede kwaliteitswaarschuwingen", () => {
    const base = parseDetail(fixture("oneworld-filantropie.html"), "https://example.test/1");
    expect(qualityWarnings([{ ...base, employer: "Onbekende werkgever", hoursMin: null }, { ...base, employer: "Onbekende werkgever", hoursMin: null }, base])).toEqual(expect.arrayContaining([expect.stringContaining("onbekende werkgever"), expect.stringContaining("onbekende uren")]));
  });
});
