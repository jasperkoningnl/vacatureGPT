# VacatureGPT

Een compacte, privé vacaturezoeker voor functies in media, communicatie en de culturele
sector. De app importeert vacatures uit meerdere bronnen, dedupliceert en bewaart de
brondata in Neon PostgreSQL, laat GPT vacatures tegen persoonlijke voorkeuren beoordelen
en gebruikt feedback om volgende beoordelingen beter te kalibreren. De interface bevat
daarnaast een persoonlijke selectie, shortlist, sollicitatietracking, bronbeheer en een
optionele wekelijkse e-mail.

> **Projectdoorlichting:** zie [de volledige analyse van techniek, functionaliteit,
> vormgeving en gebruiksvriendelijkheid](docs/analyse-2026-08-20.md), inclusief
> geprioriteerde verbetervoorstellen en ideeën voor nieuwe functionaliteit.
> De interactie en vormgeving zijn daarna herzien rond één weekroutine; die keuzes staan in
> [het ontwerpdocument](docs/ontwerp-weekroutine.md).

## De weekroutine

De app kent één hoofdweg, en de weekmail is er het beginpunt van:

1. **Deze week** (`/`) toont wat er ligt: het aantal kansrijke tips, je shortlist en wat je
   voor later bewaarde. De knop erboven is dezelfde als in de mail.
2. **Beoordelen** (`/beoordelen`) loopt die tips één voor één langs, met het AI-advies er
   open bij. Elke vacature krijgt één van drie oordelen: *op shortlist* (zet hem meteen op
   je shortlist), *bewaren voor later* of *niet passend*. Wijkt je oordeel af van dat van de
   AI, dan vraagt de rij eerst om een reden — dezelfde regel als op de vacaturepagina.
3. **Shortlist** (`/shortlist`) staat op deadline gesorteerd; de sollicitatiestatus werk je
   daar direct bij, zonder eerst een vacature te openen.
4. **Alle vacatures** (`/vacatures`) is er om zelf te bladeren, inclusief wat de AI juist
   niet selecteerde. Elke rij heeft een knop naar dezelfde beoordeelrij voor die ene vacature.

Daarnaast staan de **blinde test** (`/kalibreren`, vijf vacatures zonder AI-oordeel),
**voorkeuren** en **bronnen** in een aparte, secundaire navigatiegroep. Elk oordeel en elke
reden is een append-only feedback-event en voedt de volgende AI-ronde.

## Lokaal starten

1. Installeer Node.js 20+ en pnpm 10.
2. Kopieer `.env.example` naar `.env.local` en vul de Neon `DATABASE_URL`, een eigen `APP_PASSWORD` en een willekeurige `SESSION_SECRET` van minimaal 32 tekens in. Deel of commit deze waarden nooit.
3. Installeer en initialiseer:
   ```bash
   pnpm install
   pnpm db:migrate
   pnpm db:seed
   pnpm ingest:oneworld
   pnpm dev
   ```
4. Open `http://localhost:3000` en log in met `APP_PASSWORD`.

## Commando's

`pnpm db:migrate` past uitsluitend versiebeheer-migraties toe; het verwijdert geen schema's
of andere tabellen. `pnpm db:seed` is herhaalbaar en voegt bronnen,
standaardvoorkeuren en gevolgde werkgevers toe. De `ingest:*`-commando's importeren de
afzonderlijke vacaturebronnen; `pnpm ai:assess` beoordeelt nieuwe of gewijzigde vacatures.
Controles: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Na deployment van de parser en migratie repareer je de bestaande OneWorld-records eenmalig met:

```bash
pnpm repair:oneworld
```

Deze import koppelt eerst op het externe OneWorld-ID, daarna op de exacte bron-URL en pas daarna op de conservatieve canonieke sleutel. Feedback, eerste vinddatum en bronhistorie blijven daardoor aan dezelfde vacature gekoppeld.

