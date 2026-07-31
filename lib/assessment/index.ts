export type Assessment = { score: number; summary: string; indicators: string[] };
export interface AssessmentProvider { assess(input: { title: string; description: string }): Promise<Assessment>; }
export class MockAssessmentProvider implements AssessmentProvider { async assess() { return { score: 0, summary: "Nog niet beoordeeld", indicators: [] }; } }
