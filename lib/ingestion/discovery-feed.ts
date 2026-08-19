import { createHash } from "node:crypto";

export const DISCOVERY_FEED_PATH = "data/vacaturegpt_discovery_latest.json";
export const DISCOVERY_BRANCH = "discovery-data";

export type DiscoveryPosting = {
  company: string;
  title: string;
  location?: string;
  remote_policy?: string;
  hours?: string;
  salary?: string;
  posted_date?: string;
  source?: string;
  source_url?: string;
  direct_url?: string;
  first_seen?: string;
};

export type DiscoveryVacancy = {
  sourceUrl: string;
  directUrl: string | null;
  normalizedDirectUrl: string | null;
  normalizedSourceUrl: string | null;
  companyTitleKey: string;
  canonicalKey: string;
  title: string;
  employer: string;
  location: string | null;
  hoursMin: number | null;
  hoursMax: number | null;
  hoursOriginal: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: "month" | "year" | "hour" | null;
  salaryOriginal: string | null;
  firstSeenAt: Date;
  originalText: string;
  contentHash: string;
  rawData: { feedRunDate: string; posting: DiscoveryPosting; selectedUrl: string };
};

const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const identity = (value: string) => clean(value).toLocaleLowerCase("nl-NL");
export const companyTitleKey = (company: string, title: string) => `${identity(company)}|${identity(title)}`;

export function normalizeDiscoveryUrl(value: string | undefined): string | null {
  const input = clean(value);
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function isSpecificVacancyUrl(value: string): boolean {
  const normalized = normalizeDiscoveryUrl(value);
  if (!normalized) return false;
  const url = new URL(normalized);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  const generic = /^(jobs?|careers?|vacatures?|werken-bij|werkenbij|work-with-us|join-us|about|contact|search)$/i;
  return !(parts.length === 1 && generic.test(parts[0]));
}

export function discoveryUrlsInRawData(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(discoveryUrlsInRawData);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    if (/^(direct_url|source_url|directUrl|sourceUrl|selectedUrl)$/i.test(key) && typeof nested === "string") {
      const normalized = normalizeDiscoveryUrl(nested);
      return normalized ? [normalized] : [];
    }
    return discoveryUrlsInRawData(nested);
  });
}

function parseHours(value: string) {
  const numbers = [...value.matchAll(/\d{1,2}/g)].map((match) => Number(match[0])).filter((number) => number <= 80);
  return { min: numbers[0] ?? null, max: numbers[1] ?? numbers[0] ?? null };
}

function parseSalary(value: string) {
  const numbers = [...value.matchAll(/\d[\d.,]*/g)].map((match) => Number(match[0].replace(/\.(?=\d{3}\b)/g, "").replace(",", "."))).filter(Number.isFinite);
  const period = /(?:per\s+)?uur|hour/i.test(value) ? "hour" as const : /jaar|year|annual/i.test(value) ? "year" as const : numbers.length ? "month" as const : null;
  return { min: numbers[0] ? Math.round(numbers[0]) : null, max: numbers[1] ? Math.round(numbers[1]) : numbers[0] ? Math.round(numbers[0]) : null, period };
}

function date(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Ongeldige ${field}: ${value || "ontbreekt"}`);
  return new Date(`${value}T00:00:00Z`);
}

export function parseDiscoveryFeed(input: string): { runDate: string; postingsFound: number; vacancies: DiscoveryVacancy[]; errors: string[] } {
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch (error) { throw new Error(`Discovery-feed bevat malformed JSON: ${error instanceof Error ? error.message : "onbekende fout"}`); }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { postings?: unknown }).postings)) throw new Error("Discovery-feed heeft geen geldige postings-array.");
  const runDate = clean((parsed as { run_date?: unknown }).run_date);
  date(runDate, "run_date");
  const postings = (parsed as { postings: unknown[] }).postings;
  const vacancies: DiscoveryVacancy[] = [];
  const errors: string[] = [];
  postings.forEach((unknownPosting, index) => {
    try {
      if (!unknownPosting || typeof unknownPosting !== "object" || Array.isArray(unknownPosting)) throw new Error("posting is geen object");
      const posting = unknownPosting as DiscoveryPosting;
      const company = clean(posting.company); const title = clean(posting.title);
      if (!company || !title) throw new Error("company of title ontbreekt");
      const direct = normalizeDiscoveryUrl(posting.direct_url);
      const source = normalizeDiscoveryUrl(posting.source_url);
      const selected = direct && isSpecificVacancyUrl(direct) ? direct : source && isSpecificVacancyUrl(source) ? source : null;
      if (!selected) throw new Error("geen specifieke vacature-URL");
      const hoursOriginal = clean(posting.hours) || null; const salaryOriginal = clean(posting.salary) || null;
      const hours = parseHours(hoursOriginal ?? ""); const salary = parseSalary(salaryOriginal ?? "");
      const firstSeenAt = date(clean(posting.first_seen || posting.posted_date || runDate), "first_seen");
      const originalText = [title, company, clean(posting.location), clean(posting.remote_policy), hoursOriginal, salaryOriginal, clean(posting.posted_date), clean(posting.source)].filter(Boolean).join("\n");
      const rawData = { feedRunDate: runDate, posting, selectedUrl: selected };
      vacancies.push({ sourceUrl: selected, directUrl: clean(posting.direct_url) || null, normalizedDirectUrl: direct, normalizedSourceUrl: source,
        companyTitleKey: companyTitleKey(company, title), canonicalKey: createHash("sha256").update(companyTitleKey(company, title)).digest("hex"),
        title, employer: company, location: clean(posting.location) || null, hoursMin: hours.min, hoursMax: hours.max, hoursOriginal,
        salaryMin: salary.min, salaryMax: salary.max, salaryPeriod: salary.period, salaryOriginal, firstSeenAt, originalText,
        contentHash: createHash("sha256").update(JSON.stringify(rawData)).digest("hex"), rawData });
    } catch (error) { errors.push(`Posting ${index + 1}: ${error instanceof Error ? error.message : "onbekende fout"}`); }
  });
  return { runDate, postingsFound: postings.length, vacancies, errors };
}

export function githubDiscoveryFeedUrl(repository: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Ongeldige GitHub repositorynaam.");
  return `https://api.github.com/repos/${repository}/contents/${DISCOVERY_FEED_PATH}?ref=${DISCOVERY_BRANCH}`;
}

export async function fetchDiscoveryFeed(repository: string, token: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(githubDiscoveryFeedUrl(repository), { headers: { Accept: "application/vnd.github.raw+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } });
  if (!response.ok) throw new Error(`Discovery-feed kon niet uit branch ${DISCOVERY_BRANCH} worden gelezen: GitHub HTTP ${response.status}`);
  return parseDiscoveryFeed(await response.text());
}

export function isDiscoveryDuplicate(item: DiscoveryVacancy, knownUrls: ReadonlySet<string>, knownCompanyTitles: ReadonlySet<string>) {
  return Boolean((item.normalizedDirectUrl && knownUrls.has(item.normalizedDirectUrl))
    || (item.normalizedSourceUrl && knownUrls.has(item.normalizedSourceUrl))
    || knownCompanyTitles.has(item.companyTitleKey));
}
