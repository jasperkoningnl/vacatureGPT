import { scoreToVerdict, type Verdict } from "../ai/vacancy-assessment";
import { deadlineSentence } from "../deadline";

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

export function normalizeBaseUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("APP_BASE_URL moet een http(s)-URL zijn");
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

const PALETTE = { ink: "#202923", muted: "#626d66", line: "#d6dcd7", accent: "#1f6145", paper: "#f6f5f1", surface: "#ffffff" };

function factLine(vacancy: DigestVacancy) {
  return [vacancy.location, hours(vacancy), salary(vacancy)].filter((value): value is string => Boolean(value)).join(" · ");
}

/**
 * De mail is het beginpunt van dezelfde handeling als op de site: je loopt de tips één voor één
 * langs. Daarom staat de oproep om te beoordelen bovenaan en niet onder de kaarten, en wijst hij
 * naar de beoordeelrij in plaats van naar een losse vacaturepagina. Het AI-oordeel blijft bewust
 * buiten de mail: dat lees je pas op de vacature zelf, zodat de mail je niet vooraf stuurt.
 */
export function buildWeeklyDigest(vacancies: DigestVacancy[], baseUrl: string, now: Date = new Date()) {
  const root = normalizeBaseUrl(baseUrl);
  const count = vacancies.length;
  const noun = count === 1 ? "vacature" : "vacatures";
  const subject = `VacatureGPT — ${count} nieuwe ${noun} deze week`;
  const button = `display:inline-block;background:${PALETTE.accent};color:#fff;padding:13px 20px;text-decoration:none;border-radius:4px;font-weight:700`;

  const cards = vacancies.map((vacancy) => {
    const facts = factLine(vacancy);
    const closing = deadlineSentence(vacancy.deadline, now);
    return `<div style="background:${PALETTE.surface};border:1px solid ${PALETTE.line};border-radius:6px;padding:18px 20px;margin:0 0 12px">`
      + `<h2 style="font-family:Georgia,serif;font-size:19px;line-height:1.25;margin:0 0 4px">${escapeHtml(vacancy.title)}</h2>`
      + `<p style="margin:0 0 6px;font-weight:700">${escapeHtml(vacancy.employer)}</p>`
      + (facts ? `<p style="color:${PALETTE.muted};margin:0 0 6px;font-size:14px">${escapeHtml(facts)}</p>` : "")
      + (closing ? `<p style="color:${PALETTE.muted};margin:0 0 12px;font-size:14px">${escapeHtml(closing)}</p>` : "")
      + `<a href="${root}/vacatures/${vacancy.id}" style="color:${PALETTE.accent};font-weight:700;text-decoration:none">Vacature openen →</a>`
      + `</div>`;
  }).join("");

  const html = `<!doctype html><html lang="nl"><body style="margin:0;background:${PALETTE.paper};font-family:Arial,Helvetica,sans-serif;color:${PALETTE.ink};line-height:1.55">`
    + `<div style="max-width:640px;margin:auto;padding:28px 20px 40px">`
    + `<p style="color:${PALETTE.accent};font-size:12px;letter-spacing:.11em;text-transform:uppercase;font-weight:700;margin:0 0 8px">VacatureGPT · deze week</p>`
    + `<h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.15;margin:0 0 10px">${count} kansrijke ${noun} deze week</h1>`
    + `<p style="color:${PALETTE.muted};margin:0 0 20px">Loop ze één voor één langs. Wat je interessant vindt gaat meteen naar je shortlist, twijfelgevallen bewaar je voor later en wat niet past leg je weg met een reden.</p>`
    + `<p style="margin:0 0 28px"><a href="${root}/beoordelen" style="${button}">Beoordeel ze één voor één</a></p>`
    + cards
    + `<p style="margin:26px 0 0;color:${PALETTE.muted};font-size:14px">`
    + `<a href="${root}/vacatures" style="color:${PALETTE.accent}">Blader door alle vacatures</a> · `
    + `<a href="${root}/shortlist" style="color:${PALETTE.accent}">Bekijk je shortlist</a></p>`
    + `</div></body></html>`;

  const text = [
    `${count} kansrijke ${noun} deze week`,
    "",
    `Beoordeel ze één voor één: ${root}/beoordelen`,
    "",
    ...vacancies.flatMap((vacancy) => {
      const facts = factLine(vacancy);
      const closing = deadlineSentence(vacancy.deadline, now);
      return [vacancy.title, vacancy.employer, ...(facts ? [facts] : []), ...(closing ? [closing] : []), `Vacature openen: ${root}/vacatures/${vacancy.id}`, ""];
    }),
    `Blader door alle vacatures: ${root}/vacatures`,
    `Bekijk je shortlist: ${root}/shortlist`,
  ].join("\n");

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
