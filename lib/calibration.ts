import { feedbackLabels, type FeedbackDecision, type ReasonCode } from "./feedback-validation";

/** Kalibratie en detailpagina delen één set oordelen en redenen; deze aliassen houden de bestaande namen intact. */
export const verdictLabels = feedbackLabels;
export type Verdict = FeedbackDecision;
export type { ReasonCode };

export type CalibrationCandidate = {
  id: number; title: string; employer: string; location: string | null;
  hoursMin: number | null; hoursMax: number | null; hoursOriginal: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryOriginal: string | null;
  deadline: Date | null; description: string | null; originalText: string; aiVerdict: Verdict;
};
export type BlindVacancy = Omit<CalibrationCandidate, "aiVerdict">;
export function calibrationResponse<T extends { verdict: Verdict }>(assessment: T, persistedVerdict: Verdict) {
  return { ...assessment, userVerdict: persistedVerdict, agreed: assessment.verdict === persistedVerdict };
}
export function isCalibrationEligible(value: { active: boolean; aiVerdict: Verdict | null; hasFeedback: boolean }) { return value.active && value.aiVerdict !== null && !value.hasFeedback; }

const target: Verdict[] = ["interesting", "interesting", "interesting", "maybe", "not_suitable"];
const shuffled = <T,>(items: T[], random: () => number) => items.map(value => ({ value, order: random() })).sort((a, b) => a.order - b.order).map(x => x.value);

/** Selects a balanced batch, then fills shortages without duplicates. Employer variety is preferred. */
export function selectCalibrationBatch(candidates: CalibrationCandidate[], random = Math.random): BlindVacancy[] {
  const pools = new Map<Verdict, CalibrationCandidate[]>();
  for (const verdict of Object.keys(verdictLabels) as Verdict[]) pools.set(verdict, shuffled(candidates.filter(x => x.aiVerdict === verdict), random));
  const selected: CalibrationCandidate[] = [];
  const used = new Set<number>(); const employers = new Set<string>();
  const take = (pool: CalibrationCandidate[], preferEmployer = true) => {
    const index = pool.findIndex(x => !used.has(x.id) && (!preferEmployer || !employers.has(x.employer.toLocaleLowerCase("nl"))));
    if (index < 0) return false;
    const [item] = pool.splice(index, 1); selected.push(item); used.add(item.id); employers.add(item.employer.toLocaleLowerCase("nl")); return true;
  };
  for (const verdict of target) if (!take(pools.get(verdict)!, true)) take(pools.get(verdict)!, false);
  const remaining = shuffled(candidates.filter(x => !used.has(x.id)), random);
  while (selected.length < 5 && (take(remaining, true) || take(remaining, false))) { /* fill */ }
  return shuffled(selected, random).map((item) => { const { aiVerdict, ...vacancy } = item; void aiVerdict; return vacancy; });
}

export function orderCalibrationBatch<T extends { id: number }>(rows: T[], ids: number[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => Boolean(row));
}

export function calibrationSummary(results: { userVerdict: Verdict; aiVerdict: Verdict }[]) {
  const agreed = results.filter(x => x.userVerdict === x.aiVerdict).length;
  const breakdown = { interesting: 0, maybe: 0, not_suitable: 0 };
  for (const result of results) breakdown[result.userVerdict]++;
  return { total: results.length, agreed, differed: results.length - agreed, agreementPercentage: results.length ? Math.round(agreed / results.length * 100) : 0, breakdown };
}
