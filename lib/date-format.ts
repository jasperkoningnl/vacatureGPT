const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";
export function formatDate(value: Date | string | number, options: Intl.DateTimeFormatOptions = {}) { return new Intl.DateTimeFormat("nl-NL", { timeZone: AMSTERDAM_TIME_ZONE, day: "numeric", month: "long", year: "numeric", ...options }).format(new Date(value)); }
export function formatDateTime(value: Date | string | number) { return formatDate(value, { hour: "2-digit", minute: "2-digit" }); }
