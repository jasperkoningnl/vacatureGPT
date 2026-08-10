import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiAssessments, feedback, sources, vacancies, vacancyOccurrences } from "@/lib/db/schema";
import { saveFeedback } from "@/app/actions";

export const dynamic = "force-dynamic";
const verdictLabels = { interesting: "Interessant", maybe: "Misschien", not_suitable: "Niet passend" } as const;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v] = await getDb().select({ vacancy: vacancies, sourceUrl: vacancyOccurrences.sourceUrl, source: sources.name, feedback, assessment: aiAssessments })
    .from(vacancies).innerJoin(vacancyOccurrences, eq(vacancies.id, vacancyOccurrences.vacancyId))
    .innerJoin(sources, eq(sources.id, vacancyOccurrences.sourceId)).leftJoin(feedback, eq(feedback.vacancyId, vacancies.id))
    .leftJoin(aiAssessments, eq(aiAssessments.vacancyId, vacancies.id)).where(eq(vacancies.id, Number(id))).limit(1);
  if (!v) notFound();
  const x = v.vacancy;
  return <><p><Link href="/vacatures">← Vacatures</Link></p><h1>{x.title}</h1><div className="split">
    <section className="panel stack"><h2>{x.employer}</h2><div><b>Locatie</b><br/>{x.location ?? "Niet vermeld"}</div><div><b>Uren</b><br/>{x.hoursMin ? `${x.hoursMin}–${x.hoursMax ?? x.hoursMin} uur` : "Niet vermeld"}</div><div><b>Salaris</b><br/>{x.salaryMin ? `€ ${x.salaryMin}–${x.salaryMax ?? x.salaryMin}` : (x.salaryOriginal ? "Niet gekwantificeerd" : "Niet vermeld")}</div><div><b>Deadline</b><br/>{x.deadline?.toLocaleDateString("nl-NL") ?? "Niet vermeld"}</div><a href={v.sourceUrl} target="_blank" rel="noreferrer">Open bij {v.source} ↗</a><hr/><h2>Originele vacaturetekst</h2><div className="text">{x.originalText}</div></section>
    <aside className="stack">
      <section className="panel"><h2>AI-beoordeling</h2>{v.assessment ? <><p><b>{v.assessment.score} · {verdictLabels[v.assessment.verdict]}</b></p><p>{v.assessment.summary}</p>{v.assessment.positives.length > 0 && <><h3>Pluspunten</h3><ul>{v.assessment.positives.map((item) => <li key={item}>{item}</li>)}</ul></>}{v.assessment.concerns.length > 0 && <><h3>Aandachtspunten</h3><ul>{v.assessment.concerns.map((item) => <li key={item}>{item}</li>)}</ul></>}</> : <p className="muted">Nog niet beoordeeld</p>}<p className="muted">Dit is AI-advies; jouw feedback hieronder blijft jouw eigen oordeel.</p></section>
      <section className="panel"><h2>Jouw feedback</h2><form action={saveFeedback} className="form"><input type="hidden" name="vacancyId" value={x.id}/><select name="value" defaultValue={v.feedback?.value ?? "maybe"}><option value="interesting">Interessant</option><option value="maybe">Misschien</option><option value="not_suitable">Niet passend</option></select><select name="reasonCode" defaultValue={v.feedback?.reasonCode ?? ""}><option value="">Geen reden</option><option value="role">Functie / inhoud</option><option value="seniority">Niveau / verantwoordelijkheid</option><option value="location">Locatie / reistijd</option><option value="hours">Uren</option><option value="salary">Salaris</option><option value="employer">Werkgever / sector</option><option value="other">Iets anders</option></select><textarea name="note" rows={5} placeholder="Notitie" defaultValue={v.feedback?.note ?? ""}/><button>Opslaan</button></form></section>
    </aside>
  </div></>;
}
