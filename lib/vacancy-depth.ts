/**
 * Niet elke vacature in de database is een volledige vacaturetekst. Discovery-feeds leveren
 * postings aan waarvan alleen metadata bekend is (titel, werkgever, plaats, uren, salaris,
 * datum, bron). Een oordeel op zulke regels is per definitie minder betrouwbaar dan een
 * oordeel op de echte vacaturetekst, en dat verschil hoort overal expliciet te zijn:
 * in de prompt, in het oordeel, in de UI en in de leerloop.
 */
export type VacancyContentDepth = "full" | "metadata_only";

/**
 * Een metadata-only posting levert hooguit acht korte regels op (in de praktijk 80–250 tekens);
 * een geparste vacaturetekst is een veelvoud daarvan. De grens ligt bewust ruim boven het eerste
 * en ruim onder het tweede, en classificeert bij twijfel als metadata-only.
 */
export const MIN_FULL_VACANCY_TEXT = 400;

export function contentDepthForLength(length: number): VacancyContentDepth {
  return length >= MIN_FULL_VACANCY_TEXT ? "full" : "metadata_only";
}

export function vacancyContentDepth(vacancy: { originalText: string | null | undefined }): VacancyContentDepth {
  return contentDepthForLength((vacancy.originalText ?? "").trim().length);
}

export function isMetadataOnly(vacancy: { originalText: string | null | undefined }): boolean {
  return vacancyContentDepth(vacancy) === "metadata_only";
}

export const METADATA_ONLY_BADGE = "Beperkte betrouwbaarheid";
export const METADATA_ONLY_ASSESSMENT_NOTICE = "Van deze vacature is geen volledige vacaturetekst beschikbaar. De AI beoordeelde alleen de metadata uit de feed, dus dit oordeel is voorlopig en nooit “Interessant”.";
export const METADATA_ONLY_TEXT_NOTICE = "Alleen de metadata uit de discovery-feed is bekend; de vacaturepagina van de werkgever kon niet worden opgehaald. Lees de originele vacature voor het volledige verhaal.";
