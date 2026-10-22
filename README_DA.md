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

Knappen i øverste højre hjørne er skjult som standard. Aktivér den på en udviklingsmaskine fra panelets CEP Developer Tools-konsol:

```js
localStorage.setItem('com.bytebase.gangoptimizer.devMode', '1'); location.reload();
```

**Reload Panel** gemmer importerede PDF'er, mål, OrderQ, indstillinger og valgt optimeringsplan; genindlæser `host/host.jsx` (inklusive `geometry.js` og `cutting.js`) i Illustrator; og åbner derefter panelets HTML, CSS og JavaScript igen med nye asset-URL'er. Hvis JSX-genindlæsningen fejler, vises fejlen, og panelet bliver åbent med den gemte session. Skjul knappen igen med `localStorage.removeItem('com.bytebase.gangoptimizer.devMode'); location.reload();`. Ændringer i `CSXS/manifest.xml` kræver stadig, at udvidelsen genstartes.

## Sådan tester du

1. Åbn panelet og tryk **Load demo** og **Calculate layout**. Det viser en geometrisk demo uden adgang til firmafiler.
2. Klik **Browse**, vælg en mappe med kopi af ufølsomme/test-produktions-PDF'er.
3. Ved mappeimport måler panelet automatisk hver PDF's Illustrator-geometriske bounds. Målene vises i mm. Illustrator måler den importerede placering; det er ikke en separat PDF-dictionary-inspektion af TrimBox/CropBox/MediaBox, så kontrollér mål mod den ønskede produktionsboks. Brug **Measure in Illustrator** til at måle igen.
4. Kontrollér den automatisk udtrukne **OrderQ** fra filnavnet. Hvis den mangler eller er ugyldig, indtast den bekræftede samlede ordremængde på jobkortet.
5. Kontrollér mål: fast ark `700 × 500 mm` landscape, justerbar ydre printmargin (20 mm som startværdi), logoets cut margin `5 mm på alle fire sider`.
6. Vælg **Balanced**, **Maximum sheet utilization** eller **Minimum overproduction**. Sæt maksimum overproduktion pr. job (0% som standard), og klik **Calculate layout**. Beregningen kører i en worker, viser status og sammenligner run counts med guillotinepakning i flere jobrækkefølger. Resultatet bruger ét gang sheet og indeholder en kontrolleret rækkefølge af lige snit.
7. Klik **Create working Illustrator layout**. Funktionen bruger samme Illustrator-geometriske bounds ved måling og preflight. Hver placering oversættes fra dens målte bounds efter rotation og kontrolleres derefter mod den beregnede artwork-rektangel og skæremargen. Hvis de faktiske Illustrator-bounds afviger mere end 0,1 pt, stopper layoutet og dokumentet lukkes uden at skalere filerne.
8. Det nye Illustrator-dokument er endnu ikke gemt. Kontroller visuelt placeringer, skæremargener og eventuelle PDF-/bounding-box-afvigelser.

## Hvad piloten KAN

- Dockbart panel med HTML/CSS/JS, uden npm- eller internetafhængigheder.
- Valg af lokal mappe med PDF'er.
- Automatisk måling af PDF'ers linkede geometriske bounds via Illustrator; originalerne overskrives aldrig. PDF-boksene inspiceres ikke selvstændigt, så TrimBox/CropBox skal stadig verificeres mod produktionsspecifikationen.
- Manuel korrektion/bekræftelse af mål og OrderQ.
- Quantity-aware planlægning på fast 700 × 500 mm landscape-ark med justerbar ydre printmargin, 5 mm cut margin og 0°/90° rotation. Planen søger over produktionsruns og faktisk geometrisk pakning, håndhæver overproduktionsloftet pr. job og beholder hver jobgruppe på ét ark. Gentagne geometrier caches; søgningen er afgrænset og deterministisk.
- Ét artboard pr. layout. Hver udskæringsboks kan isoleres med en kontrolleret rækkefølge af lige guillotinesnit. Panelet viser snitlisten og snitlinjerne på arket.
- Vælgbare optimeringsmåder: Balanced (standard), højeste arkudnyttelse og mindst overproduktion. Panelet viser unikke resultater med produktionsmængder og overproduktion pr. job; ens produktionsplaner samles, så samme valg ikke vises flere gange. Balanced er en heuristic, ikke en beregning af kroner eller den billigste produktionsplan.
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

`client/packing.js` er host-uafhængig og kan genbruges i UXP senere. `client/panel.js` står kun for brugerfladen; `host/host.jsx` er en tynd Illustrator-bro. Vi udvikler **single-frame** først og tilføjer split-frame, når single-frame har bestået produktionsvalidering.

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
