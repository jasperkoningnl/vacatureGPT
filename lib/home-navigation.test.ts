import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("primary vacancy review navigation", () => {
  it("starts the quick review flow from the homepage primary CTA", () => {
    const home = readFileSync("app/page.tsx", "utf8");

    expect(home).toMatch(/className="button button-large" href="\/kalibreren">Beoordeel 5 vacatures<\/Link>/);
    expect(home).toContain("nog op jouw oordeel");
  });

  it("presents reviewing as the primary navigation action", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");

    expect(layout).toContain('className="nav-primary" href="/kalibreren">Beoordelen</Link>');
    expect(layout).toContain('href="/">Mijn selectie</Link>');
    expect(layout).toContain('href="/vacatures">Alle vacatures</Link>');
  });
});
