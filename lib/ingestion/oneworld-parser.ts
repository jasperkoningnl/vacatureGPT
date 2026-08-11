import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { createIngestionWarning, parseIngestionWarning } from "./shared/ingestion-warnings";
import { isVacancyGone } from "./vacancy-gone";

export const RSS_URL = "https://www.oneworld.nl/wpjobboard/xml/rss/?category=7&type=3&meta%5Bworkload%5D=32-36";
export const UNKNOWN_EMPLOYER = "Onbekende werkgever";

export type SalaryPeriod = "month" | "year" | "hour";
export type NormalizedVacancy = {
  externalId?: string;
  sourceUrl: string;
  title: string;
  employer: string;
  location: string | null;
  hoursMin: number | null;
  hoursMax: number | null;
  hoursOriginal: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod | null;
  salaryBasisHours: number | null;
  salaryOriginal: string | null;
  deadline: Date | null;
  originalText: string;
  rawData: unknown;
  contentHash: string;
  canonicalKey: string;
  warnings: string[];
};

type Hours = { min: number; max: number; original: string };
type JsonObject = Record<string, unknown>;
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const decode = (value: unknown) => clean(cheerio.load(String(value ?? "")).root().text());

export function parseRss(xml: string) {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("item").map((_, element) => ({
    title: clean($(element).find("title").text()),
    url: clean($(element).find("link").text()),
    summary: clean($(element).find("description").text()),
  })).get().filter((entry) => entry.title && entry.url);
}

export function parseHours(value: string): Hours | null {
  const text = clean(value);
  // Only convert days when the page explicitly supplies the hours-per-day conversion.
  const days = text.match(/\b(\d(?:[.,]\d+)?)\s+days?\s+per\s+week\s*[,;(]\s*(\d(?:[.,]\d+)?)\s+hours?\s+per\s+day/i);
  if (days) {
    const total = Number(days[1].replace(",", ".")) * Number(days[2].replace(",", "."));
    return { min: total, max: total, original: text };
  }
  const range = text.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:-|–|—|tot|to|and)\s*(\d{1,2}(?:[.,]\d+)?)\s*(?:uur|uren|hours?)\b/i);
  if (range) return { min: Number(range[1].replace(",", ".")), max: Number(range[2].replace(",", ".")), original: text };
  const single = text.match(/\b(\d{1,2}(?:[.,]\d+)?)\s*(?:uur|uren|hours?)(?:\s+per\s+week)?\b/i);
  if (single) return { min: Number(single[1].replace(",", ".")), max: Number(single[1].replace(",", ".")), original: text };
  return null;
}

function euro(value: string): number {
  const compact = value.replace(/\s/g, "");
  if (/^\d{1,3}([.,])\d{3}$/.test(compact)) return Number(compact.replace(/[.,]/g, ""));
  return Math.round(Number(compact.replace(",", ".")));
}

export function parseSalary(value: string) {
  const original = clean(value);
  if (!/€|EUR\b/i.test(original)) return null;
  const amount = "([\\d]{1,3}(?:[.,][\\d]{3})+|[\\d]{4,6}|[\\d]{1,3}(?:[.,][\\d]{1,2})?)";
  const range = new RegExp(`(?:between|van)?\\s*(?:€|EUR)\\s*${amount}\\s*(?:and|to|tot|-|–|—)\\s*(?:€|EUR)?\\s*${amount}`, "i").exec(original);
  const minimum = new RegExp(`(?:minimum|minimaal|vanaf|at least)\\s*(?:of\\s*)?(?:€|EUR)\\s*${amount}`, "i").exec(original);
  const maximum = new RegExp(`(?:maximum|maximaal|up to|tot maximaal)\\s*(?:of\\s*)?(?:€|EUR)\\s*${amount}`, "i").exec(original);
  if (!range && !minimum && !maximum) return null;
  const period: SalaryPeriod | null = /per\s+(?:month|maand)|p\/?m\b/i.test(original) ? "month" : /per\s+(?:year|jaar)|annual|jaarlijks/i.test(original) ? "year" : /per\s+(?:hour|uur)|hourly|uurtarief/i.test(original) ? "hour" : null;
  const basis = original.match(/(?:for|voor|op basis van)\s+(?:a\s+)?(\d{1,2})[- ](?:hour|urige?)\s+(?:workweek|werkweek)/i)
    ?? original.match(/(?:workweek|werkweek)\s+(?:of|van)\s+(\d{1,2})\s*(?:hours?|uur)/i);
  return {
    min: range ? euro(range[1]) : minimum ? euro(minimum[1]) : null,
    max: range ? euro(range[2]) : maximum ? euro(maximum[1]) : null,
    period,
    basisHours: basis ? Number(basis[1]) : null,
    original,
  };
}

function jsonObjects(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.flatMap(jsonObjects);
  if (!value || typeof value !== "object") return [];
  const object = value as JsonObject;
  return [object, ...jsonObjects(object["@graph"])];
}

function typeIs(object: JsonObject, type: string) {
  const value = object["@type"];
  return Array.isArray(value) ? value.includes(type) : value === type;
}

