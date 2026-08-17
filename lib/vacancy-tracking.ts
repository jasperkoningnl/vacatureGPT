export const applicationStatuses = ["want_to_apply", "applied", "interview", "rejected", "no_longer_interested"] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export const applicationStatusLabels: Record<ApplicationStatus, string> = {
  want_to_apply: "Wil solliciteren",
  applied: "Gesolliciteerd",
  interview: "Gesprek",
  rejected: "Afgewezen",
  no_longer_interested: "Niet meer interessant",
};

export type TrackingData = {
  shortlistedAt: Date | null;
  applicationStatus: ApplicationStatus | null;
  note: string | null;
};

/** Build a deliberately partial update so unrelated tracking fields are retained. */
export function trackingPatch(update: { shortlistedAt?: Date | null; applicationStatus?: ApplicationStatus | null; note?: string | null }) {
  return { ...update, updatedAt: new Date() };
}
