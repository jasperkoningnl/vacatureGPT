# Ontwerp: één weekroutine, van mail tot shortlist

Vervolg op [de doorlichting van 20 augustus 2026](analyse-2026-08-20.md). Die analyse noemde
gebruiksvriendelijkheid de zwakste as en vormgeving "consistent, op de laatste tien procent na".
Dit document legt vast welke interactie daarna is gekozen en waarom.

## Het probleem: de app kende geen hoofdweg

Er waren drie plekken waar je een vacature kon beoordelen — de detailpagina, de blinde
kalibratieflow en (impliciet) de lijst — en geen enkele plek waar je de tips van deze week
gewoon één voor één afhandelde. De navigatie noemde de blinde test "Beoordelen", terwijl dat
juist het uitzonderingsgereedschap is. De shortlist was een schakelaar diep op een
detailpagina. De weekmail linkte per vacature naar een losse pagina en liet je daarna zelf
uitzoeken waar je gebleven was. Elke handeling was mogelijk; geen enkele was de bedoeling.

## De routine

Eén hoofdweg, met de mail als beginpunt en de site als exact hetzelfde beginpunt:

1. **Deze week** — wat er ligt, met de knop die de rij start.
2. **Beoordelen** — de tips één voor één, AI-advies open erbij, drie knoppen.
3. **Shortlist** — wat je serieus overweegt, op deadline, met de status erbij.
4. **Alle vacatures** — zelf bladeren, inclusief wat de AI wegliet.

Blinde test, voorkeuren en bronnen staan daar los van, in een tweede navigatiegroep.

## De keuzes en hun redenen

### Eén handeling, één gevolg

De drie knoppen in de rij zijn precies de drie oordelen uit het bestaande feedbackcontract:
`interesting`, `maybe`, `not_suitable`. Er is geen aparte shortlistknop meer in de rij:
"interessant" *is* op de shortlist zetten. Dat maakt de handeling ondubbelzinnig en houdt de
shortlist gevuld zonder tweede beweging. Op de vacaturepagina blijven oordeel en shortlist
wél gescheiden, want daar kun je van gedachten veranderen zonder je oordeel te herzien.

### De reden komt vóór het opslaan, niet erna

Wijkt jouw oordeel af van dat van de AI, dan is een reden verplicht — dezelfde regel die
`reasonIsRequired` overal afdwingt. Nieuw is het moment: de rij toont het AI-oordeel open, dus
de reden kan meteen worden gevraagd en in één schrijfactie mee. De blinde test doet het
noodgedwongen andersom (oordeel eerst, onthulling daarna, reden als aanvulling); dat verschil
is inherent aan blind beoordelen en blijft dus bestaan.

De reden is een rij chips, geen keuzelijst: op divergentie is dit één tik extra, geen formulier.

### Eén ronde is één momentopname

Na elke server action rendert Next de huidige route opnieuw. Zou de rij dan opnieuw uit de
database komen, dan valt de zojuist beoordeelde vacature eruit, schuift alles op en sla je er
ongemerkt één over. De rij wordt daarom bij het openen één keer in clientstate vastgelegd, en
`refreshFunnelRoutes` revalideert `/beoordelen` bewust *niet*. Verse data komt bij de volgende
ronde, want de route is `force-dynamic`.

### De mail is dezelfde handeling

De weekmail opent met één oproep — "Beoordeel ze één voor één" naar `/beoordelen` — en pas
daarna de kaarten. Het AI-oordeel blijft bewust buiten de mail, zoals het altijd al was: de
mail hoort je niet te sturen voordat je zelf kijkt. Deadline-urgentie staat er wél in, want die
kan de mail niet met kleur overbrengen.

### Deadlines dragen urgentie

`deadline` werd opgeslagen, geïndexeerd en getoond, en er gebeurde niets mee. `lib/deadline.ts`
rekent nu in hele kalenderdagen in Europe/Amsterdam en levert overal dezelfde zin: "Sluit
vandaag", "Sluit over 5 dagen", "Deadline verlopen". De shortlist sorteert erop, de lijst en de
beoordeelrij tonen het, de mail schrijft het uit.

### Bladeren begint bij een vraag, niet bij een leeg formulier

Boven `/vacatures` staan zes vaste ingangen die de vragen dekken die je echt stelt — waaronder
"door AI weggelaten", precies de stapel waar de gebruiker zelf doorheen wil bladeren. Ze zetten
dezelfde filters als het formulier eronder, dat nu is ingeklapt tot je het nodig hebt. Elke rij
heeft een knop naar de beoordeelrij voor die ene vacature (`/beoordelen?ids=…`), zodat markeren
buiten de weekstapel dezelfde handeling is als erbinnen.

## De vacaturetekst zelf

