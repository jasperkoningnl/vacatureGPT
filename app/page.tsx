import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { latestFeedbackPerVacancy } from "@/lib/db/latest-feedback";
import { aiAssessments, vacancies, vacancyTracking } from "@/lib/db/schema";
import { formatDate } from "@/lib/date-format";
import { feedbackLabels } from "@/lib/feedback-validation";
import { funnelTerms } from "@/lib/funnel-terms";
import { listPresets, presetSearch } from "@/lib/vacancy-list";
import { REVIEW_ROUTE } from "@/lib/site-navigation";
import { promisingAiVerdicts, rejectedVerdict } from "@/lib/vacancy-funnel";
import { applicationStatusLabels, type ApplicationStatus } from "@/lib/vacancy-tracking";

export const dynamic = "force-dynamic";

type WeekVacancy = {
  id: number; title: string; employer: string; location: string | null;
  hoursMin: number | null; hoursMax: number | null; deadline: Date | null;
  score: number | null; verdict: "interesting" | "maybe" | "not_suitable" | null;
  applicationStatus?: ApplicationStatus | null;
};

function ScorePill({ score, verdict }: Pick<WeekVacancy, "score" | "verdict">) {
  if (score === null || verdict === null) return <span className="ai-badge">Nog geen AI-oordeel</span>;
  return <span className={`ai-badge ai-badge-${verdict}`}><b>{score}</b> {feedbackLabels[verdict].toLocaleLowerCase("nl")}</span>;
}

function VacancyCards({ rows, empty, badge }: { rows: WeekVacancy[]; empty: string; badge?: (row: WeekVacancy) => React.ReactNode }) {
  if (!rows.length) return <p className="muted funnel-empty">{empty}</p>;
  return <ul className="vacancy-cards">{rows.map((row) => <li key={row.id}><Link className="vacancy-card" href={`/vacatures/${row.id}`}>
    <div className="vacancy-card-main">
      <h3>{row.title}</h3>
      <p className="vacancy-card-employer">{row.employer}</p>
      <p className="vacancy-card-facts">{[row.location || "Locatie niet vermeld", row.hoursMin ? `${row.hoursMin}${row.hoursMax && row.hoursMax !== row.hoursMin ? `–${row.hoursMax}` : ""} uur` : "Uren onbekend", row.deadline ? `Sluit ${formatDate(row.deadline)}` : null].filter(Boolean).join(" · ")}</p>
    </div>
    <div className="vacancy-card-badges">{badge ? badge(row) : <ScorePill score={row.score} verdict={row.verdict}/>}</div>
  </Link></li>)}</ul>;
}

