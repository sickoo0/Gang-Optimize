# BYTEBASE Gang Optimizer - Illustrator panel v0.1

**STATUS: KUN PILOT / IKKE PRODUKTIONSGODKENDT.**

Dette er en dockbar CEP-pilot til Adobe Illustrator. Den indeholder quantity-aware produktionsplanlægning, gruppebaseret rectangle packing og en ExtendScript-bro, der placerer linkede PDF'er i et nyt Illustrator-dokument. Illustrator-integrationen er afprøvet med midlertidige test-PDF'er; produktions-PDF'er skal fortsat valideres visuelt og mod deres godkendte PDF-boks.

## Installation på Windows (Illustrator 2025/2026)

1. Pak ZIP-filen ud.
2. Kopiér **hele** mappen `Bytebase-Gang-Optimizer` til:
   `%APPDATA%\Adobe\CEP\extensions\Bytebase-Gang-Optimizer`
   Opret undermapperne, hvis de mangler. Mappen med `CSXS/manifest.xml` skal ligge direkte under `Bytebase-Gang-Optimizer`.
3. Tillad **usignerede udviklerudvidelser på din egen test-pc**. Åbn Kommandoprompt (CMD) og kør:

   ```bat
   reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f
   ```

4. Genstart Illustrator.
5. Åbn **Window / Vindue > Extensions (Legacy)** (eller **Extensions**) > **BYTEBASE Gang Optimizer**.

Hvis panelet ikke vises: Tjek stien, at mappen ikke ligger inde i endnu en ekstra mappe, og at din Illustrator-version er understøttet. Udvidelsen er målrettet ILST 29-30, dvs. Illustrator 2025/2026. Reglen for usignerede plugins må **ikke** rulles ud til alle grafikeres computere som produktionsinstallation. Brug signeret ZXP/administreret deployment senere.

## Reload Panel under udvikling

For at åbne panelets CEP Developer Tools skal `.debug`-filen ligge i udvidelsens rodmappe ved siden af `CSXS`. Den lokale udviklingsfil bruger port 8088. Genstart Illustrator, åbn derefter `http://localhost:8088/` i Chrome eller Edge, og vælg **BYTEBASE Gang Optimizer** i listen over debug-targets.

Knappen i øverste højre hjørne er skjult som standard. Aktivér den fra panelets CEP Developer Tools-konsol:

```js
localStorage.setItem('com.bytebase.gangoptimizer.devMode', '1'); location.reload();
```

**Reload Panel** gemmer importerede PDF'er, mål, OrderQ, indstillinger og valgt optimeringsplan; genindlæser `host/host.jsx` (inklusive `geometry.js` og `cutting.js`) i Illustrator; og åbner derefter panelets HTML, CSS og JavaScript igen med nye asset-URL'er. Hvis JSX-genindlæsningen fejler, vises fejlen, og panelet bliver åbent med den gemte session. Skjul knappen igen med `localStorage.removeItem('com.bytebase.gangoptimizer.devMode'); location.reload();`. Ændringer i `CSXS/manifest.xml` kræver stadig, at udvidelsen genstartes.

`.debug` er kun til lokal udvikling og skal ikke med i produktionspakken.

## Automatisk browser- og CEP-debug

Udviklingsværktøjerne bruger Playwright. Installer dem én gang fra udvidelsens rodmappe med `npm install`. `npm test` kører de hurtige tests af pakning, guillotinesnit, ordredata, session og panel-fejl. `npm run test:browser` åbner en lokal testkopi af panelet i Chromium, kører både en ugyldig fem-job ordre (0% og 76% loft) og en gyldig ordre, og gemmer screenshots samt en rapport i `artifacts/browser-preview/`. Denne browserkopi tester HTML, worker og preview; den opretter ikke Illustrator-dokumenter.

