import Link from "next/link";

export default function NotFound() {
  return <section className="empty-state">
    <p className="eyebrow">Niet gevonden</p>
    <h1>Deze pagina bestaat niet</h1>
    <p className="muted">De vacature is misschien verwijderd, of de link klopt niet meer.</p>
    <div className="actions"><Link className="button" href="/">Naar mijn selectie</Link><Link className="button secondary" href="/vacatures">Alle vacatures</Link></div>
  </section>;
}
