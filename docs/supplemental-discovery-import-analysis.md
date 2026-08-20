# Supplemental discovery-import: technische haalbaarheidsanalyse

## Besluit

De importer is bewust **niet geïmplementeerd**. De GitHub-feed kan zonder nieuwe
infrastructuur worden gelezen, maar voor de aangeleverde Google Drive-map bestaat
geen robuuste, gedocumenteerde manier om cloud-only het nieuwste bestand met een
gegeven naam te kiezen zonder een Google API-credential. De opdracht schrijft voor
om in dat geval te stoppen en geen fragiele HTML-scraping als productieoplossing te
bouwen.

Een gedeeltelijke importer voor alleen GitHub zou bovendien niet voldoen aan het
vereiste van één centrale importer voor beide feeds en zou een onterecht werkende
Daily pipeline suggereren.

## Voorwaarden en impact

| Onderdeel | Uitkomst |
| --- | --- |
| Nieuwe env vars | Geen in deze wijziging. Voorgesteld: `GOOGLE_DRIVE_API_KEY`. |
| Nieuwe secrets | Geen in deze wijziging. Voor implementatie is een API-key als GitHub Actions-secret nodig. |
| Nieuwe accounts | Geen in deze wijziging. Voor implementatie is toegang tot een Google Cloud-project nodig. |
| Kosten | Geen in deze wijziging. Drive API-verkeer hoort binnen de toepasselijke gratis quota te blijven; stel desgewenst een quotumlimiet in. |
| Database-migraties | Niet nodig: `sources`, `source_runs`, `vacancies` en `vacancy_occurrences` kunnen discovery en assessment gescheiden opslaan. |
| Handmatige GitHub-instellingen | Geen in deze wijziging. Voor implementatie: voeg `GOOGLE_DRIVE_API_KEY` toe als Actions-secret. |
| Handmatige Vercel-instellingen | Geen; de import draait in de Daily GitHub Actions-pipeline. |

## Waarom de Drive-map blokkeert

De gedocumenteerde Google Drive API-route is `files.list`. Daarmee kan de importer
filteren op de map-ID, exacte bestandsnaam en `trashed = false`, sorteren op
`modifiedTime desc`, en alleen het eerste resultaat downloaden. Google documenteert
dat API-verzoeken een API-key of OAuth-token nodig hebben. Ook voor publiek gedeelde
data is een API-key een credential die aan een Google Cloud-project is gekoppeld.

De browserweergave van een gedeelde map biedt geen stabiel bestandsmanifest als
publieke productie-API. Het parsen van die HTML, of het nabootsen van interne
browserrequests, is ongedocumenteerd en valt onder de expliciet uitgesloten
HTML-scraping.

Relevante officiële documentatie:

- [Authenticate and authorize Drive API requests](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [`files.list`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list)
- [Search for files and folders](https://developers.google.com/workspace/drive/api/guides/search-files)
- [Download and export files](https://developers.google.com/workspace/drive/api/guides/manage-downloads)

## Simpelste cloud-only oplossing

1. Gebruik een bestaand of nieuw Google Cloud-project en activeer de Google Drive
   API.
2. Maak één API-key, beperk deze tot de Drive API en stel een passende quota-
   beperking in.
3. Bewaar de key als GitHub Actions-secret `GOOGLE_DRIVE_API_KEY`; zet hem niet in
   Vercel en niet in de repository.
4. Houd de Drive-map en de te downloaden JSON-bestanden publiek leesbaar via de link.
   Als bestanden ondanks die instelling niet met een API-key te downloaden zijn, is
   OAuth/service-account-toegang nodig en moet de implementatie opnieuw worden
   gestopt en beoordeeld.
5. Laat de importer aanroepen:

   ```text
   GET https://www.googleapis.com/drive/v3/files
     ?q='1awapWO4tGHdsKLXsmrJgPvuPUqxVxvYB'+in+parents
        +and+name='vacaturegpt_discovery_latest.json'
        +and+trashed=false
     &orderBy=modifiedTime+desc
     &pageSize=1
     &fields=files(id,name,modifiedTime,mimeType,size)
     &key=$GOOGLE_DRIVE_API_KEY
   ```

6. Download uitsluitend de teruggegeven file-ID met `files.get?alt=media`, eveneens
   met de API-key. Accepteer alleen JSON, begrens de responsomvang en valideer het
   schema voordat databasewrites starten.

De ChatGPT/Codex-feed staat inmiddels afzonderlijk op `main` in
`data/discovery/chatgpt/latest.json`. De Claude-aanlevering blijft een aparte feed;
deze analyse verandert haar opslag of provenance niet.

## Ontwerp voor implementatie nadat de blokkade is opgelost

- Lees de ChatGPT/Codex-feed rechtstreeks uit de checkout van `main`, via
  `data/discovery/chatgpt/latest.json`; hiervoor is geen GitHub API-aanroep of token nodig.
- Haal beide feeds onafhankelijk op met een `Promise.allSettled`-achtig patroon,
  zodat één bronfout de andere bron niet verhindert. Markeer de totale supplemental
  stap wel als mislukt wanneer een echte bron- of importfout optreedt, zodat het
  bestaande failure-alertmechanisme wordt geactiveerd.
- Normaliseer URL's (protocol/host-case, standaardpoorten, fragmenten en tracking-
  parameters), kies `direct_url` vóór `source_url`, en weiger origin-roots en bekende
  algemene careers-paden. Bewaar beide originele URL's en het volledige feed-item in
  `vacancy_occurrences.raw_data`.
- Dedupliceer eerst binnen de samengevoegde batch en daarna tegen alle bestaande
  occurrences/vacatures: genormaliseerde `direct_url`, vervolgens genormaliseerde
  `source_url`, vervolgens genormaliseerde `company + title`.
- Maak voor geldige nieuwe items normale actieve `vacancies` en occurrences aan.
  Daardoor selecteert de bestaande assessment-run ze automatisch als actieve
  vacatures zonder actuele assessment; er komt geen discovery-specifieke AI-logica.
- Voeg de stap na de vier structurele imports en vóór cleanup/AI-assessment toe. Toon
  per feed `gevonden / nieuw geïmporteerd / overgeslagen` en daarnaast het totaal
  nieuw supplemental discovery in `$GITHUB_STEP_SUMMARY`.
- Voeg regressietests toe voor beide normalisaties, URL-prioriteit, cross-feed- en
  database-deduplicatie, optionele uren/salaris, gecontroleerde malformed input,
  bronisolatie en selectie door de bestaande assessment-run.

