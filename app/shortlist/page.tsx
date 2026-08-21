import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiAssessments, vacancies, vacancyTracking } from "@/lib/db/schema";
import { formatDate } from "@/lib/date-format";
import { deadlineNotice } from "@/lib/deadline";
import { REVIEW_ROUTE } from "@/lib/site-navigation";
import { RemoveFromShortlist, StatusControl } from "./shortlist-controls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shortlist" };

export default async function ShortlistPage() {
  const rows = await getDb().select({
    id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location,
    hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, deadline: vacancies.deadline,
    score: aiAssessments.score, applicationStatus: vacancyTracking.applicationStatus, note: vacancyTracking.note,
  }).from(vacancies).innerJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id)).leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id))
    .where(and(eq(vacancies.active, true), isNotNull(vacancyTracking.shortlistedAt)))
    // Wat het eerst sluit staat bovenaan; vacatures zonder deadline zakken naar onderen.
    .orderBy(sql`${vacancies.deadline} asc nulls last`, desc(vacancyTracking.shortlistedAt));

  return <>
    <div className="page-title">
      <div><p className="eyebrow">Stap 2 · vervolgstappen</p><h1>Shortlist</h1><p className="lead">Alles waar je serieus mee verder wilt, met de eerstvolgende deadline bovenaan. Werk de status hier direct bij.</p></div>
      <span className="muted">{rows.length} {rows.length === 1 ? "vacature" : "vacatures"}</span>
    </div>
    {rows.length ? <ul className="shortlist">{rows.map((row) => {
      const notice = deadlineNotice(row.deadline);
      return <li className="shortlist-item panel" key={row.id}>
        <div className="shortlist-main">
          <h2><Link href={`/vacatures/${row.id}`}>{row.title}</Link></h2>
          <p className="vacancy-card-employer">{row.employer}</p>
          <p className="vacancy-card-facts">{[row.location || "Locatie niet vermeld", row.hoursMin ? `${row.hoursMin}${row.hoursMax && row.hoursMax !== row.hoursMin ? `–${row.hoursMax}` : ""} uur` : "Uren onbekend", row.score !== null ? `AI-score ${row.score}` : null].filter(Boolean).join(" · ")}</p>
          {row.deadline && <p className={`deadline-note deadline-${notice.level}`}>{notice.label} · {formatDate(row.deadline)}</p>}
          {row.note && <p className="shortlist-note">{row.note}</p>}
        </div>
        <div className="shortlist-controls">
          <StatusControl vacancyId={row.id} current={row.applicationStatus}/>
          <div className="shortlist-links"><Link className="link-button" href={`/vacatures/${row.id}`}>Openen en notitie bijwerken</Link><RemoveFromShortlist vacancyId={row.id}/></div>
        </div>
      </li>;
    })}</ul> : <div className="empty-state panel">
      <h2>Je shortlist is nog leeg</h2>
      <p className="muted">Alles wat je in de beoordeelrij interessant noemt, komt hier automatisch terecht.</p>
      <div className="actions"><Link className="button" href={REVIEW_ROUTE}>Naar de beoordeelrij</Link><Link className="button secondary" href="/vacatures">Blader door alle vacatures</Link></div>
    </div>}
  </>;
}
