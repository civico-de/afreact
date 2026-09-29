# React vs Angular renderer

The same Afform definitions are rendered twice: by core's Angular runtime on
`civicrm/facade/angular` and by this extension's React renderer on
`civicrm/facade/demo`. The pages share one markup, so any difference comes
from the renderer.

## Behavioural parity

`frontend/e2e/parity.spec.ts` runs the same scenarios against both pages and
compares the outcomes through the API: validation, create with a joined email
(submitted with Enter, as the form element on core's Afform page allows),
prefill and update from `#?Individual1=<id>`, the saved records field by field,
and the table rows after sorting and paging. All of them pass on both
renderers.

## Visual parity

The React renderer writes the markup of core's Angular templates — afField and
its field templates, afRepeat, afTitle, the SearchKit table and its pager —
with the same classes, and loads the stylesheets core's Angular modules bring
for them (`crmUI.css`, `afCore.css`, the SearchKit display styles). The site
theme therefore styles both renderers; `frontend/src/facade.css` only sizes the
native controls that replace jQuery widgets.

`frontend/e2e/visual.spec.ts` pairs the parts of both pages — titles, fields,
labels, controls, clear links, buttons, table header, sort icons, rows, pager —
and compares position, size and the main computed styles to within 2 px.
Remaining differences must be listed in the spec with a reason, and an entry
that no longer excuses anything fails the test.

### Differences by design

| Area | Angular | React |
|---|---|---|
| Select fields | select2 | native `<select>`, sized and marked like select2 (warning border when required and empty) |
| Date fields | jQuery UI datepicker, site input format | native `<input type="date">`, wider than the datepicker to fit its format and calendar icon |
| Clear links | `<a>` without `href`, not reachable by keyboard | same link with `role="button"`, focusable, Enter and Space |
| Admin block menus | gear menu per block for administrators | not rendered |
| API calls | calls made together share one request | one request per call |

## Accessibility

`frontend/e2e/a11y.spec.ts` runs axe on both pages in light and dark mode and
fails when the React page breaks a rule on more elements than the Angular page.
Findings only on the Angular page: the select2 widgets carry roles their
elements do not allow, the clear link carries `aria-label` without a role, and
the primary-email radio has no label. Both pages share the theme's contrast
findings listed under upstream bugs.

### Not implemented in the React renderer

Each of these shows a visible "Not supported by the React renderer" note
instead of being dropped:

- conditional display and validation (`af-if`, `af-required`, `af-disabled`)
- defaults with tokens (static defaults work)
- Angular expressions in text (`{{ … }}`)
- field types other than Text, Email, Url, Number, Hidden, TextArea, Date,
  Select, Radio, CheckBox and DisplayOnly — notably EntityRef, ChainSelect and File
- directives outside plain HTML, forms, blocks, joins, repeats and table
  displays (for example other search display types)

## Load metrics

`frontend/e2e/compare.spec.ts` loads each page in a fresh browser context
(cold: empty HTTP cache) and in one shared context (warm), rotating the order
per round, with `debug_enabled` off. A page counts as ready when the form has
an input and the table has a data row with a link. The React demo page runs
once per layout source (see the README): `api` fetches the layout with
`Facade.getForm`, `page` finds it in the page, `bundle` parses core's compiled
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

### Reading the numbers

- **Ready time.** Most of React's lead is SearchKit's 600 ms debounce: the
  Angular table waits for it before its first request when it sits inside a
  search form.
- **Layout source.** `api` adds one round trip before `Afform.prefill` and
  `SearchDisplay.run` can start. The layout is cached in core's Angular
  cache, so `getForm` costs about 60 ms, the same as an empty API request;
  compiling it takes about 220 ms more. `page` and `bundle` start both calls
  as soon as the elements mount and are 30–270 ms faster cold. Warm, `page`
  was ahead in two of three runs: `bundle` still waits for its module file.
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

### Choosing a source

- `api` works for any `<facade-form>`, including ones added after the page
  loaded, at the cost of one round trip.
- `page` is the fastest, but the server renders every layout into each page,
  and its route must know the forms in advance.
- `bundle` also needs the forms in advance. Its file is shared with the
  Angular runtime and cached by the browser across pages, at the cost of
  parsing core's internal partial format in the browser: JS-literal
  attributes, the attribute types of `CRM_Afform_ArrayHtml`, and the edit menu
  afform_admin appends.

## Upstream bugs found on the way

All are in core, so the Angular runtime and this renderer share them.

**Self-including block crashes PHP.** Saving a form that embeds a block which
includes itself crashes the PHP process on CiviCRM up to 6.18:
`FormDataModel::parseFields` recurses into the block without a guard. Afform
runs the parser on save (through `CreateContribution::validateFormModel`),
prefill, submit and autocomplete. Core fixed it in 6.19 (commit
`375489330c`). `Facade.getForm` guards the recursion itself and rejects such a
block with an error.

**Confirmation message is not escaped.** `Afform.submit` fills tokens such as
`[Individual1.0.first_name]` in the confirmation message with the submitted
values without HTML escaping (`AbstractProcessor::replaceTokens`), and
`afForm` inserts the message as HTML. Markup typed into a field therefore
runs on the page that shows the confirmation. Tokens inside the form itself
(`af-token`) are set as text and not affected. Present on upstream `master`
as of 2026-09-29; not yet reported, and to go to the CiviCRM security team
rather than the public tracker. The React renderer inserts the message as
HTML as well, for parity.

**Theme contrast below WCAG AA.** Riverlea (stream Minetta) links on the
shaded rows of a striped table reach 4.2:1 (`#2c789b` on `#ededed`), and in
dark mode white text on grey buttons reaches 3.1:1 (`#ffffff` on `#919297`);
normal-size text needs 4.5:1. Measured with axe on CiviCRM 6.18.
