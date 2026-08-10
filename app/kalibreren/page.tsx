import { getCalibrationBatch } from "@/lib/calibration-data";
import CalibrationFlow from "./calibration-flow";
export const dynamic = "force-dynamic";
export default async function Page() { return <CalibrationFlow vacancies={await getCalibrationBatch()}/>; }
