import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchWorkflow } from "./github-actions";
afterEach(() => vi.unstubAllEnvs());
describe("GitHub Actions-dispatch", () => {
  it("stuurt alleen een vaste workflow en ref naar GitHub", async () => {
    vi.stubEnv("GITHUB_ACTIONS_TOKEN", "test-token"); vi.stubEnv("GITHUB_REPOSITORY", "owner/repo"); vi.stubEnv("GITHUB_WORKFLOW_REF", "main");
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await dispatchWorkflow("reassess_preview", fetcher);
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo/actions/workflows/reassess-active-vacancy-backlog.yml/dispatches", expect.objectContaining({ method: "POST", body: JSON.stringify({ ref: "main", inputs: { mode: "preview" } }) }));
  });
  it("faalt gesloten zonder configuratie", async () => { await expect(dispatchWorkflow("daily", vi.fn())).rejects.toThrow("GITHUB_ACTIONS_TOKEN"); });
});
