# React vs Angular renderer

The same Afform definitions are rendered twice: by core's Angular runtime on
`civicrm/afreact/angular` and by this extension's React renderer on
`civicrm/afreact/demo`. The pages share one markup, so any difference comes
from the renderer. Where React does better than core, a section lists it under
"Improvements over core", with the test that pins it.

The bugs in core found on the way are in [upstream-bugs.md](upstream-bugs.md),
the measured load times in [load-metrics.md](load-metrics.md). The builders'
differences from core's SearchKit admin and FormBuilder editor are in
[comparison-builders.md](comparison-builders.md).

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
it leaves out the space core puts before commas in linked lists (see
[upstream bugs](upstream-bugs.md)). A display in a hidden `af-tab` runs only once its tab is shown, on both
renderers, so the sweep does not wait for it and finds it empty on both. A
`crm-ui-tab-set` runs all its displays at once: jQuery UI hides the panels only
after the displays started (`crmUi.js:914`, `searchDisplayBaseTrait.service.js:182`).

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

### Improvements over core

| Area | Angular | React | Pinned by |
|---|---|---|---|
| Character count of a text area with `maxlength` | "n / max" below the field, not tied to it | the same count, which describes the text area (`aria-describedby`): a screen reader reads it with the field, not on each keystroke `deviation:textarea-count-describes` | `src/afform/Field.test.tsx`: "counts the characters of a text area with a maximum and describes the field by the count" |
| Clear links | `<a>` without `href`, not reachable by keyboard | same link with `role="button"`, focusable, Enter and Space `deviation:clear-link-button` | `src/afform/Field.test.tsx`: "clears an optional radio from the keyboard" |
| Required text holding only spaces | ngModel trims it to empty and marks the field `ng-invalid-required`; the browser sees text and shows no hint | same model and alert; the control reports "This field is required." as a custom validity message, the browser's hint for that field `deviation:blank-required-validity` | `src/afform/Field.test.tsx`: "leaves a required field holding only spaces invalid and its value unset" |
| Quick-add links on reference fields (`input_attrs.quickAdd`) | in the dropdown while the input is too short or nothing matches, out of the keyboard's reach; a popup that saves no record changes nothing | below the field while it is enabled, reachable by Tab; a popup that saves no record shows an error `deviation:quick-add-links-reachable` | `src/afform/fields/EntityRef.test.tsx`: "offers the contact types' forms, opens one and selects the record it saved", "says when the form saved no record" |
| Stored ids the autocomplete cannot find | dropped from view, kept in the model | kept, with a visible "No record found" message `deviation:missing-ids-noted` | `src/afform/fields/EntityRef.test.tsx`: "says which stored ids it could not find" |
| Drag to reorder | jQuery UI sortable, pointer only | dnd-kit: pointer, and keyboard (Space or Enter, arrow keys) with screen-reader announcements; dnd-kit loads with the first draggable display on a page `deviation:keyboard-row-reorder` | `tests/browser/reorder.spec.ts`: "react: moves a row by keyboard and keeps the order after a reload"; `src/search/drag.test.tsx`: "moves a row by keyboard, saves the displaced row's weight, takes the answer" |
| Toggle fields | checkbox drawn as a switch | the same checkbox with `role="switch"` `deviation:toggle-switch-role` | `src/afform/fields/Toggle.test.tsx`: "is a labelled switch in Toggle.html's markup with Yes and No after it" |
| Tab sets (`af-tabset`, `crm-ui-tab-set`) | tab list with clickable links | ARIA tabs pattern: `role="tab"` on the focusable element with `aria-selected` and `aria-controls`, one tab in the Tab order, arrow keys, Home and End `deviation:aria-tabs-pattern` | `tests/browser/tabs.spec.ts`: "react: tabs follow the ARIA pattern with arrow keys"; `src/afform/Tabs.test.tsx`: "moves and selects with the arrow keys, Home and End, and selects on click" |
| File fields | upload progress in a CRM.status popup; the Replace link has no `href` and no role | progress in the form's status line, errors in its alert; Replace is a focusable button named after the file, and moves focus to the new file input `deviation:file-replace-button` | `src/afform/fields/File.test.tsx`: "shows a prefilled file with a replace button that clears it and moves focus to the input", "opens the replace button from the keyboard and shows a file without a link" |
| Form closed for submissions | "Sorry" alert; only the submit button is disabled, the fields stay editable | the same alert, the reason above the form, and every control disabled `deviation:closed-form-locked` | `src/afform/submission.test.tsx`: "is disabled, says why inline and alerts it as afForm does"; `tests/browser/submission.spec.ts`: "React moves the focus to the confirmation message and keeps a closed form locked" |
| Errors from `Afform.submit` and `submitDraft` | an alert only | the same alert, plus a summary above the form that lists each message and takes focus, except after an autosave `deviation:submit-error-summary` | `src/afform/submission.test.tsx`: "is a warning, in a summary that takes focus and lists each message" |
| Confirmation message | replaces the form; the focus is lost with the button | replaces the form and takes the focus `deviation:confirmation-takes-focus` | `src/afform/submission.test.tsx`: "gives the confirmation message the focus of the button it replaces"; `tests/browser/submission.spec.ts`: "React moves the focus to the confirmation message and keeps a closed form locked" |
| Grid displays | boxes in plain `<div>`s | the same boxes with `role="list"` and `role="listitem"`, named by the display label where the display is loaded by name (a form's layout carries no label), as list displays are `deviation:grid-list-roles` | `src/search/displays.test.tsx`: "lays boxes out in colno columns and names them as a list" |
| Reference field whose dynamic entity has no mapping for the controlling value | disabled, without a word | disabled, with "No entity to search for …" `deviation:dynamic-entity-unmapped-note` | `src/afform/fields/EntityRef.test.tsx`: "searches the entity the control field names with dfk_entities" |

### Differences by design

| Area | Angular | React |
|---|---|---|
| Select fields | select2, with option colours, icons and descriptions | native `<select>`, sized like select2, with its warning border on a required select emptied by the user (core up to 6.19 also warns on an untouched one); options show their label only; a select without a label is named by its placeholder, else by Select.html's title `deviation:native-select-fields` |
| Date fields | jQuery UI datepicker, site input format, a number input for the year-only format `yy`; the calendar offers the years from `start_date_years` back to `end_date_years` ahead (100 each by default) | native `<input type="date">` or `datetime-local`, wider than the datepicker to fit its format and calendar icon, without a limit on the years, so a stored date outside them stays as it is; a number input for `yy` and `<input type="month">` for formats without a day (`yy-mm`, `M yy`), which Safari and Firefox show as a text field that accepts `yyyy-mm` only. Both offer the clear link only on a field that is not required `deviation:native-date-inputs` |
| Saved search picker (`af-search-param-sets`) | picking a set assigns `#?_s=<id>`, a new history entry, loads the set, then resets the fields to their defaults (see upstream-bugs.md); clearing assigns `_s=0`, which names no set, so the fields take their defaults; edits leave `_s` in the URL but are not written there | the same history entries and defaults after clearing; the set's values stay; edits are written to the URL beside `_s`, and only where they differ from the set (or from the defaults when it names none), so a reload shows the same search `deviation:param-set-edits-in-url` |
| Search filter text shorter than `minlength` | the value is dropped from the filter while typing, so the table shows unfiltered rows | filters by what was typed `deviation:search-filter-minlength` |
| Admin block menus | afform_admin's gear menu per form and block, after a client-side permission check; titles go through Angular's template compiler | the same menu and links after the same check; titles show as text (see upstream-bugs.md) |
| Display filters reading `options.x` where nothing placed the form | `options` is undefined on the form's page and in a dashlet, the name resolves to nothing and the filter is left out | the same on the form's page, in a dashlet and in a placement; the preview page passes the records the form's placements pass, picked there (a contact that is the only argument defaults to the user's own), and where none is picked it notes the filter, as the support report does, instead of leaving out what the form means to hide. `deviation:display-filters-outside-placement` |
| Theme rules keyed on Angular's runtime classes | Riverlea sizes a table's alerts by `td > p.alert.ng-binding` and lays out link cells on the contact summary by `span.ng-scope a` | the same markup carries `ng-binding` on a table's no-results and error paragraph and `ng-scope` on each link span, so the theme styles both alike; Riverlea's dashlet padding for `.crm-dashlet-content > .ng-scope` is not covered `deviation:angular-runtime-classes` |
| API calls | calls made together share one request | one request per call `deviation:api-call-per-request` |
| Reference fields (EntityRef) | select2 over `<Entity>.autocomplete` | ARIA combobox in select2's multi-select markup for single and multiple fields; the search loads with the first such field on a page. A single field shows the chosen label in its input, with a clear link `deviation:entityref-aria-combobox` |
| Chained selects (ChainSelect) | select2, disabled while the options load and when none came back (`master` also disables it while the control field is empty); a required one without options blocks the submit for good | native `<select>`, options from `Afform.getOptions` as in Angular, disabled the same way; the browser skips a disabled select, so the server reports the missing value instead `deviation:chain-select-native` |
| In-place editors | select2, datepicker and select2 tags; text inputs at least as wide as the cell was | native `<select>`, `<input type="date">` and `datetime-local`, a colour picker beside a text input; inputs at their own width `deviation:inplace-native-inputs` |
| In-place editor for a multi-value text, number or date field (no options) | select2 tags split at commas; a date picker adding one day at a time, no day twice | chips with an input: Enter or a comma adds a text or number, Backspace on an empty input removes the last, what is typed when the editor leaves is kept; a date input adding one day at a time, no day twice; a multi-value Yes/No field is two checkboxes as in core `deviation:inplace-list-chips` |
| In-place reference editor (fk_entity, `id`) | `crm-autocomplete` on the foreign entity with `fieldName: <entity>.<field>`, quick-add and quick-edit links in the dropdown; Enter and Escape close an open list before they reach the editor | the same combobox as a form's EntityRef, with the same `fieldName`; a single value shows its label and a clear link, a multi-value one its chips; no quick-add or quick-edit links (their popup would leave the editor); Enter and Escape in an open list stay with it `deviation:inplace-reference-combobox` |
| New row (`editableRow.create`) | an "Add" button in the control column opens a row of inputs; every input is marked required but saved anyway; Enter anywhere saves; `cancelEditing()` runs before the call, so a failed save loses the typed values; a new record outside the filters reloads the displays; an empty `createLabel` leaves an icon-only button | the same row; only fields that allow no null are required and checked before the call; Enter in the row saves, Escape returns the focus to the button; a failed save keeps the row with the error; the same reload; "Add" as the fallback label; editable columns whose editor React lacks are named in the note, and a required one among them withholds the row `deviation:new-row-checked-save` |
| Full-row editing (`editableRow.full`) | a click on an editable cell opens every editable cell of the row; Save and Cancel in the control column; Enter saves the row (a document-level key handler of the last cell that opened), Escape cancels; the row's values are sent whether or not they changed, so saving an untouched row still writes the record; no check of the inputs before the call | the same cells, buttons and keys, Enter and Escape handled in the row and on its buttons; the values of every shown editable cell go in one `inlineEdit` call (a column the picker hides stays out), an unchanged row closes without a call; a cell the user emptied of a field that allows no empty value holds the row, an untouched empty one does not (the server leaves it alone either way); a failed save keeps the row open with its values and the error under the buttons, unless another editor opened meanwhile; only the editable cells are marked as editing; only tables, which have the control column, edit by row `deviation:full-row-changed-save` |
| Leaving an in-place editor | the editor stays open until Enter, Escape or a button | a valid change saves, an unchanged editor closes; switching windows leaves it open `deviation:inplace-save-on-leave` |
| Emptying an in-place text | saves `""` | saves `null` where the field can be emptied `deviation:inplace-empty-null` |
| Totals after an in-place edit | kept (see [upstream bugs](upstream-bugs.md)) | asked again |
| Drag to reorder in a hierarchical table | the row moves alone in the flat list and takes the weight of the row it displaces, whatever its depth or parent; its sub-rows stay behind until the next search | the row moves with its sub-rows, among its siblings only, and takes the displaced sibling's weight, since weights order siblings (`SearchDisplay.inlineEdit` with `draggableWeight` could also take a new parent; React sends the weight only); a drop on a sibling's sub-row counts for that sibling, one under another parent or at another depth leaves the row where it was, announced and with a notice |
| Drag to reorder in a tree display | jQuery UI sortable with connected branches: a pointer drop before or after an item in any branch, or into a branch's top padding, sends the weight of the item the drop displaces (the one after it in another branch, `1` in an empty one) and the new parent; an item whose parent the search leaves out is not shown at all; the dragged item's branch is hidden meanwhile | dnd-kit: a drop on an item's line puts the dragged item after it among that item's siblings, a drop on the edge above a branch's first item (or below a leaf) puts it first in that branch; the weight sent is the target's for a move down among the same siblings and the target's plus one otherwise, the next item's for a first place and `1` in an empty branch, with the new parent; by keyboard, Up and Down step through the lines and first places in document order with announcements; an item cannot go under itself, and a closed branch takes no first place until it is opened; an item whose parent is not on the page stands at the top and moves as one of the top items; a failed save puts the item back and asks the server for the rows; the dragged item's branch is hidden meanwhile, and the opened branches stay open, as above `deviation:tree-drag-keyboard` |
| Collapsed rows across a reload | every run closes the sub-rows again (`collapsible: closed` is applied to each new row object) | the rows opened or closed stay so through a popup save, a filter, a sort or a page change, as in the tree display `deviation:table-rows-stay-open` |
| Tab names without `name` | `tab0`, `tab1` … from one counter per page | numbered per tab set, the same on a page with one tab set `deviation:tab-names-per-tabset` |
| Tab under `url-arg` | written to the URL also when the page opens | written when the user selects a tab `deviation:url-arg-on-select` |
| Invalid field in a hidden tab | submit does nothing visible, and moving to a later tab is blocked while the current one has an invalid field | submit selects the field's tab and the browser points at the field; moving between tabs is free |
| Pages (`page-nav-buttons`) | Back and Next buttons, the form's submit button on the last page labelled by `page-nav-submit-text` (empty without it, see [upstream bugs](upstream-bugs.md)); Next does nothing while the current page holds an invalid field; Enter in a field presses Next | the same buttons, "Submit" without the attribute; Next focuses the page's first invalid field and shows the browser's message; Enter presses Next; `selected-tab` with a string literal names the page to start on, after `url-arg` and before the remembered selection (core drops the URL's tab, see [upstream bugs](upstream-bugs.md)); a URL naming no tab is skipped, where core falls through to the remembered tab |
| Tab badge from `total-count="$parent.count"` | counted after 900 ms without the form's filter values | counted at once, also without the form's filter values `deviation:tab-count-at-once` |
| Search ranges (`search_range`) | two inputs after the field's label | the same pair as a group named by the label, the inputs named "… from" and "… to"; a select range sends its bounds as typed option ids (`2`) where select2 sends strings (`"2"`) `deviation:search-range-typed-ids` |
| Repeat buttons (`af-repeat`) | add button labelled by the attribute's value, icon only when it is empty; remove button icon only | the same visible content; an icon-only button carries a screen-reader name, "Add" or "Remove" (see [upstream bugs](upstream-bugs.md)) |
| Invalid input on submit | an alert only (the browser shows its own hint on the field); while a typed value breaks `min`, `max`, `step` or `minlength`, ngModel holds `undefined`, which conditions and tokens see; an `af-required` condition that flips re-validates, so an emptied field changes between `""` and `undefined` with it | the same alert plus a summary above the form; the typed value stays in the data until it is valid; an emptied field keeps the empty value it was given, so a required flip after emptying does not rewrite it (a submit sends `""` or nothing accordingly) `deviation:invalid-input-kept` |
| `crmFormSuccess` and `crmFormError` | triggered on the `af-form` element | triggered on the renderer's wrapper element, so a listener bound to `af-form` itself hears nothing; `document` or an ancestor hears both `deviation:form-events-on-wrapper` |
| Calculated default (`afform_default` with tokens) | calculated when the field initialises and whenever a referenced field changes, until an input of the field was touched; a route value lands afterwards and outlasts the first calculation, a loaded record's value does not (see [upstream bugs](upstream-bugs.md)) | a field holding a value when it mounts (route, loaded record) keeps it until a referenced field changes |
| `afFormPreSubmit` | broadcast to Angular widgets such as a captcha before the submit | not sent; such widgets are Angular directives, which the renderer reports as unsupported |
| Prefill on load | the fields show at once under a blocking overlay (`$element.block()`) until `Afform.prefill` lands, then its records are merged over the data | the fields show at once and take input; the form is `aria-busy` with "Loading…" in its status line and the submit, draft and reset buttons wait; the records then land over the data, so a prefilled field typed into meanwhile takes the stored value; a token default waits for the prefill `deviation:prefill-without-overlay` |
| Reset button | `resetForm()` tells the fields to reset (`afFormReset`) and prefills again | the form loads afresh, so repeats, conditions and draft state start over too `deviation:reset-reloads-form` |
| Field labels and help texts (`label`, `help_pre`, `help_post`) | set as HTML (`af-markup`), tokens such as `[Individual1.0.first_name]` show the field's value inside `af-form` | the same, with the HTML rebuilt from a list of plain elements and attributes: scripts, event handlers and inline styles are dropped, other unknown tags keep their text; a token updates while the user types, where Angular waits for the input's `change` |
| Display-only fields (`DisplayOnly`) | option labels, dates in the site format, reference labels from `<Entity>.autocomplete`, rich text as HTML, URL and file links; a value matching no option, or not of the option's type (`"2"` for `2`), shows nothing, as does a date it cannot format | the same, with values compared as text and a value without option or a date that cannot be formatted shown as stored; rich text keeps what `ng-bind-html` keeps (no `id`, `role` or `aria-*`, links and images of plain schemes only), and a URL of another scheme stays text; a failed label lookup shows its error `deviation:display-only-as-stored` |
| Route parameters | the hash (`#?first_name=…`), for the fields and for the server's `args` | the same for the fields; `args` also carry the page's query string, with the hash over it `deviation:route-args-query-string` |
| Checkout block (`CheckoutBlock`, the donation form's `checkout_params`) | `afCheckoutBlock`: test-mode warning, the chosen option's description, template and fields; the details start empty and a change of option empties them; the block reads `CRM.afCheckout` from its own Angular module | the same from the page's `afreact.afCheckout` variable (`Civi\Afreact\Assets`), set while contributions through forms are enabled; the fields' labels are tied to their controls and the expiry pair is a group; an option cleared to none also empties the details (Angular leaves the stale ones in the data, which the server ignores); a new country empties the billing state and a country without states frees a required one; drafts never carry the details (see [upstream bugs](upstream-bugs.md)) |
| Tree items | `<li>` without `data-entity-id` | `<li data-entity-id>`, as list items have it, so focus can return to the row after a reload `deviation:tree-item-entity-id` |

## Accessibility

`tests/browser/a11y.spec.ts` runs axe on both pages in light and dark mode and
fails when the React page breaks a rule on more elements than the Angular page.
Findings only on the Angular page: the select2 widgets carry roles their
elements do not allow, the clear link carries `aria-label` without a role, and
the primary-email radio has no label. Both pages share the theme's contrast
findings and the layouts' own headings and links listed under [upstream bugs](upstream-bugs.md);
`tests/browser/sweep.spec.ts` excuses the latter per form (`SHARED_CONTENT`).
Both specs leave out CKEditor's editing frame: it is CKEditor's own page around
the field's content, without main landmark or h1, the same under both
renderers.

### Not implemented in the React renderer

Each of these shows a visible "Not supported by the React renderer" note
instead of being dropped. Each item names why it is left out: either core does
not support it either, or it runs Angular code the renderer cannot run. The
survey behind this covered every `*.aff.html` in core and the dev stack's
extensions.

Angular code from elsewhere, which a React renderer cannot run:

- Angular expressions other than `:: ts('…', {…})` and `crmUrl(…)` with
  literal arguments. In the surveyed layouts all other expressions sit in
  oauth-client's forms and afform's mock page, and read variables their own
  Angular controllers set (`options.client.id`, `token.scopes`), so a general
  expression evaluator would not open those forms either.
- field types other than afform's 18 (Text, Email, Url, Number, Hidden,
  TextArea, Date, Select, Radio, CheckBox, DisplayOnly, EntityRef, ChainSelect,
  Toggle, RichTextEditor, File, Range and Location) and civi_contribute's
  CheckoutBlock. An extension's own field type brings its own Angular template.
