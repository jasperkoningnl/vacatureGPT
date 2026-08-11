import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { isVacancyGone } from "./vacancy-gone";
import { createIngestionWarning } from "./shared/ingestion-warnings";
import { extractSalary } from "./shared/salary-parser";

export const OVERHEID_BASE_URL = "https://www.werkenbijdeoverheid.nl";
export const OVERHEID_OVERVIEW_URL = `${OVERHEID_BASE_URL}/vacatures?dienstverband=CSD.02`;
const CONTRACT_FILTER = "CSD.02";

export type OverheidOverviewVacancy = { sourceUrl: string };
export type OverheidVacancy = OverheidOverviewVacancy & {
  externalId: string; title: string; employer: string; location: string | null;
  hoursMin: number | null; hoursMax: number | null; hoursOriginal: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryPeriod: "month" | "year" | "hour" | null;
  salaryBasisHours: number | null; salaryOriginal: string | null; deadline: Date | null;
  originalText: string; rawData: unknown; contentHash: string; canonicalKey: string; warnings: string[];
};

const clean = (value: unknown) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

function safeUrl(value: string, base = OVERHEID_BASE_URL) {
  try { return new URL(value, base); } catch { return null; }
}

export function discoverAsyncComponentUrls(html: string, pageUrl = OVERHEID_OVERVIEW_URL) {
  const $ = cheerio.load(html); const urls = new Set<string>();
  $(".h2048059253Async, [class$='Async'], [class*='Async ']").each((_, node) => {
    const url = safeUrl($(node).attr("id") ?? "", pageUrl);
    if (!url || url.origin !== OVERHEID_BASE_URL || url.pathname !== "/vacatures" || url.searchParams.get("_hn:type") !== "component-rendering") return;
    // Never allow a generated component URL to silently drop or change the requested contract filter.
    url.searchParams.set("dienstverband", CONTRACT_FILTER); urls.add(url.href);
  });
  return [...urls];
}

export function parseOverheidResults(html: string, pageUrl = OVERHEID_OVERVIEW_URL) {
  const $ = cheerio.load(html); const vacancies = new Map<string, OverheidOverviewVacancy>(); let totalPages = 1;
  $("#vacancies-list a[href], .vacancy__title a[href]").each((_, link) => {
    const url = safeUrl($(link).attr("href") ?? "", pageUrl);
    if (url?.origin === OVERHEID_BASE_URL && /^\/vacatures\/[A-Za-z0-9][A-Za-z0-9._~%-]*$/.test(url.pathname)) {
      url.search = ""; url.hash = ""; vacancies.set(url.href, { sourceUrl: url.href });
    }
  });
  $("nav[aria-label*='Paginering'] a[href], .m-pagination a[href]").each((_, link) => {
    const url = safeUrl($(link).attr("href") ?? "", pageUrl);
    if (url?.searchParams.get("dienstverband") === CONTRACT_FILTER) totalPages = Math.max(totalPages, Number(url.searchParams.get("pagina")) || 1);
  });
  return { vacancies: [...vacancies.values()], totalPages };
}

export async function discoverOverheid(fetcher: typeof fetch = fetch) {
  const headers = { "user-agent": "VacatureGPT/1.0 personal vacancy search" };
  const overview = await fetcher(OVERHEID_OVERVIEW_URL, { headers });
  if (!overview.ok) throw new Error(`Werken bij de Overheid-overzicht gaf HTTP ${overview.status}.`);
  const componentUrls = discoverAsyncComponentUrls(await overview.text());
  if (!componentUrls.length) throw new Error("Geen async vacaturecomponent gevonden in het overzicht.");
  let selected: URL | null = null; let firstResults: ReturnType<typeof parseOverheidResults> | null = null; let pagesFetched = 1;
  for (const componentUrl of componentUrls) {
    const response = await fetcher(componentUrl, { headers }); pagesFetched++;
    if (!response.ok) continue;
    const parsed = parseOverheidResults(await response.text(), componentUrl);
    if (parsed.vacancies.length) { selected = new URL(componentUrl); firstResults = parsed; break; }
  }
  if (!selected || !firstResults) throw new Error("Discovery leverde onverwacht nul vacatures op.");
  const byUrl = new Map(firstResults.vacancies.map((item) => [item.sourceUrl, item]));
  for (let page = 2; page <= firstResults.totalPages; page++) {
    selected.searchParams.set("pagina", String(page)); selected.searchParams.set("dienstverband", CONTRACT_FILTER);
    const response = await fetcher(selected, { headers }); pagesFetched++;
    if (!response.ok) throw new Error(`Resultatenpagina ${page} gaf HTTP ${response.status}.`);
    parseOverheidResults(await response.text(), selected.href).vacancies.forEach((item) => byUrl.set(item.sourceUrl, item));
    if (process.env.NODE_ENV !== "test") await new Promise((resolve) => setTimeout(resolve, 750));
  }
  if (!byUrl.size) throw new Error("Discovery leverde onverwacht nul vacatures op.");
  return { entries: [...byUrl.values()], pagesFetched };
}

function metadata(html: string) {
  const values: Record<string, string> = {};
  for (const key of ["Uren-per-week", "Functienaam", "Standplaats", "Vacaturenummer", "Startdatum", "Einddatum", "TICC-nummer"]) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = html.match(new RegExp(`["']${escaped}["']\\s*:\\s*["']([^"']*)["']`, "i"));
    if (match) values[key] = clean(match[1]);
  }
  return values;
}