export default async function Home() {
  const db = getDb();
  const feedback = latestFeedbackPerVacancy(db);
  // De weekstapel laat expliciet afgewezen vacatures weg; het opgeslagen oordeel zelf verandert nergens.
  const notRejected = or(isNull(feedback.value), ne(feedback.value, rejectedVerdict));
  const unreviewedFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected);
  const promisingFilter = and(eq(vacancies.active, true), isNull(feedback.id), notRejected, inArray(aiAssessments.verdict, promisingAiVerdicts));
  const maybeFilter = and(eq(vacancies.active, true), eq(feedback.value, "maybe"));
  const shortlistFilter = and(eq(vacancies.active, true), isNotNull(vacancyTracking.shortlistedAt));
  const select = { id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, deadline: vacancies.deadline, score: aiAssessments.score, verdict: aiAssessments.verdict };

  const [[unreviewedCount], [promisingCount], [maybeCount], [shortlistCount], promising, shortlist] = await Promise.all([
    db.select({ n: count() }).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(unreviewedFilter),
    db.select({ n: count() }).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(promisingFilter),
    db.select({ n: count() }).from(vacancies).innerJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(maybeFilter),
    db.select({ n: count() }).from(vacancies).innerJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id)).where(shortlistFilter),
    db.select(select).from(vacancies).innerJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id)).where(promisingFilter).orderBy(sql`case when ${aiAssessments.verdict} = 'interesting' then 0 else 1 end`, desc(aiAssessments.score), desc(vacancies.firstSeenAt)).limit(5),
    db.select({ ...select, applicationStatus: vacancyTracking.applicationStatus }).from(vacancies).innerJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id)).leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).where(shortlistFilter).orderBy(desc(vacancyTracking.shortlistedAt)).limit(4),
  ]);

  const tips = promisingCount.n;
  // Dezelfde ingang als de chip boven Alle vacatures, zodat die daar ook actief oplicht.
  const passedOver = `/vacatures${presetSearch(listPresets.find(({ key }) => key === "passed-over")!)}`;
  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Deze week</p>
        <h1>{tips === 0 ? "Je bent helemaal bij." : `${tips} kansrijke ${tips === 1 ? "tip" : "tips"} wachten op je oordeel.`}</h1>
        <p className="lead">{tips === 0
          ? "Er staan nu geen nieuwe tips klaar. Zodra de bronnen weer nieuwe vacatures opleveren, verschijnen ze hier en in je weekmail."
          : "Ga ze één voor één langs. Interessant zet de vacature meteen op je shortlist, twijfel bewaar je voor later en wat niet past leg je weg met een reden. Elke keuze stuurt de volgende AI-ronde bij."}</p>
      </div>
      <div className="hero-action">
        <Link className="button button-large" href={REVIEW_ROUTE}>{tips === 0 ? "Toch iets beoordelen" : "Beoordeel ze één voor één"}</Link>
        <p>Zelfde stapel als in je weekmail · {unreviewedCount.n} {unreviewedCount.n === 1 ? "vacature" : "vacatures"} nog zonder oordeel</p>
      </div>
    </section>

    <section className="metrics funnel-metrics" aria-label="Stand van zaken">
      <div><span>{funnelTerms.promising.label}</span><strong>{tips}</strong><p className="metric-note">{funnelTerms.promising.description}</p></div>
      <div><span>Op shortlist</span><strong>{shortlistCount.n}</strong><p className="metric-note">Vacatures waar je serieus iets mee wilt, met hun sollicitatiestatus.</p></div>
      <div><span>Bewaard voor later</span><strong>{maybeCount.n}</strong><p className="metric-note">Twijfelgevallen die je als “misschien” hebt beoordeeld.</p></div>
    </section>

    <section className="funnel-section">
      <div className="section-head">
        <div><p className="eyebrow">Stap 1 · beoordelen</p><h2>De stapel van deze week</h2><p className="muted">{funnelTerms.promising.description}</p></div>
        <Link className="section-link" href={REVIEW_ROUTE}>Start met beoordelen →</Link>
      </div>
      <VacancyCards rows={promising} empty="Er wachten geen kansrijke vacatures op je oordeel."/>
    </section>

    <section className="funnel-section">
      <div className="section-head">
        <div><p className="eyebrow">Stap 2 · vervolgstappen</p><h2>Op je shortlist</h2><p className="muted">Hier houd je bij waar je wilt solliciteren en hoe het daarna loopt.</p></div>
        <Link className="section-link" href="/shortlist">Bekijk hele shortlist →</Link>
      </div>
      <VacancyCards rows={shortlist} empty="Je shortlist is nog leeg. Alles wat je in de beoordeelrij interessant noemt, komt hier terecht." badge={(row) => <span className="shortlist-badge">{row.applicationStatus ? applicationStatusLabels[row.applicationStatus] : "Nog geen status"}</span>}/>
    </section>

    <section className="funnel-section side-tracks" aria-label="Naast de weekstapel">
      <div><h3>Zelf bladeren</h3><p className="muted">Alles wat de AI níet heeft geselecteerd staat er nog. Vind je daar iets, beoordeel het dan met dezelfde knoppen.</p><Link className="section-link" href={passedOver}>Bekijk wat de AI wegliet →</Link></div>
      <div><h3>Blinde test</h3><p className="muted">Vijf vacatures zonder het AI-oordeel erbij. Handig als je het gevoel hebt dat de selectie scheef staat.</p><Link className="section-link" href="/kalibreren">Doe de blinde test →</Link></div>
      <div><h3>Afstemmen</h3><p className="muted">Je profiel, uren, steden en salarisondergrens bepalen waar de AI op selecteert.</p><Link className="section-link" href="/voorkeuren">Naar je voorkeuren →</Link></div>
    </section>
  </>;
}
