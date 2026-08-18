import { assessmentIsCurrent } from "./vacancy-assessment";

export type AssessmentMode = "normal" | "preview" | "reassess";

type VacancyState = { id: number; active: boolean; contentHash: string };
type AssessmentState = { vacancyId: number; vacancyContentHash: string; profileHash: string; promptVersion: string; model: string };

export function parseAssessmentMode(args: string[]): AssessmentMode {
  const value = args.find((arg) => arg.startsWith("--mode="))?.slice("--mode=".length) ?? "normal";
  if (value === "normal" || value === "preview" || value === "reassess") return value;
  throw new Error(`Ongeldige assessmentmodus: ${value}. Gebruik normal, preview of reassess.`);
}

/** Selects work without mutating any input. Reassessment is deliberately explicit. */
export function selectAssessmentCandidates<T extends VacancyState>(
  vacancyRows: T[],
  assessmentRows: AssessmentState[],
  profileHash: string,
  mode: AssessmentMode,
): T[] {
  const active = vacancyRows.filter((vacancy) => vacancy.active);
  if (mode === "preview" || mode === "reassess") return active;
  const existing = new Map(assessmentRows.map((assessment) => [assessment.vacancyId, assessment]));
  return active.filter((vacancy) => !assessmentIsCurrent(existing.get(vacancy.id), vacancy.contentHash, profileHash));
}
