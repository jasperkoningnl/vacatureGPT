"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveFeedback, type FeedbackState } from "@/app/actions";

type Value = "interesting" | "maybe" | "not_suitable";

export const feedbackChoices: { value: Value; label: string }[] = [
  { value: "interesting", label: "Interessant" },
  { value: "maybe", label: "Misschien" },
  { value: "not_suitable", label: "Niet passend" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Bezig met opslaan…" : "Opslaan"}</button>;
}

export function FeedbackForm({ vacancyId, current }: { vacancyId: number; current: { value: Value; reasonCode: string | null; note: string | null } | null }) {
  const initialState: FeedbackState = { status: "idle", value: current?.value };
  const [state, formAction] = useActionState(saveFeedback, initialState);
  const selected = state.status === "success" ? state.value : current?.value;

  return <form action={formAction} className="feedback-form">
    <input type="hidden" name="vacancyId" value={vacancyId}/>
    <fieldset className="feedback-choices">
      <legend className="sr-only">Kies je beoordeling</legend>
      {feedbackChoices.map((choice) => <label key={choice.value}>
        <input type="radio" name="value" value={choice.value} defaultChecked={(selected ?? "maybe") === choice.value}/>
        <span>{choice.label}</span>
      </label>)}
    </fieldset>
    {current && <p className="current-feedback">Huidig opgeslagen oordeel: <strong>{feedbackChoices.find((choice) => choice.value === selected)?.label}</strong></p>}
    <div className="feedback-details">
      <label>Reden <select name="reasonCode" defaultValue={current?.reasonCode ?? ""}><option value="">Geen reden</option><option value="role">Functie / inhoud</option><option value="seniority">Niveau / verantwoordelijkheid</option><option value="location">Locatie / reistijd</option><option value="hours">Uren</option><option value="salary">Salaris</option><option value="employer">Werkgever / sector</option><option value="other">Iets anders</option></select></label>
      <label>Notitie <textarea name="note" rows={4} placeholder="Voeg eventueel een notitie toe" defaultValue={current?.note ?? ""}/></label>
    </div>
    <div className="feedback-actions"><SubmitButton/><p className={state.status === "error" ? "feedback-error" : "feedback-success"} role="status" aria-live="polite">{state.message}</p></div>
  </form>;
}