## OneWorld en gegevenskwaliteit

De adapter gebruikt de publieke, gefilterde RSS-feed en vervolgens de JSON-LD `JobPosting` op detailpagina's. Dat is stabieler dan de zoekresultaten scrapen. De crawler gebruikt een herkenbare user-agent en wacht minimaal 1,1 seconde tussen detailverzoeken, in lijn met `robots.txt` (`Crawl-delay: 1`). RSS bevat geen paginering: de feed zelf levert de complete actuele set. Parseerfouten en onverwacht nul resultaten worden als zichtbare waarschuwing bij de bronrun opgeslagen. Werkgever, salaris of andere ontbrekende data worden niet afgeleid of verzonnen.

Deduplicatie gebruikt bronidentiteit vóór conservatief titel + werkgever + locatie; iedere vindplaats blijft daarnaast apart bewaard. Een SHA-256-hash van de gestructureerde brondata bepaalt of een bestaande vacature gewijzigd is. Fixtures in `lib/ingestion/fixtures` zijn snapshots; tests doen nooit live verzoeken.

## Productie

Zet `DATABASE_URL`, `APP_PASSWORD` en `SESSION_SECRET` in Vercel. Productie faalt gesloten als de wachtwoordvariabelen ontbreken. De sessie is een server-side ondertekende, `httpOnly`, `secure` cookie. Neon Auth wordt niet gebruikt. Voer migraties bewust uit tijdens deployment of vooraf met `pnpm db:migrate`.

## Beheer en automatisering

Op `/voorkeuren` zijn zowel de losse basisvoorkeuren als het inhoudelijke kandidaatprofiel
en de gevolgde werkgevers te beheren. Een wijziging aan profiel of werkgevers verandert de
profielhash; de volgende AI-assessment ziet daardoor vanzelf dat herbeoordeling nodig is.
Feedback wordt als historie bewaard. Lijst, funnel, kalibratie en weekmail gebruiken steeds
het nieuwste event per vacature; alleen events met `learningEligible=true` tellen mee voor
leren.

`/vacatures` ondersteunt vrije tekstzoek op titel, werkgever en vacaturetekst, combineert
dubbele vindplaatsen tot één vacature en pagineert de unieke resultaten. Boven de lijst staan
vaste ingangen (kansrijk volgens AI, door AI weggelaten, nog niet beoordeeld, door mij
interessant, door mij afgewezen, alles); die zetten precies dezelfde filters als het formulier
eronder. Filters en pagina blijven via de URL deelbaar.

De stijl staat in `app/styles/` en laadt in vaste volgorde via `app/globals.css`: eerst
`tokens.css` (kleur, ruimte, typografie, donkere modus), dan `base.css`, `layout.css`,
`components.css`, `review.css` en `pages.css`. Een later bestand verfijnt, maar draait niets
terug wat eerder is afgesproken.

Onder `/bronnen` kunnen beheerders vaste GitHub Actions-workflows starten: de dagelijkse
pipeline, een gratis preview of betaalde AI-herbeoordeling, cleanup en de bestaande weekmail.
De app voert die taken niet zelf uit. Configureer in Vercel uitsluitend server-side:

- `GITHUB_ACTIONS_TOKEN`: fine-grained personal access token met **Actions: Read and write**
  voor uitsluitend deze repository;
- `GITHUB_REPOSITORY`: repository in de vorm `eigenaar/repository`;
- `GITHUB_WORKFLOW_REF`: bestaande branch of tag, normaal `main`.

De tokenhouder heeft toegang tot de repository nodig. Er is geen nieuw account of externe
zoekdienst nodig. Workflowruns gebruiken bestaande GitHub Actions-minuten; AI-assessment
kan bestaande OpenAI-kosten veroorzaken en vraagt daarom in de UI expliciete bevestiging.
Voer productiemigraties nooit handmatig uit: de cloud-workflows draaien `pnpm db:migrate`.
