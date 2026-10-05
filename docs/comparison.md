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

`tests/browser/sweep.spec.ts` renders every form of the site with both
renderers and compares what a user sees without typing: texts, fields, buttons
and the first page of each table. It reads select, reference and date widgets
for the value they show, so the differences by design below do not count, and
it leaves out the space core puts before commas in linked lists (see upstream
bugs).

## Visual parity

The React renderer writes the markup of core's Angular templates — afField and
its field templates, afRepeat, afTitle, the SearchKit table and its pager —
with the same classes, and loads the stylesheets core's Angular modules bring
for them (`crmUI.css`, `afCore.css`, the SearchKit display and in-place edit
styles). The site theme therefore styles both renderers; `src/afreact.css`
only sizes the native controls that replace jQuery widgets, and gives
editable cells a focus outline and icons at full opacity, where core dims them.

`tests/browser/visual.spec.ts` pairs the parts of both pages — titles, fields,
labels, controls, clear links, buttons, table header, sort icons, rows, pager —
and compares position, size and the main computed styles to within 2 px.
Remaining differences must be listed in the spec with a reason, and an entry
that no longer excuses anything fails the test.

### Differences by design

| Area | Angular | React |
|---|---|---|
| Select fields | select2, with option colours, icons and descriptions | native `<select>`, sized like select2, with its warning border on a required select emptied by the user (core up to 6.19 also warns on an untouched one); options show their label only |
| Date fields | jQuery UI datepicker, site input format | native `<input type="date">`, wider than the datepicker to fit its format and calendar icon |
| Search filter text shorter than `minlength` | the value is dropped from the filter while typing, so the table shows unfiltered rows | filters by what was typed |
| Clear links | `<a>` without `href`, not reachable by keyboard | same link with `role="button"`, focusable, Enter and Space |
| Admin block menus | gear menu per block for administrators | not rendered |
| API calls | calls made together share one request | one request per call |
| Reference fields (EntityRef) | select2 over `<Entity>.autocomplete` | ARIA combobox in select2's multi-select markup for single and multiple fields; the search loads with the first such field on a page. A single field shows the chosen label in its input, with a clear link |
| Stored ids the autocomplete cannot find | dropped from view, kept in the model | kept, with a visible "No record found" message |
| Chained selects (ChainSelect) | select2 | native `<select>`, options from `Afform.getOptions` as in Angular |
| In-place editors | select2, datepicker and select2 tags; text inputs at least as wide as the cell was | native `<select>`, `<input type="date">` and `datetime-local`, a colour picker beside a text input; inputs at their own width |
| Leaving an in-place editor | the editor stays open until Enter, Escape or a button | a valid change saves, an unchanged editor closes; switching windows leaves it open |
| Emptying an in-place text | saves `""` | saves `null` where the field can be emptied |
| Totals after an in-place edit | kept (see upstream bugs) | asked again |
| Drag to reorder | jQuery UI sortable, pointer only | dnd-kit: pointer, and keyboard (Space or Enter, arrow keys) with screen-reader announcements; dnd-kit loads with the first draggable table on a page. Hierarchical tables show a note instead |

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
  Select, Radio, CheckBox, DisplayOnly, EntityRef and ChainSelect — notably File
- quick-add links on reference fields (`input_attrs.quickAdd`); the field
  itself still works
- range inputs in search filters (`search_range`)
- directives outside plain HTML, forms, blocks, joins, repeats, search
  fieldsets and table displays (for example tabs and other search display types)
- table features: row editing (`editableRow`: new rows and full-row mode),
  drag to reorder in hierarchical tables, include columns
- in-place editors for contact references (EntityRef), locations, and
  multi-value text, number, date or Yes/No fields; their cells stay read-only
