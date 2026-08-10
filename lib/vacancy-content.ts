export type VacancyContentBlock =
  | { type: "heading" | "paragraph"; text: string }
  | { type: "list"; items: string[] };

const bulletPattern = /^\s*(?:[-*•–]|\d+[.)])\s+(.+)$/;
const headingPattern = /^(?:[A-ZÀ-Þ][A-ZÀ-Þ0-9 &/\-–]{2,}|[^.!?]{2,60}:)$/;

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
    if (headingPattern.test(trimmed)) { flushParagraph(); blocks.push({ type: "heading", text: trimmed }); }
    else paragraph.push(trimmed);
  }
  flushParagraph(); flushList();
  return blocks;
}

export function vacancyContentText(blocks: VacancyContentBlock[]) {
  return blocks.flatMap((block) => block.type === "list" ? block.items : [block.text]).join("\n");
}
