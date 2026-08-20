import { z } from "zod";

export const workflowActions = {
  daily: { label: "Dagelijkse ingestie en AI-pipeline", workflow: "daily-vacancy-pipeline.yml", inputs: {} },
  reassess_preview: { label: "Preview AI-herbeoordeling (gratis)", workflow: "reassess-active-vacancy-backlog.yml", inputs: { mode: "preview" } },
  reassess_run: { label: "AI-herbeoordeling uitvoeren (OpenAI-kosten)", workflow: "reassess-active-vacancy-backlog.yml", inputs: { mode: "run" }, costly: true },
  cleanup: { label: "Verlopen vacatures opschonen", workflow: "cleanup-vacancies.yml", inputs: {} },
  weekly: { label: "Weekmail uitvoeren", workflow: "weekly-vacancy-email.yml", inputs: {} },
} as const;
export type WorkflowAction = keyof typeof workflowActions;
export const workflowActionSchema = z.enum(Object.keys(workflowActions) as [WorkflowAction, ...WorkflowAction[]]);

export async function dispatchWorkflow(action: WorkflowAction, fetcher: typeof fetch = fetch) {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const ref = process.env.GITHUB_WORKFLOW_REF;
  if (!token || !repository || !ref) throw new Error("GITHUB_ACTIONS_TOKEN, GITHUB_REPOSITORY en GITHUB_WORKFLOW_REF zijn vereist");
  const config = workflowActions[action];
  const response = await fetcher(`https://api.github.com/repos/${repository}/actions/workflows/${config.workflow}/dispatches`, {
    method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref, inputs: config.inputs }), cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub workflow starten mislukt (HTTP ${response.status})`);
}
