/**
 * Als de salarisparser geen bedrag kon herleiden, blijft de ruwe brontekst over. Dat is soms één
 * nette zin en soms een halve alinea met kopregels erin — en die hoort niet ongefilterd in een
 * feitenblok dat verder uit korte waarden bestaat. Hier wordt hij ingekort tot de zin die het
 * bedrag draagt. Er wordt niets afgeleid of afgerond: wat er staat, staat er, alleen korter.
 */
export const SALARY_FIELD_LIMIT = 90;

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

/** Knipt op de laatste woordgrens vóór de limiet, zodat er nooit een half woord overblijft. */
function truncate(value: string, limit = SALARY_FIELD_LIMIT) {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).replace(/[,;:.\s]+$/, "")}…`;
}

export function compactSalaryOriginal(original: string | null | undefined): string | null {
  const text = collapse(original ?? "");
  if (!text) return null;
  if (text.length <= SALARY_FIELD_LIMIT) return text;

  // Een voorloop tussen haakjes is bijna altijd de meta-regel van de vacature, niet het salaris zelf.
  // Eén niveau nesting telt mee, want die regel bevat zelf vaak nog "(36 uur)".
  const withoutLead = collapse(text.replace(/^\((?:[^()]|\([^()]*\))*\)\s*/, ""));
  const candidate = withoutLead.includes("€") ? withoutLead : text;

  // De eerste zin met een bedrag erin zegt wat je wilt weten; de rest staat in de vacaturetekst.
  const sentence = candidate.split(/(?<=[.!?])\s+/).find((part) => part.includes("€")) ?? candidate;
  return truncate(collapse(sentence));
}
