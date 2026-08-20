"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { funnelLinks, isActivePath, manageLinks } from "@/lib/site-navigation";

function NavLink({ href, label, className }: { href: string; label: string; className?: string }) {
  const pathname = usePathname() ?? "/";
  const active = isActivePath(pathname, href);
  return <Link href={href} className={[className, active ? "nav-active" : undefined].filter(Boolean).join(" ") || undefined} aria-current={active ? "page" : undefined}>{label}</Link>;
}

/** Elke actieve pagina is zowel visueel als voor een schermlezer herkenbaar. */
export function SiteNav() {
  return <nav className="shell site-nav" aria-label="Hoofdnavigatie">
    <Link className="brand" href="/">VacatureGPT</Link>
    <div className="nav-group nav-funnel">
      {funnelLinks.map(({ href, label }) => <NavLink key={href} href={href} label={label} className={href === "/kalibreren" ? "nav-primary" : undefined}/>)}
    </div>
    <div className="nav-group nav-manage">
      <span className="nav-group-label" aria-hidden="true">Beheer</span>
      {manageLinks.map(({ href, label }) => <NavLink key={href} href={href} label={label} className="nav-secondary"/>)}
    </div>
  </nav>;
}
