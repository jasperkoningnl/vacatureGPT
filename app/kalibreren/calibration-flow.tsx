"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { saveCalibrationReason, submitCalibrationChoice } from "@/app/actions";
import { VacancyContent } from "@/app/components/vacancy-content";
import { calibrationSummary, verdictLabels, type BlindVacancy, type ReasonCode, type Verdict } from "@/lib/calibration";

const reasons: [ReasonCode, string][] = [["role", "Functie / inhoud"], ["seniority", "Niveau / verantwoordelijkheid"], ["location", "Locatie / reistijd"], ["hours", "Uren"], ["salary", "Salaris"], ["employer", "Werkgever / sector"], ["other", "Iets anders"]];
const formatHours = (v: BlindVacancy) => v.hoursMin ? `${v.hoursMin}${v.hoursMax && v.hoursMax !== v.hoursMin ? `–${v.hoursMax}` : ""} uur` : v.hoursOriginal || "Niet vermeld";
const formatSalary = (v: BlindVacancy) => v.salaryMin ? `€ ${v.salaryMin.toLocaleString("nl-NL")}${v.salaryMax ? `–${v.salaryMax.toLocaleString("nl-NL")}` : ""}` : v.salaryOriginal || "Niet vermeld";
type Reveal = { verdict: Verdict; score: number; summary: string; agreed: boolean };

export default function CalibrationFlow({ vacancies }: { vacancies: BlindVacancy[] }) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<{ userVerdict: Verdict; aiVerdict: Verdict }[]>([]);
  const [choice, setChoice] = useState<Verdict>();
  const [reveal, setReveal] = useState<Reveal>();
  const [reason, setReason] = useState<ReasonCode>();
  const [note, setNote] = useState("");
  const [reasonSaved, setReasonSaved] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const [pending, start] = useTransition();
  const vacancy = vacancies[index];

  const choose = (value: Verdict) => {
    if (submitting.current || reveal) return;
    submitting.current = true;
    start(async () => {
      try {
        setError("");
        const result = await submitCalibrationChoice({ vacancyId: vacancy.id, value });
        setChoice(result.userVerdict);
        setReveal(result);
      } catch (e) { setError(e instanceof Error ? e.message : "Opslaan mislukt"); }
      finally { submitting.current = false; }
    });
  };
  const next = () => {
    if (!choice || !reveal || (!reveal.agreed && !reasonSaved)) return;
    setResults((current) => [...current, { userVerdict: choice, aiVerdict: reveal.verdict }]);
    setIndex((current) => current + 1);
    setChoice(undefined); setReveal(undefined); setReason(undefined); setNote(""); setReasonSaved(false); setError("");
  };
  const submitReason = () => {
    if (submitting.current || reasonSaved) return;
    if (!reason) { setError("Kies eerst een reden."); return; }
    submitting.current = true;
    start(async () => {
      try {
        setError("");
        await saveCalibrationReason({ vacancyId: vacancy.id, reasonCode: reason, note });
        setReasonSaved(true);
      } catch (e) { setError(e instanceof Error ? e.message : "Opslaan mislukt"); }
      finally { submitting.current = false; }
    });
  };

  if (!vacancies.length) return <section className="empty-state"><p className="eyebrow">Kalibreren</p><h1>Je bent helemaal bij</h1><p>Er zijn nu geen actieve, door AI beoordeelde vacatures zonder jouw oordeel.</p><Link className="button" href="/vacatures">Naar vacatures</Link></section>;
  if (index >= vacancies.length) {
    const summary = calibrationSummary(results);
    return <section className="batch-summary"><p className="eyebrow">Batch afgerond</p><h1>{summary.total} vacatures beoordeeld</h1><div className="summary-numbers"><div><strong>{summary.agreed}</strong><span>eens met AI</span></div><div><strong>{summary.differed}</strong><span>anders beoordeeld</span></div><div><strong>{summary.agreementPercentage}%</strong><span>overeenstemming</span></div></div><h2>Jouw oordelen</h2><p>Interessant <b>{summary.breakdown.interesting}</b> · Misschien <b>{summary.breakdown.maybe}</b> · Niet passend <b>{summary.breakdown.not_suitable}</b></p><div className="actions"><a className="button" href="/kalibreren">Nog 5 beoordelen</a><Link className="button secondary" href="/vacatures">Naar vacatures</Link></div></section>;
  }

  return <div className="calibration">
    <header className="calibration-head"><div><p className="eyebrow">Blind beoordelen</p><h1>{vacancy.title}</h1><p className="lead">{vacancy.employer}</p></div><b>{index + 1} van {vacancies.length}</b></header>
    <div className="progress" aria-label={`${index + 1} van ${vacancies.length}`}><span style={{ width: `${(index + 1) / vacancies.length * 100}%` }}/></div>
    <article className="vacancy-review">
      <dl className="metadata"><div><dt>Locatie</dt><dd>{vacancy.location || "Niet vermeld"}</dd></div><div><dt>Uren</dt><dd>{formatHours(vacancy)}</dd></div><div><dt>Salaris</dt><dd>{formatSalary(vacancy)}</dd></div><div><dt>Deadline</dt><dd>{vacancy.deadline ? new Date(vacancy.deadline).toLocaleDateString("nl-NL") : "Niet vermeld"}</dd></div></dl>
      <VacancyContent text={vacancy.description || vacancy.originalText} bounded/>
      <Link className="read-more" href={`/vacatures/${vacancy.id}`}>Lees volledige vacature</Link>
    </article>
    {!reveal ? <section className="decision"><h2>Wat vind jij van deze vacature?</h2><div className="choice-grid">{(Object.keys(verdictLabels) as Verdict[]).map((value) => <button disabled={pending} className="choice" key={value} onClick={() => choose(value)}>{verdictLabels[value]}</button>)}</div></section>
      : <section className={`reveal ${reveal.agreed ? "agreement" : "disagreement"}`} aria-live="polite">
        <p className="eyebrow">Vergelijking</p>
        <div className="judgment-comparison"><div><span>Jij</span><strong>{verdictLabels[choice!]}</strong></div><div><span>AI</span><strong>{verdictLabels[reveal.verdict]} <small>· {reveal.score}</small></strong></div></div>
        <div className="ai-reason"><h3>Waarom?</h3><p>{reveal.summary}</p></div>
        {!reveal.agreed && !reasonSaved && <div className="reason-form"><h3>Waarom beoordeel jij deze anders?</h3><div className="reason-grid">{reasons.map(([value, label]) => <label key={value}><input type="radio" name="reason" checked={reason === value} onChange={() => setReason(value)}/><span>{label}</span></label>)}</div><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder={reason === "other" ? "Korte toelichting (verplicht)" : "Eventuele korte notitie"}/><button disabled={pending} onClick={submitReason}>Reden opslaan</button></div>}
        {!reveal.agreed && reasonSaved && <p className="saved-message">Je reden is opgeslagen.</p>}
        {(reveal.agreed || reasonSaved) && <button className="next-button" disabled={pending} onClick={next}>Volgende vacature</button>}
      </section>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
