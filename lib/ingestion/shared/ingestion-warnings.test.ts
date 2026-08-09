import { describe, expect, it } from "vitest";
import { categoryLabel, createIngestionWarning, parseIngestionWarning, runStatusForWarnings, sourceHealth } from "./ingestion-warnings";

describe("ingestion warnings", () => {
  it.each(["info", "warning", "critical"] as const)("formatteert en parseert %s", (severity) => {
    const stored = createIngestionWarning({ severity, category: "fetch", message: "Concrete melding.", url: "https://example.nl/vacature/1?a=b" });
    expect(parseIngestionWarning(stored)).toEqual({ severity, category: "fetch", message: "Concrete melding.", url: "https://example.nl/vacature/1?a=b" });
    expect(categoryLabel("fetch")).toBe("Vacature kon niet worden opgehaald");
  });
  it("leest een legacy string als waarschuwing", () => expect(parseIngestionWarning("Oude parsermelding")).toEqual({ severity: "warning", category: "other", message: "Oude parsermelding" }));
  it("bepaalt de runstatus op de hoogste ernst", () => {
    const info = createIngestionWarning({ severity: "info", category: "other", message: "Veilige fallback" });
    const warning = createIngestionWarning({ severity: "warning", category: "other", message: "Iets overgeslagen" });
    const critical = createIngestionWarning({ severity: "critical", category: "batch", message: "Batch onbetrouwbaar" });
    expect(runStatusForWarnings([info])).toBe("success");
    expect(runStatusForWarnings([info, warning])).toBe("warning");
    expect(runStatusForWarnings([critical])).toBe("error");
  });
  it.each([[['success', 'success'], 'Goed'], [['success', 'warning'], 'Aandacht'], [['warning', 'error'], 'Probleem']] as const)("aggregeert bronstatussen", (statuses, expected) => expect(sourceHealth([...statuses])).toBe(expected));
});
