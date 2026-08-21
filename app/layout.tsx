import "./globals.css";
import { SiteNav } from "./components/site-nav";

export const metadata = {
  title: { default: "Deze week · VacatureGPT", template: "%s · VacatureGPT" },
  description: "Persoonlijke vacaturezoeker",
  applicationName: "VacatureGPT",
  robots: { index: false, follow: false },
};
export const viewport = { width: "device-width", initialScale: 1, themeColor: [
  { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
  { media: "(prefers-color-scheme: dark)", color: "#17201c" },
] };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="nl"><body>
    <a className="skip-link" href="#hoofdinhoud">Naar de hoofdinhoud</a>
    <header className="site-header"><SiteNav/></header>
    <main className="shell" id="hoofdinhoud" tabIndex={-1}>{children}</main>
  </body></html>;
}
