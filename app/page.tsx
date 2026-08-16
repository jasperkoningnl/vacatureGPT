import Link from "next/link";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { verdictLabels } from "@/lib/calibration";
import { getDb } from "@/lib/db";
import { aiAssessments, feedback, vacancies } from "@/lib/db/schema";
import { promisingAiVerdicts } from "@/lib/vacancy-funnel";

export const dynamic = "force-dynamic";
type FunnelVacancy = { id: number; title: string; employer: string; location: string | null; hoursMin: number | null; hoursMax: number | null; score: number | null; verdict: "interesting" | "maybe" | "not_suitable" | null };

function VacancyCards({ vacancies: rows, empty, showJasper = false }: { vacancies: FunnelVacancy[]; empty: string; showJasper?: boolean }) {
  return <div className="vacancy-cards">{rows.map((vacancy) => <Link className="vacancy-card" href={`/vacatures/${vacancy.id}`} key={vacancy.id}>
    <div><h3>{vacancy.title}</h3><p>{vacancy.employer}</p></div>
    <div className="card-badges"><span className="ai-badge">AI: {vacancy.score === null || vacancy.verdict === null ? "Nog geen oordeel" : `${vacancy.score} · ${verdictLabels[vacancy.verdict]}`}</span>{showJasper && <span className="user-badge">Jasper: Interessant</span>}</div>
    <dl><div><dt>Locatie</dt><dd>{vacancy.location || "Niet vermeld"}</dd></div><div><dt>Uren</dt><dd>{vacancy.hoursMin ? `${vacancy.hoursMin}${vacancy.hoursMax && vacancy.hoursMax !== vacancy.hoursMin ? `–${vacancy.hoursMax}` : ""} uur` : "Uren onbekend"}</dd></div></dl>
  </Link>)}{!rows.length && <p className="muted funnel-empty">{empty}</p>}</div>;
}

export default async function Home() {
  const db = getDb();
  const reviewFilter = and(eq(vacancies.active, true), isNull(feedback.id), inArray(aiAssessments.verdict, promisingAiVerdicts));
  const suitableFilter = and(eq(vacancies.active, true), eq(feedback.value, "interesting"));
  const select = { id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, score: aiAssessments.score, verdict: aiAssessments.verdict };
  const [[toReviewCount], [suitableCount], toReview, suitable] = await Promise.all([
    db.select({ n: count() }).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(reviewFilter),
    db.select({ n: count() }).from(vacancies).innerJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(suitableFilter),
    db.select(select).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(reviewFilter).orderBy(sql`case when ${aiAssessments.verdict} = 'interesting' then 0 else 1 end`, desc(aiAssessments.score), desc(vacancies.firstSeenAt)).limit(6),
    db.select(select).from(vacancies).leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).innerJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(suitableFilter).orderBy(desc(feedback.updatedAt), desc(vacancies.firstSeenAt)).limit(5),
  ]);
  return <>
    <section className="hero"><div><p className="eyebrow">AI schift → Jasper beoordeelt</p><h1>De beste vacatures blijven over.</h1><p className="lead">Begin bij de kansrijke vacatures die nog op jouw oordeel wachten.</p></div><Link className="button button-large" href="/vacatures?feedback=unreviewed&ai=promising&sort=ai-score">Bekijk te beoordelen</Link></section>
    <section className="metrics funnel-metrics" aria-label="Vacaturefunnel"><div><span>Te beoordelen</span><strong>{toReviewCount.n}</strong></div><div><span>Geschikt bevonden</span><strong>{suitableCount.n}</strong></div></section>
    <section className="funnel-section"><div className="section-head"><div><p className="eyebrow">Jouw volgende stap</p><h2>Te beoordelen</h2><p className="muted">Actieve vacatures die AI waarschijnlijk passend vindt en die jij nog niet hebt beoordeeld.</p></div><Link href="/vacatures?feedback=unreviewed&ai=promising&sort=ai-score">Alle te beoordelen →</Link></div><VacancyCards vacancies={toReview} empty="Er wachten geen kansrijke vacatures op je oordeel." /></section>
    <section className="funnel-section"><div className="section-head"><div><p className="eyebrow">Jouw oordeel</p><h2>Geschikt</h2><p className="muted">Actieve vacatures die jij als interessant hebt beoordeeld.</p></div><Link href="/vacatures?feedback=interesting">Alle geschikte →</Link></div><VacancyCards vacancies={suitable} empty="Je hebt nog geen actieve vacatures als geschikt beoordeeld." showJasper /></section>
  </>;
}
