import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { feedbackDecisions, reasonIsRequired } from "./feedback-validation";
import { REVIEW_IDS_LIMIT, decisionConfirmation, parseVacancyIds, reviewActions, reviewSummary, shortlistsOnDecision } from "./review-queue";

describe("één handeling per vacature in de beoordeelrij", () => {
  it("biedt precies de drie oordelen uit het gedeelde feedbackcontract", () => {
    expect(reviewActions.map(({ value }) => value)).toEqual([...feedbackDecisions]);
    expect(reviewActions.map(({ label }) => label)).toEqual(["Op shortlist", "Bewaren voor later", "Niet passend"]);
  });

  it("laat alleen 'interessant' de shortlist raken", () => {
    expect(shortlistsOnDecision("interesting")).toBe(true);
    expect(shortlistsOnDecision("maybe")).toBe(false);
    expect(shortlistsOnDecision("not_suitable")).toBe(false);
  });

  it("bevestigt na elke keuze wat er is gebeurd, in andere woorden per keuze", () => {
    const messages = feedbackDecisions.map(decisionConfirmation);
    expect(new Set(messages).size).toBe(messages.length);
    expect(decisionConfirmation("interesting")).toContain("shortlist");
    expect(decisionConfirmation("not_suitable")).toContain("reden");
  });

  it("telt de ronde per uitkomst", () => {
    const summary = reviewSummary([
      { vacancyId: 1, value: "interesting" }, { vacancyId: 2, value: "not_suitable" }, { vacancyId: 3, value: "interesting" },
    ]);
    expect(summary).toMatchObject({ total: 3, shortlisted: 2 });
    expect(summary.breakdown).toEqual({ interesting: 2, maybe: 0, not_suitable: 1 });
    expect(reviewSummary([])).toMatchObject({ total: 0, shortlisted: 0 });
  });
});

describe("een reden is verplicht zodra je van de AI afwijkt", () => {
  it("gebruikt dezelfde regel als de detailpagina, ook wanneer de AI kansrijk zei", () => {
    expect(reasonIsRequired("interesting", "maybe")).toBe(true);
    expect(reasonIsRequired("interesting", "interesting")).toBe(false);
    expect(reasonIsRequired("not_suitable", "maybe")).toBe(true);
    expect(reasonIsRequired("maybe", "maybe")).toBe(false);
  });

  it("vraagt de reden vóór het opslaan in plaats van erna", () => {
    const queue = readFileSync("app/beoordelen/review-queue.tsx", "utf8");
    expect(queue).toContain("if (reasonIsRequired(value, item.assessment?.verdict ?? null)) { setChoice(value); return; }");
    expect(queue.indexOf("setChoice(value); return;")).toBeLessThan(queue.indexOf("save(value);"));
    expect(queue).toContain("if (!reason) { setError(REASON_REQUIRED_MESSAGE); return; }");
    expect(queue).toContain('if (reason === "other" && !note.trim()) { setError(NOTE_REQUIRED_MESSAGE); return; }');
  });
});

describe("een zelfgekozen setje vacatures beoordelen", () => {
  it("accepteert een nette lijst en ontdubbelt hem", () => {
    expect(parseVacancyIds("3,1,3,2")).toEqual([3, 1, 2]);
    expect(parseVacancyIds(["7"])).toEqual([7]);
  });

  it("valt terug op geen selectie in plaats van een fout", () => {
    for (const value of [undefined, "", "  ", "abc", "1,abc", "0", "-4", "1.5", Array.from({ length: REVIEW_IDS_LIMIT + 1 }, (_, index) => index + 1).join(",")]) {
      expect(parseVacancyIds(value as string | undefined)).toEqual([]);
    }
  });
});

describe("de rij is een momentopname van één ronde", () => {
  const queue = readFileSync("app/beoordelen/review-queue.tsx", "utf8");
  const actions = readFileSync("app/actions.ts", "utf8");

  it("bevriest de rij bij het openen, zodat een opgeslagen oordeel niets laat opschuiven", () => {
    expect(queue).toContain("const [queue] = useState(items);");
    expect(queue).not.toContain("items[index]");
  });

  it("verse data pas bij een nieuwe ronde: de beoordeelroute wordt niet gerevalideerd", () => {
    expect(actions).toContain('function refreshFunnelRoutes(vacancyId:number){revalidatePath(`/vacatures/${vacancyId}`);revalidatePath("/");revalidatePath("/vacatures");}');
    expect(actions).not.toContain('revalidatePath("/beoordelen")');
    expect(readFileSync("app/beoordelen/page.tsx", "utf8")).toContain('export const dynamic = "force-dynamic"');
  });

  it("legt oordeel en shortlist in één handeling vast", () => {
    expect(actions).toContain("const shortlisted=shortlistsOnDecision(stored.value);");
    expect(actions).toContain("if(shortlisted)await upsertTracking(x.vacancyId,{shortlistedAt:new Date()});");
    expect(actions.indexOf("await storeFeedback(getDb(),x)")).toBeLessThan(actions.indexOf("const shortlisted=shortlistsOnDecision"));
  });
});
