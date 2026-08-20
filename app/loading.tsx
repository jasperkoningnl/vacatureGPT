/** Alle pagina's doen serverwerk vóór de eerste render; dit maakt die wachttijd zichtbaar. */
export default function Loading() {
  return <div className="route-loading" role="status" aria-live="polite">
    <p className="eyebrow">Even geduld</p>
    <p className="muted">Gegevens worden opgehaald…</p>
    <div className="skeleton-list" aria-hidden="true"><span/><span/><span/></div>
  </div>;
}
