# Upstream bugs found on the way

Bugs in core that came up while building the React renderer. Unless an entry
says otherwise, the Angular runtime and this renderer share them; where React
avoids one, the entry says what it does instead and names the `deviation:`
marker of the code and the test that do it. Where a bug is reported or fixed
upstream, the entry links the issue or pull request; one reported to the
CiviCRM security team names its security/core issue only. The ID in
parentheses at the end of an entry is its key in civico's internal bug list.

## Forms and placements

**Placement lists are cached without invalidation.** Fixed for 6.21 by
[civicrm-core#37197](https://github.com/civicrm/civicrm-core/pull/37197). (S94)

**Saving a case summary block also submits the case form.** The React renderer
keeps its own `<form>` inside the case form: controls submit that form, and its
submit event stops there. `deviation:case-summary-own-form` (S74)

**Defaults overwrite loaded or copied values.** Fixed for 6.21 by
[civicrm-core#37199](https://github.com/civicrm/civicrm-core/pull/37199). The
React renderer keeps the loaded and copied values.
`deviation:defaults-keep-loaded-values` (S95)

**Word replacements on Standalone.** Fixed in 6.20.0 by
[civicrm-core#37148](https://github.com/civicrm/civicrm-core/pull/37148)
([dev/core#5862](https://lab.civicrm.org/dev/core/-/issues/5862)). (S96)

**A new block can include itself.** `Afreact.getForm` stops at the loop and
rejects such a block with an error. `deviation:self-including-block-rejected`
(S47)

**Confirmation message is not escaped.** Reported privately as
security/core#230; a patch is merged for the next security release. afreact
escapes the submitted values in core's confirmation message and URL-encodes them
in the redirect, whichever renderer shows the form
(`Civi/Afreact/ConfirmationMessage.php`). A message or redirect another listener
set, such as the checkout's, is left as it is.
`deviation:confirmation-message-escaped`

**An emptied field shows "null" in a token.** The React renderer shows nothing
and leaves the default's text without it. `deviation:token-null-empty` (S26)

**A token default overwrites the loaded value.** Fixed for 6.21 by
[civicrm-core#37655](https://github.com/civicrm/civicrm-core/pull/37655). The
React renderer keeps the loaded value until a referenced field changes.
`deviation:token-default-keeps-loaded` (S38)

**A paged form's submit button has no text without `page-nav-submit-text`.** The
React renderer labels it "Submit". `deviation:page-nav-submit-label` (S18)

**Titles in the edit menu are compiled as Angular templates.** Reported
privately as security/core#249. React renders the titles as text.
`deviation:admin-menu-title-text`

**An extension's form texts are translated in core's catalog only.** Fixed on
`master` for 6.22 (`08e161022f`). The React renderer translates them in the
domain of the extension that ships the form, then in core's, as that fix does.
`deviation:form-strings-extension-domain` (S97)

**A plural message stays in English.** A `ts()` with `plural` and `count`, as
in "%count tags removed.", finds neither form, because core looks both up as
unrelated texts. Open PR
[civicrm/civicrm-core#38172](https://github.com/civicrm/civicrm-core/pull/38172)
adds `CRM_Utils_JS::translateStrings()`; afreact uses it where core has it.
(C09)

## Drafts and submission

**"Draft Saved" before any draft.** The React renderer keeps the button's own
text, disabled, until the form holds a change no draft has saved. Only the
user's changes count: what the form fills in by itself before that, such as a
default calculated from the loaded record, stays part of the untouched form,
which autosave does not store. `deviation:draft-pristine-label` (S98)

**A submit can cross a running draft save.** The React renderer keeps the submit
button disabled until the draft save has ended.
`deviation:draft-save-holds-submit` (S44)

**A restored draft adds keys to its extra fields.** The React renderer restores
the field values only. Like afForm it always sends `extra: {fields: {}}`: the
server stores the values as sent, and `Prefill::populateSubmissionData()` hands
back an entity the stored data lacks as its definition, which the React renderer
ignores. `deviation:draft-extra-fields-restored` (S13)

**A validate listener cannot see which record it validates.** The submit runs on
the server, so the React renderer shares this. A fix would be small:
`Submit::validate()` passes `$this->_entityIds` to the event, which gets
`getEntityIds(string $entityName)` with the trait's logic. Not reported
upstream. (S99)

**A failed save reports success.** The submit runs on the server and its answer
is the same either way, so the React renderer shows the same success. A
`civi.afform.validate` listener that runs the checks first turns them into form
errors. (S92)

**A required extra field never passes.** Fixed for 6.21 by
[civicrm-core#37447](https://github.com/civicrm/civicrm-core/pull/37447); extra
fields of a repeated fieldset not checked. The React renderer shares both,
except that it leaves `extra` out while no form-level extra field holds a value:
6.19 and 6.20 then skip the check, so a required extra field that sits only in
repeated fieldsets passes there, required in the browser alone (reproduced
through `Afform.submit` on 6.19.1). (S15)

**`crmFormError` carries an earlier submit's response.** The React renderer
sends the response of the failing submit only, none when `Afform.submit` itself
failed. `deviation:form-error-own-response` (S45)

## Fields and filters

**A late prefill overrides a newer selection.** afreact applies only the answer
to the field's latest selection. `deviation:autofill-latest-selection` (S43)

**A late prefill fills the wrong repeat item.** afreact writes the answer to the
item the selection was made in, wherever it stands by then.
`deviation:autofill-follows-moved-item` (S43)

**A required rich text or proximity field can be submitted empty.** React marks
the textarea, the distance and the address required.
`deviation:required-rich-text-location` (S101)

**"Choose undefined first".** The React renderer uses the control field's name
instead. `deviation:chain-select-control-name` (S102)

**A date range's inputs have no label.** The React renderer names the pair after
the label and each input "… from" and "… to". `deviation:range-bounds-labelled`
(S61)

**A rich text field is never disabled.** The React renderer restarts the editor
on a disabled textarea, which core's CKEditor 4 opens read-only (its `readOnly`
setting follows the textarea), and destroys it with the field.
`deviation:rich-text-disabled` (S105)

**The current user as default of a multiple contact field.** Fixed for 6.21 by
[civicrm-core#37457](https://github.com/civicrm/civicrm-core/pull/37457). The
React renderer does so on every version, for form fields and search filters
alike. `deviation:current-user-multiple-default` (S106)

**The minlength message names the required marker.** Upstream:
[`d777c0f29b`](https://github.com/civicrm/civicrm-core/commit/d777c0f29b). The
React renderer leaves the marker out.
`deviation:minlength-message-without-marker` (S64)

**A saved filter set that fails to load is passed over without a word.** The
React renderer shows the error above the fields, gives those fields their
defaults, as for an id that names no set, and searches with them.
`deviation:param-set-load-error-shown` (S108)

**The saved search picker loses or hides errors.** The React renderer shows each
error, the update's in its dialog. `deviation:param-sets-show-errors` (S69)

**The saved search picker offers "Save changes" for an unchanged set.** The
React renderer compares the values with sorted keys and an empty list equal to
an empty object. `deviation:param-set-unchanged-compare` (S68)

**A saved set's details fail on a removed field and blank Yes/No values.** The
React renderer shows the field's name for a removed field and "Yes" or "No".
`deviation:param-set-details-robust` (S109)

**The saved search choice has no label.** The React renderer names it "Saved
searches". `deviation:param-sets-select-label` (S66)

**Month dates in a format other than `yy-mm`.** The React renderer stores
`2001-03-01` for every format without a day. `deviation:month-date-any-format`
(S67)

**A range slider is never disabled.** The React renderer disables it with the
form. `deviation:range-slider-disabled` (S57)

**A bound of 0 is dropped.** The React renderer keeps a bound of 0.
`deviation:number-bound-zero`, [S23]. (S21)

**A Location filter's inputs have no label.** The React renderer names the three
as a group after the label, and each input "Distance", "Distance unit" and
"Address". `deviation:location-inputs-labelled` (S65)

**A saved Location filter loads as false.** The React renderer keeps the object,
also from the URL. `deviation:location-filter-object-kept`, [S39]. (S40)

**A reset drops the values the URL gave.** The React renderer fills them again
on a reset. `deviation:reset-refills-route-values` (S110)

**`_s` in a submission form's URL.** The React renderer reads `_s` only on
search forms. (S111)

**Clearing a Yes/No select stores "No".** The React renderer stores `null`.
`deviation:boolean-select-cleared-null` (S20)

**A URL field is never disabled.** The React renderer disables them like every
other input. `deviation:url-input-disabled` (S57)

**A date-only column without a time setting asks for a time.** afreact reads a
missing setting from the column: a timestamp takes date and time, as in core, a
date only the date; the builder offers "Show Time" for a field that shows one,
takes a default with time there, and a relative default such as `now` keeps its
time. `deviation:date-time-by-type` (S113)

**A saved search set in the route empties entity fields.** The React renderer
reads `_s` in search fieldsets only. `deviation:route-search-set-skips-entities`
(S114)

**A false or 0 under an operator is dropped.** The React renderer keeps every
value that is present. `deviation:operator-falsy-value-kept` (S25)

## Conditions

**A rule inside an `af-repeat` row tests the first row.** Reported as
[dev/core#6113](https://lab.civicrm.org/dev/core/-/issues/6113). The React
renderer does the same, since a fix needs one meaning in the editor, both
runtimes and the server. Reported in
[dev/core#6113](https://lab.civicrm.org/dev/core/-/work_items/6113). (S116)

**A rule on a second join block tests the first.** The editor is fixed for 6.21
by [civicrm-core#37004](https://github.com/civicrm/civicrm-core/pull/37004) and
[civicrm-core#37577](https://github.com/civicrm/civicrm-core/pull/37577); the
runtime is not checked. React numbers and labels them so on every version. The
Angular runtime numbers the blocks per fieldset, so a block in a second fieldset
of the entity shares record 0 with the first fieldset's block (measured on
6.19.1, see "Join blocks are numbered in link order"), and a rule on "Email 2"
tests record 1, which no block shows or fills. React's runtime numbers over the
entity, as the server and the 6.21 builder do.
`deviation:condition-join-block-index` (S115)

**`IS EMPTY` reads an emptied list as filled and "No" as empty.** The React
renderer takes unset, `""`, `[]` and `{}` as empty and `false` and `0` as
answers. `deviation:condition-is-empty-values` (S22)

**"No Value" and "Any Value" conditions decide nothing.** The React renderer
tests for an unset value, as the server does. `deviation:condition-is-null`
(S17)

**A LIKE pattern with an asterisk breaks the rule.** The React renderer matches
the asterisk as text. `deviation:condition-like-asterisk` (S24)

## Joins and repeats

**Selecting another record keeps the last one's join records.** afreact keeps a
join record past the loaded ones only when it has no id, as one typed into the
form. `deviation:loaded-joins-replace-stored` (S80)

**Repeat buttons without a name.** The remove button is named on `master` for
6.22 by
[civicrm-core#38074](https://github.com/civicrm/civicrm-core/pull/38074); the
add button is not. The React renderer shows the same content and adds a
screen-reader name, "Add" or "Remove item n". `deviation:repeat-button-names`
(S60)

**Join blocks are numbered in link order.** (S120)

- A block hidden by `af-if` at load links later, so the next block takes its
  index.
- A block shown after load takes the index after the others: Home and Work swap
  location types.
- In a repeated fieldset all items share one counter, so item n writes its block
  to record n of its contact.
- Each fieldset has its own counter, so the blocks of a second fieldset of the
  entity start again at record 0 (unchanged on `master` as of 2026-10-20). The
  React renderer numbers blocks by their position among the entity's blocks over
  all its fieldsets, shown or not, as the server and the 6.21 builder do. Each
  item of a repeated fieldset is a record of its own with that list of blocks,
  so all items use the same numbers. React sends `null` for a block without a
  record, as core's own prefill does for a missing location type; the server
  drops the nulls and keeps the positions. A repeated join block is left out of
  the runtime's numbers but counted by the builder's tokens; a layout mixing
  repeated and single blocks of one join has no consistent numbering, since the
  server merges all of that join's blocks into one.
  `deviation:join-blocks-layout-order`

**The primary radio of a repeat has no name.** The React renderer names the
radio by the field's label. `deviation:repeat-primary-radio-name` (S121)

**A copied repeat item is the same record.** The React renderer copies the
values without `id` and with `is_primary` off.
`deviation:repeat-copy-new-record` (S19)

**A copied repeat item shows a file it will not save.** The React renderer
leaves stored files out of a copy, whose field offers an empty chooser. A chosen
but not yet uploaded file is never copied, in core or React.
`deviation:repeat-copy-stored-file` (S123)

**An extra field in a repeated fieldset has one value for all items.** Fixed for
6.21 by
[civicrm-core#36186](https://github.com/civicrm/civicrm-core/pull/36186); the
join part remains. An extra field in a repeated join block keeps one value for
all its records, also on `master`: a join record holds only the join entity's
fields, so the submission has no place for a value per record, and the React
renderer shares this. For a fieldset's items it keeps `extras` on every version;
the stored submission keeps them per item on 6.19.1, and 6.19 and 6.20 hand them
to submit subscribers (read from the code, not run). For an extra chain select,
afField asks `Afform.getOptions` under the fieldset's entity, so a field of that
entity with the same name answers; the React renderer asks under `extra`, as
both renderers name it for an autocomplete (read from the code, not run).
`deviation:repeat-extra-fields-per-item` (S124)

**A repeat shows more items at first than its maximum.** React opens with at
most `max` items and marks a larger "Initially show" invalid.
`deviation:repeat-default-within-max`, [S76]. (S75)

## File uploads

**A failed upload still completes the submit.** The React renderer counts the
records as saved but announces nothing: it lists the failed files in its alert,
disables every field except their file inputs, and Save uploads only those again
with the same token, without a second `Afform.submit`. A failed file is no
longer required and has a "Remove file" button, so the submit can finish without
it. Once the files are uploaded or removed the form finishes as after any
submit; a user who leaves before that leaves the records saved with nothing
announced. `deviation:failed-upload-retry` (S42)

**Replacing a join's file never clears it.** The React renderer sends `{id:
null, file_name: null}`, which clears the field on the entity and on a join
record. `deviation:replace-join-file-clears` (S11)

**The first join record's upload carries no index.** The React renderer uploads
a file chosen before Save Draft into the draft after `submitDraft`, as afForm
does, and sends the record's index. `deviation:first-join-upload-index` (S09)

**A draft's file on a new join record is lost on submit.** The React renderer
keeps such a file and uploads it again after the submit.
`deviation:draft-join-file-reupload` (S10)

## Tabs

**A tab's title becomes a tooltip on its panel.** The React renderer drops the
attribute. `deviation:tab-title-no-tooltip` (S125)

**Nested tab panels in `crm-ui-tab-set`.** The React renderer leaves the wrapper
without a role. `deviation:tabset-wrapper-no-role` (S126)

**A link inside each tab.** The React renderer makes the link the tab, inside an
item with `role="presentation"` that keeps jQuery UI's classes, as
`afTabset.html` does from 6.20
([`f7156dc5f0`](https://github.com/civicrm/civicrm-core/commit/f7156dc5f0)).
`deviation:tab-link-is-tab` (S127)

**A required field in a hidden tab blocks submit silently.** The React renderer
selects that tab first, and the browser shows its message at the field.
`deviation:hidden-tab-invalid-field` (S128)

**A later tab does not open while the current one has an invalid field.** The
React renderer opens the tab; submit and Next check the fields and show the
browser's message at the first invalid one. `deviation:later-tab-opens-invalid`
(S129)

**`url-arg` loses to a literal `selected-tab`.** The React renderer opens the
URL's tab and starts on `selected-tab` only without one.
`deviation:url-arg-over-selected-tab` (S130)

## Checkout

**Checkout field labels name nothing.** The React renderer ties each label to
its control, names the expiry pair as a group and names each control after its
field (read from the code of 6.18.1). `deviation:checkout-labels-tied` (S131)

**Billing state after a change of country.** The React renderer empties the
state with the country, and a country without states frees the required select.
`deviation:billing-state-follows-country` (S132)

**The block reads a contribution value other than the one the submit saves.**
The React renderer reads every contribution value as the submit saves it, for
the block itself and for a template's `getContributionValue()`: the fixed value
where the entity's data has the key, else the field, and `null` only while
empty. `deviation:checkout-value-as-saved` (S133)

**A template's `afForm.submit()` is not held.** The React renderer's stand-in
for a checkout template submits only while the form's submit button is enabled.
`deviation:checkout-submit-once` (S134)

## Search displays

**Notifications run a tag label as HTML.** Reported privately as
security/core#248; a patch is merged for the next security release. afreact
escapes the text and title of every notification it raises; where a screen has
no notification container, `CRM.alert()` opens a dialog that shows text, and
gets it unescaped. `deviation:alert-text-escaped`

**A right icon on a single value shows only in the first column.** React reads
index 0. `deviation:single-value-right-icon` (S158)

**An image that links to a task does nothing.** React runs the task on a click
or Enter, as in a field's link. `deviation:image-task-link` (S159)

**A page past the last one stays empty.** React moves to the last page once the
count is in. `deviation:page-past-end-clamped` (S160)

**Search labels stay in the page title.** The React renderer shows the plain
title again. `deviation:title-labels-cleared` (S163)

**A display outside the search fieldset runs without its form.** Fixed on
`master` for 6.22 by
[civicrm-core#37992](https://github.com/civicrm/civicrm-core/pull/37992). React
names the form for every display on it.
`deviation:display-outside-fieldset-form` (S164)

**Grouped rows are selectable, draggable and editable.** React shows neither
checkboxes, drag handles nor in-place editors on rows without a key, and a task
link in such a row notes that it has no record. `deviation:keyless-rows` (S165)

**"Column undefined" in the column picker.** React numbers it by position
("Column 3"); a set saved by Angular for such a column therefore does not match
it in React. `deviation:column-picker-position-label` (S166)

**List, grid and tree displays.**

- _The tree drops rows whose parent is filtered out._ React shows it at the top
  level. `deviation:tree-orphans-top-level` (S167)
- _Every reload closes the tree again._ React keeps them open.
  `deviation:tree-branches-stay-open` (S168)
- _The tree's toggle has no name or state._ React names it "%1 sub-items" and
  sets `aria-expanded` on every button with children.
  `deviation:tree-toggle-name-state` (S169)
- _Focus is lost on a reload._ React returns it to the same control in the same
  row once the rows are back. `deviation:display-focus-across-reload` (S170)
- _A section header for 0 reads "(none)"._ React shows the value and keeps
  "(none)" for empty ones. `deviation:section-header-zero` (S171)
- _A multi-valued field starts a section on every row._ React compares them by
  content. `deviation:section-lists-by-content` (S172)

## Editing and drag ordering

**In-place editing.**

- _A failed save leaves a placeholder._ React opens the editor again with the
  typed value and the error, marked `aria-invalid`, and announces "Not saved" in
  a live region. `deviation:inline-edit-failed-save-reopens` (S173)
- _Enter anywhere on the page saves._ React listens on the editor only.
  `deviation:inline-edit-keys-on-editor` (S174)
- _An emptied required field fails with "Inline edit failed."_ React marks the
  input `required` and checks it before sending.
  `deviation:inline-edit-required-checked` (S175)
- _Unchanged lists are saved._ React compares by value.
  `deviation:inline-edit-compare-by-value` (S176)
- _Totals stay stale._ React asks for the totals again.
  `deviation:inline-edit-refreshes-totals` (S177)
- _Editing needs a mouse._ React makes it a button in the tab order with an
  "Edit <column>" name, opens it with Enter, Space or F2, and returns focus to
  it when the editor closes. `deviation:inline-edit-keyboard-button` (S178)

**Full-row editing marks every cell of the row as editing.** React marks the
editable cells only. `deviation:full-row-editing-class` (S179)

**Dragging a row of a hierarchical table leaves its sub-rows behind.** React
moves the row with its sub-rows and only among its siblings.
`deviation:tree-table-drag-with-subrows` (S180)

**The "Add" row of `editableRow.create` throws per input.** The React renderer's
row has no such error. (S181)

**A failed drag-sort keeps the new order on screen.** The React renderer puts
the rows back and shows the error, and offers no drag while a save runs.
`deviation:drag-sort-failure-restores` (S182)

**The weight column keeps the old numbers after a drag.** The React renderer
shows the returned weights. `deviation:drag-weights-shown` (S183)

## Bulk actions

**Bulk actions.**

- _A batch that fails partway leaves stale rows._ A batch that fails after
  earlier batches were applied leaves the table and the selection as they were
  (`crmSearchTaskApiBatch.ctrl.js` `onError` cancels the dialog), so the rows
  show stale values. React reloads the table and clears the selection whenever a
  batch was sent. `deviation:bulk-failed-batch-reloads` (S184)
- _The error alert hides the server's message._ The error alert shows the task's
  `errorMsg` in place of the server's message whenever the task has one. React
  shows both. `deviation:bulk-error-both-messages` (S185)
- _Selecting all pages fails silently._ Selecting all pages has no error handler
  (`searchDisplayTasksTrait.service.js` `selectAllPages`): the checkboxes stay
  disabled with no message. React shows the error and enables them again.
  `deviation:bulk-select-all-error` (S186)
- _A select-all still loading overrides a later choice._ A select-all still
  loading is not cancelled by a later choice: `selectAllPages()` sets
  `selectedRows` whenever the ids arrive, so choosing "None" meanwhile ends with
  every row selected (read from the code, not run). React drops the ids once the
  selection changed, a task ran or the filters changed, leaves out the rows an
  edit took out of the result meanwhile, and reports only the latest run's
  failure. `deviation:select-all-latest-choice` (S187)
- _A row an inline edit takes out of the result stays selected._ A row an inline
  edit takes out of the result stays selected: `onPostRun()` deselects an edited
  row that left the results, but `searchDisplayEditableTrait` reloads through
  `getResultsPronto()` without passing the row, so that branch never runs and
  the next task includes the record (read from the code, not run). React
  deselects the row once the save answers without it.
  `deviation:edited-row-deselected` (S188)
- _A failed task list leaves an empty actions menu._ A failed `getSearchTasks`
  leaves an empty actions menu with no message (`getMetadata`). React shows the
  error. `deviation:bulk-task-list-error` (S189)
- _A redirect task loses its query._ A redirect task's query is replaced by its
  data expression (`doTask`: `query && $eval(query) && $eval(data)`), so
  `reset=1` is lost. React merges query and data.
  `deviation:redirect-task-query-merged` (S190)
- _A row link to a task the server does not offer throws._ A row link to a task
  the server does not return opens the API batch dialog without an `apiBatch`,
  which throws (`onClickLink`). React alerts that the task is not offered.
  `deviation:row-link-task-not-offered` (S191)
- _The row checkboxes have no label._ The row checkboxes have no label
  (`crmSearchDisplayTableBody.html`). React labels each with the row's first
  column. `deviation:row-checkbox-label` (S192)

**The download dialog never ends a failed download.** The React renderer shows
the server's error and closes the dialog, and disables the buttons while the
file loads. `deviation:download-failure-closes` (S193)

**The tag dialog offers no tags on a contact-type search.** The React renderer
looks tags up for "Contact" on any contact-type search, and the EntityTag rows
name that table. `deviation:tag-task-contact-types` (S194)

**A failed relationship batch leaves its dialog hanging.** The React renderer
alerts with the server's message and closes the dialog.
`deviation:relationship-batch-failure-alerts` (S195)

**A preset relationship type breaks core's dialog.** The React renderer starts
from the preset type, contact and field values, with the type locked when
`disableRelationshipSelect` is set. `deviation:relationship-preset-type` (S196)

**The open case dialog's Save needs no lookup.** The React renderer enables Save
once the fields and the lookup are loaded.
`deviation:open-case-save-waits-lookup` (S197)

**A failed open case batch leaves its dialog hanging.** The React renderer keeps
a failed joint case in the dialog with the server's message and alerts for a
failed batch. `deviation:open-case-batch-failure` (S198)

**A failed assign role batch leaves its dialog hanging.** The React renderer
alerts with the server's message and closes the dialog.
`deviation:case-role-batch-failure-alerts` (S199)

**Skipping every contact still starts the open case batch.** The React renderer
closes the dialog and sends nothing. `deviation:skipped-contacts-send-nothing`
(S200)

**The add grant dialog shares the open case dialog's faults.** The React
renderer handles these as in the open case dialog above.
`deviation:grant-dialog-case-fixes` (S201)

**The add grant dialog counts grants as contacts.** The React renderer counts
each contact once. `deviation:grant-count-contacts-once` (S202)

**The merge tags dialog hangs when no selected tag is left.** The React renderer
says that none of the selected tags exists any more.
`deviation:tag-merge-none-left` (S203)

**The add translation dialog swallows a failed lookup and leaves its fields
unlabelled.** The React renderer shows the error, labels the title field and
names the locale radios as a group. `deviation:translation-dialog-labels-errors`
(S204)

## ReCaptcha

**A used reCAPTCHA response is sent again.** The React renderer drops an expired
response and resets the widget after a failed submission.
`deviation:recaptcha-response-once` (S79)

## Batch display

**10.1 + 20.2 does not meet a target of 30.3.** The React renderer rounds the
sum to 15 significant digits and imports without asking.
`deviation:batch-tally-exact` (S28)

**The new batch's Name label points nowhere.** The React renderer labels it.
`deviation:batch-name-label` (S37)

**A failed batch save drops the changes.** The React renderer keeps the rows
unsaved and shows the server's message.
`deviation:batch-save-failure-keeps-rows` (S33)

**A removed batch row can come back.** The React renderer removes the row once
the delete succeeds. `deviation:batch-delete-then-remove` (S205)

**Copying a batch column leaves its formulas stale.** The React renderer
recomputes the formulas of every row. `deviation:batch-copy-recomputes-formulas`
(S36)

**A formula adds strings.** The React renderer computes on numbers.
`deviation:batch-formula-numbers` (S206)

**Required batch values are checked on one page only.** The React renderer
checks every row and moves to the first row missing a value.
`deviation:batch-required-every-page` (S29)

**A failed batch create or import hangs.** The React renderer shows the server's
message and lets the user try again. `deviation:batch-create-import-failure`
(S207)

**The batch import can miss the last edits.** The React renderer saves again
until no edit is left, then imports. `deviation:batch-import-after-last-save`
(S31)

**Leaving a batch drops its unsaved edits.** The React renderer asks before the
page is left with unsaved rows and saves them when the display closes.
`deviation:batch-unsaved-on-leave` (S208)

**A display-only batch column with a joined or suffixed key shows nothing.** The
React renderer reads the import column (`col.spec.name`).
`deviation:batch-display-only-import-column` (S35)

**A batch formula over a joined entity computes 0.** The React renderer reads
each field from the column showing it. `deviation:batch-formula-joined-columns`
(S32)

**A batch total does not count a 0.** The React renderer counts every filled
value, but no unticked box and no empty list. `deviation:batch-count-zero`
(S209)

## Chart display

**A removed chart keeps running.** Partly fixed for 6.21 by
[civicrm-core#37736](https://github.com/civicrm/civicrm-core/pull/37736). The
React renderer clears the timers when it removes the chart; the form handler is
bound anonymously and stays. `deviation:chart-removed-clears-timers` (S249)

**An empty filter list breaks a chart's search.** The React renderer hands an
empty list over as `{}`. `deviation:chart-empty-filters-object` (S250)

**A chart on a contact summary tab throws.** Fixed for 6.21 by
[civicrm-core#37204](https://github.com/civicrm/civicrm-core/pull/37204). Both
renderers use the same element and share it. Fixed on `master` (6.21) in
[civicrm-core#37204](https://github.com/civicrm/civicrm-core/pull/37204), where
a chart reports no count at all. (S251)

**A chart's download links and drawing are out of reach for assistive
technology.** Both renderers use the same element and share it. (S252)

**chart_kit's bundle is built anew on every read.** The React renderer reads the
bundle once per afreact element on a page, so the hook fires that often; it adds
nothing of its own to the bundle. (S253)

**"Add field" stays on a full single-column axis.** The React editor offers "Add
field" only on a multi-column axis or one without a column.
`deviation:chart-add-field-full-axis` (S254)

**A changed scale type keeps settings it no longer offers.** The React editor
re-picks every setting whose stored value the column no longer offers.
`deviation:chart-scale-type-repicks` (S255)

**Old chart settings crash the editor.** The React editor hands the adaptor an
empty column list and drops an order index that names no column.
`deviation:chart-legacy-settings-guarded` (S256)

## Accessibility and themes

**Minetta's dark mode greys the primary button below contrast.** The React pages
keep the theme's button classes rather than colours of their own, and the a11y
spec accepts the finding where a core page in the same theme shows it too.
(S258)

**RiverLea's front-end legend rule reaches back-office forms.** React lets the
legend take its own width outside public pages, so the border runs beside the
title (`css/afreact-form.css`). `deviation:legend-own-width` (S259)

**Tab forms put an h3 under the page's h1.** Both renderers show the layout's
markup as it is. (S135)

**afTitle puts an h4 under the page's h1.** Both renderers follow afTitle.
(S136)

**Icon-only row links without a name.** Both renderers show the link as the
server returns it. (S210)

**Dashboard layout needs a mouse.** afreact renders listed Afform dashlets
inside core's dashboard and leaves its layout alone, so the gap remains until
the dashboard screen itself moves to React (architecture.md, "Dashlets"). (C08)

**Theme contrast below WCAG AA.** In light mode Minetta's badges
(`.crm-container .badge`: `--crm-primary-text-color` on `--crm-primary-color`)
reach about 2:1 (`#fafaf6` on `#afafab`), so the search builder's "Where" clause
badges fail in core's editor and in React's, measured with axe on 6.19.0
(civikitchen image of 2026-10-11). (S260)

**FormBuilder's "View Page" link fails contrast in light mode.** React gives it
the colour of the tab labels beside it. `deviation:view-page-link-contrast`
(S137)

**In-place edit placeholders fail contrast.** React shows it in the text colour,
in italics. `deviation:editable-placeholder-contrast` (S211)

## SearchKit builder

**Saving a deletion moves the open tab to another display.** afreact moves the
open tab up by the deleted displays before it.
`deviation:display-tab-follows-save` (S248)

**An invalid query timeout is dropped without a word.** React marks a timeout
that is negative or not whole invalid and refuses to save until it is fixed.
`deviation:search-timeout-invalid-blocks-save` (S212)

**Unticking an action can enable them all.** afreact enables all once each
offered task is on. `deviation:tasks-all-enabled-by-name` (S213)

**Opening a display turns its old add button into a different one.** afreact
moves the button as the server shows it. `deviation:legacy-add-button-as-shown`
(S214)

**Editing a function changes its text arguments.** afreact reads and writes the
argument as the server does, so an argument left alone is written back as it
was. `deviation:function-string-escapes` (S215)

**A style condition on an aliased column loses its field.** afreact resolves the
alias through the search's select first. Its condition then offers the operators
core allows for that field, so a rule saved with another one, such as LIKE on an
aliased date, takes the field's first operator when it is opened.
`deviation:rule-condition-alias-field` (S216)

**An aliased column cannot be coloured.** afreact takes the field from the
column's select expression. `deviation:column-alias-color` (S217)

**A style condition on a column without the `:label` suffix never matches.**
afreact stores the option by what the compared column returns: its ID, name or
label. `deviation:rule-condition-option-key` (S218)

**A style condition on a label column compares the admin's label.** afreact
tests such a condition on the field's `:name`, which the server adds to the
query itself (`getCssRulesSelect`). `deviation:rule-condition-label-by-name`
(S219)

**Options keyed by abbreviation, grouping or URL have no value.** afreact also
loads `abbr`, `grouping` and `url`, and leaves out an option that lacks the
compared attribute. `deviation:option-key-attribute` (S220)

**A column's format can list a column twice.** afreact disables a format another
column has. `deviation:column-format-once` (S221)

**A smart group's contact column is listed twice.** afreact moves the column to
the front instead. `deviation:group-contact-column-once` (S222)

**A column takes the field of another item's source.** afreact matches an alias
first. `deviation:column-alias-before-field` (S223)

**A data entry column with an alias loses its field.** afreact resolves the
alias through the search's select first. `deviation:batch-column-alias-field`
(S224)

**A data entry default that is not a valid number disappears on save.** afreact
names the column and refuses to save until the default is fixed.
`deviation:batch-default-invalid-blocks-save` (S225)

**A new autocomplete display searches by description.** afreact searches by `id`
and the entity's own search fields. `deviation:autocomplete-search-fields`
(S226)

**Changing a subsearch filter removes it.** afreact removes a filter only when
its field is cleared. `deviation:subsearch-filter-change` (S228)

**A subsearch filter on an unsuffixed field matches nothing.** afreact stores
the name only for a `:name` filter field and the id otherwise.
`deviation:subsearch-filter-value-key` (S229)

**Import reports calls as records.** afreact counts the saved records.
`deviation:import-counts-records` (S230)

**Import checks only the first display.** afreact checks every display against
its own search, matching exact search and display name pairs.
`deviation:import-checks-every-display` (S231)

**A failed metadata reload after an import goes unreported.** afreact closes the
dialog as imported and reports the failed reload in an alert.
`deviation:import-reload-failure-shown` (S232)

**Listing accessibility.** afreact gives its tabs arrow keys, and the listing
visible filter labels and a named actions header.
`deviation:search-listing-a11y` (S233)

**Segment items reorder only by mouse.** afreact adds move-up and move-down
buttons per item. `deviation:segment-item-move-buttons` (S234)

**Removing a column leaves its sort and having behind.** Fixed for 6.21 and
6.20.1 by
[civicrm-core#38021](https://github.com/civicrm/civicrm-core/pull/38021) and
[civicrm-core#38026](https://github.com/civicrm/civicrm-core/pull/38026).
afreact prunes both when a column goes. Fixed on `master` in
[civicrm-core#38021](https://github.com/civicrm/civicrm-core/pull/38021) and on
the 6.20 branch in [#38026](https://github.com/civicrm/civicrm-core/pull/38026),
in no release yet (2026-11-18). `deviation:removed-column-prunes-sort` (S235)

**Removing a join leaves aggregates and groupings on it.** afreact drops every
select and group-by expression that refers to the removed join or its nested
joins, and unwraps the aggregates that a removed grouping required, as a change
of the grouping does. `deviation:join-removal-prunes-expressions` (S236)

**A function grouping's label points at nothing.** afreact captions such a row
as a named group instead. `deviation:groupby-function-caption` (S237)

**The smart group's contact column can be removed.** afreact offers no remove
button for that column on either tab. `deviation:smart-group-column-kept` (S238)

**Removing a join can take the smart group's contact column.** When a change of
the joins drops the first column, afreact moves a contact ID that needs no
aggregate to the front. `deviation:smart-group-column-leads` (S239)

**Grouping a smart group counts its contact column.** afreact refuses to save a
smart group whose first column is an aggregate that returns no ID of its rows,
as `COUNT` or `SUM` do; grouping by the contact ID, or choosing `MIN` or `MAX`
for the column, still saves. `deviation:smart-group-aggregate-refused` (G15)

**Selected columns stay selectable.** afreact leaves selected columns out of the
list. `deviation:selected-columns-not-offered` (S240)

**A join inside a combined search breaks the union.** afreact keeps each set's
columns in their rows: a join adds no columns there, and a removed column leaves
an empty cell. In the first set, whose columns name the outer ones, the removed
column's row leaves every set with its outer columns.
`deviation:union-join-keeps-rows` (S241)

**Renaming a combined search's column leaves stale references.** afreact renames
the field in them and in the outer select too, keeping their own suffixes such
as `:label` and aliases, and inside an outer column's function such as
`COUNT(name)`. A change of suffix alone leaves them as they are, and so do a
field that another column still selects or that becomes one a column keeps, a
suffix the new field lacks, and an outer column's alias.
`deviation:union-rename-outer-references` (S242)

**Removing a combined search's row drops columns another row still provides.**
afreact then removes only the outer column named like the row.
`deviation:union-remove-row-keeps-shared-field` (S243)

**Removing a combined search's first set leaves stale references.** afreact
keeps the outer select and renames it, the conditions, grouping and sorting to
the next set's columns, as when a column is renamed. A row the next set leaves
empty goes with the outer columns built on it, as when a row is removed;
conditions and sorting on it stay, as in core.
`deviation:union-remove-first-renames-outer` (S244)

**A combined search's function column takes its field's type.** afreact types
such a column by the function's result. `deviation:union-function-column-type`
(S245)

**An empty default on a number column becomes 0.** afreact converts numeric text
only and keeps an empty or non-numeric default as it is.
`deviation:number-default-kept` (S246)

**An unfinished template path is dropped.** afreact keeps the typed path and
marks the input invalid. `deviation:include-path-kept` (S247)

## FormBuilder

**Switching off "Combine multiple fields" drops the field's suffix.** afreact
keeps the first field as written. `deviation:multi-field-keeps-suffix` (S157)

**A default of No or 0 is not saved.** afreact keeps a default of `false` or `0`
and reads it back as set. `deviation:field-falsy-setting-kept` (S41)

**A tab's count offers its charts.** Fixed for 6.21 by
[civicrm-core#37204](https://github.com/civicrm/civicrm-core/pull/37204). React
offers the tab's other displays only. `deviation:chart-tab-count-not-offered`
(S138)

**A style value with a colon is cut at it.** React splits at the first colon
only. `deviation:style-value-colon-kept` (S62)

**The condition badges fail contrast.** React shows them at full opacity.
`deviation:condition-badge-contrast` (S139)

**Typing a repeat bound overwrites the other one.** React lets a bound be typed
freely and moves the other bound to meet it once the input is left.
`deviation:repeat-bounds-on-blur` (S71)

**An invalid submission limit is dropped without a word.** React marks such a
limit invalid and refuses to save until it is fixed.
`deviation:submit-limit-invalid-blocks-save` (S140)

**Typing a field's maximum below its minimum's first digit loses it.** React
keeps what is typed and brings a bound past the other back to it once the input
is left. `deviation:field-bounds-on-blur` (S70)

**A negative relative date offset cannot be typed.** React leaves the stored
offset alone while the input holds no number and keeps the "-" on show.
`deviation:date-offset-minus` (S82)

**The "New Submission Form" choices are not sorted.** React sorts them by label.
`deviation:new-form-choices-sorted` (S63)

**The content block is not always first among the "New Field Block" choices.**
React always puts it first, then the others by label in the same code unit
order. `deviation:content-block-first` (S63)

**A failed load of the "New Search Form" choices spins forever.** React shows
the error and loads again on the next opening.
`deviation:search-choices-load-error` (S142)

**A rich text block removed while its editor loads throws.** `closeEditor()`
cannot call that off, so a block removed in the meantime, by opening another
form or deleting the block, gets an editor started on a detached textarea:
CKEditor 4 throws "Cannot read properties of null (reading 'unselectable')" and
keeps a dead instance (6.19; seen in React's builder with the CPU slowed six
times, which uses core's element; core's own builder read from the code, not
run). A block closed before it is removed does the same. With CKEditor 4, React
keeps such a block hidden on the page until its editor has started, then closes
and removes it; a script that never loads leaves one hidden, empty element
behind. `deviation:rich-text-starting-removed` (S143)

**An unknown form shows an empty submissions page.** React says that no such
form exists that the user may see. `deviation:unknown-form-submissions` (S144)

**Two packaged contact tabs ignore their contact type filter.** React keeps a
filled list as it is, says that the placements ignore it, and replaces it only
when a filter is chosen. `deviation:placement-filters-list` (S145)

**The navigation menu item's title has no label.** React keeps the placeholder
and names the input "Menu item title". `deviation:menu-item-title-label` (S73)

**The conditional rules dialog lists a field twice.** React lists each placed
field once. `deviation:condition-fields-once` (S51)

**The conditional rules are stored doubly escaped.** React reads both and writes
plain JSON, stored with single escaping. `deviation:condition-rules-plain-json`
(S146)

**An opened form counts as unsaved.** React shows "Saved" until the first edit.
`deviation:opened-form-saved` (S56)

**Editor tabs hold controls inside the tab.** React renders each tab as a link
with `role="tab"`, edits the entity's label in the head of its panel and keeps
the tab set's gear menu, for the active tab, at the end of the tab bar.
`deviation:editor-tab-controls-outside` (S147)

**Ctrl-Shift-Z does not redo.** React compares the key case-blind and redoes on
Ctrl-Shift-Z. `deviation:redo-shift-z` (S55)

**Ctrl-Z in a text input undoes the form.** React ignores the keys in inputs,
textareas, selects and editable text, which keep the browser's own undo.
`deviation:undo-keys-outside-inputs` (S55)

**Undo during markup editing keeps the stale markup.** React disables undo and
redo while the markup is being edited. `deviation:undo-off-while-markup` (S148)

**Undo cannot take back a toggle from a field's menu.** React records one step
per change, and undo and redo only move in the history.
`deviation:undo-field-menu-toggle` (S149)

**Edits made during a save count as saved.** React marks the state it sent as
saved; later edits stay unsaved. `deviation:save-keeps-later-edits` (S46)

**Entities added in the markup arrive without metadata.** React loads the
metadata of every entity type and display on the form that lacks it.
`deviation:markup-entities-load-meta` (S52)

**Extra fields all get the same name.** React numbers each new extra field past
the names on the form. `deviation:extra-field-unique-name` (S50)

**Changing placements duplicates display filters.** React adds a default filter
only for a placement entity that has none. `deviation:placement-filter-once`
(S48)

**The locale setting has no label.** React labels it with the `locale` field's
title. `deviation:locale-setting-label` (S59)

**Behaviors on a block's tab are not saved.** React shows behaviors only for
entities on a form. `deviation:behaviors-only-on-forms` (S53)

**Placement entities without a filter show an empty row.** React renders rows
only for entities with a filter. `deviation:placement-rows-with-filter` (S151)

**"Save as block" fails outside a fieldset.** React saves such a block for any
entity type (`*`). `deviation:save-block-any-entity` (S49)

**The block toggle can name the wrong value.** React names the first.
`deviation:block-toggle-first-value` (S54)

**Saving a form stores the admin's translations in place of `ts()`.** React
keeps the attribute's text and saves the `shallow` layout as HTML;
`formbuilder-editor.spec.ts` saves such a form with a translated page and checks
the attribute is stored unchanged. `deviation:save-keeps-ts-calls` (S27)

**Saving a form drops values the editor cannot resolve, or fails.** React keeps
both texts; the same test covers them. `deviation:save-keeps-unread-attributes`
(S77)

**A Contribution form saved as a `shallow` layout fails.** React converts the
layout to HTML with `Afform.convert` and saves that, which the check parses
itself. `deviation:save-sends-html` (S12)

**The markup tab turns `ts()` into `null`.** React converts the markup
`shallow`; `formbuilder-editor.spec.ts` applies markup and checks the `ts()`
call is stored. `deviation:markup-keeps-ts-calls` (S77)

**A display's filters cannot be read back once they hold a list, a time or a
quote.** React splits only outside quotes and brackets and reads back everything
it writes; `nodes.test.ts` covers the three values.
`deviation:display-filters-read-back` (S78)

**A form with a negative menu order cannot be saved.** React takes any whole
number and keeps what is typed, such as "-", until it is one.
`deviation:navigation-weight-negative` (S72)

**A hidden filter on a field behind a foreign key shows no field.** React looks
the name up whole, asks the entity's `getFields` for one behind a foreign key,
which resolves it, names the field ("Membership Status: Current Membership?")
and offers its input, labelled; a name the API does not know shows an error.
`SearchTab.test.tsx` covers these. `deviation:filter-field-through-join` (S153)

**A display filter's backslashes double on every edit.** React reads string
literals with AngularJS's escapes, for the editor and the form alike;
`nodes.test.ts` covers it. `deviation:display-filter-escapes` (S78)

**A display filter named with a leading digit breaks the form.** React writes
such names quoted, as `{'1abc': routeParams['2x']}`; `nodes.test.ts` covers it.
`deviation:display-filter-digit-names` (S78)

**Saving a form writes an empty `input_attrs` into fields' settings.** React
reads without writing and saves the `defn` as stored;
`formbuilder-editor.spec.ts` compares the clone route with core's and names this
difference. `deviation:field-defn-read-only` (S56)

**A form without `af-form` breaks the editor.** React says the form has no
`af-form` element and cannot be edited in the builder; `form-sweep.spec.ts`
checks the message. `deviation:form-without-af-form` (S154)

**A field whose label the form hides is listed without a name.** React lists it
by its metadata label; `fields.test.ts` covers it.
`deviation:hidden-label-field-named` (S155)

**Opening a form detaches a block holding a join.** React backfills `actions`
only on the form's own joins and blocks and leaves blocks' contents alone;
`formbuilder-editor.spec.ts` saves such a form and checks the block stays.
`deviation:block-join-kept` (S56)

**The date range separator shows twice.** React shows it between the two inputs
only. `deviation:date-range-separator-once` (S58)

**Viewing a slider field changes it.** React shows the same defaults without
writing them. `deviation:slider-defaults-not-written` (S56)

**Filters of a removed placement stay stored.** React sends `placement_filters:
{}`, which stores an empty list. `deviation:placement-filters-emptied` (S14)

**`AfformBehavior.get` fails with a narrow `select`.** The support report
selects both with the keys it needs. `deviation:behavior-get-full-select` (S156)
