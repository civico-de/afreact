# Load metrics

`tests/browser/compare.spec.ts` loads each page in a fresh browser context
(cold: empty HTTP cache) and in one shared context (warm), rotating the order
per round, with `debug_enabled` off. A page counts as ready when the form has
an input and the table has a data row with a link. The React demo page runs
once per layout source (see [reference.md](reference.md#how-it-works)): `api` fetches the layout with
`Afreact.getForm`, `page` finds it in the page, `bundle` parses core's compiled
Angular module file.

Measured 2026-09-29 on the civikitchen dev stack (CiviCRM 6.18, localhost,
headless Chromium), three runs of 5 rounds each, medians. Absolute times drift
by a third between sessions on the same machine; compare columns within a
run.

| Metric | React `api` | React `page` | React `bundle` | Angular |
|---|---|---|---|---|
| ready, cold | 640–870 ms | 565–695 ms | 600–675 ms | 1215–1375 ms |
| ready, warm | 600–725 ms | 565–585 ms | 555–660 ms | 1190–1250 ms |
| HTTP requests, cold | 71 | 69 | 70 | 76 |
| API requests | 4 | 2 | 2 | 2 |
| script bytes | 420 kB | 420 kB | 420 kB | 415 kB |
| style bytes | 402 kB | 402 kB | 402 kB | 407 kB |
| other XHR bytes, cold / warm | 26 / 0 kB | 26 / 0 kB | 35 / 8 kB | 138 / 112 kB |

Byte counts are encoded sizes as the Resource Timing API reports them, which
includes responses served from the HTTP cache. The server needs 85–120 ms
(median time to first byte) for the demo page with every source.

## Every page of the tour

`tests/browser/pages.spec.ts` loads each page of the tour video on the render
route (`civicrm/afreact/render`, React with the layout in the page) the same
way: cold in a fresh context and warm in a shared one, the renderer order
alternating, `debug_enabled` off. A table counts as ready with its first body
row, a list, grid or tree with its first item, a form with its first input (the
rich-text editor's frame for the fields form). Measured 2026-10-06 on the
civikitchen dev stack (CiviCRM 6.18.1, localhost, headless Chromium), medians
of 5 rounds in ms:

| page | Angular cold | React cold | Angular warm | React warm |
|---|---|---|---|---|
| afsearchAfreactDemoGroups | 805 | 208 | 820 | 199 |
| afsearchAfreactDemoEditable | 1055 | 423 | 1057 | 417 |
| afsearchAfreactDemoOrder | 802 | 211 | 810 | 195 |
| afsearchAfreactDemoFeatures | 822 | 229 | 829 | 205 |
| afsearchAfreactDemoContactTypes | 822 | 213 | 844 | 204 |
| afformAfreactDemoTabs | 237 | 220 | 229 | 201 |
| afsearchAfreactDemoList | 997 | 378 | 1005 | 352 |
| afsearchAfreactDemoGrid | 992 | 363 | 974 | 373 |
| afsearchAfreactDemoTree | 805 | 202 | 809 | 201 |
| afsearchAfreactDemoRanges | 820 | 226 | 820 | 215 |
| afsearchAdministerMembershipTypes | 822 | 218 | 825 | 192 |
| afsearchCiviCRMQueues | 817 | 204 | 819 | 191 |
| afsearchSettingsDatePreferences | 822 | 214 | 807 | 203 |
| afsearchPrintPagePDFFormats | 821 | 206 | 815 | 203 |
| afsearchSiteEmailAddresses | 820 | 211 | 822 | 199 |
| afformAfreactDemoFields | 505 | 495 | 486 | 453 |

Every search display is 600 ms ahead on React, which is SearchKit's filter
debounce (next section); the editable, list and grid pages take 150–250 ms
longer on both renderers alike. The two forms come out within
40 ms of each other: both wait for `Afform.prefill`, and the fields form for
CKEditor. The tour video shows larger and noisier numbers than these because
it records while loading and runs each page once.

## Reading the numbers

- **Ready time.** Most of React's lead is SearchKit's 600 ms debounce: every
  Angular display starts its first search through the filter watcher, which
  waits for filter values to settle. The React table has no filters yet and
  starts at once because its initial filter values are computed before it
  (architecture.md, "The first search").
- **Prefill.** A form counts as ready with its first input. Both renderers show
  the inputs before `Afform.prefill` returns (Angular under its blocking
  overlay); before 2026-10-06 the React form showed its inputs only once the
  prefill had landed, one round trip later.
- **Tables in the tour.** A table counts as ready with its first body row.
  Angular renders an empty table before its search starts and swaps in
  placeholders only then, so counting the table element itself as ready
  put Angular 200–400 ms ahead on the admin pages that it is not.
- **Layout source.** `api` adds one round trip before `Afform.prefill` and
  `SearchDisplay.run` can start. The layout is cached in core's Angular
  cache, so `getForm` costs about 60 ms, the same as an empty API request;
  compiling it takes about 220 ms more. `page` and `bundle` start both calls
  as soon as the elements mount and are 30–270 ms faster cold. Warm, `page`
  was ahead in two of three runs: `bundle` still waits for its module file.
- **Chunks.** The bundle's static imports (the React vendor chunk and the
  module runtime) are preloaded from the page head
  (`Civi\Afreact\Assets::load`), so they arrive with `afreact.js` instead of
  after it has run; lazy chunks (comboboxes, drag and drop)
  still load on demand. Measured on the membership types page with 10 cold
  loads each way: 20 ms on localhost, 50 ms with 50 ms of emulated latency,
  which is the one round trip it saves.
- **Critical path.** `Afform.prefill` and `SearchDisplay.run` run in parallel
  and take 200–400 ms each on the server. Both are unchanged core actions and
  cost the same under Angular.
- **Bytes.** Core loads Angular on every CiviCRM page, whether a form uses it
  or not. The React bundle (about 88 kB gzip, of which TanStack Query is about
  10 kB and the module file parser under 2 kB) therefore adds to the page
  rather than replacing anything; script and style bytes come out almost even.
- **Requests.** Angular batches its API calls; React sends `prefill`,
  `SearchDisplay.run` and the row count separately. Batching would save
  requests, not time: core runs batched calls one after another.
- **Debug mode** changes the picture: core then serves unminified scripts
  (angular.js alone is about 330 kB) and assembles the Angular modules per
  request instead of serving a cached file. Measure with debug off.

## Choosing a source

- `api` works for any `<afreact-form>`, including ones added after the page
  loaded, at the cost of one round trip.
- `page` is the fastest, but the server renders every layout into each page,
  and its route must know the forms in advance.
- `bundle` also needs the forms in advance. Its file is shared with the
  Angular runtime and cached by the browser across pages, at the cost of
  parsing core's internal partial format in the browser: JS-literal
  attributes and the attribute types of `CRM_Afform_ArrayHtml`.
