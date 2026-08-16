import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiAssessments, feedback, sources, vacancies, vacancyOccurrences } from "@/lib/db/schema";
import { VacancyContent } from "@/app/components/vacancy-content";
import { FeedbackForm } from "./feedback-form";

export const dynamic = "force-dynamic";
const verdictLabels = { interesting: "Interessant", maybe: "Misschien", not_suitable: "Niet passend" } as const;
const currency = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function salaryText(vacancy: typeof vacancies.$inferSelect) {
  if (!vacancy.salaryMin) return vacancy.salaryOriginal || "Niet vermeld";
  const range = vacancy.salaryMax && vacancy.salaryMax !== vacancy.salaryMin
    ? `${currency.format(vacancy.salaryMin)} – ${currency.format(vacancy.salaryMax)}`
    : currency.format(vacancy.salaryMin);
  const details = [vacancy.salaryPeriod, vacancy.salaryBasisHours ? `op basis van ${vacancy.salaryBasisHours} uur` : null].filter(Boolean).join(", ");
  return details ? `${range} (${details})` : range;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [result] = await getDb().select({ vacancy: vacancies, sourceUrl: vacancyOccurrences.sourceUrl, source: sources.name, feedback, assessment: aiAssessments })
    .from(vacancies).innerJoin(vacancyOccurrences, eq(vacancies.id, vacancyOccurrences.vacancyId))
    .innerJoin(sources, eq(sources.id, vacancyOccurrences.sourceId)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id))
    .leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).where(eq(vacancies.id, Number(id)))
    .orderBy(desc(vacancyOccurrences.active), desc(vacancyOccurrences.lastSeenAt), asc(vacancyOccurrences.id)).limit(1);
  if (!result) notFound();
  const vacancy = result.vacancy;

  return <article className="vacancy-detail">
    <header className="vacancy-detail-header">
      <Link className="back-link" href="/vacatures">← Terug naar vacatures</Link>
      {!vacancy.active && <div className="inactive-notice" role="status">Deze vacature is niet meer actief. De informatie hieronder kan verouderd zijn.</div>}
      <h1>{vacancy.title}</h1>
      <p className="vacancy-employer">{vacancy.employer}</p>
    </header>

    <section className="review-section panel" aria-labelledby="my-review-title">
      <p className="eyebrow">Jouw eigen oordeel</p>
      <h2 id="my-review-title">Mijn beoordeling</h2>
      <p className="section-intro">Leg vast of deze vacature bij je past. Dit oordeel helpt ook om toekomstige AI-beoordelingen beter af te stemmen.</p>
      <FeedbackForm vacancyId={vacancy.id} current={result.feedback && { value: result.feedback.value, reasonCode: result.feedback.reasonCode, note: result.feedback.note }}/>
    </section>

    <section className="detail-section" aria-labelledby="details-title">
      <div className="section-heading"><div><p className="eyebrow">In één oogopslag</p><h2 id="details-title">Vacaturegegevens</h2></div><a className="source-link" href={result.sourceUrl} target="_blank" rel="noreferrer">Bekijk originele vacature ↗</a></div>
      <dl className="detail-metadata panel">
        <div><dt>Locatie</dt><dd>{vacancy.location || "Niet vermeld"}</dd></div>
        <div><dt>Uren</dt><dd>{vacancy.hoursMin ? `${vacancy.hoursMin}–${vacancy.hoursMax ?? vacancy.hoursMin} uur` : vacancy.hoursOriginal || "Niet vermeld"}</dd></div>
        <div><dt>Salaris</dt><dd>{salaryText(vacancy)}</dd></div>
        <div><dt>Deadline</dt><dd>{vacancy.deadline?.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) ?? "Niet vermeld"}</dd></div>
      </dl>
      <p className="source-name muted">Bron: {result.source}</p>
    </section>

    <section className="detail-section ai-assessment panel" aria-labelledby="ai-title">
      <p className="eyebrow">AI-advies · los van jouw beoordeling</p>
      <h2 id="ai-title">AI-beoordeling</h2>
      {result.assessment ? <>
        <div className="ai-verdict"><strong>{verdictLabels[result.assessment.verdict]}</strong><span>{result.assessment.score}/100</span></div>
        <p className="ai-summary">{result.assessment.summary}</p>
        <div className="ai-points">
          <div><h3>Pluspunten</h3>{result.assessment.positives.length ? <ul>{result.assessment.positives.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">Geen pluspunten vermeld.</p>}</div>
          <div><h3>Aandachtspunten</h3>{result.assessment.concerns.length ? <ul>{result.assessment.concerns.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">Geen aandachtspunten vermeld.</p>}</div>
        </div>
      </> : <p className="muted">Voor deze vacature is nog geen AI-beoordeling beschikbaar.</p>}
    </section>

    <section className="vacancy-text-section" aria-labelledby="vacancy-text-title">
      <p className="eyebrow">Volledige beschrijving</p>
      <h2 id="vacancy-text-title">Vacaturetekst</h2>
      <VacancyContent text={vacancy.originalText}/>
    </section>
  </article>;
}
