import Link from "next/link";
import { getDb } from "@/lib/db";
import { queryVacancyList } from "@/lib/db/application-queries";
import { feedbackLabels } from "@/lib/feedback-validation";
import { funnelTerms } from "@/lib/funnel-terms";
import { METADATA_ONLY_BADGE } from "@/lib/vacancy-depth";
import { showsRejected, type RawSearchParams } from "@/lib/vacancy-list";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { sourceOptions, filters: q, items, rejectedCount } = await queryVacancyList(getDb(), await searchParams);
  const rejectedVisible = showsRejected(q);

  return <><div className="page-title"><div><p className="eyebrow">Beheer · volledige vacaturelijst</p><h1>Alle vacatures</h1></div><span className="muted">{items.length} {items.length === 1 ? "vacature" : "vacatures"}</span></div><form className="filters">
    <label className="filter-field"><span>Stad</span><input name="city" placeholder="Bijv. Utrecht" defaultValue={q.city}/></label>
    <label className="filter-field"><span>Werkgever</span><input name="employer" placeholder="Bijv. NPO" defaultValue={q.employer}/></label>
    <label className="filter-field"><span>Bron</span><select name="source" defaultValue={q.source ?? ""}><option value="">Alle bronnen</option>{sourceOptions.map(x=><option key={x.slug} value={x.slug}>{x.name}</option>)}</select></label>
    <label className="filter-field"><span>Salaris</span><select name="salary" defaultValue={q.salary ?? ""}><option value="">Alle</option><option value="known">Bekend</option><option value="unknown">Onbekend</option></select></label>
    <label className="filter-field"><span>Jouw oordeel</span><select name="feedback" defaultValue={q.feedback ?? ""}><option value="">Alle</option><option value="unreviewed">{funnelTerms.unreviewed.label}</option><option value="interesting">{feedbackLabels.interesting}</option><option value="maybe">{feedbackLabels.maybe}</option><option value="not_suitable">{feedbackLabels.not_suitable}</option></select></label>
    <label className="filter-field"><span>AI-oordeel</span><select name="ai" defaultValue={q.ai ?? ""}><option value="">Alle</option><option value="promising">{funnelTerms.promising.label}</option><option value="interesting">{feedbackLabels.interesting}</option><option value="maybe">{feedbackLabels.maybe}</option><option value="not_suitable">{feedbackLabels.not_suitable}</option><option value="unassessed">Nog geen AI-oordeel</option></select></label>
    <label className="filter-field"><span>Sorteren</span><select name="sort" defaultValue={q.sort}><option value="newest">Nieuwste</option><option value="deadline">Deadline</option><option value="ai-score">Beste match</option></select></label>
    <label className="filter-toggle"><input type="checkbox" name="rejected" value="show" defaultChecked={q.rejected === "show"}/><span>Toon ook afgewezen ({rejectedCount})</span></label>
    <button>Filter</button>
  </form>
  {rejectedVisible
    ? <p className="muted list-note">Afgewezen vacatures staan nu tussen de resultaten. {funnelTerms.rejected.description}</p>
    : rejectedCount > 0 && <p className="muted list-note">{rejectedCount} {rejectedCount === 1 ? "vacature die je als niet passend beoordeelde is" : "vacatures die je als niet passend beoordeelde zijn"} verborgen. Zet “Toon ook afgewezen” aan om {rejectedCount === 1 ? "hem" : "ze"} erbij te zien.</p>}
  <div className="table-wrap"><table className="vacancy-table">
    <caption className="sr-only">Actieve vacatures binnen de gekozen filters, met jouw oordeel en het AI-oordeel per vacature.</caption>
    <thead><tr><th scope="col">Vacature</th><th scope="col">Beoordelingen</th><th scope="col">Locatie</th><th scope="col">Uren</th><th scope="col">Salaris</th><th scope="col">Deadline</th><th scope="col">Bronnen</th></tr></thead>
    <tbody>{items.map((r) => <tr key={r.id}>
    <th scope="row"><Link href={`/vacatures/${r.id}`}><b>{r.title}</b></Link><br/><span className="muted">{r.employer}</span></th>
    <td><div className="judgements"><span className="ai-badge">AI: {r.aiScore === null || r.aiVerdict === null ? "Nog geen oordeel" : `${r.aiScore} · ${feedbackLabels[r.aiVerdict]}`}</span><span className="user-badge">Jouw oordeel: {r.feedback?feedbackLabels[r.feedback]:"Nog geen oordeel"}</span>{r.metadataOnly && <span className="depth-badge" title="Alleen metadata bekend; geen volledige vacaturetekst.">{METADATA_ONLY_BADGE}</span>}</div></td>
    <td>{r.location ?? "Niet vermeld"}</td><td>{r.hoursMin ? `${r.hoursMin}${r.hoursMax ? `–${r.hoursMax}` : ""} uur` : "Uren onbekend"}</td>
    <td>{r.salaryMin ? `€ ${r.salaryMin.toLocaleString("nl-NL")}${r.salaryMax ? `–${r.salaryMax.toLocaleString("nl-NL")}` : ""}` : (r.salaryOriginal ? "Niet gekwantificeerd" : "Niet vermeld")}</td>
    <td>{r.deadline?.toLocaleDateString("nl-NL") ?? "Niet vermeld"}</td>
    <td><div className="source-links">{r.occurrences.map((occurrence) => <a key={`${occurrence.source}-${occurrence.url}`} href={occurrence.url} target="_blank" rel="noreferrer">{occurrence.source} ↗</a>)}</div></td>
  </tr>)}</tbody></table></div>{!items.length && <p className="muted">Geen vacatures binnen deze filters.</p>}</>;
}
