import { describe, expect, it } from "vitest"; import { formatDate, formatDateTime } from "./date-format";
describe("user-facing dates",()=>{it("always uses the Europe/Amsterdam calendar day",()=>expect(formatDate("2026-08-20T22:30:00Z")).toBe("21 augustus 2026"));it("formats Amsterdam local time",()=>expect(formatDateTime("2026-01-20T23:30:00Z")).toBe("21 januari 2026 om 00:30"));});
