import { describe, expect, it, vi } from "vitest";
import { calibrationResponse, calibrationSummary, isCalibrationEligible, orderCalibrationBatch, selectCalibrationBatch, type CalibrationCandidate } from "./calibration";

const candidate = (id: number, aiVerdict: CalibrationCandidate["aiVerdict"], employer = `Werkgever ${id}`): CalibrationCandidate => ({ id, aiVerdict, employer, title: `Vacature ${id}`, location: null, hoursMin: null, hoursMax: null, hoursOriginal: null, salaryMin: null, salaryMax: null, salaryOriginal: null, deadline: null, description: null, originalText: "Tekst" });
describe("calibration selection", () => {
  it("only considers active, AI-assessed vacancies without feedback eligible",()=>{expect(isCalibrationEligible({active:true,aiVerdict:"maybe",hasFeedback:false})).toBe(true);expect(isCalibrationEligible({active:false,aiVerdict:"maybe",hasFeedback:false})).toBe(false);expect(isCalibrationEligible({active:true,aiVerdict:null,hasFeedback:false})).toBe(false);expect(isCalibrationEligible({active:true,aiVerdict:"maybe",hasFeedback:true})).toBe(false)});
  it("targets 3 interesting, 1 maybe and 1 not suitable without exposing AI fields", () => {
    const input = [candidate(1,"interesting"),candidate(2,"interesting"),candidate(3,"interesting"),candidate(4,"maybe"),candidate(5,"not_suitable")];
    const batch = selectCalibrationBatch(input, () => .5);
    expect(batch).toHaveLength(5); expect(batch.map(x => x.id).sort()).toEqual([1,2,3,4,5]); expect(batch.every(x => !("aiVerdict" in x) && !("aiScore" in x))).toBe(true);
  });
  it("fills a bucket shortage and never duplicates a vacancy", () => {
    const input = [candidate(1,"interesting"),candidate(2,"maybe"),candidate(3,"maybe"),candidate(4,"not_suitable"),candidate(5,"not_suitable"),candidate(6,"not_suitable")];
    const ids = selectCalibrationBatch(input, () => .4).map(x => x.id);
    expect(ids).toHaveLength(5); expect(new Set(ids).size).toBe(5);
  });
  it("prefers different employers where practical", () => {
    const batch = selectCalibrationBatch([candidate(1,"interesting","A"),candidate(2,"interesting","A"),candidate(3,"interesting","B"),candidate(4,"maybe","C"),candidate(5,"not_suitable","D"),candidate(6,"interesting","E")], () => .5);
    expect(new Set(batch.map(x => x.employer)).size).toBe(5);
  });
  it("keeps the same URL-defined batch stable and ordered", () => {
    const rows = [candidate(3, "maybe"), candidate(1, "interesting"), candidate(2, "not_suitable")];
    expect(orderCalibrationBatch(rows, [2, 3, 1]).map((row) => row.id)).toEqual([2, 3, 1]);
  });
});
describe("batch summary", () => { it("calculates agreement and verdict breakdown", () => {
  expect(calibrationSummary([{userVerdict:"interesting",aiVerdict:"interesting"},{userVerdict:"maybe",aiVerdict:"interesting"}])).toEqual({total:2,agreed:1,differed:1,agreementPercentage:50,breakdown:{interesting:1,maybe:1,not_suitable:0}});
}); });
it("does not import or call OpenAI", () => { expect(vi.isMockFunction(selectCalibrationBatch)).toBe(false); });

describe("calibration vote persistence", () => {
  it("returns the verdict persisted by the database after a racing submission", () => {
    expect(calibrationResponse({ verdict: "interesting" as const, score: 80 }, "maybe")).toMatchObject({ userVerdict: "maybe", agreed: false });
  });
});
