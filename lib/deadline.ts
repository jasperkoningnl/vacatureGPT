import { formatDate } from "./date-format";

/**
 * Een shortlist-item waarvan de sluitingsdatum stilletjes verloopt is precies de fout die deze app
 * hoort te voorkomen. De deadline is daarom nooit alleen een datum, maar altijd ook een urgentie.
 * Alles rekent in hele dagen in Europe/Amsterdam, zodat "vandaag" hier hetzelfde betekent als daar.
 */
export type DeadlineLevel = "expired" | "urgent" | "soon" | "later" | "unknown";
export type DeadlineNotice = { level: DeadlineLevel; label: string; days: number | null };

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });

/** Het kalenderdagverschil in Amsterdam, los van tijdstip en zomertijd. */
export function daysUntil(deadline: Date | string, now: Date = new Date()): number {
  const asDay = (value: Date) => Date.parse(`${dayFormatter.format(value)}T00:00:00Z`);
  const target = typeof deadline === "string" ? new Date(deadline) : deadline;
  return Math.round((asDay(target) - asDay(now)) / 86_400_000);
}

export function deadlineNotice(deadline: Date | string | null, now: Date = new Date()): DeadlineNotice {
  if (!deadline) return { level: "unknown", label: "Geen deadline bekend", days: null };
  const days = daysUntil(deadline, now);
  if (days < 0) return { level: "expired", label: "Deadline verlopen", days };
  if (days === 0) return { level: "urgent", label: "Sluit vandaag", days };
  if (days === 1) return { level: "urgent", label: "Sluit morgen", days };
  if (days <= 7) return { level: "soon", label: `Sluit over ${days} dagen`, days };
  return { level: "later", label: `Sluit over ${days} dagen`, days };
}

/** Dezelfde zin voor de mail, waar geen kleur beschikbaar is om urgentie te dragen. */
export function deadlineSentence(deadline: Date | string | null, now: Date = new Date()): string | null {
  const notice = deadlineNotice(deadline, now);
  if (notice.level === "unknown" || !deadline) return null;
  return `${notice.label} · ${formatDate(deadline)}`;
}
