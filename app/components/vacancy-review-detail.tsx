import Link from "next/link";
import type { ReactNode } from "react";
import { METADATA_ONLY_TEXT_NOTICE, isMetadataOnly } from "@/lib/vacancy-depth";
import { VacancyContent } from "./vacancy-content";
import { AiAssessmentBody, MetadataOnlyNotice, VacancyFacts, type AssessmentData, type VacancyDetailData } from "./vacancy-parts";

export type { AssessmentData, VacancyDetailData };

export function VacancyReviewDetail({ vacancy, review, assessment, concealAssessment = false, sourceUrl, sourceName, backLink, tracking }: {
  vacancy: VacancyDetailData; review: ReactNode; assessment?: AssessmentData | null; concealAssessment?: boolean;
  sourceUrl?: string | null; sourceName?: string | null; backLink?: { href: string; label: string }; tracking?: ReactNode;
}) {
  // Een vacature zonder volledige tekst wordt overal als zodanig gemarkeerd, ook wanneer de AI-beoordeling nog verborgen is.
  const metadataOnly = isMetadataOnly(vacancy);
  return <article className="vacancy-detail">
    <header className="vacancy-detail-header">
      {backLink && <Link className="back-link" href={backLink.href}>← {backLink.label}</Link>}
      {vacancy.active === false && <div className="inactive-notice" role="status">Deze vacature is niet meer actief. De informatie hieronder kan verouderd zijn.</div>}
      <h1>{vacancy.title}</h1><p className="vacancy-employer">{vacancy.employer}</p>
    </header>
    <section className="review-section panel" aria-labelledby="my-review-title">
      <p className="eyebrow">Jouw eigen oordeel</p><h2 id="my-review-title">Mijn beoordeling</h2>
      <p className="section-intro">Leg vast of deze vacature bij je past. Dit oordeel helpt ook om toekomstige AI-beoordelingen beter af te stemmen.</p>
      {review}
    </section>
    {tracking && <section className="tracking-section panel" aria-labelledby="tracking-title">
      <p className="eyebrow">Jouw vervolgstap · los van beoordelingen</p><h2 id="tracking-title">Shortlist &amp; sollicitatie</h2>
      <p className="section-intro">Leg apart vast of je serieus verder wilt met deze vacature en waar je sollicitatie staat.</p>
      {tracking}
    </section>}
    <section className="detail-section" aria-labelledby="details-title">
      <div className="section-heading"><div><p className="eyebrow">In één oogopslag</p><h2 id="details-title">Vacaturegegevens</h2></div>{sourceUrl && <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">Bekijk originele vacature ↗</a>}</div>
      <VacancyFacts vacancy={vacancy}/>{sourceName && <p className="source-name muted">Bron: {sourceName}</p>}
    </section>
    <section className="detail-section ai-assessment panel" aria-labelledby="ai-title">
      <p className="eyebrow">AI-advies · los van jouw beoordeling</p><h2 id="ai-title">AI-beoordeling</h2>
      {metadataOnly && <MetadataOnlyNotice/>}
      {concealAssessment ? <p className="muted">AI-beoordeling wordt zichtbaar nadat je zelf hebt beoordeeld</p> : assessment ? <AiAssessmentBody assessment={assessment}/> : <p className="muted">Voor deze vacature is nog geen AI-beoordeling beschikbaar.</p>}
    </section>
    <section className="vacancy-text-section" aria-labelledby="vacancy-text-title"><p className="eyebrow">{metadataOnly ? "Alleen metadata uit de feed" : "Volledige beschrijving"}</p><h2 id="vacancy-text-title">Vacaturetekst</h2>{metadataOnly && <p className="depth-notice" role="note">{METADATA_ONLY_TEXT_NOTICE}</p>}<VacancyContent text={vacancy.originalText}/></section>
  </article>;
}
