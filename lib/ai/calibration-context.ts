export const MIN_ELIGIBLE_REVIEWS = 3;
export const MAX_CALIBRATION_EXAMPLES = 3;

export type CalibrationVerdict = "interesting" | "maybe" | "not_suitable";
export type CalibrationFeedback = {
  id: number;
  learningEligible: boolean;
  aiVerdict: CalibrationVerdict | null;
  userVerdict: CalibrationVerdict;
  reasonCode: string | null;
  note: string | null;
  vacancyTitle: string;
  employer: string;
  updatedAt: Date;
};

export type CalibrationContext = {
  eligibleReviews: number;
  agreements: number;
  disagreements: number;
  disagreementReasons: { reasonCode: string; count: number }[];
  disagreementPatterns: { reasonCode: string; aiVerdict: CalibrationVerdict; userVerdict: CalibrationVerdict; count: number }[];
  recentExamples: { vacancyTitle: string; employer: string; aiVerdict: CalibrationVerdict; userVerdict: CalibrationVerdict; reasonCode: string; note?: string }[];
};

const validReasons = new Set(["role", "seniority", "location", "hours", "salary", "employer", "other"]);

/** Builds a bounded, deterministic summary. It never interprets notes into new preferences. */
export function buildCalibrationContext(rows: CalibrationFeedback[]): CalibrationContext | null {
  const eligible = rows.filter((row) => row.learningEligible && row.aiVerdict !== null);
  if (eligible.length < MIN_ELIGIBLE_REVIEWS) return null;
  const disagreements = eligible.filter((row) => row.aiVerdict !== row.userVerdict);
  const agreements = eligible.length - disagreements.length;
  const reasonCounts = new Map<string, number>();
  const patternCounts = new Map<string, number>();
  for (const row of disagreements) {
    if (!row.reasonCode || !validReasons.has(row.reasonCode)) continue;
    reasonCounts.set(row.reasonCode, (reasonCounts.get(row.reasonCode) ?? 0) + 1);
    const key = `${row.reasonCode}|${row.aiVerdict}|${row.userVerdict}`;
    patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
  }
  const disagreementReasons = [...reasonCounts].map(([reasonCode, count]) => ({ reasonCode, count }))
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode));
  const disagreementPatterns = [...patternCounts].map(([key, count]) => {
    const [reasonCode, aiVerdict, userVerdict] = key.split("|") as [string, CalibrationVerdict, CalibrationVerdict];
    return { reasonCode, aiVerdict, userVerdict, count };
  }).sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode) || a.aiVerdict.localeCompare(b.aiVerdict) || a.userVerdict.localeCompare(b.userVerdict));
  const recentExamples = disagreements.filter((row) => row.reasonCode && validReasons.has(row.reasonCode))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id - a.id)
    .slice(0, MAX_CALIBRATION_EXAMPLES).map((row) => ({
      vacancyTitle: row.vacancyTitle.slice(0, 120), employer: row.employer.slice(0, 120),
      aiVerdict: row.aiVerdict!, userVerdict: row.userVerdict, reasonCode: row.reasonCode!,
      ...(row.note?.trim() ? { note: row.note.trim().slice(0, 240) } : {}),
    }));
  return { eligibleReviews: eligible.length, agreements, disagreements: disagreements.length, disagreementReasons, disagreementPatterns, recentExamples };
}
