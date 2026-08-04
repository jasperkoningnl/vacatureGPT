import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { detectStage, extractSalary } from "./shared/salary-parser";

export const VILLAMEDIA_BASE_URL = "https://www.villamedia.nl";
export const VILLAMEDIA_OVERVIEW_URL = `${VILLAMEDIA_BASE_URL}/vacatures`;
export const MAX_OVERVIEW_PAGES = 10;

type JsonObject = Record<string, unknown>;
export type OverviewVacancy = { sourceUrl: string; externalId?: string; title: string; employer: string; city: string | null };
export type VillamediaVacancy = {
  externalId?: string; sourceUrl: string; title: string; employer: string; location: string | null;
  hoursMin: number | null; hoursMax: number | null; hoursOriginal: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: "month" | "year" | "hour" | null;
  salaryBasisHours: number | null; salaryOriginal: string | null; deadline: Date | null;
  originalText: string; rawData: unknown; contentHash: string; canonicalKey: string; warnings: string[]; isStage: boolean;
};

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const decode = (value: unknown) => clean(cheerio.load(String(value ?? "")).root().text());

function validDetailUrl(href: string, pageUrl: string) {
  try {
    const url = new URL(href, pageUrl);
    return url.origin === VILLAMEDIA_BASE_URL && url.pathname.startsWith("/vacatures/functie/") ? url.href : null;
  } catch { return null; }
}

export function parseOverview(html: string, pageUrl = VILLAMEDIA_OVERVIEW_URL) {
  const $ = cheerio.load(html);
  const vacancies: OverviewVacancy[] = [];
  $("li.vacature").each((_, element) => {
    const link = $(element).find(".txt h2 a").first();
    const sourceUrl = validDetailUrl(link.attr("href") ?? "", pageUrl);
    if (!sourceUrl) return;
    const title = decode(link.text() || link.attr("title"));
    const metadata = decode($(element).find(".txt p").first().text());
    const parts = metadata.split(",").map(clean).filter(Boolean).filter((part) => !/^topvacatures?$/i.test(part));
    vacancies.push({ sourceUrl, externalId: clean(link.attr("data-entry_id")) || undefined, title, employer: parts[0] ?? "", city: parts[1] ?? null });
  });
  const nextHref = $("a.next[rel='next']").attr("href");
  let nextUrl: string | null = null;
  if (nextHref) {
    try { nextUrl = new URL(nextHref, pageUrl).href; } catch { /* Invalid pagination URL ends discovery. */ }
  }
  return { vacancies, nextUrl };
}

export async function discoverVillamedia(fetcher: typeof fetch = fetch) {
  const visited = new Set<string>();
  const byUrl = new Map<string, OverviewVacancy>();
  const externalIds = new Set<string>();
  let nextUrl: string | null = VILLAMEDIA_OVERVIEW_URL;
  while (nextUrl && visited.size < MAX_OVERVIEW_PAGES) {
    if (visited.has(nextUrl)) break;
    visited.add(nextUrl);
    const response = await fetcher(nextUrl, { headers: { "user-agent": "VacatureGPT/1.0 personal vacancy search" } });
    if (!response.ok) throw new Error(`Villamedia-overzicht gaf HTTP ${response.status}: ${nextUrl}`);
    const page = parseOverview(await response.text(), nextUrl);
    if (visited.size === 1 && page.vacancies.length === 0) throw new Error("De eerste Villamedia-overzichtspagina bevat nul geldige vacature-URL's.");
    for (const item of page.vacancies) {
      if (byUrl.has(item.sourceUrl) || (item.externalId && externalIds.has(item.externalId))) continue;
      byUrl.set(item.sourceUrl, item);
      if (item.externalId) externalIds.add(item.externalId);
    }
    nextUrl = page.nextUrl;
  }
  return { entries: [...byUrl.values()], overviewPagesFetched: visited.size };
}

function jsonObjects(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(jsonObjects);
  if (!value || typeof value !== "object") return [];
  const object = value as JsonObject;
  return [object, ...jsonObjects(object["@graph"])];
}
function typeIs(object: JsonObject, type: string) { const value = object["@type"]; return Array.isArray(value) ? value.includes(type) : value === type; }
function nestedString(value: unknown, ...keys: string[]) { let current = value; for (const key of keys) { if (!current || typeof current !== "object") return ""; current = (current as JsonObject)[key]; } return clean(current); }

export function parseVillamediaHours(body: string) {
  const text = clean(body);
  const ambiguous = text.match(/\b(?:een|twee|drie|vier|vijf|zes|zeven|\d+)\s+of\s+(?:een|twee|drie|vier|vijf|zes|zeven|\d+)\s+dagen?\s+per\s+week\b/i);
  const range = text.match(/\b(\d{1,2})\s*(?:-|–|—|tot)\s*(\d{1,2})\s*(?:uur|uren)\b/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]), original: clean(range[0]) };
  const single = text.match(/\b(?:een\s+contract\s+van\s+)?(\d{1,2})\s*(?:uur|uren)(?:\s+per\s+week)?\b/i);
  if (single) return { min: Number(single[1]), max: Number(single[1]), original: clean(single[0]) };
  return ambiguous ? { min: null, max: null, original: clean(ambiguous[0]) } : null;
}

function fallbackDeadline(body: string) {
  const match = body.match(/(?:reageren tot(?: en met)?|uiterlijk)\s+(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)(?:\s+(20\d{2}))?/i);
  if (!match) return null;
  const months = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const year = Number(match[3] ?? 2026);
  return new Date(Date.UTC(year, months.indexOf(match[2].toLowerCase()), Number(match[1])));
}

