"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { submitReviewDecision } from "@/app/actions";
import { VacancyContent } from "@/app/components/vacancy-content";
import { AiAssessmentBody, MetadataOnlyNotice, hoursText, salaryText, verdictLabels } from "@/app/components/vacancy-parts";
import { formatDate } from "@/lib/date-format";
import { deadlineNotice } from "@/lib/deadline";
import { NOTE_REQUIRED_MESSAGE, REASON_REQUIRED_MESSAGE, reasonCodes, reasonIsRequired, reasonLabels, type FeedbackDecision, type ReasonCode } from "@/lib/feedback-validation";
import { decisionConfirmation, reviewActions, reviewSummary, type ReviewResult } from "@/lib/review-queue";
import { isMetadataOnly } from "@/lib/vacancy-depth";
import type { ReviewQueueItem } from "@/lib/review-queue-data";

type Props = { items: ReviewQueueItem[]; returnTo?: { href: string; label: string } };

function factChips(item: ReviewQueueItem) {
  const { vacancy } = item;
  const notice = deadlineNotice(vacancy.deadline);
  return [
    { term: "Locatie", value: vacancy.location || "Niet vermeld", level: undefined as string | undefined },
    { term: "Uren", value: hoursText(vacancy), level: undefined },
    { term: "Salaris", value: salaryText(vacancy), level: undefined },
    { term: "Deadline", value: vacancy.deadline ? `${notice.label} · ${formatDate(vacancy.deadline)}` : "Niet vermeld", level: vacancy.deadline ? notice.level : undefined },
  ];
}

/**
 * Eén vacature tegelijk, met het AI-advies er open bij. Elke keuze slaat meteen op en schuift door,
 * zodat een mail met tips en een bezoek aan de site dezelfde handeling zijn. Wijkt jouw oordeel af
 * van dat van de AI, dan vraagt dezelfde regel als overal om een reden vóórdat er iets wordt bewaard.
 */