export function parseDetail(html: string, sourceUrl: string): NormalizedVacancy {
  const $ = cheerio.load(html);
  const structured: JsonObject[] = [];
  for (const node of $('script[type="application/ld+json"]').toArray()) {
    try { structured.push(...jsonObjects(JSON.parse($(node).text()))); } catch { /* Ignore only this malformed block. */ }
  }
  const job = structured.find((object) => typeIs(object, "JobPosting")) ?? {};
  const descriptionHtml = clean(job.description);
  const description = descriptionHtml ? clean(cheerio.load(descriptionHtml).text()) : "";

  const labels = new Map<string, string>();
  $("dt, .wpjb-grid-row, .job-meta li, .vacancy-meta li, .vacature-meta li").each((_, element) => {
    const node = $(element);
    if (element.tagName === "dt") {
      const value = clean(node.next("dd").text());
      if (value) labels.set(clean(node.text()).replace(/:$/, "").toLowerCase(), value);
      return;
    }
    const labelNode = node.find(".wpjb-grid-col, .label, strong, b").first();
    const label = clean(labelNode.text()).replace(/:$/, "").toLowerCase();
    const whole = clean(node.text());
    const value = clean(whole.slice(clean(labelNode.text()).length)).replace(/^:\s*/, "");
    if (label && value) labels.set(label, value);
  });
  // OneWorld also renders plain labelled lines. Restrict this fallback to known labels.
  const pageText = clean($("body").text());
  for (const label of ["locatie", "tijd per week", "soort dienstverband", "gepubliceerd", "opleidingsniveau"]) {
    if (labels.has(label)) continue;
    const match = pageText.match(new RegExp(`${label}\\s*:\\s*([^|•\\n]{1,100}?)(?=\\s+(?:Locatie|Tijd per week|Soort Dienstverband|Gepubliceerd|Opleidingsniveau)\\s*:|$)`, "i"));
    if (match) labels.set(label, clean(match[1]));
  }

  const title = decode(job.title || $("h1").first().text() || $('meta[property="og:title"]').attr("content"));
  const organization = job.hiringOrganization && typeof job.hiringOrganization === "object" ? job.hiringOrganization as JsonObject : undefined;
  const otherOrganization = structured.find((object) => typeIs(object, "Organization") && clean(object.name) && clean(object.name).toLowerCase() !== "oneworld");
  const employer = decode(organization?.name || otherOrganization?.name || $(".wpjb-top-header-title, .wpjb-company_name, .wpjb-company-name, [itemprop='hiringOrganization'] [itemprop='name'], .company-name, .vacature-organisatie").first().text()) || UNKNOWN_EMPLOYER;
  const address = job.jobLocation && typeof job.jobLocation === "object" ? (job.jobLocation as JsonObject).address : undefined;
  const jsonLocation = address && typeof address === "object" ? clean((address as JsonObject).addressLocality) : "";
  const location = decode(labels.get("locatie") || jsonLocation) || null;

  const labelledHours = parseHours(labels.get("tijd per week") ?? "");
  const jsonHours = parseHours(clean(job.workHours));
  const descriptionHours = description.split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/€|EUR\b/i.test(sentence))
    .map(parseHours).find((candidate) => candidate !== null) ?? null;
  const hours = labelledHours || jsonHours || descriptionHours;
  const warnings: string[] = [];
  if (labelledHours) {
    for (const [source, candidate] of [["JSON-LD", jsonHours], ["beschrijving", descriptionHours]] as const) {
      if (candidate && (candidate.min !== labelledHours.min || candidate.max !== labelledHours.max)) {
        const detail = candidate.original.length > 160 ? `${candidate.original.slice(0, 157)}...` : candidate.original;
        warnings.push(`Tijd per week (${labelledHours.original}) conflicteert met ${source} (${detail}).`);
      }
    }
  }

  const salaryNodes = $("li, p").toArray().map((node) => clean($(node).text())).filter((text) => /€|EUR\b/i.test(text));
  const likelySalary = salaryNodes.map(parseSalary).find(Boolean) ?? parseSalary(description);
  const identifier = job.identifier;
  const externalId = typeof identifier === "object" && identifier ? clean((identifier as JsonObject).value || (identifier as JsonObject)["@value"]) : clean(identifier);
  const deadlineValue = clean(job.validThrough);
  const deadline = deadlineValue && !Number.isNaN(new Date(deadlineValue).valueOf()) ? new Date(deadlineValue) : null;
  const originalText = description || clean($(".wpjb-text-box, .job-description, [itemprop='description'], article").first().text());
  if (!structured.length && !labels.size && !originalText) warnings.push("Pagina bevat geen bruikbare metadata, JSON-LD of vacaturetekst.");
  if (/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/i.test(title)) warnings.push("Titel bevat nog een gecodeerde HTML-entiteit.");

  const stable = `${title.toLowerCase()}|${employer.toLowerCase()}|${(location ?? "").toLowerCase()}`;
  const rawData = { job, labelledMetadata: Object.fromEntries(labels), extracted: { hoursOriginal: hours?.original ?? null, salaryOriginal: likelySalary?.original ?? null }, parserWarnings: warnings };
  return {
    externalId: externalId || undefined, sourceUrl, title, employer, location,
    hoursMin: hours?.min ?? null, hoursMax: hours?.max ?? null, hoursOriginal: hours?.original ?? null,
    salaryMin: likelySalary?.min ?? null, salaryMax: likelySalary?.max ?? null, salaryPeriod: likelySalary?.period ?? null,
    salaryBasisHours: likelySalary?.basisHours ?? null, salaryOriginal: likelySalary?.original ?? null,
    deadline, originalText, rawData, warnings,
    contentHash: createHash("sha256").update(JSON.stringify(rawData)).digest("hex"),
    canonicalKey: createHash("sha256").update(stable).digest("hex"),
  };
}

