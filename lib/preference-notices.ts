/**
 * De voorkeurenpagina toonde permanent een waarschuwing over een ontbrekend minimumsalaris,
 * terwijl "niet ingevuld" een normale toestand is: de prompt behandelt onbekend salaris
 * bewust als onbekend en niet als negatief. Een waarschuwing hoort alleen te verschijnen als
 * de opgeslagen voorkeur er echt aanleiding toe geeft. Er wordt nergens een salarisbedrag
 * verzonnen: wat niet is opgeslagen, blijft leeg.
 */
export type NoticeLevel = "warning" | "info";
export type PreferenceNotice = { level: NoticeLevel; field: "salaryMin" | "hours"; message: string };

export type PreferenceState = { hoursMin: number; hoursMax: number; salaryMin: number | null };

export function preferenceNotices(preferences: PreferenceState): PreferenceNotice[] {
  const notices: PreferenceNotice[] = [];
  if (preferences.salaryMin === null) {
    notices.push({ level: "info", field: "salaryMin", message: "Minimumsalaris is niet ingesteld. Vacatures zonder salaris blijven als onbekend getoond en worden niet negatief beoordeeld." });
  } else if (preferences.salaryMin <= 0) {
    notices.push({ level: "warning", field: "salaryMin", message: "Minimumsalaris moet groter zijn dan nul. Vul een echt bedrag in of laat het veld leeg." });
  }
  if (preferences.hoursMin > preferences.hoursMax) {
    notices.push({ level: "warning", field: "hours", message: "Uren vanaf is hoger dan uren tot. Zo past geen enkele vacature binnen je urenbereik." });
  }
  return notices;
}

export function hasWarning(notices: PreferenceNotice[]) {
  return notices.some((notice) => notice.level === "warning");
}
