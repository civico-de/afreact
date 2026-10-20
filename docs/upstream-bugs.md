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
that form, and its submit event stops there. `deviation:case-summary-own-form`

**Defaults overwrite loaded or copied values.** A block behind `af-if` that
opens after prefill gets its field defaults over the loaded values, and
copying a repeat item overwrites the copied values with defaults; fix proposed
in [civicrm-core#37199](https://github.com/civicrm/civicrm-core/pull/37199).
The React renderer keeps the loaded and copied values. `deviation:defaults-keep-loaded-values`

**Word replacements on Standalone.** On Standalone sites in en_US, word and
translation replacements never apply: `CRM_Core_I18n` caches an empty list
while the settings metadata is translated during boot, before the database is
known (dev/core#5862). Fix proposed in civicrm/civicrm-core#37148; the
civikitchen standalone image carries it as a patch.

**A new block can include itself.** Core rejects saving a form that would
embed itself, but its check (`Utils::findEmbedCycle`) knows only forms already
saved, so a new block whose layout includes itself is saved anyway
(`SavedFormHeadlessTest` saves one on 6.19.0). `Afreact.getForm` stops at the
loop and rejects such a block with an error. `deviation:self-including-block-rejected`

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
which sets it as `innerHTML` (read from the code, not run). The missing
escaping is present on upstream `master` as of 2026-10-05; to go to the
CiviCRM security team rather than the public tracker.

afreact escapes the submitted values site-wide, whichever
renderer shows it: a `civi.api.respond` listener on `Afform.submit` rebuilds
core's message with each token value HTML-escaped and the admin's markup
kept (`Civi/Afreact/ConfirmationMessage.php`). Values that hold HTML, such
as a rich-text field, therefore show as text. A message another listener set
is left as it is. The contribution checkout sets its own; afreact escapes it
only where it equals core's (no `[token]`, no entity saved after the
contribution). The same listener rebuilds the redirect with each token value
URL-encoded, unless another listener set it, as the checkout does with its
payment URL. The checkout page is unchanged. `deviation:confirmation-message-escaped`

**An emptied field shows "null" in a token.** afForm's `getTokenValues()`
and `replaceTokens()` treat only `undefined` as empty, so a token for a field
set to `null` (a cleared number, or a cleared select of an Integer or Float field; a cleared date is `""`, a cleared String select `""`, a cleared Boolean one `false`) reads
"null" in labels, content blocks and calculated defaults (read from the code
on `master` as of 2026-10-06, not run). The React renderer shows nothing and
leaves the default's text without it. `deviation:token-null-empty`

**A token default overwrites the loaded value.** afField watches the values
of the fields a token default refers to (`afField.component.js:118-128`) and
recalculates on any change. `Afform.prefill` merges the loaded record in one
step, so when it fills a referenced field too, the next digest recalculates
and replaces the record's own value: a contact with nickname "Stored" and a
field defaulting to `Dear [Individual1.0.first_name]` opens as "Dear Ada" and
saves that (reproduced on civikitchen 6.18.1 with `afformAfreactDemoRules`,
`tests/browser/rules.spec.ts`). The React renderer keeps the loaded value
until a referenced field changes. `deviation:token-default-keeps-loaded`

**A paged form's submit button has no text without `page-nav-submit-text`.**
`afTabset.html` (6.19) writes `{{ $ctrl.pageNavSubmitText }}` into the
button on the last page with no fallback; FormBuilder shows "Submit" as the
attribute's default in the editor only, so a tab set with `page-nav-buttons`
and no `page-nav-submit-text` renders an empty, unnamed button (read from the
code, not run). The React renderer labels it "Submit". `deviation:page-nav-submit-label`

**Titles in the edit menu are compiled as Angular templates.**
`AfformAdminInjector` writes the form's title and each embedded SavedSearch's
label into the edit menu with `htmlspecialchars()`, which leaves `{{ }}`
alone, and Angular then compiles the partial. A form titled `Probe {{7*6}}`
shows "Edit Probe 42 in FormBuilder" (run on 6.19). Labels come from users
with "manage own" permissions, while the menu is shown to administrators, so
this lets one user's text run as an expression in another user's session.
React renders the titles as text. `deviation:admin-menu-title-text`

## Drafts and submission

**"Draft Saved" before any draft.** afForm starts its draft watcher after
prefill, and Angular's first call of a `$watch` listener, made with the
unchanged data, marks a pristine draft as saved (`setupDraftWatcher`,
`afForm.component.js` on 6.18; read from the code, not run). Every save-draft
button therefore reads "Draft Saved", disabled, as soon as the form has
loaded. The React renderer keeps the button's own text, disabled, until the
form holds a change no draft has saved. `deviation:draft-pristine-label`

**A submit can cross a running draft save.** afForm lets Submit run while
`submitDraft` or a draft's upload is in flight, so the late draft answer can
leave a draft behind the submission, or the draft's upload fails with "Draft
not found" after a successful save (`afForm.component.js`, `master` as of
2026-10-06; read from the code, not run). The React renderer keeps the submit
button disabled until the draft save has ended. `deviation:draft-save-holds-submit`

