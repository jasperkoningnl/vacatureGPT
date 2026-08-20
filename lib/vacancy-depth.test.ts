import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildCalibrationContext, type CalibrationFeedback } from "./ai/calibration-context";
import { buildAssessmentProfile } from "./ai/profile";
import { assessVacancy, assessmentIsCurrent, ASSESSMENT_CONFIG, verdictForContentDepth } from "./ai/vacancy-assessment";
import { parseDiscoveryFeed } from "./ingestion/discovery-feed";
import { contentDepthForLength, isMetadataOnly, MIN_FULL_VACANCY_TEXT, vacancyContentDepth } from "./vacancy-depth";

const profile = buildAssessmentProfile({ hoursMin: 32, hoursMax: 36, salaryMin: null, primaryCities: [], secondaryCities: [], travelOrigin: "Amersfoort", maxTravelMinutes: 30, roleFamilies: [], positiveIndicators: [], negativeIndicators: [] }, []);
const fullText = "Over de functie. ".repeat(60);
const discoveryFeed = JSON.stringify({ run_date: "2026-08-19", postings: [{ company: "Voorbeeld Organisatie", title: "Communicatieadviseur", location: "Utrecht", remote_policy: "Hybride", hours: "32-36 uur", salary: "€ 4.000 per maand", posted_date: "2026-08-17", source: "linkedin", source_url: "https://linkedin.example/jobs/123", direct_url: "https://jobs.example/vacancy/communicatieadviseur", first_seen: "2026-08-18" }] });
const vacancy = (originalText: string) => ({ title: "Redacteur", employer: "A", location: "Utrecht", hoursMin: null, hoursMax: null, salaryMin: null, salaryMax: null, salaryPeriod: null, deadline: null, description: null, originalText });

describe("vacancy content depth", () => {
  it("separates a metadata-only discovery posting from a full vacancy text", () => {
    const item = parseDiscoveryFeed(discoveryFeed).vacancies[0];
    expect(item.contentDepth).toBe("metadata_only");
    expect(item.description).toBeNull();
    expect(isMetadataOnly(item)).toBe(true);
    expect(vacancyContentDepth({ originalText: fullText })).toBe("full");
  });

  it("classifies at the documented boundary and treats absent text as metadata-only", () => {
    expect(contentDepthForLength(MIN_FULL_VACANCY_TEXT - 1)).toBe("metadata_only");
    expect(contentDepthForLength(MIN_FULL_VACANCY_TEXT)).toBe("full");
    expect(vacancyContentDepth({ originalText: null })).toBe("metadata_only");
  });
});

describe("assessment of a metadata-only vacancy", () => {
  it("tells the model that only metadata is available and never claims vacancy-text knowledge", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: { score: 92, summary: "Beperkte data.", positives: [], concerns: [] }, usage: null });
    const result = await assessVacancy({ parse } as never, vacancy("Redacteur\nA\nUtrecht"), profile);
    expect(parse.mock.calls[0][0].input).toContain('"contentDepth":"metadata_only"');
    expect(parse.mock.calls[0][0].instructions).toContain("metadata_only");
    expect(result.contentDepth).toBe("metadata_only");
  });

  it("never presents a metadata-only judgement as a full Interessant", () => {
    expect(verdictForContentDepth(92, "metadata_only")).toBe("maybe");
    expect(verdictForContentDepth(92, "full")).toBe("interesting");
    expect(verdictForContentDepth(20, "metadata_only")).toBe("not_suitable");
  });

  it("caps the stored verdict of a high-scoring metadata-only assessment", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: { score: 92, summary: "Beperkte data.", positives: [], concerns: [] }, usage: null });
    expect((await assessVacancy({ parse } as never, vacancy("Redacteur\nA\nUtrecht"), profile)).verdict).toBe("maybe");
    parse.mockResolvedValue({ output_parsed: { score: 92, summary: "Volledige tekst.", positives: [], concerns: [] }, usage: null });
    expect((await assessVacancy({ parse } as never, vacancy(fullText), profile)).verdict).toBe("interesting");
  });

  it("reassesses only the metadata-only backlog on an older prompt version", () => {
    const stored = { vacancyContentHash: "v1", profileHash: "p1", promptVersion: "vacancy-fit-v3", model: ASSESSMENT_CONFIG.model };
    expect(assessmentIsCurrent(stored, "v1", "p1", "full")).toBe(true);
    expect(assessmentIsCurrent(stored, "v1", "p1", "metadata_only")).toBe(false);
    expect(assessmentIsCurrent({ ...stored, promptVersion: ASSESSMENT_CONFIG.promptVersion }, "v1", "p1", "metadata_only")).toBe(true);
  });
});

describe("thin judgements stay out of the learning loop", () => {
  const row = (id: number, overrides: Partial<CalibrationFeedback> = {}): CalibrationFeedback => ({
    id, learningEligible: true, aiVerdict: "interesting", userVerdict: "not_suitable", reasonCode: "role", note: null,
    vacancyTitle: `Vacature ${id}`, employer: "Werkgever", contentDepth: "full", updatedAt: new Date(`2026-08-0${id}T12:00:00Z`), ...overrides,
  });

  it("does not count a metadata-only review as an eligible calibration review", () => {
    expect(buildCalibrationContext([row(1), row(2), row(3, { contentDepth: "metadata_only" })])).toBeNull();
    expect(buildCalibrationContext([row(1), row(2), row(3)])?.eligibleReviews).toBe(3);
  });

  it("never uses a metadata-only review as a calibration example", () => {
    const context = buildCalibrationContext([row(1), row(2), row(3), row(4, { contentDepth: "metadata_only", employer: "Dun" })]);
    expect(context?.eligibleReviews).toBe(3);
    expect(context?.recentExamples.map(({ employer }) => employer)).not.toContain("Dun");
  });

  it("determines calibration depth from the live vacancy text in the assessment run", () => {
    const script = readFileSync("scripts/assess-vacancies.ts", "utf8");
    expect(script).toContain("contentDepth: vacancyContentDepth(row)");
    expect(script).toContain("originalText: vacancies.originalText");
  });
});

describe("limited reliability is visible in the interface", () => {
  const shared = readFileSync("app/components/vacancy-review-detail.tsx", "utf8");
  const list = readFileSync("app/vacatures/page.tsx", "utf8");

  it("marks the assessment and the vacancy text on both review routes", () => {
    expect(shared).toContain("isMetadataOnly(vacancy)");
    expect(shared).toContain("METADATA_ONLY_ASSESSMENT_NOTICE");
    expect(shared).toContain("METADATA_ONLY_TEXT_NOTICE");
    expect(shared.indexOf("METADATA_ONLY_ASSESSMENT_NOTICE")).toBeLessThan(shared.indexOf("concealAssessment ?"));
  });

  it("marks a thin vacancy in the list without loading full vacancy texts", () => {
    expect(list).toContain("METADATA_ONLY_BADGE");
    expect(list).toContain("length(btrim(");
    expect(list).not.toContain("originalText: vacancies.originalText");
  });
});
