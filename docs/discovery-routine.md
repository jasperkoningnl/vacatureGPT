# Discovery-routine: geplande vacaturezoekopdracht

Een geplande ChatGPT/Codex-routine zoekt elke werkdag naar nieuwe vacatures en publiceert
het resultaat als JSON in de repository. De routine is de producent van de
supplemental discovery-feed die in
[`supplemental-discovery-import-analysis.md`](./supplemental-discovery-import-analysis.md)
wordt beschreven; de nog te bouwen importer is de consument.

## Schema

| Onderdeel | Waarde |
| --- | --- |
| Naam | `VacatureGPT discovery (werkdagen 20:00 NL)` |
| Trigger-ID | `trig_01V8GPDfWtDKjBnCNhTLon37` |
| Moment | maandag tot en met vrijdag, 20:00 Europe/Amsterdam |
| Cron | `0 18 * * 1-5` (UTC; zomertijd) |
| Sessie | elke run start een nieuwe sessie, zonder geheugen van de vorige |

De cron staat in UTC en volgt de klokwissel niet vanzelf. Bij zomertijd hoort
`0 18 * * 1-5`, bij wintertijd `0 19 * * 1-5`. De routine controleert dit aan het
eind van elke run en meldt het in haar slotrapport wanneer de cron moet worden
aangepast; het aanpassen zelf gebeurt handmatig, omdat de gestarte sessies geen
MCP-tools hebben.

## Uitvoer

De routine werkt vanuit `main` en mag per dagelijkse run uitsluitend deze twee bestanden wijzigen:

- `data/discovery/chatgpt/latest.json` — uitsluitend de nieuwe vacatures van de laatste run.
- `data/discovery/chatgpt/seen.json` — alle eerder gevonden vacatures, voor deduplicatie.

De feed gebruikt geen blijvende databranch. Applicatiecode, configuratie, documentatie
en andere databestanden blijven tijdens een discovery-run ongewijzigd. De afzonderlijke
Claude-feed en haar bestanden vallen buiten deze routine.

```json
{"run_date":"YYYY-MM-DD","postings":[{"company":"","title":"","location":"","remote_policy":"hybrid/remote/on-site/unknown","hours":"","salary":"","posted_date":"","source":"linkedin/indeed/other","source_url":"","direct_url":"of null","first_seen":"YYYY-MM-DD"}]}
```

`remote_policy` is precies een van `hybrid`, `remote`, `on-site`, `unknown`;
`source` precies een van `linkedin`, `indeed`, `other`. Onbekende tekstvelden
blijven leeg en `direct_url` is `null` wanneer de vacaturepagina bij de werkgever
zelf niet bekend is. Er wordt nooit een waarde afgeleid of verzonnen.

Deduplicatie loopt eerst binnen de run en daarna tegen `seen.json`, op
genormaliseerde URL (`direct_url` en `source_url`) en anders op genormaliseerd
`company` + `title`.

## Zoekbereik

Zes vaste zoekopdrachten op LinkedIn Jobs, Indeed en de gevolgde werkgevers.
Relevant zijn content- en redactierollen, leiderschap in communicatie en digitale
innovatie daarbinnen. Voorkeur voor Amersfoort, daarna Utrecht, Hilversum en
Zwolle, daarna Amsterdam met hybride werken; 32–36 uur is ideaal en de
salarisondergrens is € 3.500 bruto per maand bij fulltime. Uitzendbureaus,
junior- en administratieve functies, sales, woordvoerderschap en technisch
projectmanagement vallen af.

De volledige opdracht staat in de routine zelf en is te bekijken en te wijzigen
via de configuratie van de ChatGPT/Codex-routine. Deze pagina beschrijft alleen wat de
routine oplevert, zodat de importer daarop kan bouwen.
