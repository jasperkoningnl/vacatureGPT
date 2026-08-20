import "./globals.css";
import { SiteNav } from "./components/site-nav";

export const metadata = { title: "VacatureGPT", description: "Persoonlijke vacaturezoeker", robots: { index: false, follow: false } };
export const viewport = { themeColor: "#205c43" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="nl"><body>
    <a className="skip-link" href="#hoofdinhoud">Naar de hoofdinhoud</a>
    <header className="site-header"><SiteNav/></header>
    <main className="shell" id="hoofdinhoud" tabIndex={-1}>{children}</main>
  </body></html>;
}
