import { describe, expect, it } from "vitest";
import { isVacancyGone } from "./vacancy-gone";

describe("source-specific hard vacancy expiry", () => {
  it("detects the Villamedia not-found redirect", () => expect(isVacancyGone("villamedia", "https://www.villamedia.nl/vacatures/niet-gevonden", "<title>Vacatures</title>")).toBe(true));
  it("detects the OneWorld not-found title", () => expect(isVacancyGone("oneworld", "https://www.oneworld.nl/job/old", "<title>Pagina niet gevonden - OneWorld</title>")).toBe(true));
  it("detects both Culturele Vacatures title forms", () => {
    expect(isVacancyGone("culturele-vacatures", "https://www.culturele-vacatures.nl/old", "<title>Pagina niet gevonden – Culturele vacatures</title>")).toBe(true);
    expect(isVacancyGone("culturele-vacatures", "https://www.culturele-vacatures.nl/old", "<title>Pagina niet gevonden &ndash; Culturele vacatures</title>")).toBe(true);
  });
  it("detects each definitive Werken bij de Overheid signal", () => {
    expect(isVacancyGone("werken-bij-de-overheid", "https://example.test/old", "<title>Helaas - Werken bij de Overheid</title>")).toBe(true);
    expect(isVacancyGone("werken-bij-de-overheid", "https://example.test/old", "<meta property='og:url' content='https://www.werkenbijdeoverheid.nl/vacancy404'>")).toBe(true);
    expect(isVacancyGone("werken-bij-de-overheid", "https://example.test/old", "<body>De vacature die je zoekt bestaat niet of is verlopen</body>")).toBe(true);
  });
  it("does not treat generic pages as gone", () => expect(isVacancyGone("oneworld", "https://www.oneworld.nl/job/live", "<title>Redacteur - OneWorld</title>")).toBe(false));
});
