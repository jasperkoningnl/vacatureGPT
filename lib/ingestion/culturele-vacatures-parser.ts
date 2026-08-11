import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { isVacancyGone } from "./vacancy-gone";
import { extractSalary } from "./shared/salary-parser";
import { createIngestionWarning } from "./shared/ingestion-warnings";

export const CULTURELE_BASE_URL = "https://www.culturele-vacatures.nl";
export const CULTURELE_OVERVIEW_URL = `${CULTURELE_BASE_URL}/vacatures-zoeken/`;

export type CultureleOverviewVacancy = {
  sourceUrl: string; title: string; employer: string; location: string | null;
  hoursMin: number | null; hoursMax: number | null; hoursOriginal: string | null;
  deadline: Date | null; vacancyTypes: string[]; isPaid: boolean;
};

export type CultureleVacancy = CultureleOverviewVacancy & {
  externalId?: string; salaryMin: number | null; salaryMax: number | null;
  salaryPeriod: "month" | "year" | "hour" | null; salaryBasisHours: number | null;
  salaryOriginal: string | null; originalText: string; rawData: unknown;
  contentHash: string; canonicalKey: string; warnings: string[];
};

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const decode = (value: unknown) => clean(cheerio.load(String(value ?? "")).root().text());

function date(value: string) {
  const match = value.match(/\b(\d{1,2})-(\d{1,2})-(20\d{2})\b/);
  return match ? new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]))) : null;
}

function hours(value: string) {
  const range = value.match(/\b(\d{1,2})\s*(?:-|–|—|tot)\s*(\d{1,2})\s*uur\b/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]), original: clean(range[0]) };
  const single = value.match(/\b(\d{1,2})\s*uur\b/i);
  return single ? { min: Number(single[1]), max: Number(single[1]), original: clean(single[0]) } : null;
}

