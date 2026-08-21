import type { Metadata } from "next";
import { getReviewQueue, getReviewQueueByIds } from "@/lib/review-queue-data";
import { parseVacancyIds } from "@/lib/review-queue";
import ReviewQueue from "./review-queue";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beoordelen" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ids = parseVacancyIds((await searchParams).ids);
  if (ids.length) return <ReviewQueue items={await getReviewQueueByIds(ids)} returnTo={{ href: "/vacatures", label: "Terug naar alle vacatures" }}/>;
  return <ReviewQueue items={await getReviewQueue()}/>;
}