Med Illustrator åbent og panelet indlæst kan `npm run debug:cep` koble Playwright på den lokale CEP debug-port 8088 og gemme status, mængder, konsol/crashfejl og screenshots i `artifacts/cep-debug/`. `npm run debug:cep:calculate` trykker også på Calculate layout og venter på færdig status. Til en samlet genindlæsning og beregning med både nuværende loft og 76% kan du køre `npm run debug:cep:calculate -- --reload --try-custom-76`; `--reload` bruger panelets Reload Panel-knap, gemmer sessionen og genindlæser JSX samt panelassets. `--maximum-utilization` vælger den tilstand, der bruger mest af arket, før beregningen. Den valgfrie `--create` accepterer oprettelsesdialogen og opretter et nyt, usparet arbejdsdokument i Illustrator, så brug den kun med testordrer. Scriptet gemmer kun ordreantal og antal PDF'er, ikke lokale filstier. Brug ikke debug-porten på et netværk.

CEP-versioner kan variere i CDP-understøttelse. Hvis Playwright ikke kan koble på, rapporterer scriptet fejlen; `http://localhost:8088/` skal samtidig vise BYTEBASE-panelet som debug-target. Browserkopi-testen kan stadig køres uden Illustrator.

## Sådan tester du

1. Åbn panelet og tryk **Load demo** og **Calculate layout**. Det viser en geometrisk demo uden adgang til firmafiler.
2. Klik **Browse**, vælg en mappe med kopi af ufølsomme/test-produktions-PDF'er.
3. Ved mappeimport måler panelet automatisk hver PDF's Illustrator-geometriske bounds. Målene vises i mm. Illustrator måler den importerede placering; det er ikke en separat PDF-dictionary-inspektion af TrimBox/CropBox/MediaBox, så kontrollér mål mod den ønskede produktionsboks. Brug **Measure in Illustrator** til at måle igen.
4. Kontrollér den automatisk udtrukne **OrderQ** fra filnavnet. Hvis den mangler eller er ugyldig, indtast den bekræftede samlede ordremængde på jobkortet.
5. Kontrollér mål: fast ark `700 × 500 mm` landscape, justerbar ydre printmargin (20 mm som startværdi), logoets cut margin `5 mm på alle fire sider`.
6. Klik **Calculate layout** for at optimere på ét ark. Standardtilstanden minimerer den samlede overproduktion automatisk; brugeren behøver ikke indstille en procent. Under **Advanced production limits** kan en produktionsbegrænsning pr. job sættes manuelt. Alle job på samme ark bruger et fælles antal trykoplag, og en manuel grænse kontrolleres separat for hvert job. Hvis ingen fælles oplagsmængde overholder en manuel grænse, viser panelet den laveste grænse, der passer til én-arks-mængderne, og et eksempel på ordreantal. Ved 0% skal de præcise OrderQ-mængder også kunne være fysisk på det ene ark; ellers vises en forklaring. Beregningen kører i en worker og søger blandt oplagsmængder og jobrækkefølger for at udnytte pladsen bedre. Søgningen er afgrænset og heuristisk; den garanterer ikke den matematisk bedste pakning. Arket har en kontrolleret rækkefølge af lige snit. **Optimization mode** kan skifte mellem de beregnede forslag uden at kræve en ny beregning.
7. Klik **Create working Illustrator layout**. Funktionen bruger samme Illustrator-geometriske bounds ved måling og preflight. Hver placering oversættes fra dens målte bounds efter rotation og kontrolleres derefter mod den beregnede artwork-rektangel og skæremargen. Hvis de faktiske Illustrator-bounds afviger mere end 0,1 pt, stopper layoutet og dokumentet lukkes uden at skalere filerne.
8. Det nye Illustrator-dokument er endnu ikke gemt. Kontroller visuelt placeringer, skæremargener og eventuelle PDF-/bounding-box-afvigelser.

## Hvad piloten KAN

