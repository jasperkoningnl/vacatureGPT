import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { preferences, watchedEmployers } from "@/lib/db/schema";
import { preferenceNotices } from "@/lib/preference-notices";
import { addWatchedEmployer, savePreferences, toggleWatchedEmployer } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Voorkeuren" };

export default async function Page() {
  const employers = await getDb().select().from(watchedEmployers).orderBy(watchedEmployers.name);
  const [p] = await getDb().select().from(preferences).orderBy(desc(preferences.updatedAt)).limit(1);
  if (!p) return <p>Voer eerst de seed uit.</p>;
  const notices = preferenceNotices(p);
  return <><div className="page-title"><div><p className="eyebrow">Beheer · afstemming</p><h1>Voorkeuren</h1></div></div>
    {notices.map((notice) => <p className={notice.level === "warning" ? "pref-notice pref-notice-warning" : "pref-notice pref-notice-info"} key={notice.field} role={notice.level === "warning" ? "alert" : undefined}>{notice.message}</p>)}
    <form action={savePreferences} className="panel form">
      <input type="hidden" name="id" value={p.id}/>
      <div className="filters">
        <label>Uren vanaf<input type="number" name="hoursMin" defaultValue={p.hoursMin}/></label>
        <label>Uren tot<input type="number" name="hoursMax" defaultValue={p.hoursMax}/></label>
        <label>Minimumsalaris (optioneel)<input type="number" name="salaryMin" defaultValue={p.salaryMin ?? ""} placeholder="Leeg = geen ondergrens"/></label>
      </div>
      <label>Primaire steden<input name="primaryCities" defaultValue={p.primaryCities.join(", ")}/></label>
      <label>Secundaire steden<input name="secondaryCities" defaultValue={p.secondaryCities.join(", ")}/></label>
      <div className="filters">
        <label>Vertrekpunt<input name="travelOrigin" defaultValue={p.travelOrigin}/></label>
        <label>Max. reistijd (min.)<input type="number" name="maxTravelMinutes" defaultValue={p.maxTravelMinutes}/></label>
      </div>
      <label>Kandidaatprofiel<textarea name="candidateContext" defaultValue={p.candidateContext} rows={8} required/><small className="muted">Beschrijf ervaring, senioriteit en het soort werk dat inhoudelijk past. Uren, steden en salaris blijven in de aparte velden.</small></label>
      <label>Rolfamilies<textarea name="roleFamilies" defaultValue={p.roleFamilies.join(", ")} rows={3}/></label>
      <label>Positieve indicatoren<textarea name="positiveIndicators" defaultValue={p.positiveIndicators.join(", ")} rows={3}/></label>
      <label>Negatieve indicatoren<textarea name="negativeIndicators" defaultValue={p.negativeIndicators.join(", ")} rows={3}/></label>
      <button>Voorkeuren opslaan</button>
    </form>
    <section className="panel"><h2>Gevolgde werkgevers</h2><p className="muted">Ingeschakelde werkgevers wegen mee in de AI-beoordeling.</p>{employers.map((employer) => <form action={toggleWatchedEmployer} className="inline-form" key={employer.id}><input type="hidden" name="id" value={employer.id}/><input type="hidden" name="enabled" value={String(!employer.enabled)}/><span>{employer.name}</span><button>{employer.enabled ? "Niet meer volgen" : "Weer volgen"}</button></form>)}<form action={addWatchedEmployer} className="inline-form"><label>Werkgever toevoegen<input name="name" required maxLength={200}/></label><button>Toevoegen</button></form></section></>;
}