function detailUrl(href: string, pageUrl: string) {
  try {
    const url = new URL(href, pageUrl);
    return url.origin === CULTURELE_BASE_URL && /^\/20\d{2}\/\d{2}\/[a-z0-9-]+\/$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

function splitHeading(value: string) {
  const [employer, ...title] = decode(value).split(":");
  return title.length ? { employer: clean(employer), title: clean(title.join(":")) } : { employer: "", title: clean(employer) };
}

export function parseCultureleOverview(html: string, pageUrl = CULTURELE_OVERVIEW_URL) {
  const $ = cheerio.load(html); const vacancies: CultureleOverviewVacancy[] = [];
  $(".facetwp-template .fwpl-result").each((_, node) => {
    const link = $(node).find("h3.entry-title a").first();
    const sourceUrl = detailUrl(link.attr("href") ?? "", pageUrl); if (!sourceUrl) return;
    const heading = splitHeading(link.text());
    const summary = decode($(node).find(".fwpl-item.el-d5z59j").first().text());
    const parts = summary.split("|").map(clean);
    const intro = parts[0]?.match(/^(.+?)\s+in\s+(.+?)\s+zoekt\s+een\s+(.+?)\s+voor\s+(.+?)\s+per\s+week$/i);
    const typeText = parts.find((part) => /^Vacature voor een /i.test(part))?.replace(/^Vacature voor een /i, "") ?? "";
    const vacancyTypes = typeText.split(",").map(clean).filter(Boolean);
    const parsedHours = hours(intro?.[4] ?? summary);
    vacancies.push({ sourceUrl, employer: heading.employer || clean(intro?.[1]), title: heading.title || clean(intro?.[3]),
      location: clean(intro?.[2]) || null, hoursMin: parsedHours?.min ?? null, hoursMax: parsedHours?.max ?? null,
      hoursOriginal: parsedHours?.original ?? null, deadline: date(parts.find((part) => /^Sluitingsdatum:/i.test(part)) ?? ""),
      vacancyTypes, isPaid: vacancyTypes.some((type) => type.toLowerCase() === "betaalde functie") });
  });
  const script = html.match(/window\.FWP_JSON\s*=\s*(\{.*?\});\s*<\/script>/s)?.[1];
  let page = 1; let totalPages = 1;
  if (script) { try { const settings = (JSON.parse(script) as { preload_data?: { settings?: { pager?: { page?: number; total_pages?: number } } } }).preload_data?.settings?.pager; page = settings?.page ?? 1; totalPages = settings?.total_pages ?? 1; } catch { /* The visible results remain usable. */ } }
  return { vacancies, page, totalPages };
}

export async function discoverCulturele(fetcher: typeof fetch = fetch) {
  const byUrl = new Map<string, CultureleOverviewVacancy>(); let pagesFetched = 0; let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    const url = page === 1 ? CULTURELE_OVERVIEW_URL : `${CULTURELE_OVERVIEW_URL}?fwp_paged=${page}`;
    const response = await fetcher(url, { headers: { "user-agent": "VacatureGPT/1.0 personal vacancy search" } });
    if (!response.ok) throw new Error(`Culturele Vacatures-overzicht gaf HTTP ${response.status}: ${url}`);
    const parsed = parseCultureleOverview(await response.text(), url); pagesFetched++;
    if (page === 1) { if (!parsed.vacancies.length) throw new Error("Het Culturele Vacatures-overzicht bevat nul geldige vacature-URL's."); totalPages = parsed.totalPages; }
    parsed.vacancies.filter((item) => item.isPaid).forEach((item) => byUrl.set(item.sourceUrl, item));
    if (page < totalPages && process.env.NODE_ENV !== "test") await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return { entries: [...byUrl.values()], overviewPagesFetched: pagesFetched };
}

export function parseCultureleDetail(html: string, overview: CultureleOverviewVacancy): CultureleVacancy {
  const $ = cheerio.load(html); const content = $(".entry-content").first();
  const originalText = decode(content.text()); const heading = splitHeading($("h1.entry-title").first().text());
  const blocks = content.find("p, li").toArray().flatMap((node) => [decode($(node).text()), ...$(node).contents().toArray()
    .filter((child) => child.type === "text").map((child) => decode($(child).text()))]).filter(Boolean);
  const salary = extractSalary(blocks); const canonical = $("link[rel='canonical']").attr("href");
  const postId = $("article[id^='post-']").first().attr("id")?.match(/^post-(\d+)$/)?.[1];
  const sourceUrl = detailUrl(canonical ?? "", overview.sourceUrl) ?? overview.sourceUrl;
  const title = heading.title || overview.title; const employer = heading.employer || overview.employer;
  const warnings = [...salary.warnings]; if (!postId) warnings.push(createIngestionWarning({ severity: "info", category: "identity", message: "WordPress post-ID ontbreekt — de canonical URL is veilig als identifier gebruikt." }));
  const stable = `${title.toLowerCase()}|${employer.toLowerCase()}|${(overview.location ?? "").toLowerCase()}`;
  const rawData = { overview, canonical: sourceUrl, extracted: { salaryStatus: salary.status, salaryWarnings: salary.warnings }, parserWarnings: warnings };
  return { ...overview, sourceUrl, externalId: postId ?? sourceUrl, title, employer,
    salaryMin: salary.min, salaryMax: salary.max, salaryPeriod: salary.period, salaryBasisHours: salary.basisHours,
    salaryOriginal: salary.original, originalText, rawData, warnings,
    contentHash: createHash("sha256").update(JSON.stringify(rawData)).digest("hex"),
    canonicalKey: createHash("sha256").update(stable).digest("hex") };
}

export function batchFailureReason(discovered: number, parsed: CultureleVacancy[], failed: number) {
  if (!discovered) return "Discovery leverde onverwacht nul betaalde vacatures op.";
  if (!parsed.length) return "Geen enkele detailpagina kon worden geparseerd.";
  if (failed / discovered > 0.5) return `Meer dan 50% van de detailpagina's mislukte (${failed}/${discovered}).`;
  return null;
}

export async function fetchCulturele(fetcher: typeof fetch = fetch) {
  const discovery = await discoverCulturele(fetcher); const results: CultureleVacancy[] = []; const warnings: string[] = []; const goneUrls: string[] = [];
  for (const entry of discovery.entries) {
    if ((results.length || warnings.length) && process.env.NODE_ENV !== "test") await new Promise((resolve) => setTimeout(resolve, 900));
    try { const response = await fetcher(entry.sourceUrl, { headers: { "user-agent": "VacatureGPT/1.0 personal vacancy search" } });
      const html = await response.text(); if (isVacancyGone("culturele-vacatures", response.url || entry.sourceUrl, html)) { goneUrls.push(entry.sourceUrl); continue; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`); const parsed = parseCultureleDetail(html, entry);
      if (!parsed.originalText || !parsed.title || !parsed.employer) throw new Error("geen bruikbare vacaturetekst, titel of werkgever"); results.push(parsed);
    } catch (error) { warnings.push(createIngestionWarning({ severity: "warning", category: "fetch", url: entry.sourceUrl, message: `Vacature kon niet worden gelezen — ${error instanceof Error ? error.message : "onbekende parseerfout"}. Deze vacature is deze run overgeslagen.` })); }
  }
  return { ...discovery, results, failedCount: discovery.entries.length - results.length - goneUrls.length, warnings, goneUrls };
}

export function mergeReliable(old: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(incoming).filter(([key, value]) => value !== null && value !== undefined && (old[key] === null || old[key] === undefined)));
}
