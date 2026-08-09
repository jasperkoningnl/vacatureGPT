export const warningSeverities = ["info", "warning", "critical"] as const;
export type WarningSeverity = (typeof warningSeverities)[number];
export type WarningCategory = "salary" | "parsing" | "fetch" | "identity" | "data-quality" | "batch" | "other";

export type IngestionWarning = { severity: WarningSeverity; category: WarningCategory; message: string; url?: string };

const categoryLabels: Record<WarningCategory, string> = {
  salary: "Salarisinterpretatie",
  parsing: "Vacature kon niet worden gelezen",
  fetch: "Vacature kon niet worden opgehaald",
  identity: "Identificatie",
  "data-quality": "Ontbrekende gegevens",
  batch: "Broncontrole",
  other: "Overig",
};

const encodedNotice = /^\[(INFO|WARNING|CRITICAL)\]\[([a-z-]+)\](?:\[([^\]]+)\])? (.+)$/s;

export function createIngestionWarning({ severity, category, message, url }: IngestionWarning) {
  return `[${severity.toUpperCase()}][${category}]${url ? `[${encodeURIComponent(url)}]` : ""} ${message.trim()}`;
}

export function parseIngestionWarning(value: string): IngestionWarning {
  const match = value.match(encodedNotice);
  if (!match || !warningSeverities.includes(match[1].toLowerCase() as WarningSeverity) || !(match[2] in categoryLabels)) {
    return { severity: "warning", category: "other", message: value };
  }
  let url: string | undefined;
  if (match[3]) {
    try { url = decodeURIComponent(match[3]); } catch { url = match[3]; }
  }
  return { severity: match[1].toLowerCase() as WarningSeverity, category: match[2] as WarningCategory, message: match[4], ...(url ? { url } : {}) };
}

export function categoryLabel(category: WarningCategory) { return categoryLabels[category]; }

export function highestWarningSeverity(values: string[]): WarningSeverity | null {
  const rank: Record<WarningSeverity, number> = { info: 1, warning: 2, critical: 3 };
  return values.map(parseIngestionWarning).reduce<WarningSeverity | null>((highest, item) => !highest || rank[item.severity] > rank[highest] ? item.severity : highest, null);
}

export function runStatusForWarnings(values: string[]): "success" | "warning" | "error" {
  const severity = highestWarningSeverity(values);
  return severity === "critical" ? "error" : severity === "warning" ? "warning" : "success";
}

export function warningCounts(values: string[]) {
  return values.map(parseIngestionWarning).reduce((counts, item) => ({ ...counts, [item.severity]: counts[item.severity] + 1 }), { info: 0, warning: 0, critical: 0 });
}

export function warningsMarkdown(values: string[]) {
  if (!values.length) return "Geen meldingen.";
  const labels: Record<WarningSeverity, string> = { info: "Info", warning: "Waarschuwingen", critical: "Kritiek" };
  const parsed = values.map(parseIngestionWarning);
  return ["### Meldingen", ...warningSeverities.flatMap((severity) => {
    const items = parsed.filter((item) => item.severity === severity);
    return items.length ? ["", `**${labels[severity]}**`, "", ...items.map((item) => `- ${item.message}${item.url ? ` — ${item.url}` : ""}`)] : [];
  })].join("\n");
}

export type SourceHealth = "Goed" | "Aandacht" | "Probleem" | "Onbekend";
export function sourceHealth(statuses: Array<"running" | "success" | "warning" | "error" | null | undefined>): SourceHealth {
  const usable = statuses.filter((status): status is "success" | "warning" | "error" => status === "success" || status === "warning" || status === "error");
  if (!usable.length) return "Onbekend";
  if (usable.includes("error")) return "Probleem";
  if (usable.includes("warning")) return "Aandacht";
  return "Goed";
}
