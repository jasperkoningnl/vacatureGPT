import { formatDate } from "@/lib/date-format";
import { METADATA_ONLY_ASSESSMENT_NOTICE, METADATA_ONLY_BADGE } from "@/lib/vacancy-depth";

export type VacancyDetailData = {
  id: number; title: string; employer: string; active?: boolean;
  location: string | null; hoursMin: number | null; hoursMax: number | null; hoursOriginal: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryOriginal: string | null;
  salaryPeriod?: string | null; salaryBasisHours?: number | null; deadline: Date | string | null; originalText: string;
};
export type AssessmentData = { verdict: "interesting" | "maybe" | "not_suitable"; score: number; summary: string; positives: string[]; concerns: string[] };

export const verdictLabels = { interesting: "Interessant", maybe: "Misschien", not_suitable: "Niet passend" } as const;

const currency = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function salaryText(vacancy: VacancyDetailData) {
  if (!vacancy.salaryMin) return vacancy.salaryOriginal || "Niet vermeld";
  const range = vacancy.salaryMax && vacancy.salaryMax !== vacancy.salaryMin ? `${currency.format(vacancy.salaryMin)} – ${currency.format(vacancy.salaryMax)}` : currency.format(vacancy.salaryMin);
  const details = [vacancy.salaryPeriod, vacancy.salaryBasisHours ? `op basis van ${vacancy.salaryBasisHours} uur` : null].filter(Boolean).join(", ");
  return details ? `${range} (${details})` : range;
}

export function hoursText(vacancy: Pick<VacancyDetailData, "hoursMin" | "hoursMax" | "hoursOriginal">) {
  if (vacancy.hoursMin) return `${vacancy.hoursMin}${vacancy.hoursMax && vacancy.hoursMax !== vacancy.hoursMin ? `–${vacancy.hoursMax}` : ""} uur`;
  return vacancy.hoursOriginal || "Niet vermeld";
}

/** Eén feitenblok, overal met dezelfde volgorde en dezelfde formuleringen bij ontbrekende data. */
export function VacancyFacts({ vacancy, className = "detail-metadata panel" }: { vacancy: VacancyDetailData; className?: string }) {
  return <dl className={className}>
    <div><dt>Locatie</dt><dd>{vacancy.location || "Niet vermeld"}</dd></div>
    <div><dt>Uren</dt><dd>{hoursText(vacancy)}</dd></div>
    <div><dt>Salaris</dt><dd>{salaryText(vacancy)}</dd></div>
    <div><dt>Deadline</dt><dd>{vacancy.deadline ? formatDate(vacancy.deadline) : "Niet vermeld"}</dd></div>
  </dl>;
}

/** Dezelfde waarschuwing bij een oordeel dat alleen op feed-metadata rust, waar dat oordeel ook staat. */
export function MetadataOnlyNotice() {
  return <p className="depth-notice" role="note"><strong>{METADATA_ONLY_BADGE}.</strong> {METADATA_ONLY_ASSESSMENT_NOTICE}</p>;
}

/** Het AI-advies zelf, zonder omhulsel: de detailpagina en de beoordeelrij zetten er hun eigen kop omheen. */
export function AiAssessmentBody({ assessment }: { assessment: AssessmentData }) {
  return <>
    <div className={`ai-verdict ai-verdict-${assessment.verdict}`}><strong>{verdictLabels[assessment.verdict]}</strong><span>{assessment.score}/100</span></div>
    <p className="ai-summary">{assessment.summary}</p>
    <div className="ai-points">
      <div><h3>Pluspunten</h3>{assessment.positives.length ? <ul>{assessment.positives.map(item => <li key={item}>{item}</li>)}</ul> : <p className="muted">Geen pluspunten vermeld.</p>}</div>
      <div><h3>Aandachtspunten</h3>{assessment.concerns.length ? <ul>{assessment.concerns.map(item => <li key={item}>{item}</li>)}</ul> : <p className="muted">Geen aandachtspunten vermeld.</p>}</div>
    </div>
  </>;
}
