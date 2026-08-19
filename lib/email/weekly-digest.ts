import { scoreToVerdict, type Verdict } from "../ai/vacancy-assessment";

export const WEEKLY_DIGEST_LIMIT = 15;
export type DigestVacancy = {
  id: number; title: string; employer: string; location: string | null; active: boolean;
  hoursMin: number | null; hoursMax: number | null; hoursOriginal: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: string | null; salaryOriginal: string | null;
  deadline: Date | null;
  firstSeenAt: Date; score: number; verdict: Verdict; feedbackValue: Verdict | null;
};

export function digestBoundary(now: Date, lastSuccessfulSentAt: Date | null) {
  return lastSuccessfulSentAt ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
}

export function selectWeeklyVacancies(input: DigestVacancy[], firstDigestBoundary: Date | null, successfullyEmailedIds: Set<number>, limit = WEEKLY_DIGEST_LIMIT) {
  return input
    .filter((vacancy) => vacancy.active)
    .filter((vacancy) => firstDigestBoundary === null || vacancy.firstSeenAt > firstDigestBoundary)
    .filter((vacancy) => !successfullyEmailedIds.has(vacancy.id))
    .filter((vacancy) => vacancy.feedbackValue !== "not_suitable")
    .filter((vacancy) => vacancy.verdict !== "not_suitable" && scoreToVerdict(vacancy.score) !== "not_suitable")
    .sort((a, b) => Number(a.feedbackValue !== null) - Number(b.feedbackValue !== null) || b.score - a.score || b.firstSeenAt.getTime() - a.firstSeenAt.getTime() || a.id - b.id)
    .slice(0, limit);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function hours(vacancy: DigestVacancy) {
  if (vacancy.hoursMin !== null) return `${vacancy.hoursMin}${vacancy.hoursMax !== null && vacancy.hoursMax !== vacancy.hoursMin ? `–${vacancy.hoursMax}` : ""} uur`;
  return vacancy.hoursOriginal;
}

function salary(vacancy: DigestVacancy) {
  if (vacancy.salaryMin !== null) {
    const range = `€ ${vacancy.salaryMin.toLocaleString("nl-NL")}${vacancy.salaryMax !== null && vacancy.salaryMax !== vacancy.salaryMin ? `–${vacancy.salaryMax.toLocaleString("nl-NL")}` : ""}`;
    return vacancy.salaryPeriod ? `${range} ${vacancy.salaryPeriod}` : range;
  }
  return vacancy.salaryOriginal;
}

function deadline(vacancy: DigestVacancy) {
  if (!vacancy.deadline) return null;
  return `Deadline ${new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" }).format(vacancy.deadline)}`;
}

export function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("APP_BASE_URL moet een http(s)-URL zijn");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export function buildWeeklyDigest(vacancies: DigestVacancy[], baseUrl: string) {
  const root = normalizeBaseUrl(baseUrl);
  const subject = `VacatureGPT — ${vacancies.length} nieuwe vacature${vacancies.length === 1 ? "" : "s"} deze week`;
  const cards = vacancies.map((vacancy) => {
    const facts = [vacancy.location, hours(vacancy), salary(vacancy), deadline(vacancy)].filter((value): value is string => Boolean(value));
    return `<div style="padding:20px 0;border-bottom:1px solid #d8ddd9"><h2 style="font-size:19px;margin:0 0 5px">${escapeHtml(vacancy.title)}</h2><p style="margin:0 0 7px"><strong>${escapeHtml(vacancy.employer)}</strong></p>${facts.length ? `<p style="color:#66716b;margin:0 0 14px">${facts.map(escapeHtml).join(" · ")}</p>` : ""}<a href="${root}/vacatures/${vacancy.id}" style="display:inline-block;background:#205c43;color:#fff;padding:10px 14px;text-decoration:none">Bekijk vacature</a></div>`;
  }).join("");
  const html = `<!doctype html><html lang="nl"><body style="font-family:Arial,sans-serif;color:#1d2521;max-width:640px;margin:auto;padding:24px"><h1 style="font-size:25px">Nieuwe vacatures deze week</h1>${cards}<p style="margin-top:26px"><a href="${root}/vacatures">Bekijk alle vacatures</a></p></body></html>`;
  const text = [`Nieuwe vacatures deze week`, "", ...vacancies.flatMap((vacancy) => {
    const facts = [vacancy.location, hours(vacancy), salary(vacancy), deadline(vacancy)].filter(Boolean);
    return [vacancy.title, vacancy.employer, ...facts, `Bekijk vacature: ${root}/vacatures/${vacancy.id}`, ""];
  }), `Bekijk alle vacatures: ${root}/vacatures`].join("\n");
  return { subject, html, text };
}

export function weeklyRunKey(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function deliveryAction(input: { candidateCount: number; enabled: boolean; existingStatus?: "pending" | "sent" | "failed" }) {
  if (input.existingStatus === "sent") return "already_sent" as const;
  if (input.candidateCount === 0) return "no_candidates" as const;
  if (!input.enabled) return "preview" as const;
  return "send" as const;
}
