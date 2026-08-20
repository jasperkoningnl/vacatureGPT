import { describe, expect, it, vi } from "vitest";
import { createVacancyActivityBatch, runIngestSource, type IngestResult, type RunnerStore, type SourceDefinition } from "./ingest-runner";
import type { sourceRuns, sources } from "../db/schema";

const definition: SourceDefinition = { slug: "test", name: "Testbron", baseUrl: "https://example.com" };
type Source = typeof sources.$inferSelect;
type Run = typeof sourceRuns.$inferSelect;

function fixture(enabled: boolean) {
  const source: Source = { id: 1, ...definition, enabled, createdAt: new Date() };
  const run: Run = { id: 2, sourceId: 1, status: "running", startedAt: new Date(), finishedAt: null, resultCount: 0, newCount: 0, changedCount: 0, warnings: [], error: null };
  const store: RunnerStore = {
    ensureSource: vi.fn().mockResolvedValue(source), createRun: vi.fn().mockResolvedValue(run), finishRun: vi.fn().mockResolvedValue(undefined),
    reconcile: vi.fn().mockResolvedValue(undefined), appendSummary: vi.fn().mockResolvedValue(undefined),
  };
  return { source, run, store };
}

const normalResult: IngestResult = { resultCount: 3, newCount: 1, changedCount: 1, unchanged: 1, duplicates: 1, trustworthy: true };

describe("shared ingest runner", () => {
  it("batches and deduplicates vacancy activity recomputation", async () => {
    const recompute = vi.fn().mockResolvedValue(2); const activity = createVacancyActivityBatch(recompute);
    activity.touch(8); activity.touch(9); activity.touch(8);
    await expect(activity.flush()).resolves.toBe(2);
    expect(recompute).toHaveBeenCalledWith([8, 9]);
  });

  it("skips a disabled source without executing ingest and records a clean skipped run", async () => {
    const { store } = fixture(false); const ingest = vi.fn();
    const result = await runIngestSource(definition, ingest, store);
    expect(result.status).toBe("skipped");
    expect(ingest).not.toHaveBeenCalled();
    expect(store.finishRun).toHaveBeenCalledWith(2, expect.objectContaining({ status: "skipped" }));
    expect(store.appendSummary).toHaveBeenCalledWith(expect.stringContaining("ingest is netjes overgeslagen"));
    expect(store.reconcile).not.toHaveBeenCalled();
  });

  it("does not turn a disabled source back on while ensuring it", async () => {
    const { source, store } = fixture(false);
    await runIngestSource(definition, vi.fn(), store);
    expect(source.enabled).toBe(false);
    expect(store.ensureSource).toHaveBeenCalledWith(definition);
  });

  it("runs an enabled source normally", async () => {
    const { store } = fixture(true); const ingest = vi.fn().mockResolvedValue(normalResult);
    const result = await runIngestSource(definition, ingest, store);
    expect(result.status).toBe("success");
    expect(ingest).toHaveBeenCalledOnce();
    expect(store.finishRun).toHaveBeenCalledWith(2, expect.objectContaining({ status: "success", resultCount: 3, newCount: 1, changedCount: 1 }));
  });

  it("preserves successful-run reconciliation and ingest counters used by deduplication and lifecycle", async () => {
    const { store } = fixture(true);
    await runIngestSource(definition, async () => normalResult, store);
    expect(store.reconcile).toHaveBeenCalledWith(1, 2);
    expect(store.finishRun).toHaveBeenCalledWith(2, expect.objectContaining({ resultCount: 3, newCount: 1, changedCount: 1 }));
    expect(store.appendSummary).toHaveBeenCalledWith(expect.stringMatching(/Duplicates prevented \| 1/));
  });
});
