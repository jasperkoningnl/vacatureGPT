# VacatureGPT — fase 1

Een compacte, privé vacaturezoeker. De app haalt betaalde functies van OneWorld op, bewaart brondata en genormaliseerde velden in Neon PostgreSQL en laat je voorkeuren en feedback vastleggen. Er worden nog geen AI-diensten aangeroepen.

## Lokaal starten

1. Installeer Node.js 20+ en pnpm 10.
2. Kopieer `.env.example` naar `.env.local` en vul de Neon `DATABASE_URL`, een eigen `APP_PASSWORD` en een willekeurige `SESSION_SECRET` van minimaal 32 tekens in. Deel of commit deze waarden nooit.
3. Installeer en initialiseert:
   ```bash
   pnpm install
   pnpm db:migrate
   pnpm db:seed
   pnpm ingest:oneworld
   pnpm dev
   ```
4. Open `http://localhost:3000` en log in met `APP_PASSWORD`.

## Commando's

`pnpm db:migrate` past uitsluitend versiebeheer-migraties toe; het verwijdert geen schema's of andere tabellen. `pnpm db:seed` is herhaalbaar en voegt de bron, standaardvoorkeuren en gevolgde werkgevers toe. `pnpm ingest` en `pnpm ingest:oneworld` voeren de OneWorld-adapter uit. Controles: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

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
