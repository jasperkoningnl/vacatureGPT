import type { CalibrationVerdict } from "./ai/calibration-context";

/**
 * Eén contract voor beide beoordeelroutes. De detailpagina en de kalibratieflow schrijven
 * allebei via deze functies, zodat er niet twee verschillende sets regels naast elkaar staan:
 * een oordeel is alleen een leersignaal als het expliciet gekozen is én compleet is
 * onderbouwd waar dat vereist is.
 */
export const feedbackDecisions = ["interesting", "maybe", "not_suitable"] as const satisfies readonly CalibrationVerdict[];
export const reasonCodes = ["role", "seniority", "location", "hours", "salary", "employer", "other"] as const;

export type FeedbackDecision = (typeof feedbackDecisions)[number];
export type ReasonCode = (typeof reasonCodes)[number];

export const feedbackLabels: Record<FeedbackDecision, string> = { interesting: "Interessant", maybe: "Misschien", not_suitable: "Niet passend" };
export const reasonLabels: Record<ReasonCode, string> = {
  role: "Functie / inhoud", seniority: "Niveau / verantwoordelijkheid", location: "Locatie / reistijd",
  hours: "Uren", salary: "Salaris", employer: "Werkgever / sector", other: "Iets anders",
};

export const NO_DECISION_MESSAGE = "Kies eerst Interessant, Misschien of Niet passend.";
export const REASON_REQUIRED_MESSAGE = "Jouw oordeel wijkt af van de AI. Kies daarom een reden.";
export const NOTE_REQUIRED_MESSAGE = "Licht 'Iets anders' kort toe.";
export const INVALID_REASON_MESSAGE = "Kies een geldige reden.";

/** Alleen een expliciet gekozen oordeel is een beslissing; een niet-ingevuld formulier is er geen. */
export function isFeedbackDecision(value: unknown): value is FeedbackDecision {
  return typeof value === "string" && (feedbackDecisions as readonly string[]).includes(value);
}

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === "string" && (reasonCodes as readonly string[]).includes(value);
}

/** Wijkt het eigen oordeel af van een bestaand AI-oordeel, dan hoort daar overal een reden bij. */
export function reasonIsRequired(value: unknown, aiVerdict: CalibrationVerdict | null): boolean {
  return aiVerdict !== null && isFeedbackDecision(value) && value !== aiVerdict;
}

export type FeedbackSubmission = { value: unknown; aiVerdict: CalibrationVerdict | null; reasonCode?: unknown; note?: unknown };
export type ValidatedFeedback = { value: FeedbackDecision; aiVerdict: CalibrationVerdict | null; reasonCode: ReasonCode | null; note: string | null; learningEligible: boolean; reasonRequired: boolean };

/**
 * Valideert één inzending volgens de regels die overal gelden. Ontbreekt de reden bij een
 * afwijking, dan wordt het oordeel wél bewaard maar níet als leersignaal gemarkeerd: de
 * kalibratieflow beoordeelt blind en levert de reden pas na de onthulling aan.
 */
export function validateFeedback(input: FeedbackSubmission): ValidatedFeedback {
  if (!isFeedbackDecision(input.value)) throw new Error(NO_DECISION_MESSAGE);
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
  const rawReason = typeof input.reasonCode === "string" && input.reasonCode.trim() ? input.reasonCode.trim() : null;
  if (rawReason !== null && !isReasonCode(rawReason)) throw new Error(INVALID_REASON_MESSAGE);
  if (rawReason === "other" && !note) throw new Error(NOTE_REQUIRED_MESSAGE);
  const reasonRequired = reasonIsRequired(input.value, input.aiVerdict);
  return { value: input.value, aiVerdict: input.aiVerdict, reasonCode: rawReason, note, reasonRequired, learningEligible: !reasonRequired || rawReason !== null };
}

/** Gebruikt op elke plek waar de gebruiker het AI-oordeel al kent en de reden dus meteen hoort te geven. */
export function assertFeedbackIsComplete(validated: ValidatedFeedback): ValidatedFeedback {
  if (validated.reasonRequired && validated.reasonCode === null) throw new Error(REASON_REQUIRED_MESSAGE);
  return validated;
}

/** De kolomwaarden die naar de database gaan; `reasonRequired` is afleidbaar en wordt niet opgeslagen. */
export function feedbackColumns(validated: ValidatedFeedback) {
  return { value: validated.value, aiVerdict: validated.aiVerdict, reasonCode: validated.reasonCode, note: validated.note, learningEligible: validated.learningEligible };
}

const validationMessages = new Set<string>([NO_DECISION_MESSAGE, REASON_REQUIRED_MESSAGE, NOTE_REQUIRED_MESSAGE, INVALID_REASON_MESSAGE]);

/** Contractfouten zijn bruikbare uitleg voor de gebruiker; al het andere blijft een generieke fout. */
export function feedbackValidationMessage(error: unknown): string | null {
  return error instanceof Error && validationMessages.has(error.message) ? error.message : null;
}
