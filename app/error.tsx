"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Eén nette Nederlandse foutpagina in plaats van de kale Next-pagina bij een databasehik. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Pagina kon niet worden geladen", error); }, [error]);
  return <section className="empty-state">
    <p className="eyebrow">Er ging iets mis</p>
    <h1>Deze pagina kon niet worden geladen</h1>
    <p className="muted">Meestal is dit tijdelijk. Probeer het opnieuw; blijft het misgaan, kijk dan in de serverlogboeken.</p>
    {error.digest && <p className="muted">Foutcode: {error.digest}</p>}
    <div className="actions"><button onClick={reset}>Opnieuw proberen</button><Link className="button secondary" href="/">Naar mijn selectie</Link></div>
  </section>;
}
