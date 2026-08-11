import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { VacancyContent } from "@/app/components/vacancy-content";
import { getDb } from "@/lib/db";
import { vacancies } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Full text for blind calibration. Deliberately does not query or render AI assessments. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vacancyId = Number(id);
  if (!Number.isSafeInteger(vacancyId)) notFound();
  const [vacancy] = await getDb().select({
    id: vacancies.id,
    title: vacancies.title,
    employer: vacancies.employer,
    originalText: vacancies.originalText,
  }).from(vacancies).where(and(eq(vacancies.id, vacancyId), eq(vacancies.active, true))).limit(1);
  if (!vacancy) notFound();

  return <><p><Link href="/kalibreren">← Terug naar blind beoordelen</Link></p><section className="panel stack">
    <p className="eyebrow">Volledige vacaturetekst</p><h1>{vacancy.title}</h1><p className="lead">{vacancy.employer}</p>
    <VacancyContent text={vacancy.originalText}/>
  </section></>;
}