- bulk actions whose task is an Angular dialog (download, update, tag, merge
  tags, add relationship, and extensions' own), takes input fields
  (`apiBatch.fields`, e.g. soft credits), or uses an expression other than a
  literal, an object literal, `ids[n]`, `ids.join(',')` and the task's data
  names. They stay in the actions menu, disabled, with the note as their
  title; a row link to one alerts.

The support report (`civicrm/admin/afreact`) lists these per form; for bulk
actions it asks the server for each display's tasks.

### Bulk actions

The React table runs the tasks `SearchDisplay.getSearchTasks` returns:
API batches (enable, disable, delete, …) in a confirmation dialog with
progress, `CRM.loadForm` popups, and redirects to a new window. Selection
follows core: per page or all pages (a `return: 'id'` run), Shift for a range,
kept across sorting and paging, cleared by new filters and after a task.

| Area | Angular | React |
|---|---|---|
| Confirmation dialog | jQuery UI dialog through `dialogService` | native modal `<dialog>`: focus moves in and back to the menu button, Escape cancels before the run starts |
| Progress bar | moves forward every second while a batch runs | moves per finished batch |
| Delete task without `confirmMsg` (changed by a hook) | runs at once | asks with core's delete question |
| After a row link updates its row | reloads that row (`refreshAfterEditing`) | reloads the table |
| Select-all control | icon buttons | the same buttons with `role="checkbox"` and `aria-checked` (`mixed` for some) |
| Selection count, task result | visible count only | also announced in a live region |

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
Present on upstream `master` as of 2026-10-02; fix proposed in
[civicrm-core#37197](https://github.com/civicrm/civicrm-core/pull/37197)
(`_afform_clear()` also clears the `metadata` cache).

**"Choose undefined first".** When a chained select's control field is empty,
afField looks the control field's label up among its neighbours and puts
`Choose %1 first` in the placeholder. If that field has no label or sits
outside the nearest repeat item, join or fieldset, the placeholder reads
"Choose undefined first" (read from the code on `master` as of 2026-10-03).
The React renderer uses the control field's name instead.

**Number ranges from the URL or a default.** afField converts the value of an
Integer or Float range field to a number before splitting it, so `5-10` becomes
`NaN` and the search runs with `>= null`. It then splits on every `-` and turns
an empty bound into 0: `5` searches `>= 5 AND <= 0`, and on a Money field
`-5-10` searches `>= 0 AND <= 5`. Reproduced in the browser on 6.18.1; fixed on
`master` (6.20) in
[`d116180483`](https://github.com/civicrm/civicrm-core/commit/d116180483)
([civicrm-core#37198](https://github.com/civicrm/civicrm-core/pull/37198)). The
React renderer splits at the first `-` after a leading sign and leaves an empty
bound out: `-5-10` is −5 to 10, `5-` and `5` are `>= 5`.

**The current user as default of a multiple contact field.** afField's
`setValue()` splits a multiple field's default into a list before it compares
the value with `user_contact_id`, so the list never matches and is then typed
as numbers: the field starts as `[NaN]`, which the request sends as `[null]`
(`afField.component.js`, `master` as of 2026-10-05; read from the code, not
run). The React renderer replaces `user_contact_id` in each list item, for
form fields and search filters alike.

**Saving a case summary block also submits the case form.** The case
summary screen is a QuickForm `<form>`, so `CaseSummaryBlockPlacement` wraps
the Afform in a `div` instead of a form. The Save button has no `type`
(`ng-click="afform.submit()"`), which makes it a submit button of the case
form: a click, or Enter in a field, runs `Afform.submit` and submits the case
form as well (`master` as of 2026-10-05; read from the code, not run). The
React renderer keeps its own `<form>` inside the case form: controls submit
that form, and its submit event stops there.

**A space before the comma in linked lists.** SearchKit's `colType/link.html`
leaves whitespace between each linked value and its comma, so a multi-valued
link column reads "German , French". Fixed on `master` (6.20) in
[`6cbc2bab82`](https://github.com/civicrm/civicrm-core/commit/6cbc2bab82). The
React renderer writes the fixed markup; on 6.19 and older the Angular table
still shows the space.

**The minlength message names the required marker.** afForm words the
message for a too short text from the label's `textContent`, so a required
field reads "First Name \* must be at least 3 characters." (`master`, 6.20,
added in [`d777c0f29b`](https://github.com/civicrm/civicrm-core/commit/d777c0f29b)).
The React renderer leaves the marker out.

**A saved filter set is dropped after loading.** With `#?_s=<id>` afFieldset
loads the `SearchParamSet`, then resets the fields to their defaults, so the
set's values never reach the search. The React renderer keeps them (fields the
URL leaves out take the set's values).

**Defaults overwrite loaded or copied values.** A block behind `af-if` that
opens after prefill gets its field defaults over the loaded values, and
copying a repeat item overwrites the copied values with defaults. The React
renderer keeps the loaded and copied values.

**Join blocks are numbered in link order.** afJoin takes its record index
from a counter in afFieldset each time it links (`afJoin.directive.js`,
`afFieldset.directive.js` `getJoinOffset`). The server pairs record n with
block n of that join in the layout: the block's `data`, such as its location
type (`FormDataModel::parseFields`, `preprocessSubmittedValues`), and its
prefilled record (`loadJoins` sorts location blocks by type). The two disagree
whenever blocks link out of layout order or more than once:
- A block hidden by `af-if` at load links later, so the next block takes its
  index. With Home hidden and Work shown, the Work field shows the Home email,
  saves over the Home record, and a new email is saved as Home.
- A block shown after load takes the index after the others: Home and Work
  swap location types. Each re-show takes a new index past the blocks, where
  the block has no location type of its own.
- In a repeated fieldset all items share one counter, so item n writes its
  block to record n of its contact. The form submits `[null, {…}]`, which made
  submitting fail until 6.2 (dev/core#5801, fixed on the server by dropping
  the nulls). A later item's prefilled email still shows empty, and an email
  typed there is added beside the old one instead of updating it.

Read from the source of `master` as of 2026-10-03; `joins.spec.ts` pins the
first case in the browser. The React renderer numbers blocks by their
position in the layout, shown or not, and sends `null` for a block without a
record, as core's own prefill does for a missing location type; the server
drops the nulls and keeps the positions.

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
submission by `sid` also warned `Undefined variable $submission` at
`Submit.php:101`, fixed in 6.19
([`cb183eb64e`](https://github.com/civicrm/civicrm-core/commit/cb183eb64e)).
The missing escaping is present on upstream `master` as of 2026-10-05; to go to
the CiviCRM security team rather than the public tracker.

afreact escapes the submitted values site-wide, whichever
renderer shows it: a `civi.api.respond` listener on `Afform.submit` rebuilds
core's message with each token value HTML-escaped and the admin's markup
kept (`Civi/Afreact/ConfirmationMessage.php`). Values that hold HTML, such
as a rich-text field, therefore show as text. A message another listener set
is left as it is. The contribution checkout sets its own; afreact escapes it
only where it equals core's (no `[token]`, no entity saved after the
contribution). The redirect and the checkout page are unchanged.

**Bulk actions.** Read from the source of `master` as of 2026-10-05
(`ext/search_kit/ang/crmSearchTasks/`), not run. Where React differs it says
so:
- A batch that fails after earlier batches were applied leaves the table and
  the selection as they were (`crmSearchTaskApiBatch.ctrl.js` `onError`
  cancels the dialog), so the rows show stale values. React reloads the table
  and clears the selection whenever a batch was sent.
- The error alert shows the task's `errorMsg` in place of the server's
  message whenever the task has one. React shows both.
- Selecting all pages has no error handler
  (`searchDisplayTasksTrait.service.js` `selectAllPages`): the checkboxes stay
  disabled with no message. React shows the error and enables them again.
- A failed `getSearchTasks` leaves an empty actions menu with no message
  (`getMetadata`). React shows the error.
- A redirect task's query is replaced by its data expression (`doTask`:
  `query && $eval(query) && $eval(data)`), so `reset=1` is lost. React merges
  query and data.
- A row link to a task the server does not return opens the API batch dialog
  without an `apiBatch`, which throws (`onClickLink`). React alerts that the
  task is not offered.
- The row checkboxes have no label (`crmSearchDisplayTableBody.html`). React
  labels each with the row's first column.

**In-place editing.** Read from the source of `master` as of 2026-10-05
(`ext/search_kit/ang/crmSearchDisplay/`); 6.18 behaves the same.
- *A failed save leaves a placeholder.* `saveEditing()` closes the editor and
  marks the cell as loading before the request, and handles only success
  (`traits/searchDisplayEditableTrait.service.js:52-72`). After an error the
  cell stays a loading placeholder until the next search, and the typed value
  is lost; the error shows only as a status notice (`crmStatus`). React opens the editor
  again with the typed value and the error, marked `aria-invalid`, and
  announces "Not saved" in a live region.
- *Enter anywhere on the page saves.* The editor listens for keys on the
  document (`crmSearchDisplayEditable.component.js:47-55`): Enter in a filter
  field or another form saves the open edit, Escape anywhere cancels it. React
  listens on the editor only.
- *An emptied required field fails with "Inline edit failed."* Enter calls
  `save()` without the form's validation. The server skips an empty value for
  a field that cannot be emptied and, with nothing left to do, throws
  (`Civi/Api4/Action/SearchDisplay/InlineEdit.php:89-91, 119-121`), which
  then ends in the placeholder above. React marks the input `required` and
  checks it before sending.
- *Unchanged lists are saved.* `save()` compares with `!==` (line 73), and the
  value and its starting copy are separate arrays, so a multi-select saves
  even when nothing changed. React compares by value.
- *Totals stay stale.* `refreshAfterEditing()` replaces the row only, so the
  totals row keeps the old sums and counts. React asks for the totals again.
- *Editing needs a mouse.* An editable value is a `<span>` with `ng-click`,
  without role or tab stop (`colType/editable.html:10-15`). React makes it a
  button in the tab order with an "Edit <column>" name, opens it with Enter,
  Space or F2, and returns focus to it when the editor closes.

**"Column undefined" in the column picker.** `getColumnToggleLabel()` numbers
a column without label or key with `col.index`, which nothing sets
(`crmSearchDisplayTable.component.js:187`), so such a column is listed as
"Column undefined", and a saved filter set stores that label. React numbers it
by position ("Column 3"); a set saved by Angular for such a column therefore
does not match it in React.

**Theme contrast below WCAG AA.** Riverlea (stream Minetta) links on the
shaded rows of a striped table reach 4.2:1 (`#2c789b` on `#ededed`), and in
dark mode white text on grey buttons reaches 3.1:1 (`#ffffff` on `#919297`);
normal-size text needs 4.5:1. Measured with axe on CiviCRM 6.18.

**A failed drag-sort keeps the new order on screen.** crmSearchDisplayTable
moves the row before `SearchDisplay.inlineEdit` (`return: draggableWeight`)
answers and has no failure path but the error message, so after a refused
save the table shows an order that is not stored until the next reload. A
second drag before the first answer sends the displaced row's old weight,
which can store a different order than the one shown. Read from the code on
6.18 and `master` (2026-10-05). The React renderer puts the rows back and shows
the error, and offers no drag while a save runs.

**The weight column keeps the old numbers after a drag.**
crmSearchDisplayTable writes the weights `inlineEdit` returns into its rows
and replaces the column object "to trigger an Angular view refresh", but the
cell is repeated `track by $index` and keeps its text, so a moved row shows
its old weight until the next reload. Measured on CiviCRM 6.18 with the
drag-to-reorder browser spec. The React renderer shows the returned weights.
