# Upstream bugs found on the way

Bugs in core that came up while building the React renderer. Unless an entry
says otherwise, the Angular runtime and this renderer share them; where React
avoids one, the entry says what it does instead. An entry marked "read from the
code, not run" was found in the source and not reproduced.

## Forms and placements

**Placement lists are cached without invalidation.** `PlacementUtils::
getAfformsForPlacement()` caches the forms of each placement in the `metadata`
cache, per domain and contact. Saving, reverting or deleting an Afform clears
only the Afform scanner and the Angular cache (`_afform_clear()`), so a
deleted placed form stays in the list and the contact summary fails with a
500 until caches are flushed; a new placement appears only after a flush.
Present on upstream `master` as of 2026-10-02; fix proposed in
[civicrm-core#37197](https://github.com/civicrm/civicrm-core/pull/37197)
(`_afform_clear()` also clears the `metadata` cache).

**Saving a case summary block also submits the case form.** The case
summary screen is a QuickForm `<form>`, so `CaseSummaryBlockPlacement` wraps
the Afform in a `div` instead of a form. The Save button has no `type`
(`ng-click="afform.submit()"`), which makes it a submit button of the case
form: a click, or Enter in a field, runs `Afform.submit` and submits the case
form as well (`master` as of 2026-10-05; read from the code, not run). The
React renderer keeps its own `<form>` inside the case form: controls submit
that form, and its submit event stops there.

**Defaults overwrite loaded or copied values.** A block behind `af-if` that
opens after prefill gets its field defaults over the loaded values, and
copying a repeat item overwrites the copied values with defaults; fix proposed
in [civicrm-core#37199](https://github.com/civicrm/civicrm-core/pull/37199).
The React renderer keeps the loaded and copied values.

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

The redirect URL is built by the same function without URL encoding, so a
submitted `&`, `=` or `#` adds query parameters or cuts the URL short. The
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
contribution). The same listener rebuilds the redirect with each token value
URL-encoded, unless another listener set it, as the checkout does with its
payment URL. The checkout page is unchanged.

**An emptied field shows "null" in a token.** afForm's `getTokenValues()`
and `replaceTokens()` treat only `undefined` as empty, so a token for a field
set to `null` (a cleared number, or a cleared select of an Integer or Float field; a cleared date is `""`, a cleared String select `""`, a cleared Boolean one `false`) reads
"null" in labels, content blocks and calculated defaults (read from the code
on `master` as of 2026-10-06, not run). The React renderer shows nothing and
leaves the default's text without it.

**A token default overwrites the loaded value.** afField watches the values
of the fields a token default refers to (`afField.component.js:118-128`) and
recalculates on any change. `Afform.prefill` merges the loaded record in one
step, so when it fills a referenced field too, the next digest recalculates
and replaces the record's own value: a contact with nickname "Stored" and a
field defaulting to `Dear [Individual1.0.first_name]` opens as "Dear Ada" and
saves that (reproduced on civikitchen 6.18.1 with `afformAfreactDemoRules`,
`tests/browser/rules.spec.ts`). The React renderer keeps the loaded value
until a referenced field changes.

**A paged form's submit button has no text without `page-nav-submit-text`.**
`afTabset.html` (6.20) writes `{{ $ctrl.pageNavSubmitText }}` into the
button on the last page with no fallback; FormBuilder shows "Submit" as the
attribute's default in the editor only, so a tab set with `page-nav-buttons`
and no `page-nav-submit-text` renders an empty, unnamed button (read from the
code, not run). The React renderer labels it "Submit".

## Drafts and submission

**"Draft Saved" before any draft.** afForm starts its draft watcher after
prefill, and Angular's first call of a `$watch` listener, made with the
unchanged data, marks a pristine draft as saved (`setupDraftWatcher`,
`afForm.component.js` on 6.18; read from the code, not run). Every save-draft
button therefore reads "Draft Saved", disabled, as soon as the form has
loaded. The React renderer keeps the button's own text, disabled, until the
form holds a change no draft has saved.

**A submit can cross a running draft save.** afForm lets Submit run while
`submitDraft` or a draft's upload is in flight, so the late draft answer can
leave a draft behind the submission, or the draft's upload fails with "Draft
not found" after a successful save (`afForm.component.js`, `master` as of
2026-10-06; read from the code, not run). The React renderer keeps the submit
button disabled until the draft save has ended.

