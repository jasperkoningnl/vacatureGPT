import type { Metadata } from "next";
import { login } from "../actions";

export const metadata: Metadata = { title: "Inloggen" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  return <section className="panel login-panel">
    <p className="eyebrow">Persoonlijke omgeving</p>
    <h1>Privétoegang</h1>
    <p className="muted">Voer het applicatiewachtwoord in.</p>
    {q.error && <p className="form-error" role="alert">Onjuist wachtwoord. Probeer het opnieuw.</p>}
    <form action={login} className="form">
      <label htmlFor="password">Wachtwoord</label>
      <input id="password" type="password" name="password" required autoFocus autoComplete="current-password"/>
      <button>Inloggen</button>
    </form>
  </section>;
}
