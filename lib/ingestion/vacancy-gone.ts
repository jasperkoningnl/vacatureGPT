import * as cheerio from "cheerio";

export type VacancySource = "villamedia" | "oneworld" | "culturele-vacatures" | "werken-bij-de-overheid";

const normalized = (value: string) => value.replace(/&(?:ndash|#8211);/gi, "–").replace(/\s+/g, " ").trim().toLowerCase();

/** Source-specific, deliberately narrow hard-expiry signals. */
export function isVacancyGone(source: VacancySource, responseUrl: string, html: string) {
  const $ = cheerio.load(html);
  const title = normalized($("title").text());
  const body = normalized($("body").text());
  const ogUrl = $("meta[property='og:url']").attr("content") ?? "";

  if (source === "villamedia") return new URL(responseUrl).pathname.replace(/\/$/, "") === "/vacatures/niet-gevonden";
  if (source === "oneworld") return title.includes("pagina niet gevonden - oneworld");
  if (source === "culturele-vacatures") return title.includes("pagina niet gevonden – culturele vacatures") || title.includes("pagina niet gevonden - culturele vacatures");
  return title.includes("helaas - werken bij de overheid")
    || /\/vacancy404(?:[/?#]|$)/i.test(ogUrl)
    || body.includes("de vacature die je zoekt bestaat niet of is verlopen");
}
