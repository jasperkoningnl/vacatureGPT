import { cleanupStaleOccurrences } from "../lib/vacancy-lifecycle";

const result = await cleanupStaleOccurrences();
console.log(`Vacancy cleanup: ${result.expiredOccurrences} stale occurrences expired; ${result.affectedVacancies} parent vacancies recomputed (lastSeenAt before ${result.cutoff.toISOString()}).`);