- in a CheckoutBlock, a checkout option's own Angular template (a payment
  processor's module) and a checkout field of a type other than text, select,
  checkBox, expiryDate and the billing state chainSelect
- directives outside plain HTML, forms, blocks, joins, repeats, search
  fieldsets, tab sets and table, list, grid, tree, batch and chart displays; on
  `af-tabset` a `selected-tab` other than a string literal
- the message template editor's `crm-monaco`, which needs the Angular
  application it belongs to. FormBuilder's `af-admin-list-menu` renders where
  FormBuilder's settings are on the page (its listing in React's FormBuilder);
  elsewhere, where core's runtime renders nothing for it, React notes it, and
  so does the support report
- include columns other than FormBuilder's placement column: a column of type
  `include` is an `ng-include` of any Angular template
- bulk actions whose task is an extension's own Angular dialog (download,
  update, tag, relationship, mailing, open case and assign case role have
  their own dialogs), takes an input field the in-place editors lack
  (`apiBatch.fields` with a Location or multi-value colour input), or uses an
  expression other than a literal, an object literal, `ids[n]`,
  `ids.join(',')` and the task's data names. They stay in the actions menu,
  disabled, with the note as their title; a row link to one alerts. A single
  extension's dialog can be rebuilt as the core ones were.
- in a batch display, a formula other than fields, numbers and `+ - * / ( )`:
  core evaluates the formula as an Angular expression. The only formula core
  defines, Contribution's `net_amount` as `[total_amount] - [fee_amount]`, is
  arithmetic.