export function qualityWarnings(results: NormalizedVacancy[]) {
  if (!results.length) return [createIngestionWarning({ severity: "critical", category: "batch", message: "Broncontrole mislukt — OneWorld leverde onverwacht nul vacatures. Er zijn geen vacatures bijgewerkt." })];
  const warnings = results.flatMap((result) => result.warnings.map((warning) => createIngestionWarning({ ...parseIngestionWarning(warning), url: result.sourceUrl })));
  const unknownEmployers = results.filter((result) => result.employer === UNKNOWN_EMPLOYER).length;
  const unknownHours = results.filter((result) => result.hoursMin === null).length;
  if (unknownEmployers / results.length > 0.2) warnings.push(createIngestionWarning({ severity: "critical", category: "batch", message: `Broncontrole mislukt — ${unknownEmployers} van ${results.length} vacatures hebben een onbekende werkgever (meer dan 20%).` }));
  if (unknownHours / results.length > 0.5) warnings.push(createIngestionWarning({ severity: "critical", category: "batch", message: `Broncontrole mislukt — ${unknownHours} van ${results.length} vacatures hebben onbekende uren (meer dan 50%).` }));
  return warnings;
}

/** Warnings that make a production repair unsafe to apply. Hour-range conflicts are
 * retained for auditability, but do not reject a record because labelled hours win. */
export function isCriticalQualityWarning(warning: string) {
  return parseIngestionWarning(warning).severity === "critical" || /Kwaliteitswaarschuwing|onverwacht nul resultaten|geen bruikbare metadata|gecodeerde HTML-entiteit/i.test(warning);
}

const ONE_WORLD_USER_AGENT = "VacatureGPT/1.0 personal vacancy search";
const detailDelay = () => new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === "test" ? 0 : 1100));

/** Fetches only the supplied vacancy pages. This is deliberately independent of RSS so
 * existing occurrences can still be repaired when discovery is unavailable. */
export async function fetchOneWorldUrls(urls: string[], fetcher: typeof fetch = fetch) {
  const uniqueUrls = [...new Set(urls)];
  const results: NormalizedVacancy[] = [];
  const goneUrls: string[] = [];
  const fetchWarnings: string[] = [];
  for (const url of uniqueUrls) {
    await detailDelay();
    try {
      const response = await fetcher(url, { headers: { "user-agent": ONE_WORLD_USER_AGENT } });
      const html = await response.text();
      if (isVacancyGone("oneworld", response.url || url, html)) { goneUrls.push(url); continue; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      results.push(parseDetail(html, url));
    } catch (error) {
      fetchWarnings.push(createIngestionWarning({ severity: "warning", category: "fetch", url, message: `Vacature kon niet worden gelezen — ${error instanceof Error ? error.message : "onbekende parseerfout"}. Deze vacature is deze run overgeslagen.` }));
    }
  }
  return {
    results,
    warnings: [...fetchWarnings, ...qualityWarnings(results)],
    failedCount: fetchWarnings.length,
    requestedCount: uniqueUrls.length,
    goneUrls,
  };
}

export function repairFailureReason(requestedCount: number, parsedCount: number, failedCount: number, warnings: string[]) {
  if (requestedCount === 0) return "De database bevat geen bestaande OneWorld-URL's.";
  if (parsedCount === 0) return "Geen enkele OneWorld-detailpagina kon worden geparseerd.";
  if (failedCount / requestedCount > 0.5) return "Meer dan 50% van de OneWorld-detailpagina's is mislukt.";
  if (warnings.some(isCriticalQualityWarning)) return "De bestaande kritieke kwaliteitscontroles zijn mislukt.";
  return null;
}

export function matchRepairOccurrence<T extends { externalId: string | null; sourceUrl: string }>(item: NormalizedVacancy, occurrences: T[]) {
  return item.externalId
    ? occurrences.find((occurrence) => occurrence.externalId === item.externalId)
    : occurrences.find((occurrence) => occurrence.sourceUrl === item.sourceUrl);
}

export async function fetchOneWorld(fetcher: typeof fetch = fetch) {
  const rss = await fetcher(RSS_URL, { headers: { "user-agent": ONE_WORLD_USER_AGENT } });
  if (!rss.ok) throw new Error(`OneWorld RSS gaf HTTP ${rss.status}`);
  const entries = parseRss(await rss.text());
  return fetchOneWorldUrls(entries.map((entry) => entry.url), fetcher);
}
