export type SalaryExtraction = {
  status: "numeric" | "qualitative" | "none" | "ambiguous";
  min: number | null;
  max: number | null;
  period: "month" | "year" | "hour" | null;
  basisHours: number | null;
  original: string | null;
  warnings: string[];
};

const positive = /\b(?:salaris|brutosalaris|brutomaandsalaris|maandsalaris|jaarsalaris|salarisindicatie|salarisschaal|inschaling|ingeschaald|schaal|beloning|loon|uurloon|verdient)\b/i;
const incidental = /\b(?:reiskosten|kilometervergoeding|kilometer|thuiswerkvergoeding|thuiswerkbudget|opleidingsbudget|vergoeding zorgverzekering|bijdrage zorgverzekering|vakantiegeld|vakantietoeslag|eindejaarsuitkering|pensioenbijdrage|onkosten|representatievergoeding|stagevergoeding)\b/i;
const money = /€\s*((?:\d{1,3}(?:[. ]\d{3})+|\d{4,6}|\d{1,3})(?:,\d{1,2})?)\s*(?:,-)?|((?:\d{1,3}(?:[. ]\d{3})+|\d{4,6}|\d{1,3})(?:,\d{1,2})?)\s*euro\b/gi;

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const amount = (value: string) => Math.round(Number(value.replace(/ /g, "").replace(/\./g, "").replace(",", ".")));

function amounts(text: string) {
  return [...text.matchAll(money)].map((match) => amount(match[1] ?? match[2])).filter(Number.isFinite);
}

function period(text: string): SalaryExtraction["period"] {
  if (/\b(?:per maand|(?:bruto)?maandsalaris)\b/i.test(text)) return "month";
  if (/\b(?:per jaar|jaarsalaris|op jaarbasis)\b/i.test(text)) return "year";
  if (/\b(?:per uur|uurloon)\b/i.test(text)) return "hour";
  return null;
}

function basisHours(text: string) {
  const match = text.match(/\b(?:op basis van|bij|voor)\s+(?:een\s+)?(\d{1,2})(?:[- ]?urige|\s*uur)(?:\s+(?:per week|werkweek))?/i);
  return match ? Number(match[1]) : null;
}

type Candidate = { min: number | null; max: number | null; period: SalaryExtraction["period"]; basisHours: number | null; original: string; inferred: boolean };

function candidate(original: string): Candidate | null {
  const values = amounts(original);
  if (!values.length || !positive.test(original) || incidental.test(original)) return null;
  let min: number | null = null;
  let max: number | null = null;
  if (values.length >= 2) [min, max] = values.slice(0, 2).sort((a, b) => a - b);
  else if (/\b(?:maximaal|maximum|tot(?: maximaal)?|ten hoogste)\b/i.test(original)) max = values[0];
  else if (/\b(?:minimaal|minimum|vanaf|ten minste)\b/i.test(original)) min = values[0];
  else min = max = values[0];
  let salaryPeriod = period(original);
  const normalMonthly = [min, max].filter((value): value is number => value !== null).every((value) => value >= 1_000 && value <= 20_000);
  const inferred = !salaryPeriod && normalMonthly && /\b(?:bruto|salaris|schaal|inschaling|ingeschaald)\b/i.test(original);
  if (inferred) salaryPeriod = "month";
  return { min, max, period: salaryPeriod, basisHours: basisHours(original), original, inferred };
}

function corroborates(a: Candidate, b: Candidate) {
  if (a.min === b.min && a.max === b.max && a.period === b.period) return true;
  if (a.min === null || a.max === null || b.min === null || b.max === null || a.period !== b.period) return false;
  const overlaps = a.min <= b.max && b.min <= a.max;
  const endpointDifference = Math.max(Math.abs(a.min - b.min), Math.abs(a.max - b.max));
  const rounded = [a.min, a.max, b.min, b.max].some((value) => value % 100 === 0);
  return overlaps && rounded && endpointDifference <= Math.max(a.max, b.max) * 0.12;
}

function precision(value: Candidate) {
  return [value.min, value.max].filter((item): item is number => item !== null).filter((item) => item % 100 !== 0).length;
}

export function extractSalary(blocks: string[]): SalaryExtraction {
  const unique = [...new Set(blocks.map(clean).filter(Boolean))];
  const numeric = unique.map(candidate).filter((value): value is Candidate => value !== null);
  if (numeric.length) {
    const incompatible = numeric.some((value, index) => numeric.slice(index + 1).some((other) => !corroborates(value, other)));
    if (incompatible) return { status: "ambiguous", min: null, max: null, period: null, basisHours: null, original: numeric.map((value) => value.original).join("\n"), warnings: ["Multiple competing employee salary ranges found."] };
    const best = [...numeric].sort((a, b) => precision(b) - precision(a))[0];
    return { status: "numeric", min: best.min, max: best.max, period: best.period, basisHours: best.basisHours, original: best.original,
      warnings: best.inferred ? ["Salary period inferred as month from Dutch salary-scale context."] : [] };
  }
  const qualitative = unique.filter((block) => positive.test(block) && !incidental.test(block) && amounts(block).length === 0);
  if (qualitative.length) return { status: "qualitative", min: null, max: null, period: null, basisHours: null, original: qualitative.join("\n"), warnings: [] };
  return { status: "none", min: null, max: null, period: null, basisHours: null, original: null, warnings: [] };
}

export function detectStage(title: string, blocks: string[]) {
  const titleStage = /\b(?:stage|stagiair|stagiaire|intern|internship)\b/i.test(title);
  const bodyStage = blocks.some((block) => /\b(?:stagevergoeding|stageplek|stageplaats|stage lopen|stagiair|stagiaire|internship)\b/i.test(block));
  return titleStage || bodyStage;
}
