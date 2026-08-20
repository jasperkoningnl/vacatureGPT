"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveFeedback, type FeedbackState } from "@/app/actions";
import { feedbackDecisions } from "@/lib/feedback-learning";

type Value = (typeof feedbackDecisions)[number];

export const feedbackChoices: { value: Value; label: string }[] = [
  { value: "interesting", label: "Interessant" },
  { value: "maybe", label: "Misschien" },
  { value: "not_suitable", label: "Niet passend" },
];

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending || disabled}>{pending ? "Bezig met opslaan…" : "Opslaan"}</button>;
}

/** Een nog niet beoordeelde vacature krijgt geen voorselectie: opslaan kan pas na een expliciete keuze. */
export function FeedbackForm({ vacancyId, current }: { vacancyId: number; current: { value: Value; reasonCode: string | null; note: string | null } | null }) {
  const initialState: FeedbackState = { status: "idle", value: current?.value };
  const [state, formAction] = useActionState(saveFeedback, initialState);
  const [choice, setChoice] = useState<Value | undefined>(current?.value);
  const stored = state.status === "success" ? state.value : current?.value;

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
      ? <p className="current-feedback">Huidig opgeslagen oordeel: <strong>{feedbackChoices.find((option) => option.value === stored)?.label}</strong></p>
      : <p className="current-feedback">Nog geen oordeel opgeslagen. Kies Interessant, Misschien of Niet passend; er wordt niets vastgelegd tot je zelf kiest.</p>}
    <div className="feedback-details">
      <label>Reden <select name="reasonCode" defaultValue={current?.reasonCode ?? ""}><option value="">Geen reden</option><option value="role">Functie / inhoud</option><option value="seniority">Niveau / verantwoordelijkheid</option><option value="location">Locatie / reistijd</option><option value="hours">Uren</option><option value="salary">Salaris</option><option value="employer">Werkgever / sector</option><option value="other">Iets anders</option></select></label>
      <label>Notitie <textarea name="note" rows={4} placeholder="Voeg eventueel een notitie toe" defaultValue={current?.note ?? ""}/></label>
    </div>
    <div className="feedback-actions"><SubmitButton disabled={!choice}/><p className={state.status === "error" ? "feedback-error" : "feedback-success"} role="status" aria-live="polite">{state.message}</p></div>
  </form>;
}
