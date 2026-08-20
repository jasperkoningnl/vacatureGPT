/**
 * De navigatie volgt de funnel: beoordelen → mijn selectie → shortlist. Beheerpagina's staan
 * daar los van, zodat wat je dagelijks doet niet op één hoop ligt met wat je zelden instelt.
 */
export type NavLink = { href: string; label: string };

export const funnelLinks: NavLink[] = [
  { href: "/kalibreren", label: "Beoordelen" },
  { href: "/", label: "Mijn selectie" },
  { href: "/shortlist", label: "Shortlist" },
];

export const manageLinks: NavLink[] = [
  { href: "/vacatures", label: "Alle vacatures" },
  { href: "/voorkeuren", label: "Voorkeuren" },
  { href: "/bronnen", label: "Bronnen" },
];

/** "/" is alleen actief op de homepage zelf; de andere routes ook op hun eigen subpagina's. */
export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
