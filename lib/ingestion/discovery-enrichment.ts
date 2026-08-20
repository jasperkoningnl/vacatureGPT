import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { MIN_FULL_VACANCY_TEXT, vacancyContentDepth } from "../vacancy-depth";
import { isSpecificVacancyUrl, normalizeDiscoveryUrl, type DiscoveryVacancy } from "./discovery-feed";

/**
 * Discovery levert alleen metadata. Waar de feed een directe vacaturepagina bij de werkgever
 * aanwijst, wordt die pagina opgehaald zodat het AI-oordeel op de echte vacaturetekst rust.
 * Vacaturenetwerken en sociale platformen worden nooit zelf geopend of gescrapet; blijft de
 * tekst uit, dan blijft de vacature expliciet metadata-only.
 */
export const BLOCKED_ENRICHMENT_HOSTS = [
  "linkedin.com", "lnkd.in", "indeed.com", "glassdoor.com", "glassdoor.nl", "ziprecruiter.com",
  "facebook.com", "instagram.com", "x.com", "twitter.com",
] as const;
export const ENRICHMENT_TIMEOUT_MS = 10_000;
export const MAX_ENRICHMENT_BYTES = 2_000_000;
export const ENRICHMENT_USER_AGENT = "vacatureGPT-discovery/1.0 (+https://github.com/jasperkoningnl/vacatureGPT)";

export type EnrichmentStatus = "enriched" | "blocked" | "unavailable" | "too_thin" | "failed";
export type EnrichmentOutcome = { status: EnrichmentStatus; url?: string; reason?: string };
export type EnrichmentFetch = (url: string, init: { headers: Record<string, string>; redirect: "follow"; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; url?: string; headers: { get(name: string): string | null }; text(): Promise<string> }>;

const blocked = (hostname: string) => BLOCKED_ENRICHMENT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));

/** Alleen een https-vacaturepagina bij de werkgever zelf komt in aanmerking; al het andere blijft dicht. */
export function enrichmentTarget(item: Pick<DiscoveryVacancy, "normalizedDirectUrl">): string | null {
  const normalized = normalizeDiscoveryUrl(item.normalizedDirectUrl ?? undefined);
  if (!normalized || !isSpecificVacancyUrl(normalized)) return null;
  const url = new URL(normalized);
  return url.protocol === "https:" && !blocked(url.hostname) ? normalized : null;
}

/** Haalt alleen zichtbare paginatekst op; navigatie, scripts en formulieren tellen niet als vacaturetekst. */
export function extractVacancyText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, header, footer, aside, form, iframe, template").remove();
  const main = $("main, article, [role='main']").first();
  const text = (main.length ? main : $("body")).text();
  return text.replace(/\r\n?/g, "\n").replace(/[ \t ]+/g, " ").split("\n").map((line) => line.trim()).filter(Boolean).join("\n").trim();
}

export async function fetchVacancyText(url: string, fetchImpl: EnrichmentFetch = fetch as unknown as EnrichmentFetch): Promise<{ text?: string; outcome: EnrichmentOutcome }> {
  try {
    const response = await fetchImpl(url, { headers: { "User-Agent": ENRICHMENT_USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(ENRICHMENT_TIMEOUT_MS) });
    const finalUrl = response.url ? normalizeDiscoveryUrl(response.url) : url;
    if (finalUrl && blocked(new URL(finalUrl).hostname)) return { outcome: { status: "blocked", url, reason: "doorverwijzing naar een geblokkeerd netwerk" } };
    if (!response.ok) return { outcome: { status: "unavailable", url, reason: `HTTP ${response.status}` } };
    if (!/text\/html|application\/xhtml/i.test(response.headers.get("content-type") ?? "")) return { outcome: { status: "unavailable", url, reason: "geen HTML-respons" } };
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_ENRICHMENT_BYTES) return { outcome: { status: "unavailable", url, reason: "pagina te groot" } };
    const html = await response.text();
    if (html.length > MAX_ENRICHMENT_BYTES) return { outcome: { status: "unavailable", url, reason: "pagina te groot" } };
    const text = extractVacancyText(html);
    if (text.length < MIN_FULL_VACANCY_TEXT) return { outcome: { status: "too_thin", url, reason: "pagina bevat geen bruikbare vacaturetekst" } };
    return { text, outcome: { status: "enriched", url } };
  } catch (error) {
    return { outcome: { status: "failed", url, reason: error instanceof Error ? error.message : "onbekende fout" } };
  }
}

/**
 * Bouwt de verrijkte vacature. De metadataregels blijven bovenaan staan als herkomst, de opgehaalde
 * tekst wordt de vacaturetekst, en de provenance in rawData bepaalt zoals altijd de contentHash —
 * zodat een later opgehaalde of gewijzigde tekst netjes een herbeoordeling uitlokt.
 */
export function enrichedDiscoveryVacancy(item: DiscoveryVacancy, text: string, url: string): DiscoveryVacancy {
  const rawData = { ...item.rawData, enrichment: { fetchedFrom: url, textHash: createHash("sha256").update(text).digest("hex") } };
  const originalText = `${item.originalText}\n\n${text}`;
  return { ...item, description: text, originalText, contentDepth: vacancyContentDepth({ originalText }), rawData, contentHash: createHash("sha256").update(JSON.stringify(rawData)).digest("hex") };
}

/** Verrijking is altijd optioneel: mislukt het, dan blijft de metadata-only vacature ongewijzigd. */
export async function enrichDiscoveryVacancy(item: DiscoveryVacancy, fetchImpl?: EnrichmentFetch): Promise<{ item: DiscoveryVacancy; outcome: EnrichmentOutcome }> {
  const target = enrichmentTarget(item);
  if (!target) return { item, outcome: { status: "blocked", reason: "geen veilige directe werkgevers-URL" } };
  const { text, outcome } = await fetchVacancyText(target, fetchImpl);
  return { item: text ? enrichedDiscoveryVacancy(item, text, target) : item, outcome };
}
