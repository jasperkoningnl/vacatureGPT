import { count, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedback, sourceRuns, sources, vacancies } from "@/lib/db/schema";
import { categoryLabel, parseIngestionWarning, sourceHealth, warningCounts } from "@/lib/ingestion/shared/ingestion-warnings";
export const dynamic = "force-dynamic";

function Notices({ values }: { values: string[] }) {
  if (!values.length) return null;
  const counts = warningCounts(values);
  const summary = [[counts.critical, "kritiek"], [counts.warning, "waarschuwing"], [counts.info, "info"]].filter(([amount]) => amount).map(([amount, label]) => `${amount} ${label}`).join(" · ");
  return <details className="notices"><summary>{summary}</summary>{values.map((value, index) => { const item = parseIngestionWarning(value); return <div className={`notice notice-${item.severity}`} key={index}><b>{item.severity === "critical" ? "Kritiek" : item.severity === "warning" ? "Waarschuwing" : "Info"} · {categoryLabel(item.category)}</b><br/>{item.message}{item.url && <><br/><a href={item.url}>{item.url}</a></>}</div>; })}</details>;
}

export default async function Home() {
  const db = getDb(); const week = new Date(); week.setDate(week.getDate() - 7);
  const [[active], [recent], runs, notes, activeSourceRuns] = await Promise.all([
    db.select({ n: count() }).from(vacancies).where(eq(vacancies.active, true)), db.select({ n: count() }).from(vacancies).where(gte(vacancies.firstSeenAt, week)),
    db.select({ name: sources.name, status: sourceRuns.status, finished: sourceRuns.finishedAt, count: sourceRuns.resultCount, warnings: sourceRuns.warnings }).from(sourceRuns).innerJoin(sources, eq(sourceRuns.sourceId, sources.id)).orderBy(desc(sourceRuns.startedAt)).limit(5),
    db.select({ value: feedback.value, note: feedback.note, title: vacancies.title, updated: feedback.updatedAt }).from(feedback).innerJoin(vacancies, eq(feedback.vacancyId, vacancies.id)).orderBy(desc(feedback.updatedAt)).limit(5),
    db.select({ id: sources.id, status: sourceRuns.status }).from(sources).leftJoin(sourceRuns, eq(sources.id, sourceRuns.sourceId)).where(eq(sources.enabled, true)).orderBy(desc(sourceRuns.startedAt)),
  ]);
  const latestPerSource = [...new Map(activeSourceRuns.map((row) => [row.id, row])).values()]; const health = sourceHealth(latestPerSource.map((row) => row.status)); const needsAttention = latestPerSource.filter((row) => row.status === "warning" || row.status === "error").length; const last = runs[0];
  return <><h1>Overzicht</h1><div className="grid"><div className="card"><span className="muted">Actieve vacatures</span><div className="metric">{active.n}</div></div><div className="card"><span className="muted">Nieuw deze week</span><div className="metric">{recent.n}</div></div><div className="card"><span className="muted">Brongezondheid</span><div className="metric">{health}</div><span className="muted">{needsAttention ? `${needsAttention} van ${latestPerSource.length} bronnen vraagt aandacht` : `${latestPerSource.length} actieve bronnen`}</span></div><div className="card"><span className="muted">Laatste inname</span><div className="metric" style={{fontSize:16}}>{last?.finished?.toLocaleString("nl-NL") ?? "Nog niet"}</div></div></div><div className="split" style={{marginTop:20}}><section className="panel"><h2>Bronruns</h2>{runs.map((run, index) => <div className="run" key={index}><b>{run.name}</b> · {run.status}{run.status !== "error" && <> · {run.count} resultaten</>}<Notices values={run.warnings}/></div>)}</section><section className="panel"><h2>Recente feedback</h2>{notes.length ? notes.map((note, index) => <p key={index}><b>{note.title}</b><br/><span className="muted">{note.value}{note.note ? ` · ${note.note}` : ""}</span></p>) : <p className="muted">Nog geen feedback.</p>}</section></div></>;
}
