"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveFeedback, type FeedbackState } from "@/app/actions";
import { NOTE_REQUIRED_MESSAGE, REASON_REQUIRED_MESSAGE, feedbackDecisions, feedbackLabels, reasonCodes, reasonIsRequired, reasonLabels, type FeedbackDecision, type ReasonCode } from "@/lib/feedback-validation";

type Value = FeedbackDecision;

export const feedbackChoices: { value: Value; label: string }[] = feedbackDecisions.map((value) => ({ value, label: feedbackLabels[value] }));

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending || disabled}>{pending ? "Bezig met opslaan…" : "Opslaan"}</button>;
}

/**
 * Een nog niet beoordeelde vacature krijgt geen voorselectie: opslaan kan pas na een expliciete keuze.
 * De reden- en toelichtingsregels komen uit hetzelfde contract als de kalibratieflow, zodat er niet
 * twee verschillende sets regels naast elkaar staan.
 */
export function FeedbackForm({ vacancyId, current, aiVerdict }: { vacancyId: number; current: { value: Value; reasonCode: string | null; note: string | null } | null; aiVerdict: Value | null }) {
  const initialState: FeedbackState = { status: "idle", value: current?.value };
  const [state, formAction] = useActionState(saveFeedback, initialState);
  const [choice, setChoice] = useState<Value | undefined>(current?.value);
  const [reasonCode, setReasonCode] = useState<ReasonCode | "">((current?.reasonCode as ReasonCode) ?? "");
  const [note, setNote] = useState(current?.note ?? "");
  const stored = state.status === "success" ? state.value : current?.value;
  const needsReason = reasonIsRequired(choice, aiVerdict);
  const needsNote = reasonCode === "other";
  const blocked = !choice || (needsReason && !reasonCode) || (needsNote && !note.trim());

  return <form action={formAction} className="feedback-form">
    <input type="hidden" name="vacancyId" value={vacancyId}/>
    <fieldset className="feedback-choices">
      <legend className="sr-only">Kies je beoordeling</legend>
      {feedbackChoices.map((option) => <label key={option.value}>
        <input type="radio" name="value" value={option.value} checked={choice === option.value} onChange={() => setChoice(option.value)}/>
        <span>{option.label}</span>
      </label>)}
    </fieldset>
    {stored
      ? <p className="current-feedback">Huidig opgeslagen oordeel: <strong>{feedbackLabels[stored]}</strong></p>
      : <p className="current-feedback">Nog geen oordeel opgeslagen. Kies Interessant, Misschien of Niet passend; er wordt niets vastgelegd tot je zelf kiest.</p>}
    <div className="feedback-details">
      <label htmlFor="feedback-reason">Reden {needsReason && <span className="required-hint">verplicht</span>}
        <select id="feedback-reason" name="reasonCode" required={needsReason} aria-describedby={needsReason ? "feedback-reason-hint" : undefined} value={reasonCode} onChange={(event) => setReasonCode(event.target.value as ReasonCode | "")}>
          <option value="">Geen reden</option>{reasonCodes.map((code) => <option key={code} value={code}>{reasonLabels[code]}</option>)}
        </select>
      </label>
      <label htmlFor="feedback-note">Notitie {needsNote && <span className="required-hint">verplicht</span>}
        <textarea id="feedback-note" name="note" rows={4} required={needsNote} placeholder={needsNote ? "Korte toelichting (verplicht)" : "Voeg eventueel een notitie toe"} value={note} onChange={(event) => setNote(event.target.value)}/>
      </label>
    </div>
    {needsReason && <p className="feedback-hint" id="feedback-reason-hint">{REASON_REQUIRED_MESSAGE}</p>}
    {needsNote && !note.trim() && <p className="feedback-hint">{NOTE_REQUIRED_MESSAGE}</p>}
    <div className="feedback-actions"><SubmitButton disabled={blocked}/><p className={state.status === "error" ? "feedback-error" : "feedback-success"} role="status" aria-live="polite">{state.message}</p></div>
  </form>;
}
