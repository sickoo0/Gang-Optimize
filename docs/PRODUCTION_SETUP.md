# Single-frame production setup — development and validation

## Scope and baseline

Implemented on `feature/single-frame-production-setup`, based on verified clean HEAD
`75a0f2b7df244c743c0f7c5e3ef545751b30afe8`. Main is not merged.
The packing, beam search, production quantity logic, cutting certificates and placement geometry
remain unchanged. The profile layer supplies dimensions to the existing optimizer and checks
generated production geometry against its result.

Baseline: `npm test` passed 9 test files; `npm run test:browser` passed 8 scenarios.
The existing benchmark failed before comparing layouts because its legacy result omitted
`artworkClearance`. The comparison now explicitly validates the old engine with its old
zero-clearance schema, while the current engine must still provide 0.1 mm clearance at zero
cut margin. Benchmark inputs and algorithms were not weakened or modified. The zero-margin
row has different technical clearance across versions; compare artwork coverage as well as slot coverage.

## Architecture / changed files

| File | Responsibility |
| --- | --- |
| `shared/production-setup.js` | Versioned profiles, strict SVG dialect, mm anchors, vector paths, reservations, ink sequence and label models; ES3-compatible host/browser/Node implementation |
| `shared/separation-plan.js` | Ordered per-frame hand-off manifest; explicit disabled PDF exporter |
| `client/setup-ui.js` | Company profiles, mark/text editors, JSON advanced editor, SVG import/export, swatches, drag/reorder, verification and persistence |
| `client/pdf-inks.js` | Read-only PDF object inspection using bundled pdf-lib 1.17.1 |
| `client/vendor/` | Offline MIT-licensed pdf-lib bundle and license; no CDN or runtime install |
| `client/index.html`, `styles.css` | Sections 04/05 and compact production controls |
| `client/panel.js`, `session.js` | Bridge payload, shared preview overlay, profile lifecycle and session v4 migration |
| `host/production-artwork.jsx` | Installed-font check, exact vector paths, outlined labels, isolated layers and transactional updates |
| `host/json-read.js` | Non-evaluating parser for persisted document metadata |
| `host/host.jsx` | Optional production creation/update bridge and reload version |
| `tests/production-setup.test.js` | Profiles, geometry, SVG rejection, inks/text, PDF object streams, migration and export guards |
| `scripts/browser-preview.mjs` | Existing browser suite plus complete production UI/session checks |
| `scripts/illustrator-production-check.cjs` | Actual Illustrator fixture generation, paths, labels, update, cleanup and source-file checks |
| `tests/session.test.js`, `reload-panel.test.js` | New schema and cache-busted assets |
| `scripts/packing-comparison.cjs`, `tests/plan-invariants.js` | Correctly distinguish legacy benchmark clearance from current required clearance |
| `package.json`, `package-lock.json` | Pinned PDF parser and real Illustrator test command |

## Profile contract

Portable JSON has `schemaVersion: 2`. Version 1 has the same core fields; migration supplies
`references`, `assets` and the single `main` zone. Unknown versions are rejected. Defaults are
MASCOT — Single Frame, Generic — Simple and Custom Company Profile. Import creates a separate
company profile instead of overwriting one. Reset restores a built-in or the custom template.

Coordinates are millimetres, origin top left, positive y down. `sheet` stores width, height,
symmetric edge and default cut margin. MASCOT: 700 × 500, edge 20, cut margin 0. The print area
is 660 × 460. The optimizer retains its 0.1 mm technical clearance at zero cut margin.

Anchors: `sheet:top-left`, `sheet:top`, `sheet:top-right`, `sheet:left`, `sheet:center`,
`sheet:right`, `sheet:bottom-left`, `sheet:bottom`, `sheet:bottom-right`; replace `sheet`
with `print` or `main` for print/zone anchors. Named points in `references` can be used
directly as anchor names. The only supported zone is `{id: "main", reference: "print"}`;
additional zones are rejected until split-frame support exists.

Mark positions describe the centre of their local geometry. Types: `cross`, `target`, `dot`,
`tick`, `svg`. Width/height, stroke, rotation, visibility, production/guide status, group,
repeat count/dx/dy, `everyFrame` and explicit canonical `frames` names are validated.
`assets` maps IDs to inline SVG strings, so exported profiles are portable and cannot refer
to external files. SVG marks preserve viewBox proportions using uniform scaling inside the
configured width/height. Element strokes scale with the SVG.

