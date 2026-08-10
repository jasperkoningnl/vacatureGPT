import { formatVacancyContent } from "@/lib/vacancy-content";

export function VacancyContent({ text, bounded = false }: { text: string; bounded?: boolean }) {
  return <div className={`vacancy-content${bounded ? " vacancy-content-bounded" : ""}`}>
    {formatVacancyContent(text).map((block, index) => {
      if (block.type === "heading") return <h3 key={index}>{block.text}</h3>;
      if (block.type === "list") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
      return <p key={index}>{block.text}</p>;
    })}
  </div>;
}
