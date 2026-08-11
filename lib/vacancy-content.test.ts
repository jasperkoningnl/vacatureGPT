import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatVacancyContent, vacancyContentText } from "./vacancy-content";

describe("vacancy content formatting", () => {
  it("recognizes source headings, paragraphs and simple lists", () => {
    expect(formatVacancyContent("Over de functie:\n\nEerste alinea.\n\n- Schrijven\n- Redigeren")).toEqual([
      { type: "heading", text: "Over de functie:" },
      { type: "paragraph", text: "Eerste alinea." },
      { type: "list", items: ["Schrijven", "Redigeren"] },
    ]);
  });
  it("preserves every source phrase instead of rewriting vacancy content", () => {
    const source = "WERKZAAMHEDEN\nSchrijven en redigeren.\n\n• Makers begeleiden";
    expect(vacancyContentText(formatVacancyContent(source))).toBe("WERKZAAMHEDEN\nSchrijven en redigeren.\nMakers begeleiden");
  });
});

describe("vacancy detail source selection", () => {
  it("orders active occurrences ahead of deterministic inactive fallbacks", () => {
    const page = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
    expect(page).toContain("orderBy(desc(vacancyOccurrences.active), desc(vacancyOccurrences.lastSeenAt), asc(vacancyOccurrences.id))");
  });
});
