import Link from "next/link";
import type { ReactNode } from "react";
import { VacancyContent } from "./vacancy-content";

export type VacancyDetailData = {
  id: number; title: string; employer: string; active?: boolean;
  location: string | null; hoursMin: number | null; hoursMax: number | null; hoursOriginal: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryOriginal: string | null;
  salaryPeriod?: string | null; salaryBasisHours?: number | null; deadline: Date | string | null; originalText: string;
};
export type AssessmentData = { verdict: "interesting" | "maybe" | "not_suitable"; score: number; summary: string; positives: string[]; concerns: string[] };

const verdictLabels = { interesting: "Interessant", maybe: "Misschien", not_suitable: "Niet passend" } as const;
const currency = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const salaryText = (vacancy: VacancyDetailData) => {
  if (!vacancy.salaryMin) return vacancy.salaryOriginal || "Niet vermeld";
  const range = vacancy.salaryMax && vacancy.salaryMax !== vacancy.salaryMin ? `${currency.format(vacancy.salaryMin)} – ${currency.format(vacancy.salaryMax)}` : currency.format(vacancy.salaryMin);
  const details = [vacancy.salaryPeriod, vacancy.salaryBasisHours ? `op basis van ${vacancy.salaryBasisHours} uur` : null].filter(Boolean).join(", ");
  return details ? `${range} (${details})` : range;
};

export function VacancyReviewDetail({ vacancy, review, assessment, concealAssessment = false, sourceUrl, sourceName, backLink }: {
  vacancy: VacancyDetailData; review: ReactNode; assessment?: AssessmentData | null; concealAssessment?: boolean;
  sourceUrl?: string | null; sourceName?: string | null; backLink?: { href: string; label: string };
}) {
  return <article className="vacancy-detail">
    <header className="vacancy-detail-header">
      {backLink && <Link className="back-link" href={backLink.href}>← {backLink.label}</Link>}
      {vacancy.active === false && <div className="inactive-notice" role="status">Deze vacature is niet meer actief. De informatie hieronder kan verouderd zijn.</div>}
      <h1>{vacancy.title}</h1><p className="vacancy-employer">{vacancy.employer}</p>
    </header>
    <section className="review-section panel" aria-labelledby="my-review-title">
      <p className="eyebrow">Jouw eigen oordeel</p><h2 id="my-review-title">Mijn beoordeling</h2>
      <p className="section-intro">Leg vast of deze vacature bij je past. Dit oordeel helpt ook om toekomstige AI-beoordelingen beter af te stemmen.</p>
      {review}
    </section>
    <section className="detail-section" aria-labelledby="details-title">
      <div className="section-heading"><div><p className="eyebrow">In één oogopslag</p><h2 id="details-title">Vacaturegegevens</h2></div>{sourceUrl && <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">Bekijk originele vacature ↗</a>}</div>
      <dl className="detail-metadata panel">
        <div><dt>Locatie</dt><dd>{vacancy.location || "Niet vermeld"}</dd></div>
        <div><dt>Uren</dt><dd>{vacancy.hoursMin ? `${vacancy.hoursMin}–${vacancy.hoursMax ?? vacancy.hoursMin} uur` : vacancy.hoursOriginal || "Niet vermeld"}</dd></div>
        <div><dt>Salaris</dt><dd>{salaryText(vacancy)}</dd></div>
        <div><dt>Deadline</dt><dd>{vacancy.deadline ? new Date(vacancy.deadline).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "Niet vermeld"}</dd></div>
      </dl>{sourceName && <p className="source-name muted">Bron: {sourceName}</p>}
    </section>
    <section className="detail-section ai-assessment panel" aria-labelledby="ai-title">
      <p className="eyebrow">AI-advies · los van jouw beoordeling</p><h2 id="ai-title">AI-beoordeling</h2>
      {concealAssessment ? <p className="muted">AI-beoordeling wordt zichtbaar nadat je zelf hebt beoordeeld</p> : assessment ? <>
        <div className="ai-verdict"><strong>{verdictLabels[assessment.verdict]}</strong><span>{assessment.score}/100</span></div>
        <p className="ai-summary">{assessment.summary}</p><div className="ai-points">
          <div><h3>Pluspunten</h3>{assessment.positives.length ? <ul>{assessment.positives.map(item => <li key={item}>{item}</li>)}</ul> : <p className="muted">Geen pluspunten vermeld.</p>}</div>
          <div><h3>Aandachtspunten</h3>{assessment.concerns.length ? <ul>{assessment.concerns.map(item => <li key={item}>{item}</li>)}</ul> : <p className="muted">Geen aandachtspunten vermeld.</p>}</div>
        </div></> : <p className="muted">Voor deze vacature is nog geen AI-beoordeling beschikbaar.</p>}
    </section>
    <section className="vacancy-text-section" aria-labelledby="vacancy-text-title"><p className="eyebrow">Volledige beschrijving</p><h2 id="vacancy-text-title">Vacaturetekst</h2><VacancyContent text={vacancy.originalText}/></section>
  </article>;
}
