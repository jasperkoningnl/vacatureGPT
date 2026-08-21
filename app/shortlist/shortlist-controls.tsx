"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveShortlist, updateApplicationStatus, type TrackingState } from "@/app/actions";
import { applicationStatusLabels, applicationStatuses, type ApplicationStatus } from "@/lib/vacancy-tracking";

const idle: TrackingState = { status: "idle" };

function Saving({ saved }: { saved: string | undefined }) {
  const { pending } = useFormStatus();
  return <span className="control-status" role="status" aria-live="polite">{pending ? "Opslaan…" : saved ?? ""}</span>;
}

/**
 * De status hoort thuis op de shortlist zelf: één keuze en het staat vast, zonder eerst de
 * detailpagina te openen. De notitie blijft ongemoeid, want die hoort bij de vacature, niet bij de stap.
 */
export function StatusControl({ vacancyId, current }: { vacancyId: number; current: ApplicationStatus | null }) {
  const [state, action] = useActionState(updateApplicationStatus, idle);
  const value = (state.status === "success" ? state.tracking?.applicationStatus : current) ?? "";
  return <form action={action} className="status-control">
    <input type="hidden" name="vacancyId" value={vacancyId}/>
    <label htmlFor={`status-${vacancyId}`}>Sollicitatiestatus</label>
    <select id={`status-${vacancyId}`} name="applicationStatus" defaultValue={value} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
      <option value="">Nog geen status</option>
      {applicationStatuses.map((status) => <option key={status} value={status}>{applicationStatusLabels[status]}</option>)}
    </select>
    <Saving saved={state.status === "error" ? state.message : state.status === "success" ? "Bijgewerkt" : undefined}/>
  </form>;
}

export function RemoveFromShortlist({ vacancyId }: { vacancyId: number }) {
  const [state, action] = useActionState(saveShortlist, idle);
  if (state.status === "success") return <p className="control-status" role="status">Van shortlist gehaald.</p>;
  return <form action={action}>
    <input type="hidden" name="vacancyId" value={vacancyId}/><input type="hidden" name="shortlisted" value="false"/>
    <button type="submit" className="link-button">Van shortlist halen</button>
    {state.status === "error" && <p className="feedback-error" role="alert">{state.message}</p>}
  </form>;
}
