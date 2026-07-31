import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { z } from "zod";

export const RSS_URL = "https://www.oneworld.nl/wpjobboard/xml/rss/?category=7&type=3&meta%5Bworkload%5D=32-36";
const jobSchema = z.object({ title: z.string(), description: z.string().optional().default(""), identifier: z.object({ value: z.union([z.string(), z.number()]) }).optional(), validThrough: z.string().optional(), hiringOrganization: z.object({ name: z.string().optional() }).optional(), jobLocation: z.object({ address: z.object({ addressLocality: z.string().optional() }).optional() }).optional(), baseSalary: z.unknown().optional() });
export type NormalizedVacancy = { externalId?: string; sourceUrl: string; title: string; employer: string; location: string | null; hoursMin: number | null; hoursMax: number | null; salaryMin: number | null; salaryMax: number | null; deadline: Date | null; originalText: string; rawData: unknown; contentHash: string; canonicalKey: string };

export function parseRss(xml: string) { const $ = cheerio.load(xml, { xmlMode: true }); return $("item").map((_, el) => ({ title: $(el).find("title").text().trim(), url: $(el).find("link").text().trim(), summary: $(el).find("description").text().trim() })).get().filter(x => x.title && x.url); }
export function parseDetail(html: string, sourceUrl: string): NormalizedVacancy {
  const $ = cheerio.load(html); let raw: unknown;
  for (const node of $('script[type="application/ld+json"]').toArray()) { try { const value = JSON.parse($(node).text()); const candidates = Array.isArray(value) ? value : [value]; raw = candidates.find((x) => x?.["@type"] === "JobPosting"); if (raw) break; } catch { /* another JSON-LD block may still be valid */ } }
  const job = jobSchema.parse(raw); const text = cheerio.load(job.description).text().replace(/\s+/g, " ").trim();
  const hours = `${job.title} ${text}`.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*uur/i); const salary = text.match(/€\s*([\d.]+)\s*(?:tot|[-–])\s*€?\s*([\d.]+)/i);
  const employer = job.hiringOrganization?.name?.trim() || $(".wpjb-company_name").first().text().trim() || "Onbekende werkgever";
  const stable = `${job.title.trim().toLowerCase()}|${employer.toLowerCase()}|${job.jobLocation?.address?.addressLocality?.toLowerCase() ?? ""}`;
  const contentHash = createHash("sha256").update(JSON.stringify(job)).digest("hex");
  return { externalId: job.identifier ? String(job.identifier.value) : undefined, sourceUrl, title: job.title.trim(), employer, location: job.jobLocation?.address?.addressLocality || null, hoursMin: hours ? Number(hours[1]) : null, hoursMax: hours ? Number(hours[2]) : null, salaryMin: salary ? Number(salary[1].replaceAll(".", "")) : null, salaryMax: salary ? Number(salary[2].replaceAll(".", "")) : null, deadline: job.validThrough ? new Date(job.validThrough) : null, originalText: text, rawData: job, contentHash, canonicalKey: createHash("sha256").update(stable).digest("hex") };
}
export async function fetchOneWorld(fetcher: typeof fetch = fetch) { const rss = await fetcher(RSS_URL, { headers: { "user-agent": "VacatureGPT/1.0 personal vacancy search" } }); if (!rss.ok) throw new Error(`OneWorld RSS gaf HTTP ${rss.status}`); const entries = parseRss(await rss.text()); const results: NormalizedVacancy[] = []; const warnings: string[] = []; for (const entry of entries) { await new Promise(r => setTimeout(r, process.env.NODE_ENV === "test" ? 0 : 1100)); try { const response = await fetcher(entry.url, { headers: { "user-agent": "VacatureGPT/1.0 personal vacancy search" } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); results.push(parseDetail(await response.text(), entry.url)); } catch (error) { warnings.push(`${entry.url}: ${error instanceof Error ? error.message : "parseerfout"}`); } } if (!entries.length) warnings.push("OneWorld leverde onverwacht nul resultaten."); return { results, warnings }; }
