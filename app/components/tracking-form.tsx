"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveShortlist, saveTrackingDetails, type TrackingState } from "@/app/actions";
import { applicationStatusLabels, applicationStatuses, type TrackingData } from "@/lib/vacancy-tracking";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Bezig met opslaan…" : children}</button>;
}

function Message({ state }: { state: TrackingState }) {
  return <p className={state.status === "error" ? "feedback-error" : "feedback-success"} role="status" aria-live="polite">{state.message}</p>;
}

export function TrackingForm({ vacancyId, tracking }: { vacancyId: number; tracking: TrackingData | null }) {
  const [shortlistState, shortlistAction] = useActionState(saveShortlist, { status: "idle" } as TrackingState);
  const [detailsState, detailsAction] = useActionState(saveTrackingDetails, { status: "idle" } as TrackingState);
  const savedShortlist = shortlistState.status === "success" ? shortlistState.tracking?.shortlistedAt : tracking?.shortlistedAt;
  const savedDetails = detailsState.status === "success" ? detailsState.tracking : tracking;

  return <div className="tracking-form">
    <div className="shortlist-control">
      <div><strong>{savedShortlist ? "Op shortlist" : "Niet op shortlist"}</strong><p className="muted">Shortlist staat los van je inhoudelijke beoordeling.</p></div>
      <form action={shortlistAction}>
        <input type="hidden" name="vacancyId" value={vacancyId}/><input type="hidden" name="shortlisted" value={savedShortlist ? "false" : "true"}/>
        <Submit>{savedShortlist ? "Van shortlist verwijderen" : "Op shortlist zetten"}</Submit>
      </form>
    </div>
    <Message state={shortlistState}/>
    <form action={detailsAction} className="tracking-details" key={`${savedDetails?.applicationStatus ?? ""}:${savedDetails?.note ?? ""}`}>
      <input type="hidden" name="vacancyId" value={vacancyId}/>
      <label>Sollicitatiestatus<select name="applicationStatus" defaultValue={savedDetails?.applicationStatus ?? ""}><option value="">Geen status</option>{applicationStatuses.map(status => <option key={status} value={status}>{applicationStatusLabels[status]}</option>)}</select></label>
      <label>Eigen notitie<textarea name="note" rows={4} maxLength={2000} placeholder="Voeg eventueel een notitie toe" defaultValue={savedDetails?.note ?? ""}/></label>
      <div className="feedback-actions"><Submit>Status en notitie opslaan</Submit><Message state={detailsState}/></div>
    </form>
  </div>;
}
