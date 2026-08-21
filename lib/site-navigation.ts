/**
 * De navigatie volgt de weekroutine: deze week → beoordelen → shortlist → bladeren. Wat je zelden
 * aanraakt — de blinde test, je voorkeuren en de bronnen — staat daar los van in een tweede,
 * rustiger groep, zodat de dagelijkse handeling niet op één hoop ligt met beheer.
 */
export type NavLink = { href: string; label: string };

export const funnelLinks: NavLink[] = [
  { href: "/", label: "Deze week" },
  { href: "/beoordelen", label: "Beoordelen" },
  { href: "/shortlist", label: "Shortlist" },
  { href: "/vacatures", label: "Alle vacatures" },
];

export const manageLinks: NavLink[] = [
  { href: "/kalibreren", label: "Blinde test" },
  { href: "/voorkeuren", label: "Voorkeuren" },
  { href: "/bronnen", label: "Bronnen" },
];

/** De route waar elke oproep tot actie op uitkomt: mail, homepage en lijst wijzen allemaal hierheen. */
export const REVIEW_ROUTE = "/beoordelen";

/** "/" is alleen actief op de homepage zelf; de andere routes ook op hun eigen subpagina's. */
export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
