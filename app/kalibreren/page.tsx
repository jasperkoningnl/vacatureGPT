import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCalibrationBatch, getCalibrationBatchByIds } from "@/lib/calibration-data";
import CalibrationFlow from "./calibration-flow";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blinde test" };
const parseBatch = (value: string | undefined) => {
  if (!value) return null;
  const ids = value.split(",").map(Number);
  return ids.length > 0 && ids.length <= 5 && ids.every(Number.isSafeInteger) && new Set(ids).size === ids.length ? ids : null;
};
export default async function Page({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const ids = parseBatch((await searchParams).batch);
  if (!ids) {
    const batch = await getCalibrationBatch();
    if (batch.length) redirect(`/kalibreren?batch=${batch.map(({ id }) => id).join(",")}`);
    return <CalibrationFlow vacancies={[]}/>;
  }
  return <CalibrationFlow vacancies={await getCalibrationBatchByIds(ids)}/>;
}
