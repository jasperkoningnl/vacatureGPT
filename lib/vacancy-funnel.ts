export type VacancyVerdict = "interesting" | "maybe" | "not_suitable";

export const promisingAiVerdicts: VacancyVerdict[] = ["interesting", "maybe"];

/** Het oordeel waarmee je een vacature bewust weglegt. */
export const rejectedVerdict: VacancyVerdict = "not_suitable";

export type FunnelState = { active: boolean; aiVerdict: VacancyVerdict | null; feedback: VacancyVerdict | null };

export function isRejected(vacancy: Pick<FunnelState, "feedback">) {
  return vacancy.feedback === rejectedVerdict;
}

/**
 * Wat jij expliciet als niet passend hebt beoordeeld, hoort niet dagelijks terug te komen.
 * De dagelijkse funnel — selectie, kalibratiebatch en de lijst met "nog niet beoordeeld" —
 * laat afgewezen vacatures standaard weg. Het opgeslagen oordeel zelf blijft ongewijzigd:
 * in `Alle vacatures` zijn ze met één schakelaar weer zichtbaar.
 */
export function isInDailyFunnel(vacancy: FunnelState) {
  return vacancy.active && !isRejected(vacancy);
}

/** Nog niet door mij beoordeeld: actief, geen eigen oordeel. Zegt niets over het AI-oordeel. */
export function isUnreviewed(vacancy: FunnelState) {
  return isInDailyFunnel(vacancy) && vacancy.feedback === null;
}

/** Waarschijnlijk kansrijk volgens AI én nog niet door mij beoordeeld. */
export function isToReview(vacancy: FunnelState) {
  return isUnreviewed(vacancy) && vacancy.aiVerdict !== null && promisingAiVerdicts.includes(vacancy.aiVerdict);
}

export function isSuitable(vacancy: FunnelState) {
  return vacancy.active && vacancy.feedback === "interesting";
}
