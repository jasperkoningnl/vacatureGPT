export type VacancyVerdict = "interesting" | "maybe" | "not_suitable";

export const promisingAiVerdicts: VacancyVerdict[] = ["interesting", "maybe"];

export type FunnelState = { active: boolean; aiVerdict: VacancyVerdict | null; feedback: VacancyVerdict | null };

export function isToReview(vacancy: FunnelState) {
  return vacancy.active && vacancy.feedback === null && vacancy.aiVerdict !== null && promisingAiVerdicts.includes(vacancy.aiVerdict);
}

export function isSuitable(vacancy: FunnelState) {
  return vacancy.active && vacancy.feedback === "interesting";
}
