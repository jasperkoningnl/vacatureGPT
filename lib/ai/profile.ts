import { createHash } from "node:crypto";

export const CANDIDATE_CONTEXT = "Experienced senior editorial/media professional. Best-fitting work combines content/editorial responsibility with autonomy, quality, strategy + execution, project/program ownership, coaching/team leadership or meaningful digital/AI innovation. Communication roles can fit when they contain substantial content ownership or editorial thinking. AI/digital work is especially relevant when connected to editorial/content work. Junior roles, pure production/admin, sales, performance marketing and roles that are essentially only spokesperson work are poor fits.";

export type AssessmentProfile = {
  candidateContext: string;
  preferences: {
    hoursMin: number;
    hoursMax: number;
    salaryMin: number | null;
    primaryCities: string[];
    secondaryCities: string[];
    travelOrigin: string;
    maxTravelMinutes: number;
    roleFamilies: string[];
    positiveIndicators: string[];
    negativeIndicators: string[];
  };
  watchedEmployers: string[];
};

type PreferenceRow = AssessmentProfile["preferences"];

export function buildAssessmentProfile(preference: PreferenceRow, employers: string[], candidateContext = CANDIDATE_CONTEXT): AssessmentProfile {
  return {
    candidateContext,
    preferences: {
      ...preference,
      primaryCities: [...preference.primaryCities], secondaryCities: [...preference.secondaryCities],
      roleFamilies: [...preference.roleFamilies], positiveIndicators: [...preference.positiveIndicators], negativeIndicators: [...preference.negativeIndicators],
    },
    watchedEmployers: [...employers].sort((a, b) => a.localeCompare(b, "nl")),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

export function hashProfile(profile: AssessmentProfile): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(profile))).digest("hex");
}