The deliberately restricted SVG importer accepts a root viewBox and self-closing line,
rect, circle and ellipse with numeric geometry and black/none fill/stroke. It rejects paths,
transforms, CSS, groups, text, gradients, images, scripts, entities, external references,
unsupported attributes and clipping outside the viewBox. Re-export complex marks into the
supported primitives; arbitrary SVG support is not claimed.

Text has a reserved rectangle, PostScript font name, pt size, alignment, 0°/90° orientation,
prefix/suffix/separator, `{index}/{total} {ink}` format, display colors and optional job/sheet/run
metadata. Full/current mode controls the working legend. `legend: "repeat"` repeats the selected
legend on each planned separation; `"per-ink"` assigns each component to its corresponding
frame in the manifest. Font substitution is forbidden; overflowing text fails before replacing
existing layers. The output uses vector outlines. Browser glyph metrics are approximate;
the reserved coordinates are shared and Illustrator checks actual outlined bounds.

Ink aliases are exact, one-step mappings. Only unambiguous numeric Pantone C/U spelling variants
normalize together; C and U remain distinct. No licensed Pantone database is bundled. Display
swatches use available type-2 Separation tint-function endpoints in DeviceRGB/DeviceCMYK,
profile colors, or neutral gray. MASCOT White-BG is white with a border, Lim is yellow.
Swatches never modify PDF artwork. Ordinary inks can be dragged or moved with arrow buttons;
the profile's tail order is applied last when locked. Required missing inks warn or block.

## Geometry and updates

Geometry-changing profile edits invalidate the stored layout. Appearance edits retain it.
Production marks extending into the packing area create keep-out rectangles. This milestone
rejects a conflicting layout; it does not teach the optimizer to nest around arbitrary obstacles.
Change the mark/text configuration and recalculate. Logos are never silently moved or scaled.
Printable boundary strokes reserve their four edges, not their entire interior.

Host layers are `BYTEBASE - LINKED PDF ARTWORK`, `BYTEBASE - REGISTRATION MARKS`,
`BYTEBASE - FRAME TEXT`, `BYTEBASE - PRINT GUIDES`. The last layer has `printable=false`.
Black marks and text are proof artwork; they are NOT registration-color separations.
The working document contains all configured physical marks; the manifest filters frame-specific
marks by the explicit frame assignment. Common registration paths are reused identically.

Update works only on an owned generated document with the same layout and unmodified source
layer. Recursive fingerprints include paths/control points, fills/strokes, opacity, bounds,
linked file paths and transforms. Manual changes cause rejection. New production layers are
staged and validated before old generated layers are removed. Failures remove staging layers;
failed new-document generation closes the new document without saving. Existing user documents
are not closed by the tests. Moving/editing existing artwork requires a new working document.
The metadata marker is not a security signature against deliberate document tampering.

Sessions 1–3 migrate to 4 while preserving imported files, quantities, selected valid plans,
proposals, cut margin and scroll state. Empty sessions also save profiles. Damaged saved setup
data is retained for export/recovery rather than silently thrown away. Demo mode is temporary;
reload restores the preceding saved working session. Source PDFs edited externally must be
remeasured and their inks reverified before use.

## PDF ink evidence

The parser decodes PDF objects and object streams, finds Separation/DeviceN color-space names
and supported alternate-color endpoints without saving the PDF. It does not infer inks from
Illustrator linked-file swatches. It runs after folder import/measurement and on demand.
All results are **candidates requiring manual verification**: resources can be unused, pages
can contain process images/complex tint functions/transparency, and resources from other pages
can be present. Unsupported, encrypted, malformed or over-limit PDFs explicitly require manual
verification. Limits: 50 MB, 100,000 visited objects, nesting depth 80. A manually verified list
is required before production artwork is generated. This is not a separation-use validator.

