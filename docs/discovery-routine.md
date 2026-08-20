# Discovery-routines: geplande vacaturezoekopdrachten

Twee geplande routines zoeken elke werkdag naar nieuwe vacatures en schrijven het
resultaat als JSON naar deze repository: een Claude-routine en een ChatGPT/Codex-
routine. Ze werken onafhankelijk van elkaar, houden elk hun eigen map bij en raken
elkaars bestanden nooit aan. De importer in `scripts/ingest-discovery.ts` is de
consument.

## Gedeelde afspraken

Elke routine heeft een eigen map onder `data/discovery/` en wijzigt per run
uitsluitend deze twee bestanden:

| Routine | Map |
| --- | --- |
| Claude | `data/discovery/claude/` |
| ChatGPT/Codex | `data/discovery/chatgpt/` |

- `latest.json` bevat uitsluitend de nieuwe vacatures van de laatste run. Zijn er
  geen, dan is `postings` een lege array; de run wordt niet overgeslagen.
- `seen.json` is de historische deduplicatielijst van díe routine alleen.

Beide routines committen rechtstreeks op `main`, zonder pull request en zonder
databranch. Applicatiecode, configuratie, documentatie en de bestanden van de
andere routine blijven tijdens een run ongewijzigd. Een routine werkt altijd vanaf
de actuele `main` en haalt de laatste stand op wanneer de branch intussen is
verplaatst.

Beide feeds gebruiken hetzelfde schema:

```json
{"run_date":"YYYY-MM-DD","postings":[{"company":"","title":"","location":"","remote_policy":"hybrid/remote/on-site/unknown","hours":"","salary":"","posted_date":"","source":"linkedin/indeed/other","source_url":"","direct_url":"of null","first_seen":"YYYY-MM-DD"}]}
```

`company`, `title` en `source_url` zijn verplicht. `remote_policy` is precies een van
`hybrid`, `remote`, `on-site`, `unknown`; `source` precies een van `linkedin`,
`indeed`, `other`. Onbekende tekstvelden blijven leeg en `direct_url` is `null`
wanneer de vacaturepagina bij de werkgever zelf niet bekend is. Er wordt nooit een
waarde afgeleid of verzonnen.

Deduplicatie loopt eerst binnen de run en daarna tegen de eigen `seen.json`, op
genormaliseerde URL (`direct_url` en `source_url`) en anders op genormaliseerd
`company` + `title`.

## De Claude-routine

| Onderdeel | Waarde |
| --- | --- |
| Naam | `VacatureGPT discovery (werkdagen 20:00 NL)` |
| Trigger-ID | `trig_01V8GPDfWtDKjBnCNhTLon37` |
| Moment | maandag tot en met vrijdag, 20:00 Europe/Amsterdam |
| Cron | `0 18 * * 1-5` (UTC; zomertijd) |
| Sessie | elke run start een nieuwe sessie, zonder geheugen van de vorige |
| Commitmessage | `Claude discovery run YYYY-MM-DD: X nieuwe vacatures` |

De cron staat in UTC en volgt de klokwissel niet vanzelf. Bij zomertijd hoort
`0 18 * * 1-5`, bij wintertijd `0 19 * * 1-5`. De routine controleert dit aan het
eind van elke run en meldt in haar slotrapport wanneer de cron moet worden
aangepast; het aanpassen zelf gebeurt handmatig, omdat de gestarte sessies geen
MCP-tools hebben.

### Zoekbereik

Vijftien werkgeversqueries — één per gevolgde werkgever — plus vier rolgerichte
queries op functie en plaats. Relevant zijn content- en redactierollen, leiderschap
in communicatie en digitale innovatie daarbinnen. Voorkeur voor Amersfoort, daarna
Utrecht, Hilversum en Zwolle, daarna Amsterdam met hybride werken; 32–36 uur is
ideaal en de salarisondergrens is € 3.500 bruto per maand bij fulltime.
Uitzendbureaus, junior- en administratieve functies, stages, sales,
woordvoerderschap en technisch projectmanagement vallen af.

Twee beperkingen bepalen de vorm van die zoekopdrachten. De routine heeft alleen
WebSearch: de egress-proxy blokkeert het ophalen van vacaturesites, dus werkgever,
functie en plaats komen uit de zoekresultaten zelf. En `site:`-zoekopdrachten op
LinkedIn en Indeed leveren vrijwel uitsluitend overzichtspagina's op, geen
individuele vacatures; gerichte zoekopdrachten per werkgever doen dat wel. Daarom
neemt de routine een vacature alleen op als er een URL is die naar díe ene vacature
wijst, en laat ze overzichts-, zoek- en categoriepagina's staan.

De volledige opdracht staat in de routine zelf en is te bekijken en te wijzigen via
de routines-weergave op claude.ai.

## De ChatGPT/Codex-routine

Deze routine schrijft naar `data/discovery/chatgpt/` volgens dezelfde afspraken en
hetzelfde schema. Haar configuratie staat buiten deze repository en wordt bij de
Codex-routine zelf beheerd.

## Metadata-only vacatures en verrijking

Een discovery-posting bevat alleen metadata: titel, werkgever, plaats, remote policy, uren,
salaris, datum en bron. Dat is geen vacaturetekst, en een AI-oordeel daarop is minder
betrouwbaar dan een oordeel op een geparste vacature. De importer maakt dat verschil
expliciet in plaats van het te verbergen.

- **Ophalen waar het veilig kan.** Wijst de posting een `direct_url` aan naar de
  vacaturepagina bij de werkgever zelf, dan haalt `lib/ingestion/discovery-enrichment.ts` die
  pagina op en gebruikt de leesbare tekst als vacaturetekst. Alleen https, alleen een URL die
  naar één specifieke vacature wijst, met time-out en groottelimiet. LinkedIn, Indeed,
  Glassdoor en sociale platformen worden nooit zelf geopend of gescrapet — ook niet via een
  doorverwijzing. Mislukt het ophalen, dan blijft de vacature ongewijzigd metadata-only; dat
  is een normale uitkomst en geen pipelinewaarschuwing.
- **Diepte is afleidbaar, niet apart opgeslagen.** `lib/vacancy-depth.ts` bepaalt uit de
  vacaturetekst zelf of een vacature `full` of `metadata_only` is. Er is dus geen migratie
  nodig, en een later alsnog opgehaalde tekst verandert de classificatie vanzelf.
- **De prompt weet het.** De vacature gaat met `contentDepth` de prompt in; bij
  `metadata_only` mag het model geen taken of eisen aannemen die er niet staan en moet het de
  beperking in de samenvatting benoemen. Het oordeel wordt bovendien nooit hoger dan
  *Misschien*, hoe hoog de score ook uitvalt.
- **De UI zegt het.** Detailpagina, kalibratieflow en de vacaturelijst tonen bij zo'n vacature
  expliciet dat alleen metadata bekend is.
- **De leerloop blijft schoon.** Een oordeel over een metadata-only vacature telt niet mee als
  kalibratievoorbeeld in `buildCalibrationContext`.

## De importer

`scripts/ingest-discovery.ts` leest de feed via de GitHub Contents API vanaf `main`.
`DISCOVERY_FEED_PATH` in `lib/ingestion/discovery-feed.ts` bepaalt welk bestand dat
is; `fetchDiscoveryFeed` accepteert daarnaast een `feedPath`-argument. De standaard
is `data/discovery/chatgpt/latest.json`, en de importrun gebruikt die standaard. De
Claude-feed wordt dus nog niet geïmporteerd zolang de importer niet ook op
`data/discovery/claude/latest.json` wordt losgelaten.
