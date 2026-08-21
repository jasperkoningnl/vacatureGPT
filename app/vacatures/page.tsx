import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { queryVacancyList } from "@/lib/db/application-queries";
import { deadlineNotice } from "@/lib/deadline";
import { feedbackLabels } from "@/lib/feedback-validation";
import { funnelTerms } from "@/lib/funnel-terms";
import { REVIEW_ROUTE } from "@/lib/site-navigation";
import { METADATA_ONLY_BADGE } from "@/lib/vacancy-depth";
import { activePresetKey, listPresets, presetSearch, showsRejected, type RawSearchParams } from "@/lib/vacancy-list";
import { formatDate } from "@/lib/date-format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alle vacatures" };

/** De filters die nu gelden, terug als querystring, zodat paginering niets verliest. */
function withPage(filters: Record<string, unknown>, page: number) {
  const entries = Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)] as [string, string]);
  return `/vacatures?${new URLSearchParams([...entries.filter(([key]) => key !== "page"), ["page", String(page)]])}`;
}

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const { sourceOptions, filters: q, items, total, pageCount, rejectedCount } = await queryVacancyList(getDb(), await searchParams);
  const rejectedVisible = showsRejected(q);
  const active = activePresetKey(q);

  return <>
    <div className="page-title">
      <div><p className="eyebrow">Zelf bladeren</p><h1>Alle vacatures</h1><p className="lead">Alles wat de bronnen hebben opgeleverd, ook wat de AI niet heeft geselecteerd. Kom je iets tegen dat wél past, beoordeel het dan met dezelfde knoppen als in je weekstapel.</p></div>
      <span className="muted">{total} {total === 1 ? "vacature" : "vacatures"}</span>
    </div>

    <nav className="preset-bar" aria-label="Snelle ingangen">
      {listPresets.map((preset) => <Link key={preset.key} href={`/vacatures${presetSearch(preset)}`} className={preset.key === active ? "preset preset-active" : "preset"} aria-current={preset.key === active ? "page" : undefined} title={preset.description}>{preset.label}</Link>)}
    </nav>

    <details className="filters-wrap" open={Boolean(q.query || q.city || q.employer || q.source || q.salary)}>
      <summary>Verfijn met filters</summary>
      <form className="filters">
        <label className="filter-field"><span>Zoeken</span><input name="query" type="search" placeholder="Titel, werkgever of vacaturetekst" defaultValue={q.query}/></label>
        <label className="filter-field"><span>Stad</span><input name="city" placeholder="Bijv. Utrecht" defaultValue={q.city}/></label>
        <label className="filter-field"><span>Werkgever</span><input name="employer" placeholder="Bijv. NPO" defaultValue={q.employer}/></label>
        <label className="filter-field"><span>Bron</span><select name="source" defaultValue={q.source ?? ""}><option value="">Alle bronnen</option>{sourceOptions.map(x=><option key={x.slug} value={x.slug}>{x.name}</option>)}</select></label>
        <label className="filter-field"><span>Salaris</span><select name="salary" defaultValue={q.salary ?? ""}><option value="">Alle</option><option value="known">Bekend</option><option value="unknown">Onbekend</option></select></label>
        <label className="filter-field"><span>Jouw oordeel</span><select name="feedback" defaultValue={q.feedback ?? ""}><option value="">Alle</option><option value="unreviewed">{funnelTerms.unreviewed.label}</option><option value="interesting">{feedbackLabels.interesting}</option><option value="maybe">{feedbackLabels.maybe}</option><option value="not_suitable">{feedbackLabels.not_suitable}</option></select></label>
        <label className="filter-field"><span>AI-oordeel</span><select name="ai" defaultValue={q.ai ?? ""}><option value="">Alle</option><option value="promising">{funnelTerms.promising.label}</option><option value="interesting">{feedbackLabels.interesting}</option><option value="maybe">{feedbackLabels.maybe}</option><option value="not_suitable">{feedbackLabels.not_suitable}</option><option value="unassessed">Nog geen AI-oordeel</option></select></label>
        <label className="filter-field"><span>Sorteren</span><select name="sort" defaultValue={q.sort}><option value="newest">Nieuwste</option><option value="deadline">Deadline</option><option value="ai-score">Beste match</option></select></label>
        <label className="filter-toggle"><input type="checkbox" name="rejected" value="show" defaultChecked={q.rejected === "show"}/><span>Toon ook afgewezen ({rejectedCount})</span></label>
        <button>Filter toepassen</button>
      </form>
    </details>

    {rejectedVisible
      ? <p className="muted list-note">Afgewezen vacatures staan nu tussen de resultaten. {funnelTerms.rejected.description}</p>
      : rejectedCount > 0 && <p className="muted list-note">{rejectedCount} {rejectedCount === 1 ? "vacature die je als niet passend beoordeelde is" : "vacatures die je als niet passend beoordeelde zijn"} verborgen. Zet “Toon ook afgewezen” aan om {rejectedCount === 1 ? "hem" : "ze"} erbij te zien.</p>}

    <div className="table-wrap"><table className="vacancy-table">
      <caption className="sr-only">Actieve vacatures binnen de gekozen filters, met jouw oordeel, het AI-oordeel en een directe knop om je oordeel te geven.</caption>
      <thead><tr><th scope="col">Vacature</th><th scope="col">Beoordelingen</th><th scope="col">Kenmerken</th><th scope="col">Deadline</th><th scope="col">Bron</th><th scope="col">Actie</th></tr></thead>
      <tbody>{items.map((r) => { const notice = deadlineNotice(r.deadline); return <tr key={r.id}>
        <th scope="row"><Link href={`/vacatures/${r.id}`}><b>{r.title}</b></Link><br/><span className="muted">{r.employer}</span>{r.shortlisted && <><br/><span className="shortlist-badge">Op shortlist</span></>}</th>
        <td><div className="judgements"><span className={r.aiVerdict ? `ai-badge ai-badge-${r.aiVerdict}` : "ai-badge"}>AI: {r.aiScore === null || r.aiVerdict === null ? "Nog geen oordeel" : `${r.aiScore} · ${feedbackLabels[r.aiVerdict]}`}</span><span className="user-badge">Jouw oordeel: {r.feedback?feedbackLabels[r.feedback]:"Nog geen oordeel"}</span>{r.metadataOnly && <span className="depth-badge" title="Alleen metadata bekend; geen volledige vacaturetekst.">{METADATA_ONLY_BADGE}</span>}</div></td>
        <td className="cell-facts">{[r.location ?? "Niet vermeld", r.hoursMin ? `${r.hoursMin}${r.hoursMax && r.hoursMax !== r.hoursMin ? `–${r.hoursMax}` : ""} uur` : "Uren onbekend", r.salaryMin ? `€ ${r.salaryMin.toLocaleString("nl-NL")}${r.salaryMax && r.salaryMax !== r.salaryMin ? `–${r.salaryMax.toLocaleString("nl-NL")}` : ""}` : (r.salaryOriginal ? "Salaris niet gekwantificeerd" : "Salaris niet vermeld")].join(" · ")}</td>
        <td>{r.deadline ? <span className={`deadline-note deadline-${notice.level}`}>{notice.label}<br/><small>{formatDate(r.deadline)}</small></span> : <span className="muted">Niet vermeld</span>}</td>
        <td><div className="source-links">{r.occurrences.map((occurrence) => <a key={`${occurrence.source}-${occurrence.url}`} href={occurrence.url} target="_blank" rel="noreferrer">{occurrence.source} ↗</a>)}</div></td>
        <td><Link className="row-action" href={`${REVIEW_ROUTE}?ids=${r.id}`}>{r.feedback ? "Opnieuw beoordelen" : "Beoordelen"} →</Link></td>
      </tr>; })}</tbody>
    </table></div>
    {!items.length && <p className="muted empty-result">Geen vacatures binnen deze filters. Kies hierboven een andere ingang of wis je zoekterm.</p>}
    <nav className="pagination" aria-label="Paginering">
      {q.page > 1 && <Link href={withPage(q, q.page - 1)}>← Vorige</Link>}
      <span>Pagina {q.page} van {pageCount}</span>
      {q.page < pageCount && <Link href={withPage(q, q.page + 1)}>Volgende →</Link>}
    </nav>
  </>;
}
