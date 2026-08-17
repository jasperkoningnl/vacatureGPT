import Link from "next/link";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vacancies, vacancyTracking } from "@/lib/db/schema";
import { applicationStatusLabels } from "@/lib/vacancy-tracking";

export const dynamic = "force-dynamic";
export default async function ShortlistPage() {
  const rows = await getDb().select({ id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, applicationStatus: vacancyTracking.applicationStatus }).from(vacancies).innerJoin(vacancyTracking, eq(vacancyTracking.vacancyId, vacancies.id)).where(and(eq(vacancies.active, true), isNotNull(vacancyTracking.shortlistedAt))).orderBy(desc(vacancyTracking.shortlistedAt));
  return <><div className="page-title"><div><p className="eyebrow">Jouw vervolgstappen</p><h1>Shortlist</h1><p className="lead">Alle actieve vacatures waar je serieus mee verder wilt.</p></div></div><div className="vacancy-cards">{rows.map(row=><Link className="vacancy-card shortlist-card" href={`/vacatures/${row.id}`} key={row.id}><div><h3>{row.title}</h3><p>{row.employer}</p></div><dl><div><dt>Locatie</dt><dd>{row.location||"Niet vermeld"}</dd></div><div><dt>Sollicitatiestatus</dt><dd>{row.applicationStatus?applicationStatusLabels[row.applicationStatus]:"Geen status"}</dd></div></dl></Link>)}{!rows.length&&<p className="muted funnel-empty">Je shortlist is nog leeg.</p>}</div></>;
}
