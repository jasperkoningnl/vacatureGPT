import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sourceRuns, sources } from "@/lib/db/schema";
import { categoryLabel, parseIngestionWarning, warningCounts } from "@/lib/ingestion/shared/ingestion-warnings";
import { toggleSource } from "../actions";
import { formatDateTime } from "@/lib/date-format";
export const dynamic = "force-dynamic";
export default async function Page() {
  const rows = await getDb().select({ source: sources, run: sourceRuns }).from(sources).leftJoin(sourceRuns, eq(sources.id, sourceRuns.sourceId)).orderBy(desc(sourceRuns.startedAt)); const unique = [...new Map(rows.map((row) => [row.source.id, row])).values()];
  return <><h1>Bronnen</h1><table><thead><tr><th>Bron</th><th>Actief</th><th>Laatste run</th><th>Resultaten</th><th>Status / meldingen</th></tr></thead><tbody>{unique.map(({source, run}) => { const counts = warningCounts(run?.warnings ?? []); return <tr key={source.id}><td><b>{source.name}</b><br/><a className="muted" href={source.baseUrl}>{source.baseUrl}</a></td><td><form action={toggleSource}><input type="hidden" name="id" value={source.id}/><input type="hidden" name="enabled" value={String(!source.enabled)}/><button>{source.enabled ? "Uitschakelen" : "Inschakelen"}</button></form></td><td>{run?.finishedAt ? formatDateTime(run.finishedAt) : "Nooit"}</td><td>{run?.resultCount ?? "—"}</td><td><span className="tag">{run?.status ?? "niet gestart"}</span>{run && <p className="notice-counts">{counts.critical} kritiek · {counts.warning} waarschuwing · {counts.info} info</p>}{run?.error && <p className="notice notice-critical"><b>Ingestiefout</b><br/>{run.error}</p>}{run?.warnings.map((value, index) => { const item = parseIngestionWarning(value); return <div className={`notice notice-${item.severity}`} key={index}><b>{item.severity === "critical" ? "Kritiek" : item.severity === "warning" ? "Waarschuwing" : "Info"} · {categoryLabel(item.category)}</b><br/>{item.message}{item.url && <><br/><a href={item.url}>{item.url}</a></>}</div>; })}</td></tr>; })}</tbody></table></>;
}
