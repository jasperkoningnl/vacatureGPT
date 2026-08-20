import { and, eq } from "drizzle-orm";
import { appendFile } from "node:fs/promises";
import { getDb } from "../db";
import { sourceRuns, sources, vacancies, vacancyOccurrences } from "../db/schema";
import { recomputeVacancyActivity, reconcileSuccessfulSourceRun } from "../vacancy-lifecycle";
import { warningsMarkdown } from "./shared/ingestion-warnings";
import { type Database } from "../db/application-queries";

export type SourceDefinition = { slug: string; name: string; baseUrl: string };
export type IngestCounts = { resultCount: number; newCount: number; changedCount: number; unchanged?: number; duplicates?: number; failed?: number };
export type IngestResult = IngestCounts & { warnings?: string[]; trustworthy?: boolean; status?: "success" | "warning" | "error"; error?: string; summaryRows?: ReadonlyArray<readonly [string, number]> };
type Source = typeof sources.$inferSelect;
type Run = typeof sourceRuns.$inferSelect;

export type RunnerStore = {
  ensureSource(definition: SourceDefinition): Promise<Source>;
  createRun(sourceId: number): Promise<Run>;
  finishRun(runId: number, values: Partial<typeof sourceRuns.$inferInsert>): Promise<void>;
  reconcile(sourceId: number, runId: number): Promise<unknown>;
  appendSummary(text: string): Promise<void>;
};

export type VacancyActivityBatch = { touch(vacancyId: number): void; flush(): Promise<number> };
export function createVacancyActivityBatch(recompute: (ids: number[]) => Promise<number> = recomputeVacancyActivity): VacancyActivityBatch {
  const vacancyIds = new Set<number>();
  return { touch(id) { vacancyIds.add(id); }, async flush() { const ids = [...vacancyIds]; vacancyIds.clear(); return recompute(ids); } };
}

