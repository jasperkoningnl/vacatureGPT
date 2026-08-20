# Repositoryregels voor agents

- Begin vanaf de nieuwste `main` en maak voor iedere taak een verse branch.
- Houd iedere pull request bij één gerichte, samenhangende taak.
- Productiewerk is cloud-only: voer geen productieprocessen lokaal uit.
- Voer nooit handmatig SQL op productie uit; lever Drizzle-migraties en laat die uitsluitend via GitHub Actions lopen.
- Schrijf UI-copy in het Nederlands. Technische namen en AI-prompts mogen Engels zijn waar dat al de conventie is.
- Leid ontbrekende vacaturegegevens niet af en verzin nooit waarden.
- Draai voor iedere PR `pnpm lint`, `pnpm typecheck`, `pnpm db:check`, `pnpm test` en `pnpm build`.
- Voeg bij iedere bugfix een regressietest toe op de laag waar de fout werkelijk zat.