function labelledValue($: cheerio.CheerioAPI, label: string) {
  const icon = $(`[title='${label}'], [aria-label='${label}']`).first();
  return clean(icon.closest("li").find(".job-short-info__value").first().text());
}
function parseHours(value: string) {
  const range = value.match(/\b(\d{1,2})\s*(?:-|–|—|tot)\s*(\d{1,2})\b/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = value.match(/\b(\d{1,2})\b/); return single ? { min: Number(single[1]), max: Number(single[1]) } : { min: null, max: null };
}
const months: Record<string, number> = { januari: 0, februari: 1, maart: 2, april: 3, mei: 4, juni: 5, juli: 6, augustus: 7, september: 8, oktober: 9, november: 10, december: 11 };
function parseDate(value: string) { const match = clean(value).toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(20\d{2})$/); return match && months[match[2]] !== undefined ? new Date(Date.UTC(Number(match[3]), months[match[2]], Number(match[1]))) : null; }
const normalized = (value: string) => clean(value).toLocaleLowerCase("nl-NL").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

export function canonicalKey(title: string, employer: string, location: string | null) {
  return createHash("sha256").update(`${normalized(title)}|${normalized(employer)}|${normalized(location ?? "")}`).digest("hex");
}

export function parseOverheidDetail(html: string, overview: OverheidOverviewVacancy): OverheidVacancy {
  const $ = cheerio.load(html); const meta = metadata(html);
  const canonical = safeUrl($("link[rel='canonical']").attr("href") ?? overview.sourceUrl, overview.sourceUrl);
  const sourceUrl = canonical?.origin === OVERHEID_BASE_URL ? (canonical.search = "", canonical.hash = "", canonical.href) : overview.sourceUrl;
  const title = meta["Functienaam"] || clean($(".job-header__header").first().text());
  const employer = clean($(".job-header__title__link").first().text());
  const location = meta.Standplaats || labelledValue($, "Locatie") || null;
  const hoursOriginal = meta["Uren-per-week"] || labelledValue($, "Uren per week") || null; const parsedHours = parseHours(hoursOriginal ?? "");
  const salaryText = labelledValue($, "Salaris"); const salaryDescription = labelledValue($, "Salarisomschrijving");
  // Feed only the source's structured salary evidence and its description into the shared parser.
  const salaryEvidence = salaryText ? `Salaris ${salaryText} per maand${salaryDescription ? `. ${salaryDescription}` : ""}` : salaryDescription;
  const salary = extractSalary([salaryEvidence]);
  const deadline = meta.Einddatum ? parseDate(meta.Einddatum) : null;
  const externalId = meta["TICC-nummer"] || meta.Vacaturenummer || sourceUrl;
  const main = $("main").first(); const originalText = clean((main.length ? main : $("body")).text());
  const warnings = [...salary.warnings];
  if (!meta["TICC-nummer"] && !meta.Vacaturenummer) warnings.push(createIngestionWarning({ severity: "info", category: "identity", message: "TICC-nummer en vacaturenummer ontbreken — de canonical URL is veilig als identifier gebruikt." }));
  if (meta.Einddatum && !deadline) warnings.push(createIngestionWarning({ severity: "warning", category: "parsing", message: `Einddatum ‘${meta.Einddatum}’ kon niet worden gelezen.` }));
  const rawData = { metadata: meta, canonical: sourceUrl, extracted: { salaryStatus: salary.status, salaryWarnings: salary.warnings }, parserWarnings: warnings };
  return { sourceUrl, externalId, title, employer, location, hoursMin: parsedHours.min, hoursMax: parsedHours.max, hoursOriginal,
    salaryMin: salary.min, salaryMax: salary.max, salaryPeriod: salary.period, salaryBasisHours: salary.basisHours,
    salaryOriginal: salary.original, deadline, originalText, rawData, warnings,
    contentHash: createHash("sha256").update(JSON.stringify(rawData)).digest("hex"), canonicalKey: canonicalKey(title, employer, location) };
}

export function batchFailureReason(discovered: number, parsed: OverheidVacancy[], failed: number) {
  if (!discovered) return "Discovery leverde onverwacht nul vacatures op.";
  if (!parsed.length) return "Geen enkele detailpagina kon worden geparseerd.";
  if (failed / discovered > 0.5) return `Meer dan 50% van de detailpagina's mislukte (${failed}/${discovered}).`;
  return null;
}

export async function fetchOverheid(fetcher: typeof fetch = fetch) {
  const discovery = await discoverOverheid(fetcher); const results: OverheidVacancy[] = []; const warnings: string[] = []; const goneUrls: string[] = [];
  for (const entry of discovery.entries) {
    if ((results.length || warnings.length) && process.env.NODE_ENV !== "test") await new Promise((resolve) => setTimeout(resolve, 900));
    try { const response = await fetcher(entry.sourceUrl, { headers: { "user-agent": "VacatureGPT/1.0 personal vacancy search" } });
      const html = await response.text(); if (isVacancyGone("werken-bij-de-overheid", response.url || entry.sourceUrl, html)) { goneUrls.push(entry.sourceUrl); continue; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`); const item = parseOverheidDetail(html, entry);
      if (!item.originalText || !item.title || !item.employer) throw new Error("geen bruikbare vacaturetekst, titel of werkgever"); results.push(item);
    } catch (error) { warnings.push(createIngestionWarning({ severity: "warning", category: "fetch", url: entry.sourceUrl, message: `Vacature kon niet worden gelezen — ${error instanceof Error ? error.message : "onbekende parseerfout"}. Deze vacature is deze run overgeslagen.` })); }
  }
  return { ...discovery, pagesFetched: discovery.pagesFetched + discovery.entries.length, results,
    failedCount: discovery.entries.length - results.length - goneUrls.length, warnings, goneUrls };
}

export function mergeReliable(old: Record<string, unknown>, incoming: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(incoming).filter(([key, value]) => value !== null && value !== undefined && (old[key] === null || old[key] === undefined)));
}
