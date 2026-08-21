import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brand } from "./brand";
import { buildWeeklyDigest, type DigestVacancy } from "./email/weekly-digest";

const tokens = readFileSync("app/styles/tokens.css", "utf8");

/** Leest één blok custom properties: het kale `:root` voor licht, het mediablok voor donker. */
function tokenBlock(mode: "light" | "dark") {
  const source = mode === "light"
    ? tokens.slice(0, tokens.indexOf("@media (prefers-color-scheme: dark)"))
    : tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"));
  return Object.fromEntries([...source.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

describe("de mail en de browserchrome gebruiken hetzelfde palet als de site", () => {
  it("houdt elke merkkleur gelijk aan de bijbehorende CSS-variabele", () => {
    const light = tokenBlock("light");
    expect(brand.light).toEqual({
      paper: light.paper, surface: light.surface, ink: light.ink,
      muted: light.muted, line: light.line, accent: light.accent,
    });
    expect(brand.dark.paper).toBe(tokenBlock("dark").paper);
  });

  it("gebruikt het kopfont van de site, met dezelfde eerste keuze", () => {
    expect(tokens).toContain("--font-display: Georgia,");
    expect(brand.fontDisplay.startsWith("Georgia,")).toBe(true);
    expect(brand.fontBody.startsWith('"Avenir Next"')).toBe(true);
    expect(tokens).toContain('--font-body: "Avenir Next"');
  });

  it("gebruikt dezelfde hoekafrondingen als de panelen en knoppen op de site", () => {
    expect(brand.radius.small).toBe(tokenBlock("light")["radius-sm"]);
    expect(brand.radius.medium).toBe(tokenBlock("light")["radius-md"]);
  });
});

describe("de weekmail is zichtbaar dezelfde app", () => {
  const vacancy: DigestVacancy = {
    id: 1, title: "Redacteur", employer: "Omroep", location: "Hilversum", active: true,
    hoursMin: 32, hoursMax: 36, hoursOriginal: null, salaryMin: null, salaryMax: null,
    salaryPeriod: null, salaryOriginal: null, deadline: null,
    firstSeenAt: new Date("2026-08-10T10:00:00Z"), score: 80, verdict: "interesting", feedbackValue: null,
  };

  it("zet er geen enkele losse hexkleur meer in die niet uit het palet komt", () => {
    const { html } = buildWeeklyDigest([vacancy], "https://vacatures.example");
    const used = new Set([...html.matchAll(/#[0-9a-f]{3,6}\b/gi)].map(([hex]) => hex.toLowerCase()));
    // #fff is de knoptekst op het accent; de rest hoort uit het gedeelde palet te komen.
    const allowed = new Set([...Object.values(brand.light).map((value) => value.toLowerCase()), "#fff"]);
    expect([...used].filter((hex) => !allowed.has(hex))).toEqual([]);
  });

  it("gebruikt het papier, het accent en het kopfont van de site", () => {
    const { html } = buildWeeklyDigest([vacancy], "https://vacatures.example");
    expect(html).toContain(`background:${brand.light.paper}`);
    expect(html).toContain(`background:${brand.light.accent}`);
    expect(html).toContain(`font-family:${brand.fontDisplay}`);
  });
});