What core does not support either:

- File fields outside a form, as in search filters: core's file input takes
  its uploader from `afForm`, which a search page does not have
- save-draft and reset buttons outside `af-form`, as on a search page:
  `afButton` calls `afForm.resetForm()` and the draft handling of `afForm`
- an in-place editor for a multi-value colour field, should one exist; the
  renderer also turns a Location input away, though core defines that type
  only for the `Address.proximity` search filter, which is never editable

The support report (`civicrm/admin/afreact`) lists these per form; for bulk
actions it asks the server for each display's tasks. Its notes on a site's
own forms show which gaps matter there.

### Bulk actions

The React table runs the tasks `SearchDisplay.getSearchTasks` returns:
API batches (enable, disable, delete, …) in a confirmation dialog with
progress, the spreadsheet download, the update of chosen fields and the tag
task in dialogs of their own, `CRM.loadForm` popups, and redirects to a new
window. Selection
follows core: per page or all pages (a `return: 'id'` run), Shift for a range,
kept across sorting and paging, cleared by new filters and after a task.

| Area | Angular | React |
|---|---|---|
| Confirmation dialog | jQuery UI dialog through `dialogService` | native modal `<dialog>`: focus moves in and back to the menu button, Escape cancels before the run starts `deviation:bulk-confirm-native-dialog` |
| Progress bar | moves forward every second while a batch runs | moves per finished batch `deviation:bulk-progress-per-batch` |
| Update dialog | select2 pickers add a clause as soon as a field is picked, and pick each clause's field; `crm-search-input` for the value, unlabelled; fields of every writable type; the success alert is titled "Saved" | a native select plus an Add button; the value input of the in-place editors, labelled by the field; a field whose input the in-place editor lacks would stay in the list, disabled, with the reason as its title; values a hook presets in `task.values` start the dialog; the batch then runs in the task dialog with the same title `deviation:bulk-update-native-picker` |
| Task input fields (`apiBatch.fields`) | `crm-search-input` per field, started from its default, serialized, Boolean or first option; the task button waits for a valid form | the in-place editors' inputs with the same start values, native validation; a task with a field those editors lack stays disabled with the note `deviation:task-fields-inplace-inputs` |
| Changing a clause's field in the update dialog | keeps the value typed for the previous field | starts the new field's value afresh, as when added `deviation:update-clause-field-resets` |
| Update from a row link | a row link's single-row update runs `SearchDisplay.inlineEdit`; the update dialog's batch always runs `Entity.update` on the row's id | the same |
| Update dialog preset on a field `getFields` does not list | the clause shows an empty picker and its value is sent | the clause shows the field's name, can be removed, and its value is sent `deviation:update-preset-unknown-field` |
| Download dialog | format select; a progress bar grows by 10 % each second whatever the server does; the dialog's close button is hidden while it runs | the same format select; a full striped bar in a status region while the file loads, the title takes the focus; Escape and both buttons are off while it runs `deviation:download-dialog-status` |
| Tag dialog | add or remove; the plain tags in a select2 tree, each tagset's tags in an entityref search; the batch runs inside the dialog; looks tags up for the search's entity name (see [upstream bugs](upstream-bugs.md)) | the same choice; the tags in a native multi-select with the tree indented, each tagset's tags in a multi-select of their own; the batch then runs in the task dialog; looks tags up for "Contact" on any contact-type search; the result message counts as core's |
| Relationship dialog | relationship type in a select2, the contact in a `crm-autocomplete` filtered by the type's contact sub-type, then the type's description, dates and custom fields as `crm-search-input`; the batch runs inside the dialog; a failed batch leaves the dialog on its progress bar (see [upstream bugs](upstream-bugs.md)) | the same choice in a native select, the same autocomplete and filter, the type's fields as the in-place editors' inputs (fields they lack are noted); the batch then runs in the task dialog; the result message counts added and existing relationships as core's; a failed batch alerts with the server's message |
| Mailing dialog | name and type, a recipient check (`Contact.get` with an e-mail join) colouring an alert; "Create Mailing" makes a hidden group with the mailing and its include group chained, a second batch adds the contacts, then the browser opens the mailing; a failed step alerts core's message and closes | the same inputs and check; the group and mailing are made from the dialog, the contacts join in the task dialog's batch, then the browser opens the mailing; a failed group alerts core's and the server's message in the dialog, which stays open for another try (each try that got as far as the group leaves a hidden group behind); a failed batch alerts both and closes `deviation:mailing-group-failure-stays` |
| Open case dialog (`contact.addCase`) | the new case's fields as `crm-search-input`, starting with the required ones without a default and the subject; a choice between a case per contact and one joint case where `civicaseAllowMultipleClients` allows it; `CaseContact.get` for the selected contacts with a case not closed, counting a contact once per open case, with a choice to skip them (the default); Save is enabled before that lookup answers (see [upstream bugs](upstream-bugs.md)); "No cases to open." when every contact is skipped; the batch runs inside the dialog with "Opening case..." / "Opening %count cases..."; a failed batch leaves the dialog hanging (see [upstream bugs](upstream-bugs.md)); the success alert counts the cases and links "View case" for a single one | the same fields as the in-place editors' inputs, the same choices as native radios; the lookup runs afresh each time the dialog opens and counts each contact once; Save waits for the fields and the lookup; a case per contact runs in the task dialog's batch with the same heading, a joint case is created from the dialog, where a failed create stays with the server's message and a failed batch alerts and closes; the success alert counts the cases without the link |
| Add grant dialog (`contact.addGrant`, civigrant) | the new grant's fields as `crm-search-input`, starting with the required ones without a default; `Grant.get` for the selected contacts with a grant, counting one per grant, with a choice to skip them (the default); the same Save, skip-all and failed-batch faults as the open case dialog (see [upstream bugs](upstream-bugs.md)); the batch runs inside the dialog with "Adding %count grants..."; the success alert counts the grants and links "View grant" for a single one | the open case dialog without the joint case: the same inputs and choices, the lookup run afresh on each opening and counting each contact once; the batch runs in the task dialog with the same heading; the success alert counts the grants without the link |
| Merge tags dialog (`Tag.merge`, core master) | `Tag.get` of the selected tags by label; the first is kept with its label, changing the tag to keep takes its label; a note on reserved tags; "Merge tags" calls `Tag.merge` and alerts '%1 tags merged into "%2".'; a failure alerts the error | the same lookup, preset, note, call and alert; a failure shows in the dialog, which stays open; tags deleted since the selection get a message instead of a stuck spinner (see [upstream bugs](upstream-bugs.md)) |
| Add translation dialog (`MessageTemplate.add_translation`, message_admin, core master) | the template's title; the locales in use or offered by the UI as radios, sorted by label, the template's own marked "(existing)" and disabled; every other locale in a select2 "Other"; settings from the `crmMsgadmTasks` module; Add opens the template editor for the chosen locale | the same choices and editor URL; the settings come from `Afreact.getTaskSettings`, which runs the module's own settings factory; a native select for "Other"; a failed lookup shows an error, the labels name their fields (see [upstream bugs](upstream-bugs.md)) |
| Assign case role dialog (`case.addRole`) | the role in a select2 over the case types' roles, the contact in a `crm-autocomplete` on the role's contact type and sub-type; `Relationship.get` counts the selected cases holding the role, with "Checking...", "The selected cases do not yet have this role assigned." or "%1 cases already have this role assigned." and a choice between adding and replacing; replacing fires `Relationship.update` ending the other holders without waiting for it; `CaseContact.get` over the cases with `Relationship.create` chained per client runs inside the dialog with "Adding roles..."; a failed batch leaves the dialog hanging (see [upstream bugs](upstream-bugs.md)); the success alert counts the roles added and those the contact held already | the role in a native select with the description as title, the contact in the in-place editors' entityref input with the same filter; the count runs afresh each time the dialog opens and shows the same three states as alerts, the choice as a radio group; Save waits for the role, the contact and the count, and for a choice where cases hold the role; replacing ends the other holders first and keeps the dialog with the server's message when that fails; the batch runs in the task dialog with "Adding roles..." and a failed batch alerts and closes; the same success alert; a hook's preset role, contact and choice are taken over, the role locked by `disableRelationshipSelect`; changing the role clears the contact, whose type may not fit the new role (core keeps it) |
| Delete task without `confirmMsg` (changed by a hook) | runs at once | asks with core's delete question; a delete the renderer's own dialog settled (the removal of tags) runs at once `deviation:delete-task-always-asks` |
| Actions menu longer than the space below its button | the page scrolls to the rest | the menu scrolls within the viewport, or opens above its button when that leaves more room `deviation:actions-menu-in-viewport` |
| After a row link updates its row | reloads that row (`refreshAfterEditing`) | reloads the table `deviation:row-link-reloads-table` |
| Select-all control | icon buttons | the same buttons with `role="checkbox"` and `aria-checked` (`mixed` for some) `deviation:select-all-checkbox-role` |
| Selection count, task result | visible count only | also announced in a live region `deviation:selection-count-announced` |