export function createDatabaseRunnerStore(db: Database): RunnerStore { return {
  async ensureSource(definition) {
    const [source] = await db.insert(sources).values(definition)
      .onConflictDoUpdate({ target: sources.slug, set: { name: definition.name, baseUrl: definition.baseUrl } }).returning();
    return source;
  },
  async createRun(sourceId) { const [run] = await db.insert(sourceRuns).values({ sourceId }).returning(); return run; },
  async finishRun(runId, values) { await db.update(sourceRuns).set(values).where(eq(sourceRuns.id, runId)); },
  reconcile: reconcileSuccessfulSourceRun,
  async appendSummary(text) { if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`, "utf8"); },
}; }

function summary(definition: SourceDefinition, status: string, result?: IngestResult) {
  const rows = result?.summaryRows ?? [
    ["Parsed", result?.resultCount ?? 0], ["Added", result?.newCount ?? 0], ["Updated", result?.changedCount ?? 0],
    ["Unchanged", result?.unchanged ?? 0], ["Duplicates prevented", result?.duplicates ?? 0], ["Failed", result?.failed ?? 0],
  ];
  return [`## ${definition.name} ingestion summary`, "", `**Status: ${status}**`, "", ...(status === "skipped" ? ["Bron is uitgeschakeld; ingest is netjes overgeslagen.", ""] : []),
    "| Result | Count |", "| --- | ---: |", ...rows.map(([label, count]) => `| ${label} | ${count} |`), "", warningsMarkdown(result?.warnings ?? []), ""].join("\n");
}

export async function runIngestSource(definition: SourceDefinition, ingest: (context: { source: Source; run: Run; activity: VacancyActivityBatch }) => Promise<IngestResult>, store: RunnerStore = createDatabaseRunnerStore(getDb())) {
  const source = await store.ensureSource(definition);
  const run = await store.createRun(source.id);
  if (!source.enabled) {
    await store.finishRun(run.id, { status: "skipped", finishedAt: new Date() });
    await store.appendSummary(summary(definition, "skipped"));
    console.log(`${definition.name} summary: status=skipped (bron uitgeschakeld)`);
    return { status: "skipped" as const, source, run };
  }
  const activity = createVacancyActivityBatch();
  try {
    const result = await ingest({ source, run, activity });
    await activity.flush();
    const warnings = result.warnings ?? [];
    const status = result.status ?? (warnings.length ? "warning" : "success");
    if (result.trustworthy !== false && status !== "error") await store.reconcile(source.id, run.id);
    await store.finishRun(run.id, { status, finishedAt: new Date(), resultCount: result.resultCount, newCount: result.newCount, changedCount: result.changedCount, warnings, error: result.error });
    await store.appendSummary(summary(definition, status, result));
    console.log(`${definition.name} summary: status=${status}, parsed=${result.resultCount}, added=${result.newCount}, updated=${result.changedCount}, unchanged=${result.unchanged ?? 0}, duplicates=${result.duplicates ?? 0}, failed=${result.failed ?? 0}`);
    warnings.forEach((warning) => console.warn(`${definition.name} warning: ${warning}`));
    return { status, source, run, result };
  } catch (error) {
    await activity.flush();
    const message = error instanceof Error ? error.message : "Onbekende fout";
    await store.finishRun(run.id, { status: "error", finishedAt: new Date(), error: message });
    await store.appendSummary(summary(definition, "error", { resultCount: 0, newCount: 0, changedCount: 0, error: message }));
    throw error;
  }
}

export type IngestVacancy = { canonicalKey: string; contentHash: string; externalId?: string | null; sourceUrl: string; rawData: unknown };
export async function upsertIngestVacancy<T extends IngestVacancy>(context: { sourceId: number; runId: number; item: T; values: typeof vacancies.$inferInsert; active?: boolean; refreshUnchanged?: boolean; activity?: VacancyActivityBatch; mergeCanonical?: (existing: typeof vacancies.$inferSelect, incoming: typeof vacancies.$inferInsert) => Partial<typeof vacancies.$inferInsert> }) {
  const db = getDb(); const { sourceId, runId, item } = context;
  const [byExternal] = item.externalId ? await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences }).from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id)).where(and(eq(vacancyOccurrences.sourceId, sourceId), eq(vacancyOccurrences.externalId, item.externalId))).limit(1) : [];
  const [byUrl] = byExternal ? [] : await db.select({ vacancy: vacancies, occurrence: vacancyOccurrences }).from(vacancyOccurrences).innerJoin(vacancies, eq(vacancyOccurrences.vacancyId, vacancies.id)).where(and(eq(vacancyOccurrences.sourceId, sourceId), eq(vacancyOccurrences.sourceUrl, item.sourceUrl))).limit(1);
  const [byCanonical] = byExternal || byUrl ? [] : await db.select().from(vacancies).where(eq(vacancies.canonicalKey, item.canonicalKey)).limit(1);
  const existing = byExternal?.vacancy ?? byUrl?.vacancy ?? byCanonical; const duplicate = Boolean(byCanonical); let vacancyId: number; let outcome: "added" | "updated" | "unchanged";
  if (!existing) { const [created] = await db.insert(vacancies).values(context.values).returning({ id: vacancies.id }); vacancyId = created.id; outcome = "added"; }
  else { vacancyId = existing.id; const patch = duplicate && context.mergeCanonical ? context.mergeCanonical(existing, context.values) : context.values; outcome = duplicate ? (Object.keys(patch).length ? "updated" : "unchanged") : existing.contentHash === item.contentHash && existing.canonicalKey === item.canonicalKey ? "unchanged" : "updated"; const writeFullPatch = duplicate || outcome !== "unchanged" || context.refreshUnchanged; await db.update(vacancies).set(writeFullPatch ? { ...patch, lastSeenAt: new Date(), updatedAt: new Date() } : { lastSeenAt: new Date() }).where(eq(vacancies.id, vacancyId)); }
  const occurrence = byExternal?.occurrence ?? byUrl?.occurrence; const active = context.active ?? true;
  if (occurrence) await db.update(vacancyOccurrences).set({ active, sourceRunId: runId, externalId: item.externalId, sourceUrl: item.sourceUrl, lastSeenAt: new Date(), rawData: item.rawData }).where(eq(vacancyOccurrences.id, occurrence.id));
  else await db.insert(vacancyOccurrences).values({ active, vacancyId, sourceId, sourceRunId: runId, externalId: item.externalId, sourceUrl: item.sourceUrl, rawData: item.rawData }).onConflictDoUpdate({ target: [vacancyOccurrences.sourceId, vacancyOccurrences.sourceUrl], set: { active, vacancyId, sourceRunId: runId, externalId: item.externalId, lastSeenAt: new Date(), rawData: item.rawData } });
  if (context.activity) context.activity.touch(vacancyId); else await recomputeVacancyActivity([vacancyId]); return { vacancyId, outcome, duplicate };
}