export default function ReviewQueue({ items, returnTo }: Props) {
  // Eén ronde is één momentopname. Na elke server action rendert Next deze route opnieuw en zou de
  // zojuist beoordeelde vacature uit de rij vallen; dan schuift alles op en sla je er ongemerkt een
  // over. De rij wordt daarom één keer vastgelegd en verandert niet meer tijdens de ronde.
  const [queue] = useState(items);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ReviewResult[]>([]);
  const [choice, setChoice] = useState<FeedbackDecision>();
  const [reason, setReason] = useState<ReasonCode>();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [last, setLast] = useState<{ title: string; message: string }>();
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const item = queue[index];

  const reset = () => { setChoice(undefined); setReason(undefined); setNote(""); setError(""); };

  const save = (value: FeedbackDecision, reasonCode?: ReasonCode, freeNote?: string) => {
    if (busy.current || !item) return;
    busy.current = true;
    start(async () => {
      try {
        setError("");
        const result = await submitReviewDecision({ vacancyId: item.vacancy.id, value, reasonCode, note: freeNote });
        if (result.status === "error") { setError(result.message); return; }
        setResults((current) => [...current, { vacancyId: item.vacancy.id, value: result.value }]);
        setLast({ title: item.vacancy.title, message: decisionConfirmation(result.value) });
        setIndex((current) => current + 1);
        reset();
      } finally { busy.current = false; }
    });
  };

  const pick = (value: FeedbackDecision) => {
    if (pending || !item) return;
    setError("");
    // Afwijken van de AI mag altijd, maar nooit stilzwijgend: eerst de reden, dan pas opslaan.
    if (reasonIsRequired(value, item.assessment?.verdict ?? null)) { setChoice(value); return; }
    save(value);
  };

  const confirmWithReason = () => {
    if (!choice) return;
    if (!reason) { setError(REASON_REQUIRED_MESSAGE); return; }
    if (reason === "other" && !note.trim()) { setError(NOTE_REQUIRED_MESSAGE); return; }
    save(choice, reason, note.trim() || undefined);
  };

  const skip = () => { if (!pending) { setLast(undefined); setIndex((current) => current + 1); reset(); } };

  if (!queue.length) return <section className="empty-state">
    <p className="eyebrow">Beoordelen</p><h1>Je bent helemaal bij</h1>
    <p className="lead">Er staan nu geen kansrijke vacatures klaar waar jij nog geen oordeel over hebt gegeven.</p>
    <div className="actions"><Link className="button" href="/">Naar deze week</Link><Link className="button secondary" href="/vacatures">Blader door alle vacatures</Link></div>
  </section>;

  if (index >= queue.length) {
    const summary = reviewSummary(results);
    return <section className="batch-summary">
      <p className="eyebrow">Ronde afgerond</p><h1>{summary.total} van {queue.length} beoordeeld</h1>
      <div className="summary-numbers">
        <div><strong>{summary.breakdown.interesting}</strong><span>op de shortlist</span></div>
        <div><strong>{summary.breakdown.maybe}</strong><span>bewaard voor later</span></div>
        <div><strong>{summary.breakdown.not_suitable}</strong><span>afgewezen</span></div>
      </div>
      <p className="muted">Elke keuze en elke reden gaat mee als leersignaal naar de volgende AI-ronde.</p>
      <div className="actions">
        <Link className="button" href="/shortlist">Naar je shortlist</Link>
        {returnTo ? <Link className="button secondary" href={returnTo.href}>{returnTo.label}</Link> : <a className="button secondary" href="/beoordelen">Volgende ronde</a>}
        <Link className="button secondary" href="/">Terug naar deze week</Link>
      </div>
    </section>;
  }

  const aiVerdict = item.assessment?.verdict ?? null;
  const metadataOnly = isMetadataOnly(item.vacancy);
  const remaining = queue.length - index;

  return <div className="review-queue">
    <header className="queue-head">
      <div>
        <p className="eyebrow">Kansrijke tips · één voor één</p>
        <p className="queue-count"><b>{index + 1}</b> van {queue.length} · nog {remaining} te gaan</p>
      </div>
      <Link className="queue-exit" href="/">Stoppen voor nu</Link>
    </header>
    <div className="progress" role="progressbar" aria-label="Voortgang beoordeelrij" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index + 1} aria-valuetext={`Vacature ${index + 1} van ${queue.length}`}><span style={{ width: `${(index + 1) / queue.length * 100}%` }}/></div>
    {last && <p className="queue-last" role="status"><b>{last.title}</b> — {last.message}</p>}

    <article className="queue-card">
      <header className="queue-card-head">
        <h1>{item.vacancy.title}</h1>
        <p className="vacancy-employer">{item.vacancy.employer}</p>
        <dl className="fact-chips">{factChips(item).map(({ term, value, level }) => <div key={term}><dt>{term}</dt><dd className={level ? `deadline-note deadline-${level}` : undefined}>{value}</dd></div>)}</dl>
        {item.sourceUrl && <a className="source-link" href={item.sourceUrl} target="_blank" rel="noreferrer">Bekijk originele vacature{item.sourceName ? ` bij ${item.sourceName}` : ""} ↗</a>}
      </header>
      <section className="queue-ai panel ai-assessment" aria-labelledby="queue-ai-title">
        <p className="eyebrow">AI-advies</p><h2 id="queue-ai-title">Waarom deze tip</h2>
        {metadataOnly && <MetadataOnlyNotice/>}
        {item.assessment ? <AiAssessmentBody assessment={item.assessment}/> : <p className="muted">Voor deze vacature is nog geen AI-beoordeling beschikbaar.</p>}
      </section>
      <details className="queue-text">
        <summary>Volledige vacaturetekst lezen</summary>
        <VacancyContent text={item.vacancy.originalText}/>
      </details>
    </article>

    <div className={choice ? "decision-bar decision-bar-open" : "decision-bar"}>
      {!choice ? <>
        <div className="decision-actions" role="group" aria-label="Jouw oordeel over deze vacature">
          {reviewActions.map((action) => <button key={action.value} type="button" className={`decision decision-${action.tone}`} disabled={pending} onClick={() => pick(action.value)}>
            <b>{action.label}</b><span>{action.hint}</span>
          </button>)}
        </div>
        <div className="decision-meta">
          <button type="button" className="link-button" disabled={pending} onClick={skip}>Sla over, ik beslis later</button>
          <Link className="link-button" href={`/vacatures/${item.vacancy.id}`}>Open de volledige pagina</Link>
        </div>
      </> : <div className="reason-form">
        <h2>Jouw oordeel wijkt af van de AI</h2>
        <p className="muted">De AI noemde deze vacature {aiVerdict ? <b>{verdictLabels[aiVerdict].toLocaleLowerCase("nl")}</b> : "niets"}. Kies waar het verschil aan ligt; die reden stuurt de volgende ronde bij.</p>
        <fieldset className="reason-grid"><legend className="sr-only">Reden voor je afwijkende oordeel</legend>
          {reasonCodes.map((code) => <label key={code}><input type="radio" name="reason" value={code} checked={reason === code} onChange={() => setReason(code)}/><span>{reasonLabels[code]}</span></label>)}
        </fieldset>
        <label className="reason-note"><span className="reason-note-label">Toelichting {reason === "other" ? <span className="required-hint">verplicht</span> : <span className="muted">optioneel</span>}</span>
          <textarea value={note} maxLength={500} rows={3} onChange={(event) => setNote(event.target.value)} placeholder={reason === "other" ? "Licht kort toe waarom" : "Eventuele korte notitie"}/>
        </label>
        <div className="actions">
          <button type="button" disabled={pending} onClick={confirmWithReason}>{pending ? "Bezig met opslaan…" : "Opslaan en verder"}</button>
          <button type="button" className="secondary" disabled={pending} onClick={reset}>Terug</button>
        </div>
      </div>}
      {pending && !choice && <p role="status" className="muted">Bezig met opslaan…</p>}
      {error && <p className="feedback-error" role="alert">{error}</p>}
    </div>
  </div>;
}