### Batch display

The batch display (`crm-search-display-batch`, core's contribution batch
entry) starts a batch with `SearchDisplay.createBatch`, edits its rows in the
`Import_<id>` table and hands them to `SearchDisplay.importBatch`, whose queue
runner the browser then opens. `tests/browser/batch.spec.ts` enters the same
two contributions with both renderers and compares what the import stored.

| Area | Angular | React |
|---|---|---|
| New batch form | Name, Rows and a target per column with `tally.target`; the Name label points at an id the input lacks (see [upstream bugs](upstream-bugs.md)); a failed create leaves the button spinning (see [upstream bugs](upstream-bugs.md)); the new batch adds a history entry, so Back returns to the form | the same fields, each labelled; a failed create shows the server's message under the button; the new batch replaces the history entry, as every URL key of the renderer does |
| A batch that does not load | the error alert above an empty table | the server's message and a New Batch button that clears `batch` `deviation:batch-load-error-new` |
| Cells | `crm-search-input` per editable column, unlabelled; a display-only column reads the row by its key, not its import column (see [upstream bugs](upstream-bugs.md)) | the in-place editors' inputs, labelled "Column, Row n"; a column whose input they lack shows its value with the note; a display-only column shows the stored value of its import column |
| Formulas (`input_attrs.formula`) | built into an Angular expression and evaluated; a joined entity's fields read 0 (see [upstream bugs](upstream-bugs.md)) | parsed as fields, numbers and arithmetic, computed on numbers, each field read from the column showing it; anything else is noted |
| Totals | summed in binary floating point and compared with `==` (see [upstream bugs](upstream-bugs.md)) | summed to 15 significant digits, so typed amounts meet their target |
| Saving | every 10 seconds and before the import; a failed save drops the changes, and the import can run without the edits made during a save (see [upstream bugs](upstream-bugs.md)); leaving the page drops what was not saved yet (see [upstream bugs](upstream-bugs.md)) | the same rhythm; a failed save keeps the rows unsaved and shows the server's message until a save succeeds; the import saves until no edit is left and stops when a save fails; the page asks before it is left with unsaved rows and saves them when the display closes |
| Removing a row | removed at once, the delete sent without waiting (see [upstream bugs](upstream-bugs.md)) | removed once the delete succeeds; the focus moves to the next row's remove button, or the previous one, or Add Rows |
| Copy column | copies the first row's value and sends `Import.update` for the later rows; formulas fed by the column keep their old value (see [upstream bugs](upstream-bugs.md)) | copies the value, recomputes the formulas and saves the rows with the next save |
| Required values | checked on the rows of the current page (see [upstream bugs](upstream-bugs.md)); a CRM alert lists the first three rows | checked on every row; an alert under the table lists the same messages, the pager moves to the first row missing a value and focuses it, invalid inputs get `aria-invalid` |
| Totals mismatch | `CRM.confirm` "Totals Mismatch" | a native modal dialog with the same text and buttons `deviation:batch-mismatch-dialog` |
| While importing | the display is blocked | the table is inert `deviation:batch-import-inert` |
| A failed import | the display stays blocked (see [upstream bugs](upstream-bugs.md)) | shows the server's message and lets the import run again |
| Status | visible only | saving, adding rows and importing also announced in a live region `deviation:batch-status-announced` |

