export type VacancyContentBlock =
  | { type: "heading" | "paragraph"; text: string }
  | { type: "list"; items: string[] };

const bulletPattern = /^\s*(?:[-*•–]|\d+[.)])\s+(.+)$/;
const headingPattern = /^(?:[A-ZÀ-Þ][A-ZÀ-Þ0-9 &/\-–]{2,}|[^.!?]{2,60}:)$/;

/**
 * Vrijwel elke bron levert de vacaturetekst als één platgeslagen regel aan: de parsers halen de
 * HTML door `\s+ → " "` heen, waardoor alinea's, koppen en opsommingen verdwijnen vóór er iets is
 * opgeslagen. Een muur van drieduizend tekens is onleesbaar, dus wordt de structuur bij het tonen
 * teruggewonnen. Dat gebeurt uitsluitend op basis van wat er staat — er wordt geen woord
 * toegevoegd, weggelaten of herschreven; er komen alleen alinea- en kopgrenzen bij.
 */

/**
 * Kopjes die in Nederlandse vacatureteksten telkens terugkomen, langste eerst zodat die wint.
 * Er wordt alleen geknipt wanneer er een hoofdletter achteraan komt, en dat maakt werkwoordelijke
 * kopjes veilig: "Wij bieden een uitdagende functie" gaat verder met een kleine letter en blijft
 * dus één zin, terwijl "Wij bieden Een brutomaandsalaris van" alleen zo kan lezen doordat er een
 * kopgrens is weggevallen. Korte naamwoordelijke groepen als "Het team" of "De functie" staan hier
 * bewust niet in: daar volgt vaak een eigennaam ("Het team Regie speelt daarin een cruciale rol"),
 * en een verkeerd geplaatste kop is erger dan een gemiste.
 */
const sectionHeadings = [
  "Herken jij jezelf hierin", "Wat wij van jou vragen", "Leuk kennis te maken", "Over de organisatie",
  "Wat wij jou bieden", "Functieomschrijving", "Arbeidsvoorwaarden", "Over de functie",
  "Wat je gaat doen", "Wat ga jij doen", "Wat ga je doen", "Wat neem je mee",
  "Wat wij vragen", "Wat we vragen", "Wat vragen wij", "Wat wij bieden", "Wat we bieden",
  "Wat bieden wij", "Wat je krijgt", "Wat wij je bieden", "Wij bieden jou",
  "Wie zoeken wij", "Wie wij zoeken", "Wie ben jij", "Jouw profiel", "Je profiel",
  "Functie-eisen", "Het aanbod", "Ons aanbod", "Wij bieden", "Over ons",
  "Solliciteren", "Meer weten", "Enthousiast", "Interesse", "Contact",
].sort((a, b) => b.length - a.length);

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
const knownHeadings = new Set(sectionHeadings.map((heading) => heading.toLocaleLowerCase("nl")));

/** Een losse regel is ook een kop als het een bekende sectie is; niet elke kop schreeuwt of eindigt op een dubbele punt. */
function isHeadingLine(line: string) {
  return headingPattern.test(line) || knownHeadings.has(line.replace(/[:.]$/, "").trim().toLocaleLowerCase("nl"));
}
/** Een kop telt alleen als kop wanneer er een nieuwe zin achteraan komt; anders is het gewone tekst. */
const sectionHeadingPattern = new RegExp(`\\b(${sectionHeadings.map(escape).join("|")})\\b[:.]?(?=\\s+[A-ZÀ-Þ0-9(“"'])`, "g");

/** Een alinea die zo lang is, is nooit zo geschreven; die komt uit een platgeslagen bron. */
const FLATTENED_PARAGRAPH = 600;
/** Streeflengte van een teruggewonnen alinea: lang genoeg om samen te horen, kort genoeg om te lezen. */
const PARAGRAPH_TARGET = 320;
/** Een resterend staartje korter dan dit hoort bij de vorige alinea, niet als losse weesregel. */
const ORPHAN_TAIL = 80;

/**
 * Splitst op zinseinden zonder ooit een teken te verliezen: elk stuk is een `slice` van de bron,
 * en samengevoegd leveren ze exact de invoer weer op. Een punt telt alleen als zinseinde wanneer
 * er een hoofdletter achteraan komt, zodat "salaris max. € 7.491" heel blijft.
 */
function sentences(text: string) {
  const parts: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]+(?=\s+[A-ZÀ-Þ])/g)) {
    const end = match.index + match[0].length;
    parts.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) parts.push(text.slice(start));
  return parts;
}

/** Knipt een lange lap tekst op zinsgrenzen in alinea's van leesbare lengte. */
function paragraphsFrom(text: string): VacancyContentBlock[] {
  const collected: string[] = [];
  let current = "";
  for (const sentence of sentences(text).map((value) => value.trim()).filter(Boolean)) {
    current = current ? `${current} ${sentence}` : sentence;
    if (current.length >= PARAGRAPH_TARGET) { collected.push(current); current = ""; }
  }
  if (current) {
    if (current.length < ORPHAN_TAIL && collected.length) collected[collected.length - 1] += ` ${current}`;
    else collected.push(current);
  }
  return collected.map((value) => ({ type: "paragraph", text: value }));
}

function recoverStructure(text: string): VacancyContentBlock[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const blocks: VacancyContentBlock[] = [];
  let cursor = 0;
  for (const match of flat.matchAll(sectionHeadingPattern)) {
    const before = flat.slice(cursor, match.index).trim();
    if (before) blocks.push(...paragraphsFrom(before));
    blocks.push({ type: "heading", text: match[1] });
    cursor = match.index + match[0].length;
  }
  const rest = flat.slice(cursor).trim();
  if (rest) blocks.push(...paragraphsFrom(rest));
  return blocks;
}

/** Turns source-authored whitespace and simple list markers into display blocks without rewriting it. */
export function formatVacancyContent(source: string): VacancyContentBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: VacancyContentBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: "list", items: list });
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushParagraph(); flushList(); continue; }
    const bullet = trimmed.match(bulletPattern);
    if (bullet) { flushParagraph(); list.push(bullet[1]); continue; }
    flushList();
    if (isHeadingLine(trimmed)) { flushParagraph(); blocks.push({ type: "heading", text: trimmed }); }
    else paragraph.push(trimmed);
  }
  flushParagraph(); flushList();
  // Tekst die de bron wél gestructureerd aanleverde blijft ongemoeid; alleen platgeslagen lappen niet.
  return blocks.flatMap((block) => block.type === "paragraph" && block.text.length > FLATTENED_PARAGRAPH ? recoverStructure(block.text) : [block]);
}

export function vacancyContentText(blocks: VacancyContentBlock[]) {
  return blocks.flatMap((block) => block.type === "list" ? block.items : [block.text]).join("\n");
}
