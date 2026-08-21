/**
 * Eén palet voor alles wat buiten de stylesheet valt. De weekmail en de browserchrome kunnen geen
 * CSS-variabelen lezen, dus staan die waarden hier — met een test die ze vergelijkt met
 * `app/styles/tokens.css`. Wijzigt het palet daar, dan faalt die test in plaats van dat de mail
 * er stilzwijgend een half jaar naast blijft zitten.
 */
export const brand = {
  light: {
    paper: "#f4f3ef",
    surface: "#ffffff",
    ink: "#1b2320",
    muted: "#5f6b64",
    line: "#dce0db",
    accent: "#1c5c42",
  },
  dark: {
    paper: "#141a17",
  },
  /** Dezelfde stapels als op de site; e-mailclients vallen vanzelf terug op Arial. */
  fontBody: '"Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif',
  fontDisplay: 'Georgia, "Times New Roman", serif',
  radius: { small: "5px", medium: "10px" },
} as const;
