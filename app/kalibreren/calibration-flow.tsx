"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { saveCalibrationReason, submitCalibrationChoice } from "@/app/actions";
import { VacancyReviewDetail, type AssessmentData } from "@/app/components/vacancy-review-detail";
import { feedbackChoices } from "@/app/components/feedback-form";
import { NOTE_REQUIRED_MESSAGE, REASON_REQUIRED_MESSAGE, isFeedbackDecision, reasonCodes, reasonLabels, type ReasonCode } from "@/lib/feedback-validation";
import { calibrationSummary, verdictLabels, type BlindVacancy, type Verdict } from "@/lib/calibration";
type Reveal = AssessmentData & { userVerdict: Verdict; agreed: boolean };

export default function CalibrationFlow({ vacancies }: { vacancies: BlindVacancy[] }) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ userVerdict: Verdict; aiVerdict: Verdict }[]>([]);
  const [reveal, setReveal] = useState<Reveal>();
  const [reason, setReason] = useState<ReasonCode>(); const [note, setNote] = useState(""); const [reasonSaved, setReasonSaved] = useState(false); const [error, setError] = useState("");
  const submitting = useRef(false); const [pending, start] = useTransition(); const vacancy = vacancies[index];
  // Zelfde regel als op de detailpagina: er wordt pas opgeslagen na een expliciet gekozen oordeel.
  const choose = (value: Verdict) => {
    if (submitting.current || reveal || !isFeedbackDecision(value)) return; submitting.current = true;
    start(async () => { try { setError(""); setReveal(await submitCalibrationChoice({ vacancyId: vacancy.id, value })); } catch (e) { setError(e instanceof Error ? e.message : "Opslaan mislukt"); } finally { submitting.current = false; } });
  };
  const submitReason = () => {
    if (submitting.current || reasonSaved) return; if (!reason) { setError(REASON_REQUIRED_MESSAGE); return; } if (reason === "other" && !note.trim()) { setError(NOTE_REQUIRED_MESSAGE); return; } submitting.current = true;
    start(async () => { try { setError(""); await saveCalibrationReason({ vacancyId: vacancy.id, reasonCode: reason, note }); setReasonSaved(true); } catch (e) { setError(e instanceof Error ? e.message : "Opslaan mislukt"); } finally { submitting.current = false; } });
  };
  const next = () => {
    if (!reveal || (!reveal.agreed && !reasonSaved)) return;
    setResults(current => [...current, { userVerdict: reveal.userVerdict, aiVerdict: reveal.verdict }]); setIndex(current => current + 1);
    setReveal(undefined); setReason(undefined); setNote(""); setReasonSaved(false); setError("");
  };

  if (!vacancies.length) return <section className="empty-state"><p className="eyebrow">Blinde test</p><h1>Geen vacatures om blind te testen</h1><p className="lead">Er zijn nu geen actieve, door AI beoordeelde vacatures zonder jouw oordeel. De blinde test heeft nieuwe, nog niet beoordeelde vacatures nodig.</p><Link className="button" href="/">Naar deze week</Link></section>;
  if (index >= vacancies.length) { const summary = calibrationSummary(results); return <section className="batch-summary"><p className="eyebrow">Batch afgerond</p><h1>{summary.total} vacatures beoordeeld</h1><div className="summary-numbers"><div><strong>{summary.agreed}</strong><span>eens met AI</span></div><div><strong>{summary.differed}</strong><span>anders beoordeeld</span></div><div><strong>{summary.agreementPercentage}%</strong><span>overeenstemming</span></div></div><h2>Jouw oordelen</h2><p>Interessant <b>{summary.breakdown.interesting}</b> · Misschien <b>{summary.breakdown.maybe}</b> · Niet passend <b>{summary.breakdown.not_suitable}</b></p><p className="muted">Deze oordelen tellen mee als leersignaal voor de volgende AI-ronde. Wat je interessant vond, kun je vanaf de vacaturepagina op je shortlist zetten.</p><div className="actions"><Link className="button" href="/">Naar deze week</Link><a className="button secondary" href="/kalibreren">Nog 5 blind beoordelen</a><Link className="button secondary" href="/vacatures">Alle vacatures</Link></div></section>; }

  const review = <div className="feedback-form">
    {!reveal ? <><fieldset className="feedback-choices"><legend className="sr-only">Kies je beoordeling</legend>{feedbackChoices.map(({ value, label }) => <label key={value}><input type="radio" name="value" value={value} onChange={() => choose(value)} disabled={pending}/><span>{label}</span></label>)}</fieldset>{pending && <p role="status">Bezig met opslaan…</p>}</> : <>
      <p className="current-feedback">Opgeslagen oordeel: <strong>{verdictLabels[reveal.userVerdict]}</strong></p>
      {!reveal.agreed && !reasonSaved && <div className="reason-form"><h3>Waarom beoordeel jij deze anders?</h3><div className="reason-grid">{reasonCodes.map((value) => <label key={value}><input type="radio" name="reason" checked={reason === value} onChange={() => setReason(value)}/><span>{reasonLabels[value]}</span></label>)}</div><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder={reason === "other" ? "Korte toelichting (verplicht)" : "Eventuele korte notitie"}/><button disabled={pending} onClick={submitReason}>Reden opslaan</button></div>}
      {!reveal.agreed && reasonSaved && <p className="saved-message">Je reden is opgeslagen.</p>}
      {(reveal.agreed || reasonSaved) && <button className="next-button" disabled={pending} onClick={next}>Volgende vacature</button>}
    </>}{error && <p className="feedback-error" role="alert">{error}</p>}
  </div>;
  return <div className="calibration"><header className="calibration-head"><div><p className="eyebrow">Blinde test · zonder AI-oordeel</p><p className="muted">Je ziet het AI-oordeel pas nadat je zelf hebt gekozen. Zo meet je of de selectie nog klopt.</p></div><b>{index + 1} van {vacancies.length}</b></header><div className="progress" role="progressbar" aria-label="Voortgang kalibratiebatch" aria-valuemin={0} aria-valuemax={vacancies.length} aria-valuenow={index + 1} aria-valuetext={`Vacature ${index + 1} van ${vacancies.length}`}><span style={{ width: `${(index + 1) / vacancies.length * 100}%` }}/></div><VacancyReviewDetail vacancy={vacancy} review={review} concealAssessment={!reveal} assessment={reveal}/></div>;
}
