import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { verdictLabels } from "@/lib/calibration";
import { getDb } from "@/lib/db";
import { latestFeedbackPerVacancy } from "@/lib/db/latest-feedback";
import { aiAssessments, vacancies, vacancyTracking } from "@/lib/db/schema";
import { CALIBRATION_BATCH_SIZE, funnelTerms } from "@/lib/funnel-terms";
import { promisingAiVerdicts, rejectedVerdict } from "@/lib/vacancy-funnel";
import { applicationStatusLabels, type ApplicationStatus } from "@/lib/vacancy-tracking";

export const dynamic = "force-dynamic";
type FunnelVacancy = { id: number; title: string; employer: string; location: string | null; hoursMin: number | null; hoursMax: number | null; score: number | null; verdict: "interesting" | "maybe" | "not_suitable" | null; applicationStatus?: ApplicationStatus | null };

function VacancyCards({ vacancies: rows, empty, showOwnVerdict = false, showTracking = false }: { vacancies: FunnelVacancy[]; empty: string; showOwnVerdict?: boolean; showTracking?: boolean }) {
  return <div className="vacancy-cards">{rows.map((vacancy) => <Link className="vacancy-card" href={`/vacatures/${vacancy.id}`} key={vacancy.id}>
    <div><h3>{vacancy.title}</h3><p>{vacancy.employer}</p></div>
    <div className="card-badges"><span className="ai-badge">AI: {vacancy.score === null || vacancy.verdict === null ? "Nog geen oordeel" : `${vacancy.score} · ${verdictLabels[vacancy.verdict]}`}</span>{showOwnVerdict && <span className="user-badge">Jouw oordeel: Interessant</span>}{showTracking && <span className="shortlist-badge">{vacancy.applicationStatus ? applicationStatusLabels[vacancy.applicationStatus] : "Op shortlist"}</span>}</div>
    <dl><div><dt>Locatie</dt><dd>{vacancy.location || "Niet vermeld"}</dd></div><div><dt>Uren</dt><dd>{vacancy.hoursMin ? `${vacancy.hoursMin}${vacancy.hoursMax && vacancy.hoursMax !== vacancy.hoursMin ? `–${vacancy.hoursMax}` : ""} uur` : "Uren onbekend"}</dd></div></dl>
  </Link>)}{!rows.length && <p className="muted funnel-empty">{empty}</p>}</div>;
}

export default async function Home() {
  const db = getDb();
  const feedback = latestFeedbackPerVacancy(db);
  // De dagelijkse funnel laat expliciet afgewezen vacatures weg. "Geen eigen oordeel" impliceert dat al;
  // de voorwaarde staat er expliciet bij zodat de regel zichtbaar in de query staat en niet stilzwijgend
  // uit een andere filter volgt. Het opgeslagen oordeel zelf verandert nergens.
  const notRejected = or(isNull(feedback.value), ne(feedback.value, rejectedVerdict));
  const unreviewedFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected);
  const promisingFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected, inArray(aiAssessments.verdict, promisingAiVerdicts));
  const suitableFilter = and(eq(vacancies.active, true), eq(feedback.value, "interesting"));
  const select = { id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, score: aiAssessments.score, verdict: aiAssessments.verdict };
  const shortlistFilter = and(eq(vacancies.active, true), isNotNull(vacancyTracking.shortlistedAt));
  const shortlistSelect = { ...select, applicationStatus: vacancyTracking.applicationStatus };
  const [[unreviewedCount], [promisingCount], [suitableCount], promising, suitable, shortlist] = await Promise.all([
    db.select({ n: count() }).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(unreviewedFilter),
    db.select({ n: count() }).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(promisingFilter),
    db.select({ n: count() }).from(vacancies).innerJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(suitableFilter),
    db.select(select).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(promisingFilter).orderBy(sql`case when ${aiAssessments.verdict} = 'interesting' then 0 else 1 end`, desc(aiAssessments.score), desc(vacancies.firstSeenAt)).limit(6),
    db.select(select).from(vacancies).leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).innerJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(suitableFilter).orderBy(desc(feedback.updatedAt), desc(vacancies.firstSeenAt)).limit(5),
    db.select(shortlistSelect).from(vacancies).innerJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id)).leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).where(shortlistFilter).orderBy(desc(vacancyTracking.shortlistedAt)).limit(5),
  ]);
  return <>
    <section className="hero"><div><p className="eyebrow">AI schift → jij beoordeelt</p><h1>De beste vacatures blijven over.</h1><p className="lead">Beoordeel vacatures snel en zie jouw interessante keuzes terug bij Geschikt bevonden. Wat je als niet passend beoordeelt, verdwijnt uit deze dagelijkse funnel.</p></div><div className="hero-action"><Link className="button button-large" href="/kalibreren">Beoordeel {CALIBRATION_BATCH_SIZE} vacatures</Link><p>{funnelTerms.calibrationBatch.label} uit de {unreviewedCount.n} {unreviewedCount.n === 1 ? "vacature" : "vacatures"} die je nog niet beoordeelde</p></div></section>
    <section className="metrics funnel-metrics" aria-label="Vacaturefunnel">
      <div><span>{funnelTerms.unreviewed.label}</span><strong>{unreviewedCount.n}</strong><p className="metric-note">{funnelTerms.unreviewed.description}</p></div>
      <div><span>{funnelTerms.promising.label}</span><strong>{promisingCount.n}</strong><p className="metric-note">{funnelTerms.promising.description}</p></div>
      <div><span>{funnelTerms.suitable.label}</span><strong>{suitableCount.n}</strong><p className="metric-note">{funnelTerms.suitable.description}</p></div>
    </section>
    <section className="funnel-section"><div className="section-head"><div><p className="eyebrow">Stap 1 · beoordelen</p><h2>{funnelTerms.promising.label}</h2><p className="muted">{funnelTerms.promising.description}</p></div><Link href="/vacatures?feedback=unreviewed&amp;ai=promising&amp;sort=ai-score">Bekijk alle kansrijke vacatures →</Link></div><VacancyCards vacancies={promising} empty="Er wachten geen kansrijke vacatures op je oordeel." /></section>
    <section className="funnel-section"><div className="section-head"><div><p className="eyebrow">Stap 2 · jouw oordeel</p><h2>{funnelTerms.suitable.label}</h2><p className="muted">{funnelTerms.suitable.description}</p></div><Link href="/vacatures?feedback=interesting">Alle geschikt bevonden →</Link></div><VacancyCards vacancies={suitable} empty="Je hebt nog geen actieve vacatures als geschikt beoordeeld." showOwnVerdict /></section>
    <section className="funnel-section"><div className="section-head"><div><p className="eyebrow">Stap 3 · vervolgstappen</p><h2>Shortlist</h2><p className="muted">Actieve vacatures waar je serieus iets mee wilt doen, met hun sollicitatiestatus.</p></div><Link href="/shortlist">Bekijk hele shortlist →</Link></div><VacancyCards vacancies={shortlist} empty="Je shortlist is nog leeg." showTracking /></section>
  </>;
}
