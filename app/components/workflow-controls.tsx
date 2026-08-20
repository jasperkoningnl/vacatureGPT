"use client";
import { useActionState } from "react";
import { startWorkflow, type WorkflowState } from "../actions";
import { workflowActions, type WorkflowAction } from "@/lib/github-actions";
const initial: WorkflowState = { status: "idle" };
export function WorkflowControl({ action }: { action: WorkflowAction }) {
  const [state, submit, pending] = useActionState(startWorkflow, initial);
  const config = workflowActions[action];
  return <form action={submit} className="workflow-control"><input type="hidden" name="workflow" value={action}/><b>{config.label}</b>{"costly" in config && <label><input type="checkbox" name="confirmed" value="yes"/> Ik bevestig dat dit OpenAI-tokens en kosten kan gebruiken.</label>}<button disabled={pending}>{pending ? "Starten…" : "Start workflow"}</button>{state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}</form>;
}