export function parseVillamediaDetail(html: string, overview: OverviewVacancy): VillamediaVacancy {
  const $ = cheerio.load(html);
  const structured: JsonObject[] = [];
  $('script[type="application/ld+json"]').each((_, node) => { try { structured.push(...jsonObjects(JSON.parse($(node).text()))); } catch { /* Ignore malformed independent blocks. */ } });
  const job = structured.find((object) => typeIs(object, "JobPosting")) ?? {};
  const article = $(".article.vacature").first();
  const bodyNodes = article.find(".text").toArray().filter((node) => clean($(node).text()).length > 0)
    .sort((a, b) => clean($(b).text()).length - clean($(a).text()).length);
  const bodyNode = $(bodyNodes[0]);
  const originalText = decode(bodyNode.text());
  const meta = decode(article.find("p.meta").first().text());
  const metaParts = meta.split(",").map(clean).filter(Boolean);
  const title = decode(article.find("h1").first().text() || job.title || overview.title);
  const jsonEmployer = nestedString(job.hiringOrganization, "name");
  const employer = decode(overview.employer || metaParts[0] || jsonEmployer);
  const jsonLocation = nestedString(job.jobLocation, "address", "addressLocality");
  const detailedLocation = bodyNode.find("p, li").toArray().map((node) => decode($(node).text())).find((line) => /\b(?:Amsterdam|Arnhem|Den Haag)(?:\b|,)/i.test(line) && line.length < 100);
  const location = decode(detailedLocation || overview.city || metaParts[1] || jsonLocation) || null;
  const identifier = nestedString(job.identifier, "value") || clean(job.identifier);
  const deadlineValue = clean(job.validThrough);
  const deadline = deadlineValue && !Number.isNaN(Date.parse(deadlineValue)) ? new Date(deadlineValue) : fallbackDeadline(originalText);
  const hours = parseVillamediaHours(originalText);
  const evidenceBlocks = bodyNode.find("p, li").toArray().map((node) => decode($(node).text())).filter(Boolean);
  const salary = extractSalary(evidenceBlocks);
  const isStage = detectStage(title, evidenceBlocks);
  const warnings: string[] = [];
  if (!title) warnings.push("Titel ontbreekt.");
  if (!employer) warnings.push("Werkgever ontbreekt.");
  if (!(overview.externalId || identifier)) warnings.push("Extern ID ontbreekt.");
  warnings.push(...salary.warnings);
  const rawData = { job, overview, extracted: { hoursOriginal: hours?.original ?? null, salaryOriginal: salary.original, salaryStatus: salary.status, salaryWarnings: salary.warnings, isStage }, parserWarnings: warnings };
  const stable = `${title.toLowerCase()}|${employer.toLowerCase()}|${(location ?? "").toLowerCase()}`;
  return {
    externalId: overview.externalId || identifier || undefined, sourceUrl: overview.sourceUrl, title, employer, location,
    hoursMin: hours?.min ?? null, hoursMax: hours?.max ?? null, hoursOriginal: hours?.original ?? null,
    salaryMin: salary.min, salaryMax: salary.max, salaryPeriod: salary.period,
    salaryBasisHours: salary.basisHours, salaryOriginal: salary.original, deadline,
    originalText, rawData, warnings, isStage,
    contentHash: createHash("sha256").update(JSON.stringify(rawData)).digest("hex"),
    canonicalKey: createHash("sha256").update(stable).digest("hex"),
  };
}

export function batchFailureReason(discovered: number, results: VillamediaVacancy[], failed: number) {
  if (!results.length) return "Geen enkele Villamedia-detailpagina kon worden geparseerd.";
  if (failed / discovered > 0.5) return `Meer dan 50% van de detailpagina's mislukte (${failed}/${discovered}).`;
  if (results.filter((item) => !item.employer).length / results.length > 0.2) return "Meer dan 20% van de vacatures mist een werkgever.";
  if (results.filter((item) => !item.title || !item.externalId).length / results.length > 0.2) return "Meer dan 20% van de vacatures mist een titel of extern ID.";
  return null;
}

export async function fetchVillamedia(fetcher: typeof fetch = fetch) {
  const discovery = await discoverVillamedia(fetcher);
  const results: VillamediaVacancy[] = []; const warnings: string[] = [];
  for (const entry of discovery.entries) {
    if (results.length || warnings.length) await new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === "test" ? 0 : 1100));
    try {
      const response = await fetcher(entry.sourceUrl, { headers: { "user-agent": "VacatureGPT/1.0 personal vacancy search" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseVillamediaDetail(await response.text(), entry);
      if (!parsed.originalText || !parsed.title) throw new Error("geen bruikbare vacaturetekst of titel");
      results.push(parsed);
    } catch (error) { warnings.push(`${entry.sourceUrl}: ${error instanceof Error ? error.message : "parseerfout"}`); }
  }
  return { ...discovery, results, failedCount: discovery.entries.length - results.length, warnings };
}

export function matchVillamediaOccurrence(item: Pick<VillamediaVacancy, "externalId" | "sourceUrl" | "canonicalKey">, occurrences: Array<{ externalId: string | null; sourceUrl: string; vacancyId: number; canonicalKey?: string }>) {
  return (item.externalId ? occurrences.find((row) => row.externalId === item.externalId) : undefined)
    ?? occurrences.find((row) => row.sourceUrl === item.sourceUrl)
    ?? occurrences.find((row) => row.canonicalKey === item.canonicalKey);
}
