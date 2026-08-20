import { createHash } from "node:crypto";

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

type PreferenceRow = AssessmentProfile["preferences"] & { candidateContext?: string };

export function buildAssessmentProfile(preference: PreferenceRow, employers: string[], candidateContext = preference.candidateContext ?? ""): AssessmentProfile {
  return {
    candidateContext,
    preferences: {
      hoursMin: preference.hoursMin, hoursMax: preference.hoursMax, salaryMin: preference.salaryMin, travelOrigin: preference.travelOrigin, maxTravelMinutes: preference.maxTravelMinutes,
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
