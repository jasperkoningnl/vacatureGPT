import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatVacancyContent, vacancyContentText } from "./vacancy-content";

describe("vacancy content formatting", () => {
  it("recognizes source headings, paragraphs and simple lists", () => {
    expect(formatVacancyContent("Over de functie:\n\nEerste alinea.\n\n- Schrijven\n- Redigeren")).toEqual([
      { type: "heading", text: "Over de functie:" },
      { type: "paragraph", text: "Eerste alinea." },
      { type: "list", items: ["Schrijven", "Redigeren"] },
    ]);
  });
  it("preserves every source phrase instead of rewriting vacancy content", () => {
    const source = "WERKZAAMHEDEN\nSchrijven en redigeren.\n\n• Makers begeleiden";
    expect(vacancyContentText(formatVacancyContent(source))).toBe("WERKZAAMHEDEN\nSchrijven en redigeren.\nMakers begeleiden");
  });
});

describe("vacancy detail source selection", () => {
  it("orders active occurrences ahead of deterministic inactive fallbacks", () => {
    const page = readFileSync("app/vacatures/[id]/page.tsx", "utf8");
    expect(page).toContain("orderBy(desc(vacancyOccurrences.active), desc(vacancyOccurrences.lastSeenAt), asc(vacancyOccurrences.id))");
  });
});

describe("structuur terugwinnen uit een platgeslagen vacaturetekst", () => {
  // Zoals de bronnen hem werkelijk aanleveren: één regel, alle alinea's en koppen eruit gewassen.
  const flat = "Chef Regie NOS Sport Ben jij een inspirerende leider met passie voor sport? Dan is NOS Sport op zoek naar jou! (Hilversum | fulltime (36 uur) | salaris max. € 7.491) Leuk kennis te maken Bij de NOS zit je meteen bij een van de grootste nieuwsorganisaties van Nederland. Via tv, radio, online, socials, podcasts en de NOS-app bereiken we dagelijks miljoenen mensen. De redactie van NOS Sport bestaat uit bijna 200 collega's. Veel gebeurt op locatie, maar ook op de redactie in Hilversum bruist het, zeker in de weekenden. Het team Regie speelt daarin een cruciale rol. Hier komen sportjournalistiek, beeld en techniek samen. Wat je gaat doen Als Chef Regie geef je leiding aan een team van ongeveer 20 regisseurs en regieassistenten. Je bent verantwoordelijk voor de ontwikkeling van je team. Wat wij vragen Je hebt aantoonbare ervaring met leidinggeven in een mediaomgeving. Wij bieden Een brutomaandsalaris tussen € 4.629 en € 7.491 op basis van 36 uur. Solliciteren Stuur je motivatie voor 10 september.";
  const blocks = formatVacancyContent(flat);
  const normalise = (value: string) => value.replace(/\s+/g, " ").trim();

  it("verliest geen enkel teken: samengevoegd is het exact dezelfde tekst", () => {
    expect(normalise(blocks.map((block) => block.type === "list" ? block.items.join(" ") : block.text).join(" "))).toBe(normalise(flat));
    expect(blocks.map((block) => block.type === "paragraph" ? block.text : "").join(" ")).toContain("€ 7.491");
    expect(blocks.map((block) => block.type === "paragraph" ? block.text : "").join(" ")).toContain("€ 4.629");
  });

  it("herkent de secties die er werkelijk staan", () => {
    expect(blocks.flatMap((block) => block.type === "heading" ? [block.text] : []))
      .toEqual(["Leuk kennis te maken", "Wat je gaat doen", "Wat wij vragen", "Wij bieden", "Solliciteren"]);
  });

  it("knipt geen kop uit een lopende zin met een eigennaam erachter", () => {
    expect(blocks.some((block) => block.type === "paragraph" && block.text.includes("Het team Regie"))).toBe(true);
    expect(blocks.some((block) => block.type === "heading" && block.text === "Het team")).toBe(false);
  });

  it("laat 'Wij bieden' midden in een zin met een kleine letter erna met rust", () => {
    const sentence = "Wij bieden een uitdagende functie in een klein team. ".repeat(20);
    expect(formatVacancyContent(sentence).some((block) => block.type === "heading")).toBe(false);
  });

  it("breekt de muur op in leesbare alinea's in plaats van één blok", () => {
    const lengths = blocks.flatMap((block) => block.type === "paragraph" ? [block.text.length] : []);
    expect(lengths.length).toBeGreaterThan(3);
    expect(Math.max(...lengths)).toBeLessThan(600);
  });

  it("laat tekst die de bron wél met alinea's aanleverde ongemoeid", () => {
    const authored = `Over de functie\n\n${"Je werkt aan de redactionele lijn. ".repeat(12)}\n\n- Eerste taak\n- Tweede taak`;
    const result = formatVacancyContent(authored);
    expect(result[0]).toEqual({ type: "heading", text: "Over de functie" });
    expect(result[1].type).toBe("paragraph");
    expect(result.at(-1)).toEqual({ type: "list", items: ["Eerste taak", "Tweede taak"] });
  });
});
