/**
 * Eén woordenlijst voor de funnel. "Te beoordelen" betekende op de homepage, in de metrics en in
 * de filters drie verschillende populaties; die term is daarom overal vervangen door de drie
 * begrippen die echt van elkaar verschillen. Elk begrip heeft precies één label, dat overal wordt
 * gebruikt, zodat twee tellingen nooit hetzelfde lijken te betekenen terwijl ze iets anders tellen.
 */
export const funnelTerms = {
  /** Actief, door mij nog niet beoordeeld — ongeacht wat de AI ervan vindt. */
  unreviewed: {
    label: "Nog niet beoordeeld",
    description: "Actieve vacatures waar jij nog geen oordeel over hebt gegeven, ongeacht het AI-oordeel.",
  },
  /** Nog niet beoordeeld én door de AI als interessant of misschien gemarkeerd. */
  promising: {
    label: "Kansrijk volgens AI",
    description: "Nog niet beoordeelde vacatures die de AI als interessant of misschien inschat.",
  },
  /** De vijf vacatures van één blinde ronde; bewust ook uit de niet-kansrijke kant. */
  calibrationBatch: {
    label: "Kalibratiebatch van 5",
    description: "Vijf nog niet beoordeelde vacatures, bewust ook uit de niet-kansrijke kant, zodat de AI op beide kanten ijkt.",
  },
  /** Door mij als interessant beoordeeld. */
  suitable: {
    label: "Geschikt bevonden",
    description: "Actieve vacatures die jij als interessant hebt beoordeeld.",
  },
  /** Door mij als niet passend beoordeeld; standaard weggelegd. */
  rejected: {
    label: "Afgewezen",
    description: "Vacatures die jij als niet passend hebt beoordeeld. Ze blijven bewaard, maar staan standaard niet in de lijst.",
  },
} as const;

export type FunnelTerm = keyof typeof funnelTerms;

export const CALIBRATION_BATCH_SIZE = 5;