- Dockbart panel med HTML/CSS/JS, uden npm- eller internetafhængigheder.
- Valg af lokal mappe med PDF'er.
- Automatisk måling af PDF'ers linkede geometriske bounds via Illustrator; originalerne overskrives aldrig. PDF-boksene inspiceres ikke selvstændigt, så TrimBox/CropBox skal stadig verificeres mod produktionsspecifikationen.
- Manuel korrektion/bekræftelse af mål og OrderQ.
- Quantity-aware planlægning på fast 700 × 500 mm landscape-ark med justerbar ydre printmargin, 5 mm cut margin og 0°/90° rotation. Planen søger over produktionsruns og faktisk geometrisk pakning, håndhæver overproduktionsloftet pr. job og opretter altid ét ark. Ved 0% afvises en ordre, der fysisk ikke kan være på ét ark. Gentagne geometrier caches; søgningen er afgrænset og deterministisk.
- Ét artboard pr. layout. Hver udskæringsboks kan isoleres med en kontrolleret rækkefølge af lige guillotinesnit. Panelet viser preview og snitliste for arket.
- Vælgbare optimeringsmåder: mindst overproduktion (anbefalet standard), Balanced og højeste arkudnyttelse. Overproduktionsgrænsen beregnes automatisk som standard og kan ændres under avancerede indstillinger. Panelet viser unikke resultater med produktionsmængder og overproduktion pr. job; ens produktionsplaner samles, så samme valg ikke vises flere gange. Balanced er en heuristic, ikke en beregning af kroner eller den billigste produktionsplan.
- Preview af ét ark med skærefelter og guillotinesnit.
- Oprette **nyt, usavet** Illustrator-dokument med linkede originale PDF'er og en separat ikke-produktionsklar guide-layer.
- Fail-closed ved væsentlig mismatch mellem PDF-bounds og planlagte mål.
- Fail-closed kontrol af hver faktisk Illustrator-placering efter rotation og oversættelse, herunder artboard-offset, skæremargen og overlap.

## Hvad den IKKE kan endnu

- Automatisk aflæse og validere PDF-spotfarver og **Esko print order**.
- Optimere farvefællesskab, trykkørsler efter faktisk setup/materiale/ink-omkostning eller kroner.
- Genbruge/strukturere eksisterende spotseparationer, trapping, White-BG og Lim til produktion.
- Lave registreringsmærker og ramme-legend korrekt til RIP.
- Eksportere **én flersidet PDF med 100% K per ramme**, herunder hvid og lim sidst.
- Split-frame-optimering.
- Maskinspecifikke begrænsninger som knivspalte, minimumsstørrelse på emner, anslag og fastholdelse. Den geometriske snitliste skal kontrolleres mod jeres konkrete skæremaskine.

> **Vigtigt:** En manuelt gemt Illustrator-PDF fra denne pilot er IKKE den validerede RIP-eksport. Send ikke filen til eksponering. Produktions-PDF'erne må ikke skaleres, ændres, flades ud eller omtrappes i næste fase.

## Hvorfor denne arkitektur

`client/packing.js` er host-uafhængig og kan genbruges i UXP senere. `client/panel.js` står for brugerfladen; `host/host.jsx` er Illustrator-broen, der afviser alt andet end ét artboard. Split-frame-optimering er fortsat et separat, senere udviklingstrin.

## Næste udviklingstrin

1. Verificér pluginet i jeres konkrete Illustrator 2026.
2. Vælg en **enkelt original produktions-PDF** og tjek forskellen mellem Illustrator Place-bounds, TrimBox, farvenavne og separationsorden.
3. Implementér analyse af spot-separationer uden at ændre PDF'en.
4. Gem sekvens-/fællesfarvebegrænsninger i optimeringsmotoren.
5. Byg en sikker separationseksport, og sammenlign **side for side** med jeres faktiske `frank ramme.pdf` (6 sider, alle motiver 100% sort K).

## Kilder (Adobe)

- CEP 12 HTML Extension Cookbook: https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md
- Adobe CEP support and UXP transition: https://blog.developer.adobe.com/en/publish/2026/09/investing-in-the-future-of-creative-cloud-extensibility-uxp-comes-to-our-flagship-applications
- Illustrator Scripting Guide, PlacedItems: https://ai-scripting.docsforadobe.dev/jsobjref/PlacedItems/
