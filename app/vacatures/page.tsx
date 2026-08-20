import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiAssessments, feedback, sources, vacancies, vacancyOccurrences } from "@/lib/db/schema";
import { buildVacancyListConditions, dedupeVacancyRows, parseVacancyListFilters, resolveSourceFilter, vacancyListOrdering, type RawSearchParams } from "@/lib/vacancy-list";

export const dynamic = "force-dynamic";
const verdictLabels = { interesting: "Interessant", maybe: "Misschien", not_suitable: "Niet passend" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const db = getDb();
  const sourceOptions = await db.select({ slug: sources.slug, name: sources.name }).from(sources).orderBy(asc(sources.name));
  const parsed = parseVacancyListFilters(await searchParams);
  const q = { ...parsed, source: resolveSourceFilter(parsed.source, sourceOptions.map((option) => option.slug)) };
  const rows = await db.select({
    id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location,
    hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, salaryMin: vacancies.salaryMin,
    salaryMax: vacancies.salaryMax, salaryOriginal: vacancies.salaryOriginal, deadline: vacancies.deadline,
    url: vacancyOccurrences.sourceUrl, source: sources.name, feedback: feedback.value,
    aiScore: aiAssessments.score, aiVerdict: aiAssessments.verdict,
  }).from(vacancies)
    .innerJoin(vacancyOccurrences, and(eq(vacancies.id, vacancyOccurrences.vacancyId), eq(vacancyOccurrences.active, true)))
    .innerJoin(sources, eq(vacancyOccurrences.sourceId, sources.id))
    .leftJoin(feedback, eq(vacancies.id, feedback.vacancyId))
    .leftJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId))
    .where(and(...buildVacancyListConditions(q))).orderBy(vacancyListOrdering(q.sort), asc(vacancyOccurrences.id));
  const items = dedupeVacancyRows(rows);

  return <><div className="page-title"><div><p className="eyebrow">Volledige actieve vacaturelijst</p><h1>Alle vacatures</h1></div><span className="muted">{items.length} {items.length === 1 ? "vacature" : "vacatures"}</span></div><form className="filters">
    <input name="city" placeholder="Stad" defaultValue={q.city}/><input name="employer" placeholder="Werkgever" defaultValue={q.employer}/>
    <select name="source" defaultValue={q.source ?? ""}><option value="">Alle bronnen</option>{sourceOptions.map(x=><option key={x.slug} value={x.slug}>{x.name}</option>)}</select>
    <select name="salary" defaultValue={q.salary ?? ""}><option value="">Salaris: alle</option><option value="known">Bekend</option><option value="unknown">Onbekend</option></select>
    <select name="feedback" defaultValue={q.feedback ?? ""}><option value="">Jaspers oordeel: alle</option><option value="unreviewed">Nog niet beoordeeld</option><option value="interesting">Interessant</option><option value="maybe">Misschien</option><option value="not_suitable">Niet passend</option></select>
    <select name="ai" defaultValue={q.ai ?? ""}><option value="">Alle AI-oordelen</option><option value="promising">Waarschijnlijk passend</option><option value="interesting">Interessant</option><option value="maybe">Misschien</option><option value="not_suitable">Niet passend</option><option value="unassessed">Nog geen AI-oordeel</option></select>
    <select name="sort" defaultValue={q.sort}><option value="newest">Nieuwste</option><option value="deadline">Deadline</option><option value="ai-score">Beste match</option></select><button>Filter</button>
  </form><div className="table-wrap"><table className="vacancy-table"><thead><tr><th>Vacature</th><th>Beoordelingen</th><th>Locatie</th><th>Uren</th><th>Salaris</th><th>Deadline</th><th>Bronnen</th></tr></thead><tbody>{items.map((r) => <tr key={r.id}>
    <td><Link href={`/vacatures/${r.id}`}><b>{r.title}</b></Link><br/><span className="muted">{r.employer}</span></td>
    <td><div className="judgements"><span className="ai-badge">AI: {r.aiScore === null || r.aiVerdict === null ? "Nog geen oordeel" : `${r.aiScore} · ${verdictLabels[r.aiVerdict]}`}</span><span className="user-badge">Jasper: {r.feedback?verdictLabels[r.feedback]:"Nog geen oordeel"}</span></div></td>
    <td>{r.location ?? "Niet vermeld"}</td><td>{r.hoursMin ? `${r.hoursMin}${r.hoursMax ? `–${r.hoursMax}` : ""} uur` : "Uren onbekend"}</td>
    <td>{r.salaryMin ? `€ ${r.salaryMin.toLocaleString("nl-NL")}${r.salaryMax ? `–${r.salaryMax.toLocaleString("nl-NL")}` : ""}` : (r.salaryOriginal ? "Niet gekwantificeerd" : "Niet vermeld")}</td>
    <td>{r.deadline?.toLocaleDateString("nl-NL") ?? "Niet vermeld"}</td>
    <td><div className="source-links">{r.occurrences.map((occurrence) => <a key={`${occurrence.source}-${occurrence.url}`} href={occurrence.url} target="_blank" rel="noreferrer">{occurrence.source} ↗</a>)}</div></td>
  </tr>)}</tbody></table></div>{!items.length && <p className="muted">Geen vacatures binnen deze filters.</p>}</>;
}
