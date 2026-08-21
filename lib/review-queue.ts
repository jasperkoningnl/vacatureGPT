import { feedbackLabels, type FeedbackDecision } from "./feedback-validation";
import { promisingAiVerdicts, type VacancyVerdict } from "./vacancy-funnel";

/**
 * De wekelijkse tips loop je één voor één door. Elke keuze is één handeling met één gevolg:
 * interessant zet de vacature meteen op de shortlist, misschien legt hem op de stapel voor later,
 * niet passend legt hem weg. De drie keuzes zijn precies de drie oordelen uit het feedbackcontract,
 * zodat de leerloop dezelfde signalen krijgt als op de detailpagina en in de blinde test.
 */
export type ReviewAction = {
  value: FeedbackDecision;
  label: string;
  hint: string;
  /** Alleen "interessant" is een vervolgstap; de andere twee raken de shortlist niet aan. */
  shortlists: boolean;
  tone: "positive" | "neutral" | "negative";
};

export const reviewActions: ReviewAction[] = [
  { value: "interesting", label: "Op shortlist", hint: "Interessant genoeg om serieus te overwegen.", shortlists: true, tone: "positive" },
  { value: "maybe", label: "Bewaren voor later", hint: "Twijfelgeval; blijft in de lijst staan.", shortlists: false, tone: "neutral" },
  { value: "not_suitable", label: "Niet passend", hint: "Weggelegd, met een reden voor de volgende ronde.", shortlists: false, tone: "negative" },
];

export const reviewActionLabels: Record<FeedbackDecision, string> = { interesting: "Op shortlist", maybe: "Bewaard voor later", not_suitable: "Afgewezen" };

/** Wat er met de shortlist gebeurt hangt uitsluitend aan het oordeel, niet aan een aparte knop. */
export function shortlistsOnDecision(value: FeedbackDecision) {
  return reviewActions.find((action) => action.value === value)?.shortlists ?? false;
}

export const REVIEW_QUEUE_LIMIT = 25;

/** De rij bevat wat de AI kansrijk noemt: alles wat niet expliciet is afgeschreven. */
export const reviewQueueAiVerdicts: VacancyVerdict[] = promisingAiVerdicts;

/**
 * `?ids=` laat je een zelfgekozen setje beoordelen, bijvoorbeeld vanuit Alle vacatures.
 * Een verzonnen, lege of te lange lijst levert geen fout op maar simpelweg "geen selectie".
 */
export const REVIEW_IDS_LIMIT = 25;

export function parseVacancyIds(value: string | string[] | undefined): number[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw.trim()) return [];
  const ids = raw.split(",").map((part) => Number(part.trim()));
  if (!ids.length || ids.length > REVIEW_IDS_LIMIT || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) return [];
  return [...new Set(ids)];
}

export type ReviewResult = { vacancyId: number; value: FeedbackDecision };

export function reviewSummary(results: ReviewResult[]) {
  const breakdown: Record<FeedbackDecision, number> = { interesting: 0, maybe: 0, not_suitable: 0 };
  for (const result of results) breakdown[result.value]++;
  return { total: results.length, breakdown, shortlisted: breakdown.interesting };
}

/** Eén zin die zegt wat er zojuist gebeurde, zodat de rij niet stilzwijgend doorschuift. */
export function decisionConfirmation(value: FeedbackDecision) {
  if (value === "interesting") return "Op je shortlist gezet.";
  if (value === "maybe") return "Bewaard voor later.";
  return "Afgewezen; de reden gaat mee naar de volgende AI-ronde.";
}

export const verdictLabelsForReview = feedbackLabels;