**A restored draft adds keys to its extra fields.** Extra fields (an
`af-field` without a name, FormBuilder's "Extra …" fields) live in
`data.extra.fields` and are submitted as `extra: {fields: {…}}`. When
`Afform.prefill` returns a stored draft, afForm merges `extra` like an entity
list: it treats `fields` as an item index and adds empty `joins` and `fields`
keys among the field values, which the next save stores with them
(`afForm.component.js` `loadData()`, `master` as of 2026-10-06; read from the
code, not run). The React renderer restores the field values only. It sends
`extra` only once a form holds an extra field's value; afForm always sends
`extra: {fields: {}}`, which the server treats as no values.

## Fields and filters

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

**A date range's inputs have no label.** In a search range, `fields/Date.html`
gives the two datepickers the ids `<field>1` and `<field>2`, while afField's
label points at `<field>`, so neither input is labelled; the high input of the
other range templates has no label either (`master` as of 2026-10-05; read
from the code, not run). The React renderer names the pair after the label and
each input "… from" and "… to".

**A rich text field is never disabled.** `fields/RichTextEditor.html` has no
`ng-disabled`, so `af-disabled` and a saving form leave the editor writable,
and `crm-ui-richtext` never destroys the editor when `af-if` removes the field
(`master` as of 2026-10-05; read from the code, not run). The React renderer
restarts the editor on a disabled textarea, which core's CKEditor 4 opens
read-only (its `readOnly` setting follows the textarea), and destroys it with
the field.

**The current user as default of a multiple contact field.** afField's
`setValue()` splits a multiple field's default into a list before it compares
the value with `user_contact_id`, so the list never matches and is then typed
as numbers: the field starts as `[NaN]`, which the request sends as `[null]`
(`afField.component.js`, `master` as of 2026-10-05; read from the code, not
run). The React renderer replaces `user_contact_id` in each list item, for
form fields and search filters alike.

**The minlength message names the required marker.** afForm words the
message for a too short text from the label's `textContent`, so a required
field reads "First Name \* must be at least 3 characters." (`master`, 6.20,
added in [`d777c0f29b`](https://github.com/civicrm/civicrm-core/commit/d777c0f29b)).
The React renderer leaves the marker out.

**A saved filter set is dropped after loading.** With `#?_s=<id>` afFieldset
loads the `SearchParamSet`, then resets the fields to their defaults, so the
set's values never reach the search; fix proposed in
[civicrm-core#37200](https://github.com/civicrm/civicrm-core/pull/37200). The
React renderer keeps them (fields the URL leaves out take the set's values).

**Field labels and help texts are set as unfiltered HTML.** afField puts the
label, `help_pre` and `help_post` into `af-markup`, which assigns them to
`innerHTML` (`afMarkup.element.js`). Nothing purifies them on the way:
`Afform.get` purifies only `confirmation_message`. Script in an `on…`
attribute therefore runs for every visitor of the form. Only users who edit
forms or custom fields can write these texts, so this is a hardening gap
rather than an escalation (read from the code on `master` as of 2026-10-06,
not run). The React renderer keeps the HTML but only plain elements and
attributes, and React blocks `javascript:` URLs.

**Month dates in a format other than `yy-mm`.** For a date format without a
day, `crm.datepicker.js` stores the displayed text plus `-01`, so a custom
field with the format `M yy` saves `Mar 2001-01` instead of `2001-03-01` (read
from the code, not run). The React renderer stores `2001-03-01` for every
format without a day.

**A range slider is never disabled.** `fields/Range.html` has no
`ng-disabled`, so `af-disabled` and a saving form leave the slider movable
(`master` as of 2026-10-05; read from the code, not run). The React renderer
disables it with the form.

**A bound of 0 is dropped.** `fields/Number.html` and `fields/Range.html` write
`min="{{:: input_attrs.min || '' }}"`, and the same for `max`, so a minimum or
maximum of 0 leaves the input unbounded: a field limited to 0–10 accepts
negative numbers (`master` as of 2026-10-05; read from the code, not run). The
React renderer keeps a bound of 0.

**A Location filter's inputs have no label.** `afLocationInput.html` shows the
distance, unit and address with placeholders only, and afField's label points
at an id no input carries (`master` as of 2026-10-05; read from the code, not
run). The React renderer names the three as a group after the label, and each
input "Distance", "Distance unit" and "Address".

**A saved Location filter loads as false.** Restoring a filter value from a
saved filter set (`_s`) runs it through afField's `correctValueType()`, which
compares the proximity filter's object with 1 because the field is Boolean
(`master` as of 2026-10-05; read from the code, not run). The React renderer
keeps the object, also from the URL.

**A reset drops the values the URL gave.** afField fills a field from the
route parameters (`first_name=…` or `Individual1.first_name=…`) once, when it
renders; on `afFormReset` it only restores the default, while `loadData()`
prefills the URL's records again, so a reset form loses what the link filled
in (`afField.component.js`, `master` as of 2026-10-06; read from the code, not
run). The React renderer fills them again on a reset.

**`_s` in a submission form's URL.** afField sets every field the URL leaves
out to the saved filter set's value, null before the set has loaded; the
set's load, found or not, then resets the form, which drops the URL's values
as above (read from the code, not run). The React renderer reads `_s` only on
search forms.

**Clearing a Yes/No select stores "No".** afField's `getSetSelect()` turns a
Boolean field's value into `val === 'true'`, so an emptied select (`""` or
`undefined`) stores `false` (read from the code on `master` as of 2026-10-06,
not run). The React renderer stores `null`.

**A URL field is never disabled.** `fields/Url.html` has no `ng-disabled`, so
`af-disabled`, a saving form and a read-only autofill field leave URL inputs
editable (read from the code, not run). The React renderer disables them like
every other input.

**A date range shows a time input on each bound.** `afField.component.js`
fills `inputAttrs` for a `search_range` date in a `$timeout`, but
`fields/Date.html` binds each bound's `crm-ui-datepicker=":: $ctrl.inputAttrs[n]"`
once, when it links, before that timeout; the datepicker starts from empty
options and shows date and time even for a field whose `input_attrs` say
`time: false`, and the bounds' placeholders are lost (`master` as of
2026-10-08; seen on the demo's birth date range). The React renderer renders
the bounds from the field's own attributes: a date input for a date field.

## Conditions

**`IS EMPTY` reads an emptied list as filled and "No" as empty.** A
condition's `IS EMPTY` and `IS NOT EMPTY` test the value with `!val1`
(`afForm.component.js` `compareConditions()`; read from the code, not run):
a checkbox list or multi-select emptied again (`[]`) and an emptied range
(`{}`) count as filled, a Yes/No answer "No" and the number 0 as empty. The
React renderer takes unset, `""`, `[]` and `{}` as empty and `false` and `0`
as answers.

**`BETWEEN` conditions decide nothing before 6.20.** FormBuilder's condition
editor offers `BETWEEN` and `NOT BETWEEN` (`afGuiCondition.component.js`), but
`compareConditions()` had no case for them, so the clause was skipped; `master`
checks both bounds since
[`b5f0168f9c`](https://github.com/civicrm/civicrm-core/commit/b5f0168f9c)
(2026-08-17; read from the code, not run). The React renderer checks the
value against both bounds, inclusive, on every version.

## Joins and repeats

**Repeat buttons without a name.** `afRepeat.html` gives the remove button
only its icon, and the add button only the `af-repeat` value, which may be
empty; `crm-icon` hides the icon from assistive technology, so screen readers
meet a button without a name (`master` as of 2026-10-05; read from the code,
not run). The React renderer shows the same content and adds a screen-reader
name, "Add" or "Remove".

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

**The primary radio of a repeat has no name.** In a repeated join, afField
gives `is_primary` a single option with an empty label
(`afField.component.js:72-74`), and `fields/Radio.html` names each radio by
`aria-label="{{opt.label}}"`, so screen readers announce an unnamed radio
(6.18.1). The React renderer names the radio by the field's label.

**A copied repeat item is the same record.** `af-copy` appends
`angular.copy()` of the last item (`afRepeat.directive.js` `copyItem()`; read
from the code, not run), including a loaded record's `id` and its
`is_primary`, so the copy and the original submit under one ID and two join
records are primary. The React renderer copies the values without `id` and
with `is_primary` off.

## File uploads

**A failed upload still completes the submit.** afForm's uploader calls
`postProcess()` from `onCompleteAll`, which also runs when an upload failed,
so the form announces `crmFormSuccess`, closes its popup, shows its
confirmation message or redirects while the file is missing; only the
CRM.status popup reports the error (`afForm.component.js`, `master` as of
2026-10-05; read from the code, not run). The React renderer counts the
records as saved but announces nothing: it lists the failed files in its
alert, disables every field except their file inputs, and Save uploads only
those again with the same token, without a second `Afform.submit`. A failed
file is no longer required and has a "Remove file" button, so the submit can
finish without it. Once the files are uploaded or removed the form finishes as
after any submit; a user who leaves before that leaves the records saved with
nothing announced.

**Replacing a join's file never clears it.** The Replace link sets the stored
file's `id` to null and keeps `file_name`. For a join record,
`AbstractProcessor::preprocessSubmittedValues()` treats a set `file_name` as
"unchanged" and a `file_name` key that is null as "deleted", so a replaced file
without a new upload stays (`master` as of 2026-10-05; read from the code, not
run). The React renderer sends `{id: null, file_name: null}`, which clears the
field on the entity and on a join record.

**The first join record's upload carries no index.** afField sends `joinIndex:
afJoin && repeatIndex || null`, so record 0 sends null. Saving the record
casts it to 0, but uploading into a draft stores the file under an empty key
(`SubmitFile::updateDraft()`, `master` as of 2026-10-05; read from the code,
not run). The React renderer uploads a file chosen before Save Draft into the
draft after `submitDraft`, as afForm does, and sends the record's index.

**A draft's file on a new join record is lost on submit.**
`AbstractProcessor::preprocessSubmittedValues()` drops a join's stored file
and gives a join record without an id an empty placeholder, so a file uploaded
into the draft for a record the submit creates is not saved, and no upload
follows because the file is no longer pending (`master` as of 2026-10-06;
read from the code, not run). The React renderer keeps such a file and uploads
it again after the submit.

## Tabs

**`url-arg` blanks the tab set outside the Angular page.** On 6.18 afTabset
binds `url-arg` with `$scope.$bindToRoute()` (`afTabset.component.js:24`),
which needs the route of a `civicrm/a` page. On a form's own page it throws
and the tab set renders nothing (read from the code). `master` (6.20) reads
the hash with `$location.search()` instead
([`014650dbd5`](https://github.com/civicrm/civicrm-core/commit/014650dbd5)).
The React renderer keeps the tab in the hash on every page.

**A stale tab name shows an empty tab set.** On 6.18 a `url-arg` value or a
remembered tab that names no tab becomes the selected tab, so no panel shows
and no tab is active; fixed on `master` (6.20). The React renderer ignores
such a name and opens the first tab.

**A tab's title becomes a tooltip on its panel.** afTab reads `title` as a
binding but leaves the attribute on `<af-tab>`, so hovering anywhere in the
panel shows the tab's title. The React renderer drops the attribute.

**Nested tab panels in `crm-ui-tab-set`.** `crmUi/tabset.html` gives the
wrapper around all panels `role="tabpanel"`, and jQuery UI gives each panel
the same role, so every panel is a tab panel inside another one. The React
renderer leaves the wrapper without a role.

**A link inside each tab.** jQuery UI makes each `<li>` of `crmUi/tabset.html`
the tab (`role="tab"`) and leaves the `<a href>` in it focusable by click
(`tabindex="-1"`); 6.18's `afTabset.html` writes `role="tab"` on the `<li>` with
a link inside too. Every tab therefore holds a nested interactive element (axe
`nested-interactive`, measured on 6.18.1 for both tab sets). The React renderer
makes the link the tab, inside an item with `role="presentation"` that keeps
jQuery UI's classes, as `afTabset.html` does on `master` (6.20).

**A required field in a hidden tab blocks submit silently.** afTab hides its
panel with `ng-show`; the browser refuses to submit while a control in it is
invalid and cannot point at it, so nothing visible happens. The React
renderer selects that tab first, and the browser shows its message at the
field.

**`url-arg` loses to a literal `selected-tab`.** `afTabset.component.js`
(6.20) binds `selected-tab` two-way (`=?`) and `$onInit` overwrites
`selectedTab` with the URL's tab. A string literal cannot be assigned back, so
the first digest's binding watch finds the child changed, resets it to the
literal and throws `nonassign` (`initializeDirectiveBindings` in AngularJS
1.8): the URL's tab is dropped with a console error (read from the code, not
run). The React renderer opens the URL's tab and starts on `selected-tab`
only without one.

## Checkout

**Checkout field labels name nothing.** The templates under
`ang/afCheckout/checkoutFields/` write `<label>` without `for` beside inputs
and selects without `id`, and the checkbox template takes the field's name as
its id, which collides when a form shows the block twice; a screen reader
reads the card number input as unnamed. The select templates also set the
literal `name='field.name'`. The React renderer ties each label to its
control, names the expiry pair as a group and names each control after its
field (read from the code of 6.18.1).

**Billing state after a change of country.** The billing state select keeps
the state chosen for the previous country, and a country without states shows
"- please wait -" for good, since the fetched empty list counts as not loaded
(`afCheckoutBlock.component.js`, read from 6.18.1). The React renderer empties
the state with the country, and a country without states frees the required
select.

## Search displays

**The row count of the first search survives a filter typed right after
it.** `runSearch()` in `searchDisplayBaseTrait` asks for the count in a
second request once the rows are in. A filter change meanwhile nulls
`rowCount` and schedules the next run 600 ms later; the count of the first
run then lands in between, its guard (`requestId < _runCount`) sees no newer
run yet, and the next run keeps the stale count because `rowCount` is set.
A table filtered from 30 rows to 4 shows "30 results" and three pages for
the four rows until the next filter change. The guard came with dev/core#5965
(6.6) for the same symptom and covers only a count that lands after the
next run has started. Present on 6.18; fixed on `master` in
[civicrm-core#37253](https://github.com/civicrm/civicrm-core/pull/37253).
React asks for the count with the rows, keyed by the same filters, so a count
never outlives its filters; the tour video shows both.

**A space before the comma in linked lists.** SearchKit's `colType/link.html`
leaves whitespace between each linked value and its comma, so a multi-valued
link column reads "German , French". Fixed on `master` (6.20) in
[`6cbc2bab82`](https://github.com/civicrm/civicrm-core/commit/6cbc2bab82). The
React renderer writes the fixed markup; on 6.19 and older the Angular table
still shows the space.

**Search labels stay in the page title.** A search display adds the labels of
its filters to the title of a search page (`searchDisplayBaseTrait`, afCore's
`addTitle`), but only when there are any, so clearing the filter keeps the old
labels in the title. The React renderer shows the plain title again.

**"Column undefined" in the column picker.** `getColumnToggleLabel()` numbers
a column without label or key with `col.index`, which nothing sets
(`crmSearchDisplayTable.component.js:187`), so such a column is listed as
"Column undefined", and a saved filter set stores that label. React numbers it
by position ("Column 3"); a set saved by Angular for such a column therefore
does not match it in React.

**List, grid and tree displays.** Read from the source of `master` as of
2026-10-05 (`ext/search_kit/ang/crmSearchDisplayTree/`,
`crmSearchDisplay/traits/searchDisplayBaseTrait.service.js`), not run:
- *The tree drops rows whose parent is filtered out.* `sortTree()` keeps at the
  top level only rows without a parent value, so a row whose parent is not in
  the results (another page, a filter) is not shown at all. React shows it at
  the top level.
- *Every reload closes the tree again.* `sortTree()` sets `collapsed` from
  `collapsible: closed` on each run, so a popup form's save or a new filter
  closes the branches the user opened. React keeps them open.
- *The tree's toggle has no name or state.* The button holds an icon and the
  child count, which the theme hides while the branch is open, and no
  `aria-expanded` (`crmSearchDisplayTreeLeaf.html`). React names it
  "%1 sub-items" and sets `aria-expanded` on every button with children.
- *Focus is lost on a reload.* All three types replace their items with
  loading placeholders, so a focused link or editor in an item is removed and
  focus falls to the page. React returns it to the same control in the same
  row once the rows are back.
- *A section header for 0 reads "(none)".* The header templates show
  `row.groupHeader || ts('(none)')` (`crmSearchDisplayListHeader.html`, its grid
  twin). React shows the value and keeps "(none)" for empty ones.
- *A multi-valued field starts a section on every row.* `groupRows()` compares
  values with `!==`, and each row's list is a separate array. React compares
  them by content.

## Editing and drag ordering

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

**Full-row editing marks every cell of the row as editing.** `startEditing()`
sets `editing` on every column when `editableRow.full` is on, so the
`crm-search-field-editing` class lands on cells that hold no editor. React
marks the editable cells only.

**Dragging a row of a hierarchical table leaves its sub-rows behind.** The
table's `draggableOptions` move the row alone through the flat result list
and give it the weight of whatever row it displaces, even one under another
parent; a weight from another sibling group then puts it at an arbitrary place
among its own siblings, which core renumbers around it. React moves the row
with its sub-rows and only among its siblings.

**The "Add" row of `editableRow.create` throws per input.** The row's inputs
run `crmSearchDisplayEditable` without a row, and its `$onInit` reads
`this.row.columns[this.colIndex]` to size the input
(`crmSearchDisplayEditable.component.js:55`, since the change of 2026-07-23),
so each input logs a TypeError. The field and key handlers are set up before
that line, so the row still saves (reproduced on 6.18.1 on the custom field
options page; the line is unchanged on `master` as of 2026-10-05). The React
renderer's row has no such error.

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

## Bulk actions

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

**The download dialog never ends a failed download.** `crmSearchTaskDownload`
posts the file request without a rejection handler, so a server error leaves
the bar at 90 % and the dialog open, with its title-bar close button hidden
(read from the code on `master` as of 2026-10-06, not run). Its Cancel and
Download buttons are disabled by `$ctrl.run`, which that controller never
sets, so a second click starts a second download; Cancel and Escape still
close the dialog. The React renderer shows the server's error and closes the
dialog, and disables the buttons while the file loads.

**The tag dialog offers no tags on a contact-type search.** `crmSearchTaskTag`
queries `Tag.get` with `used_for:name CONTAINS <entity>` and saves
`entity_table:name = <entity>`, where the entity is the saved search's
`api_entity`. Tags are used for "Contact", so a search of Individuals,
Organizations or Households lists no tags at all (run on 6.18.1: the select2
holds no data). The React renderer looks tags up for "Contact" on any
contact-type search, and the EntityTag rows name that table.

**A failed relationship batch leaves its dialog hanging.** `crmSearchTaskRelationship.js`
defines no `onError`, yet the template binds the batch runner's `error` to
`$ctrl.onError(error)`; the Angular expression swallows the missing function,
so a rejected `Relationship.save` shows nothing and the dialog stays on
"Adding relationships..." (read from the code, not run). The React renderer
alerts with the server's message and closes the dialog.

**A preset relationship type breaks core's dialog.** `crmSearchTaskRelationship.js`
calls `this.onChangeRelationship()` for a `relationship_type` a
`hook_civicrm_searchKitTasks` preset in `task.values` before it assigns that
function, so the dialog throws a TypeError and shows neither the contact
field nor the type's fields (read from the code, not run). The React renderer
starts from the preset type, contact and field values, with the type locked
when `disableRelationshipSelect` is set.

**The open case dialog's Save needs no lookup.** `civiCaseTaskOpenCase.ctrl.js`
never sets `existingCount`, yet its template disables Save on
`$ctrl.existingCount === null`, so Save is enabled before `CaseContact.get`
answers; a click then throws a TypeError on `existingCaseContacts.includes`
(read from the code, not run). The React renderer enables Save once the
fields and the lookup are loaded.

**A failed open case batch leaves its dialog hanging.** As with the
relationship dialog, `civiCaseTaskOpenCase.ctrl.js` defines no `onError`
while its template binds the batch runner's `error` to `$ctrl.onError(error)`,
so a rejected `Case.save` or `Case.create` shows nothing and the dialog stays
on "Opening case..." (read from the code, not run). The React renderer keeps a
failed joint case in the dialog with the server's message and alerts for a
failed batch.

**A failed assign role batch leaves its dialog hanging.** `civiCaseTaskCaseRole.ctrl.js`
defines no `onError` either, while its template binds the batch runner's
`error` to `$ctrl.onError(error)`, so a rejected `CaseContact.get` with its
chained `Relationship.create` shows nothing and the dialog stays on "Adding
roles..." (read from the code, not run). The React renderer alerts with the
server's message and closes the dialog.

**Skipping every contact still starts the open case batch.** `submit()` in
`civiCaseTaskOpenCase.ctrl.js` cancels the dialog when no contact is left but
does not return, so `start()` runs and hides the title bar buttons of every
open jQuery UI dialog (read from the code, not run). The React renderer closes
the dialog and sends nothing.

## Batch display

**10.1 + 20.2 does not meet a target of 30.3.** `crmSearchDisplayBatch`
adds the amounts as JavaScript numbers in `getTally()` and compares the sum
with the target by `==`, so two rows of 10.1 and 20.2 against a target of 30.3
show the total in red and ask "Total Amount value 30.299999999999997 does not
match expected 30.3" before the import (seen in `batch.spec.ts`). The React
renderer rounds the sum to 15 significant digits and imports without asking.

**The new batch's Name label points nowhere.** `crmSearchDisplayBatch.html`
labels the name with `for="crm-create-new-batch-name"`, but the input's id is
`crm-create-new-batch-label`, so the field has no accessible name and a click
on the label does nothing (`batch.spec.ts` finds Angular's input by id). The
React renderer labels it.

**A failed batch save drops the changes.** `saveRows()` empties the unsaved
rows before the save and ignores a rejection, so the edits are neither kept
for the next save nor reported, and the import then runs on the old rows
(read from the code, not run). The React renderer keeps the rows unsaved and
shows the server's message.

**A removed batch row can come back.** `deleteRow()` takes the row out of the
table before `Import.delete` answers and ignores a rejection, so a failed
delete leaves the row in the import, hidden until a reload (read from the code,
not run). The React renderer removes the row once the delete succeeds.

**Copying a batch column leaves its formulas stale.** `copyCol()` writes the
value into every row and the import table, but recomputes no formula, so
copying a fee keeps every other row's net amount as it was (read from the code,
not run). The React renderer recomputes the formulas of every row.

**A formula adds strings.** `onChangeData()` evaluates `[a] + [b]` on the
values as stored, and a text input stores strings, so a formula with `+` joins
them (`"10" + "5"` is `"105"`); core's only formula, the net amount, subtracts
and is not affected (read from the code, not run). The React renderer computes
on numbers.

**Required batch values are checked on one page only.** `doImport()` asks the
Angular form whether it is valid, and the form holds only the inputs of the
current page (`resultsPage`), so an empty required value on another page of a
batch longer than the display's limit passes into the import (read from the
code, not run). The React renderer checks every row and moves to the first
row missing a value.

**A failed batch create or import hangs.** `createNewBatch()` and
`runImport()` handle no rejection, so a failed `createBatch` leaves the button
spinning and a failed `importBatch` leaves the display blocked without a
message (read from the code, not run). The React renderer shows the server's
message and lets the user try again.

**The batch import can miss the last edits.** `saveRows()` hands back the save
already running, which holds only the rows changed before it started, and
`runImport()` calls `importBatch` once that save answers. An edit made while
an autosave runs is then left out of the import (read from the code, not run).
The React renderer saves again until no edit is left, then imports.

**Leaving a batch drops its unsaved edits.** `$onDestroy` only cancels the
autosave timer, and nothing asks before the page is left, so the edits of up
to the last 10 seconds are lost on navigation (read from the code, not run).
The React renderer asks before the page is left with unsaved rows and saves
them when the display closes.

**A display-only batch column with a joined or suffixed key shows nothing.**
`crmSearchDisplayBatchBody.html` writes `row.data[col.key]`, but the rows are
keyed by the import column, `Meta::createSqlName()`, which strips the `:label`
suffix and munges dots to underscores (read from the code, not run). The React
renderer reads the import column (`col.spec.name`).

**A batch formula over a joined entity computes 0.** `onChangeData()` reads
each formula field as `data["<join>.<field>"]`, while the row is keyed by the
munged import column (`<join>_<field>`), so every field reads 0 (read from the
code, not run). The React renderer reads each field from the column showing
it.

## Chart display

**A removed chart keeps running.** `disconnectedCallback()` in chart_kit's
`civi-search-display.js` only drops the filter listener: the timers for the next
run and reload stay, and so does the `crmFormSuccess` handler bound on the
enclosing form, so a removed chart still searches and draws into a detached
node (read from the code, not run). The React renderer clears the timers when
it removes the chart; the form handler is bound anonymously and stays.

**An empty filter list breaks a chart's search.** `getJsonAttribute()` returns
a value without `{` as the raw string, so a `filters` of `[]`, the server's
empty filters, is spread as `{0: "[", 1: "]"}` into `SearchDisplay.run` (read
from the code, not run). The React renderer hands an empty list over as `{}`.

**A chart on a contact summary tab throws.** `initializeDisplay()` looks the
tab up with `querySelector(id + ' [search][display]')`, missing the `#`, so the
check never matches, and the count request then calls `.replace()` on the tab
element, a TypeError (read from the code, not run). Both renderers use the
same element and share it.

**A chart's download links and drawing are out of reach for assistive
technology.** The download links are `<a>` elements with an `onclick` and no
`href`, so the keyboard skips them, and the SVG has no text alternative (read
from the code, not run). Both renderers use the same element and share it.

**chart_kit's bundle is built anew on every read.** `Civi\ChartKit\Bundle::getAll()`
checks `$this->initialized` but never sets it, so each read re-adds every file
and fires `hook_civicrm_alterBundle` again (read from the code, not run). The
React renderer reads the bundle once per afreact element on a page, so the
hook fires that often; it adds nothing of its own to the bundle.

## Accessibility and themes

**Minetta's dark mode greys the primary button below contrast.** RiverLea's
default stream sets `--crm-primary-color` to its grey 500 (`#919297`) with
light text on it (`streams/minetta/_dark.css`), 3.1:1 where WCAG AA asks 4.5:1;
the other streams keep a passing pair in both modes. Every `btn-primary` and
`crm-button` on a core page is affected, measured on 6.18.2 with axe; the
variable is the same on `master` as of 2026-10-07. The React pages keep the
theme's button classes rather than colours of their own, and the a11y spec
accepts the finding where a core page in the same theme shows it too.

**Tab forms put an h3 under the page's h1.** The contact summary tabs for
memberships and relationships start their second section with a literal
`<h3>` (`civicrm_admin_ui/ang/afsearchTabMember.aff.html:3`,
`afformTabMember.aff.html:3`, afform's `afsearchTabRel.aff.html:3`), which
skips h2 (axe `heading-order`, 6.18.1). Both renderers show the layout's markup
as it is.

**afTitle puts an h4 under the page's h1.** `af-title` on an element other
than a fieldset or details becomes an `<h4>` (`afTitle.directive.js`),
whatever heading came before, so the filter titles of the user accounts
(`standaloneusers/ang/afsearchAdministerUserAccounts.aff.html`) and profiles
(`civicrm_admin_ui/ang/afsearchProfiles.aff.html`) pages skip h2 and h3
(axe `heading-order`, 6.18.1). Both renderers follow afTitle.

**Icon-only row links without a name.** A display link whose `text` is empty
and that has no `title`, such as the edit link of the Date Preferences
settings display (`civicrm_admin_ui/managed/SavedSearch_Settings_Date_Preferences.mgd.php`),
renders as an icon with neither text nor title (axe `link-name`, 6.18.1).
`AbstractRunAction::formatLink` keeps the link's empty text rather than the
text `getLinks` returns for the action; only `formatMultiLink` uses the
latter. Both renderers show the link as the server returns it.

**Dashboard layout needs a mouse.** Core's dashboard moves dashlets between
columns and adds them from "Available Dashlets" only by drag and drop
(`ui-sortable`, jQuery UI sortable, in `ang/crmDashboard/Dashboard.html`),
which has no keyboard path; an available dashlet has no other way onto the
dashboard. Present on 6.18 and `master` as of 2026-10-05. afreact renders
listed Afform dashlets inside core's dashboard and leaves its layout alone,
so the gap remains until the dashboard screen itself moves to React
(architecture.md, "Dashlets").

**Theme contrast below WCAG AA.** Riverlea (stream Minetta) links on the
shaded rows of a striped table reach 4.2:1 (`#2c789b` on `#ededed`), and in
dark mode white text on grey buttons reaches 3.1:1 (`#ffffff` on `#919297`);
normal-size text needs 4.5:1. Measured with axe on CiviCRM 6.18.
