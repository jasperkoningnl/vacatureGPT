/** De databasewaarden van een bronrun zijn Engels; in de interface horen ze Nederlands te heten. */
export const runStatusLabels = {
  running: "Bezig",
  success: "Geslaagd",
  warning: "Met waarschuwing",
  error: "Mislukt",
  skipped: "Overgeslagen",
  unknown: "Nooit gedraaid",
} as const;

export type RunStatusKey = keyof typeof runStatusLabels;