References: [Adobe PDF reference, color spaces](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.4.pdf),
[pdf-lib parser source](https://github.com/Hopding/pdf-lib/blob/master/src/core/parser/PDFParser.ts).

## Separation boundary / next backend

`shared/separation-plan.js` emits a JSON hand-off with logical page order, original source
placements, shared registration geometry, frame-specific labels and intended 100% K mask color.
It excludes guide geometry. It does not produce separation PDF pages. Enabling `ripEnabled`
in imported JSON is rejected; the PDF export entry point also throws.

Adobe documents host-based and in-RIP PostScript separation workflows. Their PPD/driver,
flattening, overprint and exposure settings affect output. Neither screen ink visibility nor
the plugin's logical sequence proves exported page order. Registration color is documented as
all-plate printing, but has not been verified with these linked PDFs/this RIP; it is not used.
See [Adobe separation workflow](https://helpx.adobe.com/illustrator/desktop/save-and-export/export-files-to-different-formats/print-color-separations.html)
and [Adobe overprinting](https://helpx.adobe.com/in/illustrator/using/overprinting.html).

A candidate alternative is a PDF-native separation backend from the print provider's validated
RIP: feed untouched PDFs and exact placement transforms, obtain identified black exposure masks,
then apply the per-frame marks/labels and assemble pages according to the explicit manifest.
This is a proposed integration boundary, not an implemented or approved converter. Reject
backends that flatten away spot identity, regenerate trapping or cannot report plate names.
Validate actual page count/order, masks, registration, scale, overprint/traps, and reference
differences before exposing an enabled RIP-export button. No native separation output was sent
to a printer, and no unverified production PDF was generated during this implementation.

## Physical calibration still required

The MASCOT default reflects the described structure: two upper targets per side, lower corner
targets, side dots, magenta boundary, bottom legend. Dimensions are provisional. Supply the
approved InDesign/IDML template and exported reference sheets to check target centres, circle
diameters, strokes, side dots, text font/size/baseline, print boundary, paper orientation and
which individual objects are exposure marks versus guides. Print at 100% and measure against
the approved physical frame. No exact template match or production approval is claimed.

## Tests / evidence

Run `npm test`, `npm run test:browser`, `npm run benchmark:packing`,
`npm run test:illustrator:packing`, `npm run test:illustrator:production`.
The Illustrator commands execute real ExtendScript using Windows COM; they are not mocks.
They create only fixture PDFs and new unsaved documents, close those documents, and reactivate
the original document. Reports and visual artifacts are under ignored `artifacts/` folders.

The production integration checks the exact five-ink legend, matching vector anchors,
nonprinting guides, repeat updates, unchanged linked transforms, SHA-256 equality of source
PDF before/after, current-frame Lim, centering, vertical text, rotated SVG, missing fonts,
text overflow, manually edited marks and error cleanup. The packing integration checks five
datasets including zero and 4 mm margins, with a 0.1 pt bounds acceptance limit.

Manual production acceptance remains: actual customer PDFs/spot usage, approved template
calibration, missing required inks, chosen fonts and label length, reopening saved AI files,
press-specific print areas and the eventual real RIP output. Automated fixture success does
not constitute approval of actual production artwork.

### Results on this Windows/Illustrator development machine, 27 October 2026

- `npm test`: 19 passing tests, zero failures (including the original regression files).
- `npm run test:browser`: 9 passing scenarios, zero recorded runtime failures.
- `npm run benchmark:packing`: 8 datasets completed after correcting the pre-existing legacy
  validation mismatch. Current optimizer utilization was retained/improved against ec0d1f9;
  this milestone does not change the optimizer compared with 75a0f2b.
- `npm run test:illustrator:packing`: 5 real Illustrator cases passed; largest observed linked
  bounds error 0.000433 pt, below the existing 0.1 pt acceptance threshold.
- `npm run test:illustrator:production`: 18 real Illustrator checks passed, including rotated SVG,
  centering/vertical text and rollback. Mark anchor error was below 0.000001 pt. Source fixture
  PDF SHA-256 hashes before/after matched.
- Live CEP: three profiles load, the exact five-ink legend resolves, local PDF base64 reading
  and pdf-lib analysis work, and Reload Panel reloads the new host/modules and preserves the
  saved setup. Adobe telemetry was blocked by the environment; no plugin runtime error was
  recorded by the debugger.
- `git diff --check` and syntax checks for the new browser/shared modules passed.

Native JSON export uses Illustrator's Save dialog; browser export uses a download. The OS Save
dialog, re-opening a saved AI document and approved customer reference comparisons remain manual
acceptance checks. No production separation PDF has been generated or validated.