**A restored draft adds keys to its extra fields.** Extra fields (an
`af-field` without a name, FormBuilder's "Extra …" fields) live in
`data.extra.fields` and are submitted as `extra: {fields: {…}}`. When
`Afform.prefill` returns a stored draft, afForm merges `extra` like an entity
list: it treats `fields` as an item index and adds empty `joins` and `fields`
keys among the field values, which the next save stores with them
(`afForm.component.js` `loadData()`, `master` as of 2026-10-06; read from the
code, not run). The React renderer restores the field values only. It sends
`extra` only once a form holds an extra field's value; afForm always sends
`extra: {fields: {}}`, which the server treats as no values. `deviation:draft-extra-fields-restored`

**A validate listener cannot see which record it validates.**
`preprocessSubmittedValues()` keeps only the fields placed on the form, so the
main entity's `id` is missing from `getSubmittedValues()`. The processor has
it: `loadEntities()` runs before `validate()` and stores each record it may
update in `_entityIds`. `AfformPrefillEvent` and `AfformSubmitEvent` expose
those ids, `AfformValidateEvent` does not (`master` as of 2026-10-14; read
from the code, not run). A listener that compares against the stored row can
only read the client's `getApiRequest()->getArgs()`, which may name a record
the submit will not update, so it has to check that id again itself. The submit
runs on the server, so the React renderer shares this. A fix would be small:
`Submit::validate()` passes `$this->_entityIds` to the event, which gets
`getEntityIds(string $entityName)` with the trait's logic. Not reported
upstream.

**A required extra field never passes.** `preprocessSubmittedValues()` walks
the submitted `extra` like an entity's list of records, so the required check
finds no value for any extra field, and a form with a required one fails every
submission with "… is a required field." (reproduced through `Afform.submit`
on 6.19.1; 6.20 reads the same). Fixed on `master` (6.21) in
[`a527b40fec`](https://github.com/civicrm/civicrm-core/commit/a527b40fec)
([civicrm-core#37447](https://github.com/civicrm/civicrm-core/pull/37447)).
The check still reads the form-level `extra` alone, so on `master` a required
extra field in a repeated fieldset, whose values sit in each item's `extras`,
never passes (read from the code, not run). The React renderer shares both,
except that it leaves `extra` out while no form-level extra field holds a
value: 6.19 and 6.20 then skip the check, so a required extra field that sits
only in repeated fieldsets passes there, required in the browser alone
(reproduced through `Afform.submit` on 6.19.1).

**`crmFormError` carries an earlier submit's response.** afForm keeps
`submissionResponse` from the last successful `Afform.submit` and sends it
with `crmFormError` when a later submit fails, so a listener reads the
response of a submit that did not fail. A form that stays after saving
(neither redirect nor message) can be submitted again (`afForm.component.js`,
6.19.1; read from the code, not run). The React renderer sends the response
of the failing submit only, none when `Afform.submit` itself failed. `deviation:form-error-own-response`

## Fields and filters

**A late prefill overrides a newer selection.** Each choice in an autofill
field sends `Afform.prefill` and applies the answer whenever it arrives
(`afForm.component.js` `loadData`). Cleared while the request runs, the field
fills again with the cleared record; picking A and then B ends with A when A's
answer comes last. afreact applies only the answer to the field's latest
selection. `deviation:autofill-latest-selection`

**A required rich text or proximity field can be submitted empty.**
`fields/RichTextEditor.html` and `afLocationInput` set no `ng-required`, so
the form shows the required marker but sends the empty field; only the server
rejects it. React marks the textarea, the distance and the address required.
`deviation:required-rich-text-location`

**"Choose undefined first".** When a chained select's control field is empty,
afField looks the control field's label up among its neighbours and puts
`Choose %1 first` in the placeholder. If that field has no label or sits
outside the nearest repeat item, join or fieldset, the placeholder reads
"Choose undefined first" (read from the code on `master` as of 2026-10-03).
The React renderer uses the control field's name instead. `deviation:chain-select-control-name`

**Number ranges from the URL or a default.** afField converts the value of an
Integer or Float range field to a number before splitting it, so `5-10` becomes
`NaN` and the search runs with `>= null`. It then splits on every `-` and turns
an empty bound into 0: `5` searches `>= 5 AND <= 0`, and on a Money field
`-5-10` searches `>= 0 AND <= 5`. Reproduced in the browser on 6.18.1; fixed on
`master` (6.20) in
[`d116180483`](https://github.com/civicrm/civicrm-core/commit/d116180483)
([civicrm-core#37198](https://github.com/civicrm/civicrm-core/pull/37198)). The
React renderer splits at the first `-` after a leading sign and leaves an empty
bound out: `-5-10` is −5 to 10, `5-` and `5` are `>= 5`. `deviation:number-range-bounds`

**A date range's inputs have no label.** In a search range, `fields/Date.html`
gives the two datepickers the ids `<field>1` and `<field>2`, while afField's
label points at `<field>`, so neither input is labelled; the high input of the
other range templates has no label either (`master` as of 2026-10-05; read
from the code, not run). The React renderer names the pair after the label and
each input "… from" and "… to". `deviation:range-bounds-labelled`

**A rich text field is never disabled.** `fields/RichTextEditor.html` has no
`ng-disabled`, so `af-disabled` and a saving form leave the editor writable,
and `crm-ui-richtext` never destroys the editor when `af-if` removes the field
(`master` as of 2026-10-05; read from the code, not run). The React renderer
restarts the editor on a disabled textarea, which core's CKEditor 4 opens
read-only (its `readOnly` setting follows the textarea), and destroys it with
the field. `deviation:rich-text-disabled`

**The current user as default of a multiple contact field.** afField's
`setValue()` splits a multiple field's default into a list before it compares
the value with `user_contact_id`, so the list never matches and is then typed
as numbers: the field starts as `[NaN]`, which the request sends as `[null]`
(`afField.component.js` on 6.19 and 6.20; read from the code, not run). Fixed
on `master` (6.21) in
[`830c9990b9`](https://github.com/civicrm/civicrm-core/commit/830c9990b9)
([civicrm-core#37457](https://github.com/civicrm/civicrm-core/pull/37457)),
which replaces it in each list item. The React renderer does so on every
version, for form fields and search filters alike. `deviation:current-user-multiple-default`

**The minlength message names the required marker.** afForm words the
message for a too short text from the label's `textContent`, so a required
field reads "First Name \* must be at least 3 characters." (`master`, 6.20,
added in [`d777c0f29b`](https://github.com/civicrm/civicrm-core/commit/d777c0f29b)).
The React renderer leaves the marker out. `deviation:minlength-message-without-marker`

**A saved filter set is dropped after loading.** With `#?_s=<id>` afFieldset
loads the `SearchParamSet`, then resets the fields to their defaults, so the
set's values never reach the search (6.19.1). Fixed for 6.19.2 and in 6.20
after 6.20.beta1 by
[`a800e1c1f4`](https://github.com/civicrm/civicrm-core/commit/a800e1c1f4)
([civicrm-core#37200](https://github.com/civicrm/civicrm-core/pull/37200),
backported in [civicrm-core#37436](https://github.com/civicrm/civicrm-core/pull/37436)):
the reset fills each field from the URL, else from the set. The React renderer
does so on every version. `deviation:saved-filter-set-kept`

**A saved filter set that fails to load is passed over without a word.**
afFieldset loads the set the URL names (`#?_s=<id>`) with no rejection
handler, so a failed load shows no message and never resets the form: the
fields the URL leaves out keep the empty value they hold until the set
arrives, without their defaults, and the search runs without them
(`afFieldset.directive.js`, `afField.component.js`, master, read from the
code, not run). The React renderer shows the error above the fields, gives
those fields their defaults, as for an id that names no set, and searches
with them. `deviation:param-set-load-error-shown`

**The saved search picker loses or hides errors.** `afSearchParamSets` turns
a failed list into a fake set named "Error fetching Saved Searches", leaves
its saving spinner up forever when an update fails, and drops a failed delete
without a word (`afSearchParamSets.component.js`, 6.19, read from the code,
not run). The React renderer shows each error, the update's in its dialog. `deviation:param-sets-show-errors`

**The saved search picker offers "Save changes" for an unchanged set.**
`afSearchParamSets` compares the set's `filters` and `columns` with the
current ones as JSON strings, but the server returns a set saved without
column choices with `columns` as `[]` or `null`, never the `{}` the current
values hold, and keys may come back in another order; so "Save changes" shows
as soon as such a set is picked (read from the code, not run). The React
renderer compares the values with sorted keys and an empty list equal to an
empty object. `deviation:param-set-unchanged-compare`

**A saved set's details fail on a removed field and blank Yes/No values.**
The picker's details look up each filter's field and read its `options`, so a
set holding a filter whose field the form no longer has throws; and a Yes/No
field's options are added by afField, not written in its `defn` attribute,
so `false` shows as nothing (6.19; the blank seen on the dev stack). The
React renderer shows the field's name for a removed field and "Yes" or "No". `deviation:param-set-details-robust`

**The saved search choice has no label.** The picker's `<select>` carries
neither a label nor an `aria-label` (6.19). The React renderer names it
"Saved searches". `deviation:param-sets-select-label`

**Field labels and help texts are set as unfiltered HTML.** afField puts the
label, `help_pre` and `help_post` into `af-markup`, which assigns them to
`innerHTML` (`afMarkup.element.js`). Nothing purifies them on the way:
`Afform.get` purifies only `confirmation_message`. Script in an `on…`
attribute therefore runs for every visitor of the form. Only users who edit
forms or custom fields can write these texts, so this is a hardening gap
rather than an escalation (read from the code on `master` as of 2026-10-06,
not run). The React renderer keeps the HTML but only plain elements and
attributes, and React blocks `javascript:` URLs. `deviation:field-markup-filtered`

**Month dates in a format other than `yy-mm`.** For a date format without a
day, `crm.datepicker.js` stores the displayed text plus `-01`, so a custom
field with the format `M yy` saves `Mar 2001-01` instead of `2001-03-01` (read
from the code, not run). The React renderer stores `2001-03-01` for every
format without a day. `deviation:month-date-any-format`

**A range slider is never disabled.** `fields/Range.html` has no
`ng-disabled`, so `af-disabled` and a saving form leave the slider movable
(`master` as of 2026-10-05; read from the code, not run). The React renderer
disables it with the form. `deviation:range-slider-disabled`

**A bound of 0 is dropped.** `fields/Number.html` and `fields/Range.html` write
`min="{{:: input_attrs.min || '' }}"`, and the same for `max`, so a minimum or
maximum of 0 leaves the input unbounded: a field limited to 0–10 accepts
negative numbers (`master` as of 2026-10-05; read from the code, not run). The
React renderer keeps a bound of 0. `deviation:number-bound-zero`

**A Location filter's inputs have no label.** `afLocationInput.html` shows the
distance, unit and address with placeholders only, and afField's label points
at an id no input carries (`master` as of 2026-10-05; read from the code, not
run). The React renderer names the three as a group after the label, and each
input "Distance", "Distance unit" and "Address". `deviation:location-inputs-labelled`

**A saved Location filter loads as false.** Restoring a filter value from a
saved filter set (`_s`) runs it through afField's `correctValueType()`, which
compares the proximity filter's object with 1 because the field is Boolean
(`master` as of 2026-10-05; read from the code, not run). The React renderer
keeps the object, also from the URL. `deviation:location-filter-object-kept`

**A reset drops the values the URL gave.** afField fills a field from the
route parameters (`first_name=…` or `Individual1.first_name=…`) once, when it
renders; on `afFormReset` it only restores the default, while `loadData()`
prefills the URL's records again, so a reset form loses what the link filled
in (`afField.component.js`, `master` as of 2026-10-06; read from the code, not
run). The React renderer fills them again on a reset. `deviation:reset-refills-route-values`

**`_s` in a submission form's URL.** afField sets every field the URL leaves
out to the saved filter set's value, null before the set has loaded; the
set's load, found or not, then resets the form, which drops the URL's values
as above (read from the code, not run). The React renderer reads `_s` only on
search forms.

**Clearing a Yes/No select stores "No".** afField's `getSetSelect()` turns a
Boolean field's value into `val === 'true'`, so an emptied select (`""` or
`undefined`) stores `false` (read from the code on `master` as of 2026-10-06,
not run). The React renderer stores `null`. `deviation:boolean-select-cleared-null`

**A URL field is never disabled.** `fields/Url.html` has no `ng-disabled`, so
`af-disabled`, a saving form and a read-only autofill field leave URL inputs
editable (read from the code, not run). The React renderer disables them like
every other input. `deviation:url-input-disabled`

**A date range shows a time input on each bound.** `afField.component.js`
fills `inputAttrs` for a `search_range` date in a `$timeout`, but
`fields/Date.html` binds each bound's `crm-ui-datepicker=":: $ctrl.inputAttrs[n]"`
once, when it links, before that timeout; the datepicker starts from empty
options and shows date and time even for a field whose `input_attrs` say
`time: false`, and the bounds' placeholders are lost (seen on the demo's birth
date range; fixed on `master` by civicrm-core#37112 of 2026-09-28, which sets
`inputAttrs` before the template links). The React renderer renders the bounds
from the field's own attributes: a date input for a date field. `deviation:date-range-bound-type`

**A date-only column without a time setting asks for a time.** The datepicker
shows a time input unless `input_attrs.time` is `false` (`crm.datepicker.js`),
and `crmUiDatepicker` then calls a value without time incomplete. Core fields
without a `format_type` carry no `time` setting, so a `date` column such as
`Discount.start_date` asks for a time it cannot store, while the form builder's
"Show Time" item is hidden for every such field. afreact reads a missing setting
from the column: a timestamp takes date and time, as in core, a date only the
date; the builder offers "Show Time" for a field that shows one, takes a default
with time there, and a relative default such as `now` keeps its time. `deviation:date-time-by-type`

**A saved search set in the route empties entity fields.** afField's
routeParams watcher reads `_s` for every field outside the extra fieldset, and
an entity fieldset has no selected search set, so `#?_s=3` sets each of its
fields that the route does not name to null. The React renderer reads `_s` in
search fieldsets only. `deviation:route-search-set-skips-entities`

**A false or 0 under an operator is dropped.** afField's `setValue()` keeps
`value[search_operator]` only when it is truthy, so a saved filter set or stored
values holding `{"=": false}` or `{"=": 0}` load as no filter, although
`getFilterValues()` saved them. The React renderer keeps every value that is
present. `deviation:operator-falsy-value-kept`

## Conditions

**A rule on a second join block tests the first.** Up to 6.20 the conditional
rules dialog keys each join's fields as `Individual1[0][joins][Email][0][email]`
(`afGuiConditionalDialog.ctrl.js`), so with a Home and a Work email block it
offers "Email" twice under one name, and both rules test the first block (read
from the code, not run). Fixed on `master` (6.21) in
[civicrm-core#37004](https://github.com/civicrm/civicrm-core/pull/37004) and
[civicrm-core#37577](https://github.com/civicrm/civicrm-core/pull/37577), which
number the blocks over all of the entity's fieldsets, as the server does, and
label them "Email 1", "Email 2". React numbers and labels them so on every
version. The Angular runtime numbers the blocks per fieldset, so a block in a
second fieldset of the entity shares record 0 with the first fieldset's block
(measured on 6.19.1, see "Join blocks are numbered in link order"), and a rule
on "Email 2" tests record 1, which no block shows or fills. React's runtime
numbers over the entity, as the server and the 6.21 builder do.
`deviation:condition-join-block-index`

**`IS EMPTY` reads an emptied list as filled and "No" as empty.** A
condition's `IS EMPTY` and `IS NOT EMPTY` test the value with `!val1`
(`afForm.component.js` `compareConditions()`; read from the code, not run):
a checkbox list or multi-select emptied again (`[]`) and an emptied range
(`{}`) count as filled, a Yes/No answer "No" and the number 0 as empty. The
React renderer takes unset, `""`, `[]` and `{}` as empty and `false` and `0`
as answers. `deviation:condition-is-empty-values`

## Joins and repeats

**Selecting another record keeps the last one's join records.** An autofill
field merges the selected record's joins into the form by position
(`afForm.component.js` `loadData`, `angular.merge`). The prefill returns only
the new record's join records (`AbstractProcessor::loadJoins`), so after
contact A with two emails, picking contact B with one leaves A's second email,
id included, and the submission saves it as B's. afreact keeps a join record
past the loaded ones only when it has no id, as one typed into the form.
`deviation:loaded-joins-replace-stored`

**Repeat buttons without a name.** `afRepeat.html` gives the remove button
only its icon, and the add button only the `af-repeat` value, which may be
empty; `crm-icon` hides the icon from assistive technology, so screen readers
meet a button without a name (`master` as of 2026-10-05; read from the code,
not run). The React renderer shows the same content and adds a screen-reader
name, "Add" or "Remove item n". `deviation:repeat-button-names`

**Join blocks are numbered in link order.** afJoin takes its record index
from a counter in afFieldset each time it links (`afJoin.directive.js`,
`afFieldset.directive.js` `getJoinOffset`). The server pairs record n with
block n of that join among all of the entity's fieldsets in layout order: the
block's `data`, such as its location type (`FormDataModel::parseFields` merges
it per entity, `preprocessSubmittedValues`), and its prefilled record
(`loadJoins` sorts location blocks by type). The two disagree whenever blocks
link out of layout order, more than once, or in more than one fieldset:
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
- Each fieldset has its own counter, so the blocks of a second fieldset of the
  entity start again at record 0 (unchanged on `master` as of 2026-10-20).
  Measured on 6.19.1 with the contact's Home block in one fieldset and its
  Work block in a second: both fields show and edit one value; a new contact
  gets one email, saved as Home with the value typed last; a contact with a
  Home and a Work email shows the Home email in both blocks, and an address
  typed into the Work block overwrites the Home record while the Work record
  stays as it was.

Read from the source of `master` as of 2026-10-03; `joins.spec.ts` pins the
first and the last case in the browser. The React renderer numbers blocks by
their position among the entity's blocks over all its fieldsets, shown or not,
as the server and the 6.21 builder do. Each item of a repeated fieldset is a
record of its own with that list of blocks, so all items use the same numbers.
React sends `null` for a block without a record, as core's own prefill does for
a missing location type; the server drops the nulls and keeps the positions.
A repeated join block is left out of the runtime's numbers but counted by the
builder's tokens; a layout mixing repeated and single blocks of one join has no
consistent numbering, since the server merges all of that join's blocks into one.
`deviation:join-blocks-layout-order`

**The primary radio of a repeat has no name.** In a repeated join, afField
gives `is_primary` a single option with an empty label
(`afField.component.js:72-74`), and `fields/Radio.html` names each radio by
`aria-label="{{opt.label}}"`, so screen readers announce an unnamed radio
(6.18.1). The React renderer names the radio by the field's label. `deviation:repeat-primary-radio-name`

**A copied repeat item is the same record.** `af-copy` appends
`angular.copy()` of the last item (`afRepeat.directive.js` `copyItem()`; read
from the code, not run), including a loaded record's `id` and its
`is_primary`, so the copy and the original submit under one ID and two join
records are primary. The React renderer copies the values without `id` and
with `is_primary` off. `deviation:repeat-copy-new-record`

**A copied repeat item shows a file it will not save.** `copyItem()` copies a
stored file's `{id, file_name}` into the new item, so its field shows the
original's file, while `AbstractProcessor::preprocessSubmittedValues()` drops
an unchanged file and gives a new join record an empty placeholder; the copy
is saved without the file it displayed (read from the code, not run). The
React renderer leaves stored files out of a copy, whose field offers an empty
chooser. A chosen but not yet uploaded file is never copied, in core or React.
`deviation:repeat-copy-stored-file`

**An extra field in a repeated fieldset has one value for all items.** afField
binds an extra field (an `af-field` without a name) to the form-level `extra`
data wherever it sits, so each item of a repeated fieldset shows the value
typed last in any of them, and no item submits a value of its own.
`repeat-extras.spec.ts` pins it in the browser on 6.19.1. Fixed on `master`
(6.21) in [`ec294d3293`](https://github.com/civicrm/civicrm-core/commit/ec294d3293)
([civicrm-core#36186](https://github.com/civicrm/civicrm-core/pull/36186)),
which gives each item `extras` beside its `fields`; a copied item starts
without them. An extra field in a repeated join block keeps one value for all
its records, also on `master`: a join record holds only the join entity's
fields, so the submission has no place for a value per record, and the React
renderer shares this. For a fieldset's items it keeps `extras` on every
version; the stored submission keeps them per item on 6.19.1, and 6.19 and
6.20 hand them to submit subscribers (read from the code, not run). For an
extra chain select, afField asks `Afform.getOptions` under the fieldset's
entity, so a field of that entity with the same name answers; the React
renderer asks under `extra`, as both renderers name it for an autocomplete
(read from the code, not run). `deviation:repeat-extra-fields-per-item`

**A repeat shows more items at first than its maximum.** `afRepeat` adds items
up to `af-repeat-default` (or `min`) without looking at `max`, so a block set to
show 4 with a maximum of 3 opens with 4, one past what the form allows, and the
builder's "Initially show" input takes any number. React opens with at most
`max` items and marks a larger "Initially show" invalid.
`deviation:repeat-default-within-max`

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
nothing announced. `deviation:failed-upload-retry`

**Replacing a join's file never clears it.** The Replace link sets the stored
file's `id` to null and keeps `file_name`. For a join record,
`AbstractProcessor::preprocessSubmittedValues()` treats a set `file_name` as
"unchanged" and a `file_name` key that is null as "deleted", so a replaced file
without a new upload stays (`master` as of 2026-10-05; read from the code, not
run). The React renderer sends `{id: null, file_name: null}`, which clears the
field on the entity and on a join record. `deviation:replace-join-file-clears`

**The first join record's upload carries no index.** afField sends `joinIndex:
afJoin && repeatIndex || null`, so record 0 sends null. Saving the record
casts it to 0, but uploading into a draft stores the file under an empty key
(`SubmitFile::updateDraft()`, `master` as of 2026-10-05; read from the code,
not run). The React renderer uploads a file chosen before Save Draft into the
draft after `submitDraft`, as afForm does, and sends the record's index. `deviation:first-join-upload-index`

**A draft's file on a new join record is lost on submit.**
`AbstractProcessor::preprocessSubmittedValues()` drops a join's stored file
and gives a join record without an id an empty placeholder, so a file uploaded
into the draft for a record the submit creates is not saved, and no upload
follows because the file is no longer pending (`master` as of 2026-10-06;
read from the code, not run). The React renderer keeps such a file and uploads
it again after the submit. `deviation:draft-join-file-reupload`

## Tabs

**A tab's title becomes a tooltip on its panel.** afTab reads `title` as a
binding but leaves the attribute on `<af-tab>`, so hovering anywhere in the
panel shows the tab's title. The React renderer drops the attribute. `deviation:tab-title-no-tooltip`

**Nested tab panels in `crm-ui-tab-set`.** `crmUi/tabset.html` gives the
wrapper around all panels `role="tabpanel"`, and jQuery UI gives each panel
the same role, so every panel is a tab panel inside another one. The React
renderer leaves the wrapper without a role. `deviation:tabset-wrapper-no-role`

**A link inside each tab.** jQuery UI makes each `<li>` of `crmUi/tabset.html`
the tab (`role="tab"`) and leaves the `<a href>` in it focusable by click
(`tabindex="-1"`); 6.18's `afTabset.html` writes `role="tab"` on the `<li>` with
a link inside too. Every tab therefore holds a nested interactive element (axe
`nested-interactive`, measured on 6.18.1 for both tab sets). The React renderer
makes the link the tab, inside an item with `role="presentation"` that keeps
jQuery UI's classes, as `afTabset.html` does on `master`
([`f7156dc5f0`](https://github.com/civicrm/civicrm-core/commit/f7156dc5f0)). `deviation:tab-link-is-tab`

**A required field in a hidden tab blocks submit silently.** afTab hides its
panel with `ng-show`; the browser refuses to submit while a control in it is
invalid and cannot point at it, so nothing visible happens. The React
renderer selects that tab first, and the browser shows its message at the
field. `deviation:hidden-tab-invalid-field`

**A later tab does not open while the current one has an invalid field.**
From 6.19 `selectTab()` in `afTabset.component.js` refuses to move forward
while the open tab holds an `.ng-invalid` control, also in a tab set without
`page-nav-buttons` and for a required field nobody has touched yet. The click
does nothing and says nothing (measured on 6.19.0, `tabs.spec.ts`). The React
renderer opens the tab; submit and Next check the fields and show the
browser's message at the first invalid one. `deviation:later-tab-opens-invalid`

**`url-arg` loses to a literal `selected-tab`.** `afTabset.component.js`
(6.19) binds `selected-tab` two-way (`=?`) and `$onInit` overwrites
`selectedTab` with the URL's tab. A string literal cannot be assigned back, so
the first digest's binding watch finds the child changed, resets it to the
literal and throws `nonassign` (`initializeDirectiveBindings` in AngularJS
1.8): the URL's tab is dropped with a console error (read from the code, not
run). The React renderer opens the URL's tab and starts on `selected-tab`
only without one. `deviation:url-arg-over-selected-tab`

## Checkout

**Checkout field labels name nothing.** The templates under
`ang/afCheckout/checkoutFields/` write `<label>` without `for` beside inputs
and selects without `id`, and the checkbox template takes the field's name as
its id, which collides when a form shows the block twice; a screen reader
reads the card number input as unnamed. The select templates also set the
literal `name='field.name'`. The React renderer ties each label to its
control, names the expiry pair as a group and names each control after its
field (read from the code of 6.18.1). `deviation:checkout-labels-tied`

**Billing state after a change of country.** The billing state select keeps
the state chosen for the previous country, and a country without states shows
"- please wait -" for good, since the fetched empty list counts as not loaded
(`afCheckoutBlock.component.js`, read from 6.18.1). The React renderer empties
the state with the country, and a country without states frees the required
select. `deviation:billing-state-follows-country`

**The block reads a contribution value other than the one the submit
saves.** `getContributionValue()` in `afCheckoutBlock.component.js` returns
the field on the form before the af-entity's fixed `data`, and takes `0`,
`false` and `""` for unset. The submit does it the other way round: fixed
values override submitted ones (`AbstractProcessor::preprocessSubmittedValues`),
and `Civi\Checkout\Afform::startCheckout()` reads the merged record. On a form
with a fixed `checkout_option` and an option field, Angular shows the option
chosen in the field and a processor's template takes its details, while the
submit checks out with the fixed option; an amount of 0 reads as `null`
(6.19.1; read from the code, not run). The React renderer reads every
contribution value as the submit saves it, for the block itself and for a
template's `getContributionValue()`: the fixed value where the entity's data
has the key, else the field, and `null` only while empty. `deviation:checkout-value-as-saved`

**A template's `afForm.submit()` is not held.** `submit()` in
`afForm.component.js` keeps no state of its own: `$element.block()` covers the
form against clicks, but a processor's callback that calls `afForm.submit()`
again while the first submit runs sends a second `Afform.submit`, and one that
calls it while `Afform.prefill` is under way submits without the loaded
records (6.19.1; read from the code, not run). The React renderer's stand-in
for a checkout template submits only while the form's submit button is
enabled. `deviation:checkout-submit-once`

## Search displays

**Notifications run a tag label as HTML.** `CRM.alert()` takes HTML, and the
tag merge task passes the kept tag's label into it as is
(`crmSearchTaskTagMerge.ctrl.js`), as do its and the API batch's error
messages, which can quote a submitted value; a tag named `<img src=x onerror=…>`
runs its script in the success notification. afreact escapes the text and title
of every notification it raises; where a screen has no notification container,
`CRM.alert()` opens a dialog that shows text, and gets it unescaped.
`deviation:alert-text-escaped`

**A right icon on a single value shows only in the first column.** The
field and subsearch templates read `icons.right[$index]`, where `$index` is
the column's position, while the run sends the icon at index 0: a right icon
on any later column never shows. React reads index 0. `deviation:single-value-right-icon`

**A page past the last one stays empty.** `searchDisplayBaseTrait` keeps
`page` when a reload or an old link leaves it beyond the last page, e.g. after
the only row of the last page was deleted: the display shows "no results"
while the count says otherwise, and the pager marks no page as current.
React moves to the last page once the count is in. `deviation:page-past-end-clamped`

**The row count of the first search survives a filter typed right after
it.** `runSearch()` in `searchDisplayBaseTrait` asks for the count in a
second request once the rows are in. A filter change meanwhile nulls
`rowCount` and schedules the next run 600 ms later; the count of the first
run then lands in between, its guard (`requestId < _runCount`) sees no newer
run yet, and the next run keeps the stale count because `rowCount` is set.
A table filtered from 30 rows to 4 shows "30 results" and three pages for
the four rows until the next filter change. The guard came with dev/core#5965
(6.6) for the same symptom and covers only a count that lands after the
next run has started. Present on 6.18; fixed on `master` (6.20) in
[civicrm-core#37253](https://github.com/civicrm/civicrm-core/pull/37253).
React asks for the count with the rows, keyed by the same filters, so a count
never outlives its filters; the tour video shows both. `deviation:row-count-keyed-filters`

**A space before the comma in linked lists.** SearchKit's `colType/link.html`
leaves whitespace between each linked value and its comma, so a multi-valued
link column reads "German , French". Fixed on `master` (6.20) in
[`6cbc2bab82`](https://github.com/civicrm/civicrm-core/commit/6cbc2bab82). The
React renderer writes the fixed markup; on 6.19 and older the Angular table
still shows the space. `deviation:link-list-comma-space`

**Search labels stay in the page title.** A search display adds the labels of
its filters to the title of a search page (`searchDisplayBaseTrait`, afCore's
`addTitle`), but only when there are any, so clearing the filter keeps the old
labels in the title. The React renderer shows the plain title again. `deviation:title-labels-cleared`

**A display outside the search fieldset runs without its form.** The display
names its form only through the enclosing `af-fieldset`
(`searchDisplayBaseTrait`: `afform: this.afFieldset ? … : null`), although
`SearchDisplay.run` looks for the display on the whole form when it is in no
fieldset. Without the form the server ignores the `filters` attribute in the
markup for fields the display does not select, so a table placed under the
fieldset with `filters="{'status_id.is_current_member': true}"` counts every
membership. Read from the source, not run: `AbstractRunAction::_run()` also
refuses such a display with `acl_bypass` to everyone without "all CiviCRM
permissions and ACLs". Present on 6.19 and on `master` as of 2026-10-12.
React names the form for every display on it. `deviation:display-outside-fieldset-form`

**Grouped rows are selectable and draggable.** `SearchDisplay.run` gives
the rows of a grouped search no `key`, but the display editor offers bulk
actions, drag sorting and the tree for such searches as well. Read from the
source, not run: `searchDisplayTasksTrait` selects by `row.key`, so ticking
one row ticks them all and a task gets no ids; a drop sends
`draggableWeight` with no `rowKey` (`updateDraggableWeights()`). React shows
neither checkboxes nor drag handles on rows without a key, and a task link
in such a row notes that it has no record. `deviation:keyless-rows`

**"Column undefined" in the column picker.** `getColumnToggleLabel()` numbers
a column without label or key with `col.index`, which nothing sets
(`crmSearchDisplayTable.component.js:187`), so such a column is listed as
"Column undefined", and a saved filter set stores that label. React numbers it
by position ("Column 3"); a set saved by Angular for such a column therefore
does not match it in React. `deviation:column-picker-position-label`

**List, grid and tree displays.** Read from the source of `master` as of
2026-10-05 (`ext/search_kit/ang/crmSearchDisplayTree/`,
`crmSearchDisplay/traits/searchDisplayBaseTrait.service.js`), not run:
- *The tree drops rows whose parent is filtered out.* `sortTree()` keeps at the
  top level only rows without a parent value, so a row whose parent is not in
  the results (another page, a filter) is not shown at all. React shows it at
  the top level. `deviation:tree-orphans-top-level`
- *Every reload closes the tree again.* `sortTree()` sets `collapsed` from
  `collapsible: closed` on each run, so a popup form's save or a new filter
  closes the branches the user opened. React keeps them open. `deviation:tree-branches-stay-open`
- *The tree's toggle has no name or state.* The button holds an icon and the
  child count, which the theme hides while the branch is open, and no
  `aria-expanded` (`crmSearchDisplayTreeLeaf.html`). React names it
  "%1 sub-items" and sets `aria-expanded` on every button with children. `deviation:tree-toggle-name-state`
- *Focus is lost on a reload.* All three types replace their items with
  loading placeholders, so a focused link or editor in an item is removed and
  focus falls to the page. React returns it to the same control in the same
  row once the rows are back. `deviation:display-focus-across-reload`
- *A section header for 0 reads "(none)".* The header templates show
  `row.groupHeader || ts('(none)')` (`crmSearchDisplayListHeader.html`, its grid
  twin). React shows the value and keeps "(none)" for empty ones. `deviation:section-header-zero`
- *A multi-valued field starts a section on every row.* `groupRows()` compares
  values with `!==`, and each row's list is a separate array. React compares
  them by content. `deviation:section-lists-by-content`

## Editing and drag ordering

**In-place editing.** Read from the source of `master` as of 2026-10-05
(`ext/search_kit/ang/crmSearchDisplay/`); 6.18 behaves the same.
- *A failed save leaves a placeholder.* `saveEditing()` closes the editor and
  marks the cell as loading before the request, and handles only success
  (`traits/searchDisplayEditableTrait.service.js:52-72`). After an error the
  cell stays a loading placeholder until the next search, and the typed value
  is lost; the error shows only as a status notice (`crmStatus`). React opens the editor
  again with the typed value and the error, marked `aria-invalid`, and
  announces "Not saved" in a live region. `deviation:inline-edit-failed-save-reopens`
- *Enter anywhere on the page saves.* The editor listens for keys on the
  document (`crmSearchDisplayEditable.component.js:47-55`): Enter in a filter
  field or another form saves the open edit, Escape anywhere cancels it. React
  listens on the editor only. `deviation:inline-edit-keys-on-editor`
- *An emptied required field fails with "Inline edit failed."* Enter calls
  `save()` without the form's validation. The server skips an empty value for
  a field that cannot be emptied and, with nothing left to do, throws
  (`Civi/Api4/Action/SearchDisplay/InlineEdit.php:89-91, 119-121`), which
  then ends in the placeholder above. React marks the input `required` and
  checks it before sending. `deviation:inline-edit-required-checked`
- *Unchanged lists are saved.* `save()` compares with `!==` (line 73), and the
  value and its starting copy are separate arrays, so a multi-select saves
  even when nothing changed. React compares by value. `deviation:inline-edit-compare-by-value`
- *Totals stay stale.* `refreshAfterEditing()` replaces the row only, so the
  totals row keeps the old sums and counts. React asks for the totals again. `deviation:inline-edit-refreshes-totals`
- *Editing needs a mouse.* An editable value is a `<span>` with `ng-click`,
  without role or tab stop (`colType/editable.html:10-15`). React makes it a
  button in the tab order with an "Edit <column>" name, opens it with Enter,
  Space or F2, and returns focus to it when the editor closes. `deviation:inline-edit-keyboard-button`

**Full-row editing marks every cell of the row as editing.** `startEditing()`
sets `editing` on every column when `editableRow.full` is on, so the
`crm-search-field-editing` class lands on cells that hold no editor. React
marks the editable cells only. `deviation:full-row-editing-class`

**Dragging a row of a hierarchical table leaves its sub-rows behind.** The
table's `draggableOptions` move the row alone through the flat result list
and give it the weight of whatever row it displaces, even one under another
parent; a weight from another sibling group then puts it at an arbitrary place
among its own siblings, which core renumbers around it. React moves the row
with its sub-rows and only among its siblings. `deviation:tree-table-drag-with-subrows`

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
the error, and offers no drag while a save runs. `deviation:drag-sort-failure-restores`

**The weight column keeps the old numbers after a drag.**
crmSearchDisplayTable writes the weights `inlineEdit` returns into its rows
and replaces the column object "to trigger an Angular view refresh", but the
cell is repeated `track by $index` and keeps its text, so a moved row shows
its old weight until the next reload. Measured on CiviCRM 6.18 with the
drag-to-reorder browser spec. The React renderer shows the returned weights. `deviation:drag-weights-shown`

## Bulk actions

**Bulk actions.** Read from the source of `master` as of 2026-10-05
(`ext/search_kit/ang/crmSearchTasks/`), not run. Where React differs it says
so:
- A batch that fails after earlier batches were applied leaves the table and
  the selection as they were (`crmSearchTaskApiBatch.ctrl.js` `onError`
  cancels the dialog), so the rows show stale values. React reloads the table
  and clears the selection whenever a batch was sent. `deviation:bulk-failed-batch-reloads`
- The error alert shows the task's `errorMsg` in place of the server's
  message whenever the task has one. React shows both. `deviation:bulk-error-both-messages`
- A batch whose items failed reports success up to 6.19.1: a batch action
  records each failed item in the answer's `errors` instead of failing the
  call, and `crmSearchBatchRunner` counts the batch as done. Fixed in 6.20
  and 6.19.2 in [civicrm-core#37450](https://github.com/civicrm/civicrm-core/pull/37450).
  React fails the run with the items' messages on every version. `deviation:bulk-item-errors-fail`
- Selecting all pages has no error handler
  (`searchDisplayTasksTrait.service.js` `selectAllPages`): the checkboxes stay
  disabled with no message. React shows the error and enables them again. `deviation:bulk-select-all-error`
- A failed `getSearchTasks` leaves an empty actions menu with no message
  (`getMetadata`). React shows the error. `deviation:bulk-task-list-error`
- A redirect task's query is replaced by its data expression (`doTask`:
  `query && $eval(query) && $eval(data)`), so `reset=1` is lost. React merges
  query and data. `deviation:redirect-task-query-merged`
- A row link to a task the server does not return opens the API batch dialog
  without an `apiBatch`, which throws (`onClickLink`). React alerts that the
  task is not offered. `deviation:row-link-task-not-offered`
- The row checkboxes have no label (`crmSearchDisplayTableBody.html`). React
  labels each with the row's first column. `deviation:row-checkbox-label`

**The download dialog never ends a failed download.** `crmSearchTaskDownload`
posts the file request without a rejection handler, so a server error leaves
the bar at 90 % and the dialog open, with its title-bar close button hidden
(read from the code on `master` as of 2026-10-06, not run). Its Cancel and
Download buttons are disabled by `$ctrl.run`, which that controller never
sets, so a second click starts a second download; Cancel and Escape still
close the dialog. The React renderer shows the server's error and closes the
dialog, and disables the buttons while the file loads. `deviation:download-failure-closes`

**The tag dialog offers no tags on a contact-type search.** `crmSearchTaskTag`
queries `Tag.get` with `used_for:name CONTAINS <entity>` and saves
`entity_table:name = <entity>`, where the entity is the saved search's
`api_entity`. Tags are used for "Contact", so a search of Individuals,
Organizations or Households lists no tags at all (run on 6.18.1: the select2
holds no data). The React renderer looks tags up for "Contact" on any
contact-type search, and the EntityTag rows name that table. `deviation:tag-task-contact-types`

**A failed relationship batch leaves its dialog hanging.** `crmSearchTaskRelationship.js`
defines no `onError`, yet the template binds the batch runner's `error` to
`$ctrl.onError(error)`; the Angular expression swallows the missing function,
so a rejected `Relationship.save` shows nothing and the dialog stays on
"Adding relationships..." (read from the code, not run). The React renderer
alerts with the server's message and closes the dialog. `deviation:relationship-batch-failure-alerts`

**A preset relationship type breaks core's dialog.** `crmSearchTaskRelationship.js`
calls `this.onChangeRelationship()` for a `relationship_type` a
`hook_civicrm_searchKitTasks` preset in `task.values` before it assigns that
function, so the dialog throws a TypeError and shows neither the contact
field nor the type's fields (read from the code, not run). The React renderer
starts from the preset type, contact and field values, with the type locked
when `disableRelationshipSelect` is set. `deviation:relationship-preset-type`

**The open case dialog's Save needs no lookup.** `civiCaseTaskOpenCase.ctrl.js`
never sets `existingCount`, yet its template disables Save on
`$ctrl.existingCount === null`, so Save is enabled before `CaseContact.get`
answers; a click then throws a TypeError on `existingCaseContacts.includes`
(read from the code, not run). The React renderer enables Save once the
fields and the lookup are loaded. `deviation:open-case-save-waits-lookup`

**A failed open case batch leaves its dialog hanging.** As with the
relationship dialog, `civiCaseTaskOpenCase.ctrl.js` defines no `onError`
while its template binds the batch runner's `error` to `$ctrl.onError(error)`,
so a rejected `Case.save` or `Case.create` shows nothing and the dialog stays
on "Opening case..." (read from the code, not run). The React renderer keeps a
failed joint case in the dialog with the server's message and alerts for a
failed batch. `deviation:open-case-batch-failure`

**A failed assign role batch leaves its dialog hanging.** `civiCaseTaskCaseRole.ctrl.js`
defines no `onError` either, while its template binds the batch runner's
`error` to `$ctrl.onError(error)`, so a rejected `CaseContact.get` with its
chained `Relationship.create` shows nothing and the dialog stays on "Adding
roles..." (read from the code, not run). The React renderer alerts with the
server's message and closes the dialog. `deviation:case-role-batch-failure-alerts`

**Skipping every contact still starts the open case batch.** `submit()` in
`civiCaseTaskOpenCase.ctrl.js` cancels the dialog when no contact is left but
does not return, so `start()` runs and hides the title bar buttons of every
open jQuery UI dialog (read from the code, not run). The React renderer closes
the dialog and sends nothing. `deviation:skipped-contacts-send-nothing`

**The add grant dialog shares the open case dialog's faults.** `civiGrantTaskAddGrant.ctrl.js`
never sets the `existingCount` its Save button waits for, defines no `onError`
for the batch runner's `error` binding, and starts the batch after cancelling
when every contact is skipped (read from the code, not run). The React
renderer handles these as in the open case dialog above. `deviation:grant-dialog-case-fixes`

**The add grant dialog counts grants as contacts.** `civiGrantTaskAddGrant.ctrl.js`
keeps one `contact_id` per existing grant and words its warning from that
list's length, so one contact with two grants reads "2 contacts already have
grants." (read from the code, not run). The React renderer counts each contact
once. `deviation:grant-count-contacts-once`

**The merge tags dialog hangs when no selected tag is left.**
`crmSearchTaskTagMerge.ctrl.js` reads `tags[0].id` without checking that
`Tag.get` returned a row, so tags deleted since the selection throw in the
promise and leave the spinner turning (read from the code, not run). The React
renderer says that none of the selected tags exists any more. `deviation:tag-merge-none-left`

**The add translation dialog swallows a failed lookup and leaves its fields
unlabelled.** `AddTranslation.js` gives its `crmApi4` call no error handler, so
a failure leaves an empty dialog without a message, and `AddTranslation.html`
puts "Message Template" and "Locale" in `<label>`s tied to no field (read from
the code, not run). The React renderer shows the error, labels the title field
and names the locale radios as a group. `deviation:translation-dialog-labels-errors`

## ReCaptcha

**A used reCAPTCHA response is sent again.** `crmRecaptcha2.component.js`
keeps the widget's response after a failed submission and after the response
expires, while Google accepts a response only once and only for two minutes,
so every further attempt fails with "Please go back and complete the CAPTCHA"
until the visitor ticks the box anew, which the widget does not ask for (read
from the code, not run). The React renderer drops an expired response and
resets the widget after a failed submission. `deviation:recaptcha-response-once`

## Batch display

**10.1 + 20.2 does not meet a target of 30.3.** `crmSearchDisplayBatch`
adds the amounts as JavaScript numbers in `getTally()` and compares the sum
with the target by `==`, so two rows of 10.1 and 20.2 against a target of 30.3
show the total in red and ask "Total Amount value 30.299999999999997 does not
match expected 30.3" before the import (seen in `batch.spec.ts`). The React
renderer rounds the sum to 15 significant digits and imports without asking. `deviation:batch-tally-exact`

**The new batch's Name label points nowhere.** `crmSearchDisplayBatch.html`
labels the name with `for="crm-create-new-batch-name"`, but the input's id is
`crm-create-new-batch-label`, so the field has no accessible name and a click
on the label does nothing (`batch.spec.ts` finds Angular's input by id). The
React renderer labels it. `deviation:batch-name-label`

**A failed batch save drops the changes.** `saveRows()` empties the unsaved
rows before the save and ignores a rejection, so the edits are neither kept
for the next save nor reported, and the import then runs on the old rows
(read from the code, not run). The React renderer keeps the rows unsaved and
shows the server's message. `deviation:batch-save-failure-keeps-rows`

**A removed batch row can come back.** `deleteRow()` takes the row out of the
table before `Import.delete` answers and ignores a rejection, so a failed
delete leaves the row in the import, hidden until a reload (read from the code,
not run). The React renderer removes the row once the delete succeeds. `deviation:batch-delete-then-remove`

**Copying a batch column leaves its formulas stale.** `copyCol()` writes the
value into every row and the import table, but recomputes no formula, so
copying a fee keeps every other row's net amount as it was (read from the code,
not run). The React renderer recomputes the formulas of every row. `deviation:batch-copy-recomputes-formulas`

**A formula adds strings.** `onChangeData()` evaluates `[a] + [b]` on the
values as stored, and a text input stores strings, so a formula with `+` joins
them (`"10" + "5"` is `"105"`); core's only formula, the net amount, subtracts
and is not affected (read from the code, not run). The React renderer computes
on numbers. `deviation:batch-formula-numbers`

**Required batch values are checked on one page only.** `doImport()` asks the
Angular form whether it is valid, and the form holds only the inputs of the
current page (`resultsPage`), so an empty required value on another page of a
batch longer than the display's limit passes into the import (read from the
code, not run). The React renderer checks every row and moves to the first
row missing a value. `deviation:batch-required-every-page`

**A failed batch create or import hangs.** `createNewBatch()` and
`runImport()` handle no rejection, so a failed `createBatch` leaves the button
spinning and a failed `importBatch` leaves the display blocked without a
message (read from the code, not run). The React renderer shows the server's
message and lets the user try again. `deviation:batch-create-import-failure`

**The batch import can miss the last edits.** `saveRows()` hands back the save
already running, which holds only the rows changed before it started, and
`runImport()` calls `importBatch` once that save answers. An edit made while
an autosave runs is then left out of the import (read from the code, not run).
The React renderer saves again until no edit is left, then imports. `deviation:batch-import-after-last-save`

**Leaving a batch drops its unsaved edits.** `$onDestroy` only cancels the
autosave timer, and nothing asks before the page is left, so the edits of up
to the last 10 seconds are lost on navigation (read from the code, not run).
The React renderer asks before the page is left with unsaved rows and saves
them when the display closes. `deviation:batch-unsaved-on-leave`

**A display-only batch column with a joined or suffixed key shows nothing.**
`crmSearchDisplayBatchBody.html` writes `row.data[col.key]`, but the rows are
keyed by the import column, `Meta::createSqlName()`, which strips the `:label`
suffix and munges dots to underscores (read from the code, not run). The React
renderer reads the import column (`col.spec.name`). `deviation:batch-display-only-import-column`

**A batch formula over a joined entity computes 0.** `onChangeData()` reads
each formula field as `data["<join>.<field>"]`, while the row is keyed by the
munged import column (`<join>_<field>`), so every field reads 0 (read from the
code, not run). The React renderer reads each field from the column showing
it. `deviation:batch-formula-joined-columns`

## Chart display

**A removed chart keeps running.** `disconnectedCallback()` in chart_kit's
`civi-search-display.js` only drops the filter listener: the timers for the next
run and reload stay, and so does the `crmFormSuccess` handler bound on the
enclosing form, so a removed chart still searches and draws into a detached
node (read from the code, not run). The React renderer clears the timers when
it removes the chart; the form handler is bound anonymously and stays. `deviation:chart-removed-clears-timers`

**An empty filter list breaks a chart's search.** `getJsonAttribute()` returns
a value without `{` as the raw string, so a `filters` of `[]`, the server's
empty filters, is spread as `{0: "[", 1: "]"}` into `SearchDisplay.run` (read
from the code, not run). The React renderer hands an empty list over as `{}`. `deviation:chart-empty-filters-object`

**A chart on a contact summary tab throws.** `initializeDisplay()` looks the
tab up with `querySelector(id + ' [search][display]')`, missing the `#`, so the
check never matches, and the count request then calls `.replace()` on the tab
element, a TypeError (read from the code, not run). Both renderers use the
same element and share it. Fixed on `master` (6.21) in
[civicrm-core#37204](https://github.com/civicrm/civicrm-core/pull/37204), where
a chart reports no count at all.

**A chart's download links and drawing are out of reach for assistive
technology.** The download links are `<a>` elements with an `onclick` and no
`href`, so the keyboard skips them, and the SVG has no text alternative (read
from the code, not run). Both renderers use the same element and share it.

**chart_kit's bundle is built anew on every read.** `Civi\ChartKit\Bundle::getAll()`
checks `$this->initialized` but never sets it, so each read re-adds every file
and fires `hook_civicrm_alterBundle` again (read from the code, not run). The
React renderer reads the bundle once per afreact element on a page, so the
hook fires that often; it adds nothing of its own to the bundle.

**"Add field" stays on a full single-column axis.** chart_kit's column editor
shows the button when `axis.multiColumn || !$ctrl.getAxisColumnSlots(axisKey).length`,
but the controller defines no `getAxisColumnSlots`, so Angular evaluates it as
undefined and the button shows on every axis (`chartKitAdminColumns.html`). A
second column on a single-column axis is saved but skipped by the editor and
the chart. The React editor offers "Add field" only on a multi-column axis or one without a column. `deviation:chart-add-field-full-axis`

**A changed scale type keeps settings it no longer offers.** chart_kit's column
editor picks the first option of each setting only when the field changes;
switching the scale type to categorical narrows Stat Type to count and list
but leaves a stored `sum`, which Angular shows as a blank option and the chart
still applies. The React editor re-picks every setting whose stored value the
column no longer offers. `deviation:chart-scale-type-repicks`

**Old chart settings crash the editor.** `legacySettingsAdaptor()` calls
`settings.columns.find()` on pie and row charts and indexes `columns` with
`chartOrderColIndex` unchecked, so a pie stored without columns, or an order
index past the last column, throws a TypeError and the editor stays empty
(read from the code, not run). The React editor hands the adaptor an empty
column list and drops an order index that names no column. `deviation:chart-legacy-settings-guarded`

## Accessibility and themes

**Minetta's dark mode greys the primary button below contrast.** RiverLea's
default stream sets `--crm-primary-color` to its grey 500 (`#919297`) with
light text on it (`streams/minetta/_dark.css`), 3.1:1 where WCAG AA asks 4.5:1;
the other streams keep a passing pair in both modes. Every `btn-primary` and
`crm-button` on a core page is affected, measured on 6.18.2 with axe; the
variable is the same on `master` as of 2026-10-07. The React pages keep the
theme's button classes rather than colours of their own, and the a11y spec
accepts the finding where a core page in the same theme shows it too.

**RiverLea's front-end legend rule reaches back-office forms.** `_front.css`
styles public pages under `.crm-container.crm-public`, but its
`af-form > fieldset > legend { width: 100% }` has no such scope, so a titled
fieldset on any page gets a full-width legend. The default stream draws only a
top border on fieldsets, which the legend then covers but for a short dash at
each end. Angular shows both dashes. React lets the legend take its own width
outside public pages, so the border runs beside the title
(`css/afreact-form.css`). `deviation:legend-own-width`

**Tab forms put an h3 under the page's h1.** The contact summary tabs for
memberships and relationships start their second section with a literal
`<h3>` (`civicrm_admin_ui/ang/afsearchTabMember.aff.html:3`,
`afformTabMember.aff.html:3`, afform's `afsearchTabRel.aff.html:3`), which
skips h2 (axe `heading-order`, 6.18.1). Both renderers show the layout's markup
as it is.

**afTitle puts an h4 under the page's h1.** `af-title` on an element other
than a fieldset or details becomes an `<h4>` (`afTitle.directive.js`),
whatever heading came before, so the titles on the user accounts
(`standaloneusers/ang/afsearchAdministerUserAccounts.aff.html`), profiles
(`civicrm_admin_ui/ang/afsearchProfiles.aff.html`) and CiviGrant dashboard
(`civigrant/ang/afsearchCiviGrantDashboard.aff.html`) pages skip h2 and h3
(axe `heading-order`, 6.18.1; the dashboard on 6.19). Both renderers follow afTitle.

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
normal-size text needs 4.5:1. Measured with axe on CiviCRM 6.18. In light
mode Minetta's badges (`.crm-container .badge`: `--crm-primary-text-color` on
`--crm-primary-color`) reach about 2:1 (`#fafaf6` on `#afafab`), so the
search builder's "Where" clause badges fail in core's editor and in React's,
measured with axe on 6.19.0 (civikitchen image of 2026-10-11).

**FormBuilder's "View Page" link fails contrast in light mode.** The link
sits in the canvas heading with the theme's link colour, `#2c789b` on
`#d5d5d5`, about 3.4:1 where 4.5:1 is required (Minetta, axe on 6.19). React
gives it the colour of the tab labels beside it. `deviation:view-page-link-contrast`

**In-place edit placeholders fail contrast.** `crmUI.css` shows the
placeholder of an empty `crm-ui-editable` (a container without a title, say)
in `#9a9a9a`, 2.8:1 on white (6.19). React shows it in the text colour,
in italics. `deviation:editable-placeholder-contrast`

## SearchKit builder

**An invalid query timeout is dropped without a word.** The timeout is a
`type="number" min="0"` ngModel input, so a negative number sets the model to
undefined and the save keeps the stored timeout without a word (read from the
code, not run). The column is `int unsigned`. React marks a timeout that is
negative or not whole invalid and refuses to save until it is fixed.
`deviation:search-timeout-invalid-blocks-save`

**Unticking an action can enable them all.** The actions menu config treats
the list as complete once it has as many names as there are tasks
(`searchAdminTasksConfig` `toggleTask`). A saved name of a task no longer
offered, such as one of a disabled extension, counts too, so ticking or
unticking another task can switch to all enabled. afreact enables all once each
offered task is on. `deviation:tasks-all-enabled-by-name`

**Opening a display turns its old add button into a different one.** A
display saved with the legacy `addButton` shows it, via the server, as a
toolbar button that keeps its own style and opens in a popup unless it names a
target (`Run::formatToolbar`, `Display::getSettings`). The toolbar config moves
it into `toolbar` on open with the style forced to `primary` and no target,
which the link group then sets to the same page
(`searchAdminToolbarConfig.component.js`), and it moves nothing when the
toolbar is an empty list, which the server treats as none. A save without
edits thus changes how the button looks and where it opens. afreact moves the
button as the server shows it. `deviation:legacy-add-button-as-shown`

**Editing a function changes its text arguments.** The function editor reads a
quoted argument by cutting off its quotes and writes it with
`JSON.stringify` (`crmSearchAdmin.module.js` `parseArg`,
`crmSearchFunction.component.js`). The server unescapes only the quote
(`SqlString`), so each edit in the editor adds an escape: `"a\"b"` turns into `"a\\\"b"`,
and every backslash doubles. afreact reads and writes the argument as the
server does, so an argument left alone is written back as it was.
`deviation:function-string-escapes`

**A style condition on an aliased column loses its field.** The conditions of
a display's styles, a column's icons and a link look up the chosen column as a
field name (`searchAdminCssRules`, `searchAdminIcons`, `crmSearchConditions`
`getField`), so for `gender_id:label AS g` they find
no field and offer a plain text input instead of the options; a new style rule
of such a column starts without a condition on it. afreact resolves
the alias through the search's select first. Its condition then offers the
operators core allows for that field, so a rule saved with another one, such as
LIKE on an aliased date, takes the field's first operator when it is opened. `deviation:rule-condition-alias-field`

**An aliased column cannot be coloured.** The colour option looks up the
column's key as a field (`searchAdminColors` `getField`, `getColorField`), so
`gender_id:label AS g` offers no "Use Gender color", and a new column for
`gender_id AS g` gets no colours either. afreact takes the field from the column's select
expression. `deviation:column-alias-color`

**A style condition on a column without the `:label` suffix never matches.**
Conditions of a display's styles, a column's icons and a link store an option's
name (`option-key="'name'"` in `searchAdminCssRules.html`, `searchAdminIcons.html`,
`crmSearchConditions.html`), and the server compares that with the row's value
(`AbstractRunAction::getCssStyles`, `filterCompare`). That fits the `:name`
expressions the field list offers, but a raw column such as `gender_id` holds
the ID, so a rule on "Female" is never met. afreact stores the option by what
the compared column returns: its ID, name or label. `deviation:rule-condition-option-key`

**A style condition on a label column compares the admin's label.** A new
style rule starts on its column's key (`ctrl.default` in
`searchAdminCssRules.component.js`), and an aliased column (`gender_id:label AS g`)
keeps its alias in the field list, so the condition compares the row's label
with the option's name: it holds only where both read the same, and a rule
keyed on the label would break with the viewer's language or a renamed option.
afreact tests such a condition on the field's `:name`, which the server adds to
the query itself (`getCssRulesSelect`). `deviation:rule-condition-label-by-name`

**Options keyed by abbreviation, grouping or URL have no value.** SearchKit
loads an option's id, name, label, description, colour and icon, so a
condition or filter on `state_province_id:abbr` offers options without the
abbreviation it compares. afreact also loads `abbr`, `grouping` and `url`, and
leaves out an option that lacks the compared attribute. `deviation:option-key-attribute`

**A column's format can list a column twice.** The format select of a column
offers every suffix (`crmSearchAdminFields.html`), also one another column
already selects, so `gender_id` switched to Label beside `gender_id:label` puts
the same column in the search twice. afreact disables a format another column
has. `deviation:column-format-once`

**A smart group's contact column is listed twice.** When the smart group tab
opens on a search whose first column is no contact ID, core puts the contact ID
in front of the select (`crmSearchAdminGroup` `$onInit`), even where the search
already selects it further on. Picking another contact column likewise keeps
its old place. The search then has the column twice. afreact moves the column
to the front instead. `deviation:group-contact-column-once`

**A column takes the field of another item's source.** Core's
`getExprFromSelect` returns the first select item whose alias or source field
matches a column key. With `["birth_date AS dob", "display_name AS birth_date"]`
the column `birth_date` is labelled and typed as Birth Date, although it shows
the display name. afreact matches an alias first. `deviation:column-alias-before-field`

**A data entry column with an alias loses its field.** The batch display editor
looks up a column's key as a field name (`searchAdminDisplayBatch.component.js`
`toggleTally`, `getField`), so for `id AS entry_id` it finds no field: the new
display adds no total for the column, and its default value input is untyped.
afreact resolves the alias through the search's select first. `deviation:batch-column-alias-field`

**A data entry default that is not a valid number disappears on save.** The
default value input is a number input; for `1.5` in an Integer field its
`step` validation leaves the model `undefined`, so the column is saved without
a default and core says nothing. afreact names the column and refuses to save
until the default is fixed. `deviation:batch-default-invalid-blocks-save`

**A new autocomplete display searches by description.** When it sets up a
new autocomplete display, core adds `description` to the entity's
`search_fields` array in the admin metadata instead of to a copy, so the
default search fields of that display and of every later one on the page
include `description`, even for entities without such a field. afreact
searches by `id` and the entity's own search fields. `deviation:autocomplete-search-fields`

**DB entity names lose their word breaks.** Before 6.20 the DB entity editor
derives the API name with `_.capitalize(_.camelCase())`, which lowercases all
but the first letter ("my members" becomes `Mymembers`). afreact derives it as
core's later `CRM.utils.pascalCase()` does (`MyMembers`). `deviation:db-entity-pascal-case`

**Changing a subsearch filter removes it.** The subsearch column editor
should remove a filter when its field is cleared, but `onChangeFilter()` tests
`filter.field` while filters store `subsearch_field`, so every change of the
field deletes the row. afreact removes a filter only when its field is cleared. `deviation:subsearch-filter-change`

**A subsearch filter on an unsuffixed field matches nothing.** The value
input of a subsearch filter always stores the option's name, while a filter
on a column selected without a suffix (`gender_id`) compares ids, so the
subsearch runs `gender_id = 'Female'` and shows no rows. afreact stores the
name only for a `:name` filter field and the id otherwise. `deviation:subsearch-filter-value-key`

**Import reports calls as records.** The import dialog's success message
counts the API calls of the bundle, not the records they save, so a bundle
with one search and three displays reports two items. afreact counts the
saved records. `deviation:import-counts-records`

**Import checks only the first display.** Before importing, core looks up
whether a display already exists only for the first SearchDisplay record's
search; displays of further searches in the same bundle are not checked and
collide on save. afreact checks every display against its own search, matching
exact search and display name pairs. `deviation:import-checks-every-display`

**Listing accessibility.** Core's saved-search listing nests the count badge
links inside the tab links (`nested-interactive`), labels its filter inputs
only by `title` (`label-title-only`), and leaves the actions column header
empty (`empty-table-header`). afreact renders tabs as a `tablist` with arrow
keys, visible filter labels and a named actions header. `deviation:search-listing-a11y`

**Segment items reorder only by mouse.** The segment editor sorts items by
drag and drop with no keyboard path. afreact adds move-up and move-down
buttons per item. `deviation:segment-item-move-buttons`

**Removing a column leaves its sort and having behind.** The editor's
`onChangeSelect()` should drop a removed column from `orderBy` and `having`,
but the watcher calls it without the old and new select, so nothing is pruned
and the next run sorts or filters by a column that no longer exists. afreact
prunes both when a column goes. `deviation:removed-column-prunes-sort`

**Removing a join leaves aggregates and groupings on it.** `removeJoinStuff()`
drops only select entries that start with `alias.`, so a column such as
`GROUP_CONCAT(alias.email) AS …` stays, and `groupBy` is never touched; the
next run fails on a field of a join that no longer exists. afreact drops every
select and group-by expression that refers to the removed join or its nested
joins. `deviation:join-removal-prunes-expressions`

**A function grouping's label points at nothing.** Each group-by row has
`<label for="crm-search-groupBy-N">`, but the input with that id renders only
for a plain field, so a grouping by a function has an orphaned label. afreact
captions such a row as a named group instead. `deviation:groupby-function-caption`

**The smart group's contact column can be removed.** The results preview
locks a smart group's first column, which holds the members' contact IDs, but
the Select Fields tab still offers its remove button, so the next column takes
its place whether or not it holds contacts. afreact offers no remove button
for that column on either tab. `deviation:smart-group-column-kept`

**Selected columns stay selectable.** `fieldsForSelect()` passes a
`disabledIf` callback without a `return`, so fields already in the select
are never disabled; picking one does nothing because `addParam()` skips
duplicates. afreact leaves selected columns out of the list. `deviation:selected-columns-not-offered`

**A join inside a combined search breaks the union.** In a search that
combines several entities, adding a join to one set appends the joined
entity's search fields to that set's columns only, so the sets no longer
select the same number of columns and the union fails; removing such a join
shifts that set's remaining columns into the wrong rows. afreact keeps each
set's columns in their rows: a join adds no columns there, and a removed
column leaves an empty cell. `deviation:union-join-keeps-rows`

**Renaming a combined search's column leaves stale references.** When the first
set's column gets another name, core renames only an outer select item equal to
the old name (`crmSearchAdminEntitySetSelect`), so outer conditions, grouping
and sorting keep naming a column the search no longer has. afreact
renames the field in them and in the outer select too, keeping their own
suffixes such as `:label` and aliases, and inside an outer column's function
such as `COUNT(name)`. A change of suffix alone leaves them as they are, and so
do a field that another column still selects or that becomes one a column
keeps, a suffix the new field lacks, and an outer column's alias. `deviation:union-rename-outer-references`

**Removing a combined search's row drops columns another row still provides.**
Core removes every outer column built on the removed row's field
(`crmSearchAdminEntitySetSelect` `removeEntitySetRow`), so with the rows
`gender_id` and `gender_id:label`, removing the second also removes the outer
`gender_id`. afreact then removes only the outer column named like the row. `deviation:union-remove-row-keeps-shared-field`

**Removing a combined search's first set leaves stale references.** Core then
rebuilds the outer select from the next set's column names
(`crmSearchAdminEntitySetSelect` `removeEntitySet`), dropping outer functions
such as `COUNT(name) AS n`, while outer conditions, grouping and sorting keep the
old names. afreact keeps the outer select and renames it, the conditions,
grouping and sorting to the next set's columns, as when a column is renamed. A
row the next set leaves empty goes with the outer columns built on it, as when
a row is removed; conditions and sorting on it stay, as in core. `deviation:union-remove-first-renames-outer`

**A combined search's function column takes its field's type.** The fields of
an entity set search copy the first set's field behind each column
(`crmSearchAdmin.component.js` `updateEntitySetFields`), also for a function
with a result type of its own: `COUNT(birth_date) AS n` becomes a Date field,
so a condition on `n` offers a date input. afreact types such a column by the
function's result. `deviation:union-function-column-type`

**An empty default on a number column becomes 0.** When the data entry
editor renders a column's default value, `crm-search-input` converts it to
the field's data type with `Number()`, so an empty default of an Integer or
Float field that is not an ID or a reference turns into `0`, and text such
as `abc` into `NaN`, which the save stores as `null`. afreact converts
numeric text only and keeps an empty or non-numeric default as it is. `deviation:number-default-kept`

**An unfinished template path is dropped.** The custom code column's path
input is `required` with a pattern, so while it is empty or does not match
`^~/.+/.+`, ngModel sets the path to `undefined` and the display is saved
without one, losing what was typed. afreact keeps the typed path and marks the
input invalid. `deviation:include-path-kept`

## FormBuilder

**A tab's count offers its charts.** The tab menu's "Count" select lists every
search display in the tab (`getSearchDisplays()` in `afGuiTabset.component.js`),
charts included, but a chart never sets the count: chart_kit's element writes
`totalCount` only as an own property, which it never has (6.19 and 6.20, read
from the code, not run). Fixed on `master` (6.21) in
[civicrm-core#37204](https://github.com/civicrm/civicrm-core/pull/37204). React
offers the tab's other displays only. `deviation:chart-tab-count-not-offered`

**A style value with a colon is cut at it.** `afGui.getStyles()` splits each
style at every `:`, so `background-image: url(https://example.org/a.png)`
reads as `url(https`, and the next edit in the style menu writes that back.
React splits at the first colon only. `deviation:style-value-colon-kept`

**The condition badges fail contrast.** `afGuiEditor.css` dims the "If",
"And" and "Or" badges of the conditional rules dialog with `opacity: .5`, so
their white text on the theme's grey badge falls to about 2:1, below the 4.5:1
that WCAG asks (6.19, axe-core in the dialog). React shows them at full
opacity. `deviation:condition-badge-contrast`

**Typing a repeat bound overwrites the other one.** A block's minimum and
maximum apply each keystroke at once (`getSetMin`/`getSetMax` in
`afGuiContainer.component.js`), so typing a maximum of 12 over a minimum of 2
passes through 1 and leaves the minimum at 1. React lets a bound be typed
freely and moves the other bound to meet it once the input is left.
`deviation:repeat-bounds-on-blur`

**An invalid submission limit is dropped without a word.** "Max Submissions"
(total and per user) are `type="number" min="1" step="1"` ngModel inputs, so
`0` or `1.5` set the model to undefined; the saved JSON then lacks the key and
`Afform.save` keeps the stored limit while the input still shows the typed
number. React marks such a limit invalid and refuses to save until it is fixed.
`deviation:submit-limit-invalid-blocks-save`

**Typing a field's maximum below its minimum's first digit loses it.** A number
field's minimum and maximum (and a multi-select's option count) are clamped on
each keystroke (`onChangeMin`/`onChangeMax` in `afGuiField.component.js`), so
with a minimum of 10, typing a maximum of 20 turns the "2" into 10 and ends at
100. React keeps what is typed and brings a bound past the other back to it
once the input is left. `deviation:field-bounds-on-blur`

**A negative relative date offset cannot be typed.** While the offset input
holds only "-", Angular hands `defaultDateOffset` no number, which writes
`'+' + newValue` into the default, so the stored default stops being a valid
relative date until a digit follows. React leaves the stored offset alone while
the input holds no number and keeps the "-" on show.
`deviation:date-offset-minus`

**The "New Submission Form" choices are not sorted.** `afAdminListMenu`
sorts the primary entities with `_.sortBy(links, 'Label')`, a key the links
lack (they carry `label`), so the choices keep the order of afform_admin's
entity metadata (6.19, read from the code and seen in the listing). React
sorts them by label. `deviation:new-form-choices-sorted`

**The content block is not always first among the "New Field Block" choices.**
`afAdminListMenu` sorts the content block under the key `'0'` among the
entity labels, so a label starting with a space or punctuation sorts before
it (6.19, read from the code, not run). React always puts it first, then
the others by label in the same code unit order. `deviation:content-block-first`

**A search without a display label shows "null".** The "New Search Form"
choices join the search's label and `display.label`, which reads
"Label: null" for a display without a label (6.19, read from the code, not
run). React shows the search's label alone. `deviation:search-display-label-null`

**A failed load of the "New Search Form" choices spins forever.**
`afGui.getAllSearchDisplays()` never rejects its promise, so when
`SavedSearch.get` fails the menu keeps its spinner (6.19, read from the
code, not run). React shows the error and loads again on the next opening. `deviation:search-choices-load-error`

**A rich text block removed while its editor loads throws.**
`civi-rich-text-input` opens an empty block's editor at once
(`js/wysiwyg/crm.wysiwyg.js`), and the editor's scripts load before it
attaches to the textarea. `closeEditor()` cannot call that off, so a block
removed in the meantime, by opening another form or deleting the block, gets
an editor started on a detached textarea: CKEditor 4 throws "Cannot read
properties of null (reading 'unselectable')" and keeps a dead instance (6.19;
seen in React's builder with the CPU slowed six times, which uses core's
element; core's own builder read from the code, not run). A block closed
before it is removed does the same. With CKEditor 4, React keeps such a block
hidden on the page until its editor has started, then closes and removes it;
a script that never loads leaves one hidden, empty element behind.
`deviation:rich-text-starting-removed`

**An unknown form shows an empty submissions page.**
`CRM_AfformAdmin_Page_Submissions` reads the title of the form that `name`
names without checking that one was found, so a misspelt name, or a form
the user may not see, gives the title "Submissions for " with a PHP warning
and an empty table (6.19, seen on the dev stack). React says that no such
form exists that the user may see. `deviation:unknown-form-submissions`

**Two packaged contact tabs ignore their contact type filter.**
civicrm_admin_ui's `afformTabMember` and `afsearchTabMember` store
`placement_filters` as a list (`[['contact_type' => 'Organization']]`, and
`[['contact_type' => 'Individual', 'Household']]`), while the placements read
`placement_filters['contact_type']`, so both tabs show on every contact type
(6.19, read from the code). The editor then drops such a list on any save:
it replaces every list with an empty object. React keeps a filled list as it
is, says that the placements ignore it, and replaces it only when a filter is
chosen. `deviation:placement-filters-list`

**The navigation menu item's title has no label.** `config-form.html` gives
its input only the placeholder "Title", so a screen reader reads it with the
same name as the form's title and the name disappears once text is typed
(6.19, read from the code and seen on the dev stack). React keeps the
placeholder and names the input "Menu item title". `deviation:menu-item-title-label`

**The conditional rules dialog lists a field twice.** `afGui.getFormElements()`
keeps the matches of the previous element's children when the next element
has neither children nor a block, so with a container holding field A
followed by field B, A is offered twice in the field selector (6.19, read
from the code, not run). React lists each placed field once. `deviation:condition-fields-once`

**The conditional rules are stored doubly escaped.** The dialog writes the
rule's quotes as `&quot;`, which the save escapes again to `&amp;quot;`; the
runtime and `FormDataModel` decode both levels, so nothing breaks, but the
stored markup differs from hand-written forms (6.19, seen with
`Afform.convert`). React reads both and writes plain JSON, stored with
single escaping. `deviation:condition-rules-plain-json`

**An opened form counts as unsaved.** The undo history starts with the loaded
form marked saved, but `editor.afform` changes again while the editor draws
it, and the deep watcher records that as a first, unsaved step. A form opened
from the listing so shows "Save" instead of "Saved", with Undo enabled and the
browser's warning on leaving the page, though the user changed nothing (6.19,
seen on `afformQuickAddIndividual`). React shows "Saved" until the first edit. `deviation:opened-form-saved`

**Editor tabs hold controls inside the tab.** The palette marks each `<li>` as
the tab and puts the active entity's label editor (`crm-ui-editable`) inside
its link; the tab set puts each tab's gear button inside the tab's link (axe
`aria-tab-name` on 6.19; a tab's content is presentational, so the nested
control is lost to assistive technology). React renders each tab as a link
with `role="tab"`, edits the entity's label in the head of its panel and keeps
the tab set's gear menu, for the active tab, at the end of the tab bar. `deviation:editor-tab-controls-outside`

**Ctrl-Shift-Z does not redo.** The editor's `onKeyup()` compares `e.key`
with `'z'`, but with Shift held the key is `Z`, so the shortcut does nothing
(6.19, read from the code, not run). React compares the key case-blind and
redoes on Ctrl-Shift-Z. `deviation:redo-shift-z`

**Ctrl-Z in a text input undoes the form.** `onKeyup()` listens on the window
without looking at the event's target, so Ctrl-Z in a title, a placeholder or
the markup editor reverts the whole form a step besides undoing the typing
(6.19, read from the code, not run). React ignores the keys in inputs,
textareas, selects and editable text, which keep the browser's own undo. `deviation:undo-keys-outside-inputs`

**Undo during markup editing keeps the stale markup.** Undo and redo stay
enabled while the markup is being edited; `changeHistory()` switches to the
layout tab without leaving edit mode, so the edited markup stays pending and
the next save applies it over the undone form (6.19, read from the code, not
run). React disables undo and redo while the markup is being edited. `deviation:undo-off-while-markup`

**Undo cannot take back a toggle from a field's menu.** One click on, for
example, Required in a field's menu records two undo steps, both with the
field required. Undo goes back to the first; drawing the canvas again changes
the form once more, which the deep watcher records as a new step and so drops
the redo. Every further Undo repeats this, so the toggle never goes back and
Redo stays disabled (6.19, seen in the browser on a new Individual form). React
records one step per change, and undo and redo only move in the history. `deviation:undo-field-menu-toggle`

**Edits made during a save count as saved.** When `Afform.save` returns,
`doSave()` marks the snapshot current at that moment as saved, which includes
edits made while the request ran; the button shows "Saved" and leaving the
page gives no warning, though those edits were never sent (6.19, read from
the code, not run). React marks the state it sent as saved; later edits stay
unsaved. `deviation:save-keeps-later-edits`

**Entities added in the markup arrive without metadata.** Applying edited
markup rebuilds the editor's entities and search displays from the layout,
but unlike `addEntity()` and `addSearchDisplay()` never calls
`Afform.loadAdminData`, so a new entity type has no fields in the editor and
a new display no settings (6.19, read from the code, not run). React loads
the metadata of every entity type and display on the form that lacks it. `deviation:markup-entities-load-meta`

**Extra fields all get the same name.** `afGuiElements` looks for names in use
in `editor.afform.layout['#children']`, but the layout is an array without
that key, so every new extra field of a type gets the same name, such as
`text1`, and two such fields submit under one name (6.19, read from the code,
not run). React numbers each new extra field past the names on the form. `deviation:extra-field-unique-name`

**Changing placements duplicates display filters.** `onChangePlacement()`
tests `key in filterValues` on an array, which checks indexes, not values, so
each change of the placement adds every placement entity's default filter to
the search displays again (6.19, read from the code, not run). React adds a
default filter only for a placement entity that has none. `deviation:placement-filter-once`

**The locale setting has no label.** On multilingual sites the settings tab
labels the locale with `afform_fields.afform_locale.title`, but the Afform
field is `locale`, so the label and its help title are empty and only the
required marker shows (6.19, read from the code, not run). React labels it
with the `locale` field's title. `deviation:locale-setting-label`

**Behaviors on a block's tab are not saved.** `afGuiEntity` shows the entity's
behaviors, such as autofill, on a block's entity tab too, but a block's entity
is a stand-in that is not in the layout, so a chosen mode is dropped (6.19,
read from the code, not run). React shows behaviors only for entities on a
form. `deviation:behaviors-only-on-forms`

**The relationship autofill cannot be cleared.** The default behavior template
lets a behavior without a default mode be cleared (`allowClear`), but the
autofill template, which replaces it for contacts, leaves that out, and none of
its modes means "none", so a chosen autofill can only be swapped for another
(6.19, read from the code, not run). React lets the autofill be cleared. `deviation:relationship-autofill-clearable`

**Placement entities without a filter show an empty row.** The settings tab
renders a filter row for every placement entity, also one without a type
field to filter by (a placement for such an entity added by an extension), so
an unlabelled, empty select appears (6.19, read from the code, not run).
React renders rows only for entities with a filter. `deviation:placement-rows-with-filter`

**"Save as block" fails outside a fieldset.** The container menu offers "Save
as block" for a container outside any fieldset, but `saveBlock()` then calls
`getFieldEntityType()` without a field key, which throws on
`fieldKey.substr()`, and nothing happens (6.19, read from the code, not run).
React saves such a block for any entity type (`*`). `deviation:save-block-any-entity`

**The block toggle can name the wrong value.** `getButtonText()` of the
multiple/single toggle returns `false` from a `forEach` to stop at the first
unique field with a value, which does not stop it, so a block whose data sets
two such fields (from markup) is named after the last (6.19, read from the
code, not run). React names the first. `deviation:block-toggle-first-value`

**Saving a form stores the admin's translations in place of `ts()`.** The
editor loads the layout `shallow`, evaluates each `js` attribute with
`$parse(…)({ts: CRM.ts('afform')})` and saves the result `deep`, so
`defn="{label: ts('Given name')}"` comes back as the text `ts()` returned in
the admin's language: one save in a German admin session writes "Vorname"
into the form as its source text for every language, and a packaged form
becomes a local override with fixed strings (6.19, run with a translation
given to `CRM.strings`). React keeps the attribute's text and saves
the `shallow` layout as HTML; `formbuilder-editor.spec.ts` saves such a form with a translated
page and checks the attribute is stored unchanged. `deviation:save-keeps-ts-calls`

**Saving a form drops values the editor cannot resolve, or fails.** The same
evaluation turns `afform_default: options.search_query` into `undefined`,
which the save leaves out; a `js` attribute `$parse` cannot read stays a
string, and the `deep` save of that string fails with a server error, so the
form cannot be saved at all (6.19, run). React keeps both texts; the same
test covers them. `deviation:save-keeps-unread-attributes`

**A Contribution form saved as a `shallow` layout fails.** `Afform.save`
takes `layoutFormat: "shallow"`, but the contribution service's pre-save
check builds its form model from any array layout as if it were `deep`, so
the entity's `actions` is still a string and the save ends in a server error
("Cannot access offset of type string on string", 6.19, run). React converts
the layout to HTML with `Afform.convert` and saves that, which the check
parses itself. `deviation:save-sends-html`

**The markup tab turns `ts()` into `null`.** Applying edited markup converts
it `deep`, where `CRM_Utils_JS::decode()` reads `{label: ts('Given name')}`
as `{label: null}`, and the next save stores the null (6.19, `Afform.convert`
run). React converts the markup `shallow`; `formbuilder-editor.spec.ts`
applies markup and checks the `ts()` call is stored. `deviation:markup-keeps-ts-calls`

**A display's filters cannot be read back once they hold a list, a time or a
quote.** `afGui.parseDisplayFilters()` splits the `filters` attribute on every
comma outside single quotes and on every colon, so the text its own
`stringifyDisplayFilters()` writes for `{tags: [1,2]}`,
`{receive_date: '2024-01-01 10:00:00'}` or `{a: 1, last_name: "O'Brien"}`
throws in `JSON.parse`, and the search display's filter settings stop opening
(6.19, core's two functions run). React splits only outside quotes and
brackets and reads back everything it writes; `nodes.test.ts` covers the three
values. `deviation:display-filters-read-back`

**A form with a negative menu order cannot be saved.** The menu item's Order
input allows no number below 0, and the editor's Save button submits the
form, so the browser refuses it with a message at the Order input, which sits
in a section the admin may not have open. Core's own Campaign Dashboard
(`afsearchCampaignDashboard`) stores the order -1: after any change its Save
sends nothing (6.19, seen in core's builder). React takes any whole number
and keeps what is typed, such as "-", until it is one.
`deviation:navigation-weight-negative`

**A hidden filter on a field behind a foreign key shows no field.** The
filter's field picker offers the fields of the search's entities and joins,
and `afGui.getField()` looks the name up there, so a filter such as core's
`afsearchTabMember` `{'status_id.is_current_member': true}` shows an empty
picker and its value as bare text without the field's input (6.19, seen in
core's builder). Where the last part of such a name is also a field of the
entity, `getField()` takes that one instead: `campaign_id.status_id` on an
activity search offers activity statuses. React looks the name up whole, asks
the entity's `getFields` for one behind a foreign key, which resolves it,
names the field ("Membership Status: Current Membership?") and offers its
input, labelled; a name the API does not know shows an error.
`SearchTab.test.tsx` covers these. `deviation:filter-field-through-join`

**A display filter's backslashes double on every edit.** `afGui`'s
`encode()` writes a string as JSON text in single quotes, and `decode()`
strips the quotes without reading the escapes, so `a\b` with a line break is
read back as `a\\b\nc` and written as `'a\\\\b\\nc'`. The value
changes on each pass, which every filter or placement edit makes
(6.19, core's two functions run three times). React reads string literals
with AngularJS's escapes, for the editor and the form alike; `nodes.test.ts`
covers it. `deviation:display-filter-escapes`

**A display filter named with a leading digit breaks the form.**
`stringifyDisplayFilters()` quotes a name only when it holds a non-word
character, so a filter key `1abc` or a URL parameter `2x` is written bare as
`{1abc: …}` or `routeParams.2x`, which AngularJS 1.8's `$parse` rejects
(6.19, core's AngularJS run on both). React writes such names quoted, as
`{'1abc': routeParams['2x']}`; `nodes.test.ts` covers it. `deviation:display-filter-digit-names`

**Saving a form writes an empty `input_attrs` into fields' settings.**
`afGuiField`'s `getProp()` reads a nested setting through `drillDown()`,
which creates each missing level on the field's own `defn`; the input
templates read `input_attrs.placeholder`, so every field with a `defn` of
its own gains `input_attrs: {}` on each save, as `afformQuickAddIndividual`'s
email field does (6.19, intercepted save from the edit and clone routes).
React reads without writing and saves the `defn` as stored;
`formbuilder-editor.spec.ts` compares the clone route with core's and names
this difference. `deviation:field-defn-read-only`

**A form without `af-form` breaks the editor.** `setEditorLayout()` takes
the first `af-form` of a form-type record's layout unchecked, so a record such
as message_admin's `crmMsgadmMonaco` throws `Cannot read properties of
undefined (reading '#children')`, followed by a stream of further errors, and
the editor stays half drawn without a Save button (6.19, opened in core's
editor). React says the form has no `af-form` element and cannot be edited in
the builder; `form-sweep.spec.ts` checks the message. `deviation:form-without-af-form`

**A field whose label the form hides is listed without a name.** A field with
`defn="{label: false}"`, such as the checkout block on `afformNewDonation`,
keeps `label: false` in `getEntityFields()`. The condition dialog lists it as
`field.label || field.input_attrs.label` and the token list as `field.label`,
so both show an empty entry (6.19, read from `afGuiConditionalDialog.ctrl.js`
and `afGuiEditor.component.js`). React lists it by its metadata label;
`fields.test.ts` covers it. `deviation:hidden-label-field-named`

**Opening a form detaches a block holding a join.** A join inside a block's
layout without an `actions` attribute gets one backfilled when it is drawn,
which changes the block's copy of the layout; the block's deep watcher takes
that for an edit and replaces the block with an `af-container` holding its
contents, so the next save stops using the block (6.19, run). React backfills
`actions` only on the form's own joins and blocks and leaves blocks' contents
alone; `formbuilder-editor.spec.ts` saves such a form and checks the block
stays. `deviation:block-join-kept`

**The date range separator shows twice.** For a date range the field preview
draws one input per suffix `'1'` and `'2'` and puts the separator before each
truthy suffix, so a dash also stands before the first input (6.19, read from
the code, not run). React shows it between the two inputs only. `deviation:date-range-separator-once`

**Viewing a slider field changes it.** For a Range field without options or
bounds, `getRangeProp()` writes `min` 0, `max` 99 and `step` 1 into the field's
definition while the canvas draws it, so opening the form records an undo
step and the next save stores the bounds (6.19, read from the code, not run).
React shows the same defaults without writing them. `deviation:slider-defaults-not-written`

**Filters of a removed placement stay stored.** When the last placement with
entities goes, the editor deletes `placement_filters` from the record, but
`Afform.save` merges the saved record over the stored one (`$item + $orig`),
so a left-out key keeps its stored value and the old filters return on the
next load (6.19, run with `cv`). React sends `placement_filters: {}`, which
stores an empty list. `deviation:placement-filters-emptied`

**`AfformBehavior.get` fails with a narrow `select`.** civi_case's
`onAfformGetBehaviors()` adds the case-role modes on every `get` response and
reads each row's `entities` and `modes`; with a `select` that leaves them
out, `in_array()` gets null and the call fails (6.19, run). The support
report selects both with the keys it needs. `deviation:behavior-get-full-select`
