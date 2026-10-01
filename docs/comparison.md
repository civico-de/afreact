# React vs Angular renderer

The same Afform definitions are rendered twice: by core's Angular runtime on
`civicrm/afreact/angular` and by this extension's React renderer on
`civicrm/afreact/demo`. The pages share one markup, so any difference comes
from the renderer.

## Behavioural parity

`tests/browser/parity.spec.ts` runs the same scenarios against both pages and
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
theme therefore styles both renderers; `src/afreact.css` only sizes the
native controls that replace jQuery widgets.

`tests/browser/visual.spec.ts` pairs the parts of both pages — titles, fields,
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

`tests/browser/a11y.spec.ts` runs axe on both pages in light and dark mode and
fails when the React page breaks a rule on more elements than the Angular page.
Findings only on the Angular page: the select2 widgets carry roles their
elements do not allow, the clear link carries `aria-label` without a role, and
the primary-email radio has no label. Both pages share the theme's contrast
findings listed under upstream bugs.

### Not implemented in the React renderer

Each of these shows a visible "Not supported by the React renderer" note
instead of being dropped:

- Angular expressions other than `:: ts('…')` and `crmUrl(…)`
- field types other than Text, Email, Url, Number, Hidden, TextArea, Date,
  Select, Radio, CheckBox and DisplayOnly — notably EntityRef, ChainSelect and File
- range inputs in search filters (`search_range`)
- directives outside plain HTML, forms, blocks, joins, repeats, search
  fieldsets and table displays (for example tabs and other search display types)
- table features: bulk actions, in-place editing, drag to reorder, the column
  picker, task links, include columns

The support report (`civicrm/admin/afreact`) lists these per form.

## Load metrics

`tests/browser/compare.spec.ts` loads each page in a fresh browser context
(cold: empty HTTP cache) and in one shared context (warm), rotating the order
per round, with `debug_enabled` off. A page counts as ready when the form has
an input and the table has a data row with a link. The React demo page runs
once per layout source (see the README): `api` fetches the layout with
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

### Reading the numbers

- **Ready time.** Most of React's lead is SearchKit's 600 ms debounce: every
  Angular display starts its first search through the filter watcher, which
  waits for filter values to settle. The React table has no filters yet and
  starts at once; see the plan's first open decision for what keeping that
  lead takes.
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

- `api` works for any `<afreact-form>`, including ones added after the page
  loaded, at the cost of one round trip.
- `page` is the fastest, but the server renders every layout into each page,
  and its route must know the forms in advance.
- `bundle` also needs the forms in advance. Its file is shared with the
  Angular runtime and cached by the browser across pages, at the cost of
  parsing core's internal partial format in the browser: JS-literal
  attributes, the attribute types of `CRM_Afform_ArrayHtml`, and the edit menu
  afform_admin appends.

## Upstream bugs found on the way

All are in core. Unless an entry says otherwise, the Angular runtime and this
renderer share them.

**Placement lists are cached without invalidation.** `PlacementUtils::
getAfformsForPlacement()` caches the forms of each placement in the `metadata`
cache, per domain and contact. Saving, reverting or deleting an Afform clears
only the Afform scanner and the Angular cache (`_afform_clear()`), so a
deleted placed form stays in the list and the contact summary fails with a
500 until caches are flushed; a new placement appears only after a flush.
Present on upstream `master` as of 2026-09-08; not yet reported.

**Negative lower bound of a number range.** afField splits a range default or
URL value such as `-5-10` on every `-` (`('' + value).split('-')`), so the
filter becomes `>= 0` and `<= 5`. The React renderer splits the same way for
parity. Present on upstream `master` as of 2026-09-08; not yet reported.

**A saved filter set is dropped after loading.** With `#?_s=<id>` afFieldset
loads the `SearchParamSet`, then resets the fields to their defaults, so the
set's values never reach the search. The React renderer keeps them (fields the
URL leaves out take the set's values).

**Defaults overwrite loaded or copied values.** A block behind `af-if` that
opens after prefill gets its field defaults over the loaded values, and
copying a repeat item overwrites the copied values with defaults. The React
renderer keeps the loaded and copied values.

**Word replacements on Standalone.** On Standalone sites in en_US, word and
translation replacements never apply: `CRM_Core_I18n` caches an empty list
while the settings metadata is translated during boot, before the database is
known (dev/core#5862). Fix proposed in civicrm/civicrm-core#37148; the
civikitchen standalone image carries it as a patch.

**Self-including block crashes PHP.** Saving a form that embeds a block which
includes itself crashes the PHP process on CiviCRM up to 6.18:
`FormDataModel::parseFields` recurses into the block without a guard. Afform
runs the parser on save (through `CreateContribution::validateFormModel`),
prefill, submit and autocomplete. Core fixed it in 6.19 (commit
`375489330c`). `Afreact.getForm` guards the recursion itself and rejects such a
block with an error.

**Confirmation message is not escaped.** `Afform.submit` fills tokens such as
`[Individual1.0.first_name]` in the confirmation message with the submitted
values without HTML escaping (`AbstractProcessor::replaceTokens`), and
`afForm` inserts the message as HTML. Markup typed into a field therefore
runs on the page that shows the confirmation. Tokens inside the form itself
(`af-token`) are set as text and not affected. Reproduced on civikitchen with
afform 6.18.1 on both paths:
- the submitter sees their own markup run (self-XSS);
- on a form with "Verify submission before processing", a reviewer who
  processes the stored submission (`#?sid=`) gets the confirmation message
  with the submitter's markup in their own session.

The redirect URL is built by the same function without URL encoding. The
contribution checkout passes the same unescaped message to its landing page,
which sets it as `innerHTML` (read from the code, not run). Processing a
submission by `sid` also warns `Undefined variable $submission` at
`Submit.php:101`. Present on upstream `master` as of 2026-09-29; to go to the
CiviCRM security team rather than the public tracker.

afreact escapes the submitted values site-wide, whichever
renderer shows it: a `civi.api.respond` listener on `Afform.submit` rebuilds
core's message with each token value HTML-escaped and the admin's markup
kept (`Civi/Afreact/ConfirmationMessage.php`). Values that hold HTML, such
as a rich-text field, therefore show as text. A message another listener set
is left as it is. The contribution checkout sets its own; afreact escapes it
only where it equals core's (no `[token]`, no entity saved after the
contribution). The redirect and the checkout page are unchanged.

**Theme contrast below WCAG AA.** Riverlea (stream Minetta) links on the
shaded rows of a striped table reach 4.2:1 (`#2c789b` on `#ededed`), and in
dark mode white text on grey buttons reaches 3.1:1 (`#ffffff` on `#919297`);
normal-size text needs 4.5:1. Measured with axe on CiviCRM 6.18.