Bij het inlezen haalt elke parser de HTML door `\s+ → " "`, waardoor alinea's, koppen en
opsommingen verdwijnen vóór er iets is opgeslagen. Wat er in de database staat is dus vrijwel altijd
één lap van duizenden tekens — onleesbaar, hoe je hem ook opmaakt.

`formatVacancyContent` wint die structuur bij het tonen terug. Alleen alinea's die langer zijn dan
600 tekens krijgen die behandeling, dus tekst die een bron wél netjes aanleverde blijft ongemoeid.
Binnen zo'n lap wordt geknipt op bekende Nederlandse sectiekopjes ("Wat je gaat doen", "Wij bieden",
"Solliciteren") en daarna op zinsgrenzen tot alinea's van leesbare lengte.

Twee regels houden dat eerlijk:

- **Er gaat geen teken verloren.** Elk blok is een `slice` van de bron; samengevoegd is het exact
  dezelfde tekst. Een test bewaakt dat, want de eerste versie liet `€ 7.491` als `491` overblijven.
- **Een verkeerd geplaatste kop is erger dan een gemiste.** Er wordt alleen geknipt als er een
  hoofdletter achteraan komt — daardoor blijft "Wij bieden een uitdagende functie" één zin, terwijl
  "Wij bieden Een brutomaandsalaris van" alleen zo kan lezen doordat er een kopgrens wegviel. Korte
  naamwoordelijke groepen als "Het team" of "De functie" staan bewust niet in de lijst: daar volgt
  vaak een eigennaam ("Het team Regie speelt daarin een cruciale rol").

Dit repareert wat er nu in de database staat. De structurele oplossing zit een laag dieper: laat de
parsers de blokstructuur bewaren in plaats van hem weg te wassen. Dat raakt de opgeslagen
`contentHash` niet — die gaat over `rawData` — en kost dus geen herbeoordeling, maar helpt pas
zodra een vacature opnieuw wordt ingelezen.

## De volgorde op de vacaturepagina

Eerst de feiten, dan het AI-advies, dan de vacaturetekst, en pas daarna jouw oordeel en je
vervolgstap. De vorige indeling vroeg om een oordeel voordat je iets had kunnen zien. Snel oordelen
doe je in de beoordeelrij; deze pagina is om te lezen.

Het salarisveld toont niet langer de hele brontekst wanneer de parser geen bedrag kon herleiden:
`compactSalaryOriginal` houdt de zin over die het bedrag draagt en knipt af op een woordgrens. Er
wordt niets afgeleid of afgerond — wat er staat, staat er, alleen korter.

## Vormgeving

De visuele taal bleef: papier, haarlijnen, Georgia-koppen, één groen accent. Wat veranderde:

- **Eén stijlsysteem in plaats van gelaagde correcties.** `app/globals.css` was gegroeid tot
  1.450 regels met twee `:root`-blokken, negen mediaqueries en regels die elkaar terugdraaiden.
  De stijl staat nu in zes bestanden die in vaste volgorde laden: tokens, basis, raamwerk,
  onderdelen, beoordelen, beheerpagina's. Later mag verfijnen, niet terugdraaien.
- **Kleur draagt betekenis.** Groen is het AI-advies, zand je eigen oordeel, paars de
  sollicitatiestap. Het AI-oordeel kleurt bovendien mee met zijn strekking (interessant,
  misschien, niet passend), net als de deadline met zijn urgentie. Beide werken in licht en donker.
- **De beslisbalk blijft in beeld.** In de rij staat de keuze sticky onderaan, zodat je nooit
  terug hoeft te scrollen. Vraagt de rij om een reden, dan is dat geen balk maar een stap: die
  staat stil in de pagina.
- **Beheer is rustiger dan de routine.** Bron- en werkgeverschakelaars en workflowknoppen zijn
  secundair; alleen wat je dagelijks doet krijgt een gevulde knop.
- **Smalle schermen.** De tabel schuift horizontaal in plaats van te wringen, de navigatie
  schuift per groep, en de drie keuzeknoppen blijven op één rij zonder hun uitleg.
- **De vacaturetekst is geen venster in een venster.** De uitklap in de beoordeelrij had een eigen
  kader met scrollbalk, terwijl de tekst binnen dat kader op leesbreedte stopte en de rechterhelft
  leeg liet. Nu is het een gewone uitklap zonder kader en zonder eigen scrollgebied.
- **Opsommingen krijgen een opsommingsteken.** De pluspunten van de AI stonden achter een kastlijntje
  dat als een streepje van het model las; dat is nu een gewone stip.

## Wat bewust niet is veranderd

- Het feedbackcontract, de kalibratielogica en de AI-prompt.
- Het datamodel; deze wijziging vraagt geen migratie.
- De blinde test zelf: die blijft vijf vacatures zonder AI-oordeel, alleen niet langer als
  hoofdroute gepresenteerd.
- Het weglaten van scores uit de weekmail.
