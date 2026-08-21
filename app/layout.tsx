import "./globals.css";
import { SiteNav } from "./components/site-nav";
import { brand } from "@/lib/brand";

export const metadata = {
  title: { default: "Deze week · VacatureGPT", template: "%s · VacatureGPT" },
  description: "Persoonlijke vacaturezoeker",
  applicationName: "VacatureGPT",
  robots: { index: false, follow: false },
};
/** De browserchrome krijgt dezelfde papierkleur als de pagina, in beide standen. */
export const viewport = { width: "device-width", initialScale: 1, themeColor: [
  { media: "(prefers-color-scheme: light)", color: brand.light.paper },
  { media: "(prefers-color-scheme: dark)", color: brand.dark.paper },
] };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="nl"><body>
    <a className="skip-link" href="#hoofdinhoud">Naar de hoofdinhoud</a>
    <header className="site-header"><SiteNav/></header>
    <main className="shell" id="hoofdinhoud" tabIndex={-1}>{children}</main>
  </body></html>;
}