### Chart display

The chart display (`crm-search-display-chart-kit`, from the chart_kit
extension) is drawn by core's own `<civi-search-display-chart-kit>` element on
both renderers; Angular's directive only wraps it. React creates the same
element and hands it the display, the form's name and the merged filters.
`tests/browser/chart.spec.ts` draws a pie chart with both renderers, with and
without a filter, and compares title, legend and slices.

| Area | Angular | React |
|---|---|---|
| Loading | chart_kit's scripts (d3, dc, crossfilter) load with the form's Angular modules, before the form renders | the same scripts load when the first chart on the page is drawn, with a "Loading…" status until then; the server lists them from chart_kit's bundle, and an entry it cannot load (inline markup, an ES module) shows as the chart's alert, leaving the rest of the page alone `deviation:chart-scripts-on-demand` |
| Filters | the element reads the form's values from the `afFieldset` controller; an empty filter list from the server breaks the search (see [upstream bugs](upstream-bugs.md)) | the element gets the form's values in its `filters` attribute, an empty list as `{}`; a changed value updates the attribute, and the element reruns |
| Hidden tab, filters not final | the element runs as soon as it is attached | the element is attached once the display may run, and stays while its tab is hidden again; its filters update when it is shown `deviation:chart-attached-when-runnable` |
| Removed chart | its pending search still runs (see [upstream bugs](upstream-bugs.md)) | its pending timers are cleared |
| Without chart_kit | no module defines the directive, nothing is drawn | an alert says that charts need the chart_kit extension, and the support report notes it `deviation:chart-kit-missing-alert` |
| Drawing, download links, accessibility | core's element (see [upstream bugs](upstream-bugs.md)) | the same element |

## ReCaptcha

| | Angular | React |
|---|---|---|
| `crm-recaptcha2` | a `<script>` for Google's `api.js` in the template, the widget from the `g-recaptcha` class with the key the server writes into the markup; the response goes to `data.extra.recaptcha2` through a global callback; it is kept after it expires and after a failed submission (see [upstream bugs](upstream-bugs.md)) | Google's script once per page with explicit rendering, or the page's own where present; the same key, theme and `extra.recaptcha2`; an expired response is dropped and the widget resets after a failed submission; outside `af-form` it shows as unsupported |
