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
bugs). A display in a hidden `af-tab` runs only once its tab is shown, on both
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

### Differences by design

| Area | Angular | React |
|---|---|---|
| Select fields | select2, with option colours, icons and descriptions | native `<select>`, sized like select2, with its warning border on a required select emptied by the user (core up to 6.19 also warns on an untouched one); options show their label only; a select without a label is named by its placeholder, else by Select.html's title |
| Date fields | jQuery UI datepicker, site input format, a number input for the year-only format `yy`; the calendar offers the years from `start_date_years` back to `end_date_years` ahead (100 each by default) | native `<input type="date">` or `datetime-local`, wider than the datepicker to fit its format and calendar icon, without a limit on the years, so a stored date outside them stays as it is; a number input for `yy` and `<input type="month">` for formats without a day (`yy-mm`, `M yy`), which Safari and Firefox show as a text field that accepts `yyyy-mm` only. Both offer the clear link only on a field that is not required |
| Character count of a text area with `maxlength` | "n / max" below the field, not tied to it | the same count, which describes the text area (`aria-describedby`): a screen reader reads it with the field, not on each keystroke |
| Search filter text shorter than `minlength` | the value is dropped from the filter while typing, so the table shows unfiltered rows | filters by what was typed |
| Clear links | `<a>` without `href`, not reachable by keyboard | same link with `role="button"`, focusable, Enter and Space |
| Required text holding only spaces | ngModel trims it to empty and marks the field `ng-invalid-required`; the browser sees text and shows no hint | same model and alert; the control reports "This field is required." as a custom validity message, the browser's hint for that field |
| Admin block menus | gear menu per block for administrators | not rendered |
| Display filters reading `options.x` where nothing placed the form | `options` is undefined on the form's page and in a dashlet, the name resolves to nothing and the filter is left out | the same on the form's page, in a dashlet and in a placement; the preview page and the support report, which show a form core shows nowhere, note the filter instead of leaving out what the form means to hide |
| Theme rules keyed on Angular's runtime classes | Riverlea sizes a table's alerts by `td > p.alert.ng-binding` and lays out link cells on the contact summary by `span.ng-scope a` | the same markup carries `ng-binding` on a table's no-results and error paragraph and `ng-scope` on each link span, so the theme styles both alike; Riverlea's dashlet padding for `.crm-dashlet-content > .ng-scope` is not covered |
| API calls | calls made together share one request | one request per call |
| Reference fields (EntityRef) | select2 over `<Entity>.autocomplete` | ARIA combobox in select2's multi-select markup for single and multiple fields; the search loads with the first such field on a page. A single field shows the chosen label in its input, with a clear link |
| Quick-add links on reference fields (`input_attrs.quickAdd`) | in the dropdown while the input is too short or nothing matches, out of the keyboard's reach; a popup that saves no record changes nothing | below the field while it is enabled, reachable by Tab; a popup that saves no record shows an error |
| Stored ids the autocomplete cannot find | dropped from view, kept in the model | kept, with a visible "No record found" message |
| Chained selects (ChainSelect) | select2, disabled while the options load and when none came back (`master` also disables it while the control field is empty); a required one without options blocks the submit for good | native `<select>`, options from `Afform.getOptions` as in Angular, disabled the same way; the browser skips a disabled select, so the server reports the missing value instead |
| In-place editors | select2, datepicker and select2 tags; text inputs at least as wide as the cell was | native `<select>`, `<input type="date">` and `datetime-local`, a colour picker beside a text input; inputs at their own width |
| In-place editor for a multi-value text, number or date field (no options) | select2 tags split at commas; a date picker adding one day at a time, no day twice | chips with an input: Enter or a comma adds a text or number, Backspace on an empty input removes the last, what is typed when the editor leaves is kept; a date input adding one day at a time, no day twice; a multi-value Yes/No field is two checkboxes as in core |
| In-place reference editor (fk_entity, `id`) | `crm-autocomplete` on the foreign entity with `fieldName: <entity>.<field>`, quick-add and quick-edit links in the dropdown; Enter and Escape close an open list before they reach the editor | the same combobox as a form's EntityRef, with the same `fieldName`; a single value shows its label and a clear link, a multi-value one its chips; no quick-add or quick-edit links (their popup would leave the editor); Enter and Escape in an open list stay with it |
| New row (`editableRow.create`) | an "Add" button in the control column opens a row of inputs; every input is marked required but saved anyway; Enter anywhere saves; `cancelEditing()` runs before the call, so a failed save loses the typed values; a new record outside the filters reloads the displays; an empty `createLabel` leaves an icon-only button | the same row; only fields that allow no null are required and checked before the call; Enter in the row saves, Escape returns the focus to the button; a failed save keeps the row with the error; the same reload; "Add" as the fallback label; editable columns whose editor React lacks are named in the note, and a required one among them withholds the row |
| Full-row editing (`editableRow.full`) | a click on an editable cell opens every editable cell of the row; Save and Cancel in the control column; Enter saves the row (a document-level key handler of the last cell that opened), Escape cancels; the row's values are sent whether or not they changed, so saving an untouched row still writes the record; no check of the inputs before the call | the same cells, buttons and keys, Enter and Escape handled in the row and on its buttons; the values of every shown editable cell go in one `inlineEdit` call (a column the picker hides stays out), an unchanged row closes without a call; a cell the user emptied of a field that allows no empty value holds the row, an untouched empty one does not (the server leaves it alone either way); a failed save keeps the row open with its values and the error under the buttons, unless another editor opened meanwhile; only the editable cells are marked as editing; only tables, which have the control column, edit by row |
| Leaving an in-place editor | the editor stays open until Enter, Escape or a button | a valid change saves, an unchanged editor closes; switching windows leaves it open |
| Emptying an in-place text | saves `""` | saves `null` where the field can be emptied |
| Totals after an in-place edit | kept (see upstream bugs) | asked again |
| Drag to reorder | jQuery UI sortable, pointer only | dnd-kit: pointer, and keyboard (Space or Enter, arrow keys) with screen-reader announcements; dnd-kit loads with the first draggable display on a page |
| Drag to reorder in a hierarchical table | the row moves alone in the flat list and takes the weight of the row it displaces, whatever its depth or parent; its sub-rows stay behind until the next search | the row moves with its sub-rows, among its siblings only, and takes the displaced sibling's weight, since weights order siblings (`SearchDisplay.inlineEdit` with `draggableWeight` could also take a new parent; React sends the weight only); a drop on a sibling's sub-row counts for that sibling, one under another parent or at another depth leaves the row where it was, announced and with a notice |
| Drag to reorder in a tree display | jQuery UI sortable with connected branches: a pointer drop before or after an item in any branch, or into a branch's top padding, sends the weight of the item the drop displaces (the one after it in another branch, `1` in an empty one) and the new parent; an item whose parent the search leaves out is not shown at all; the dragged item's branch is hidden meanwhile | dnd-kit: a drop on an item's line puts the dragged item after it among that item's siblings, a drop on the edge above a branch's first item (or below a leaf) puts it first in that branch; the weight sent is the target's for a move down among the same siblings and the target's plus one otherwise, the next item's for a first place and `1` in an empty branch, with the new parent; by keyboard, Up and Down step through the lines and first places in document order with announcements; an item cannot go under itself, and a closed branch takes no first place until it is opened; an item whose parent is not on the page stands at the top and moves as one of the top items; a failed save puts the item back and asks the server for the rows; the dragged item's branch is hidden meanwhile, and the opened branches stay open, as above |
| Collapsed rows across a reload | every run closes the sub-rows again (`collapsible: closed` is applied to each new row object) | the rows opened or closed stay so through a popup save, a filter, a sort or a page change, as in the tree display |
| Toggle fields | checkbox drawn as a switch | the same checkbox with `role="switch"` |
| Tab sets (`af-tabset`, `crm-ui-tab-set`) | tab list with clickable links | ARIA tabs pattern: `role="tab"` on the focusable element with `aria-selected` and `aria-controls`, one tab in the Tab order, arrow keys, Home and End |
| Tab names without `name` | `tab0`, `tab1` … from one counter per page | numbered per tab set, the same on a page with one tab set |
| Tab under `url-arg` | written to the URL also when the page opens | written when the user selects a tab |
| Invalid field in a hidden tab | submit does nothing visible (6.20 also blocks moving to a later tab while the current one has an invalid field) | submit selects the field's tab and the browser points at the field; moving between tabs is free |
| Pages (`page-nav-buttons`, 6.20) | Back and Next buttons, the form's submit button on the last page labelled by `page-nav-submit-text` (empty without it, see upstream bugs); Next does nothing while the current page holds an invalid field; Enter in a field presses Next | the same buttons, "Submit" without the attribute; Next focuses the page's first invalid field and shows the browser's message; Enter presses Next; `selected-tab` with a string literal names the page to start on, after `url-arg` and before the remembered selection (core drops the URL's tab, see upstream bugs); a URL naming no tab is skipped, where core falls through to the remembered tab |
| Tab badge from `total-count="$parent.count"` | counted after 900 ms without the form's filter values | counted at once, also without the form's filter values |
| File fields | upload progress in a CRM.status popup; the Replace link has no `href` and no role | progress in the form's status line, errors in its alert; Replace is a focusable button named after the file, and moves focus to the new file input |
| Search ranges (`search_range`) | two inputs after the field's label | the same pair as a group named by the label, the inputs named "… from" and "… to"; a select range sends its bounds as typed option ids (`2`) where select2 sends strings (`"2"`) |
| Repeat buttons (`af-repeat`) | add button labelled by the attribute's value, icon only when it is empty; remove button icon only | the same visible content; an icon-only button carries a screen-reader name, "Add" or "Remove" (see upstream bugs) |
| Form closed for submissions | "Sorry" alert; only the submit button is disabled, the fields stay editable | the same alert, the reason above the form, and every control disabled |
| Errors from `Afform.submit` and `submitDraft` | an alert only | the same alert, plus a summary above the form that lists each message and takes focus, except after an autosave |
| Invalid input on submit | an alert only (the browser shows its own hint on the field); while a typed value breaks `min`, `max`, `step` or `minlength`, ngModel holds `undefined`, which conditions and tokens see; an `af-required` condition that flips re-validates, so an emptied field changes between `""` and `undefined` with it | the same alert plus a summary above the form; the typed value stays in the data until it is valid; an emptied field keeps the empty value it was given, so a required flip after emptying does not rewrite it (a submit sends `""` or nothing accordingly) |
| `crmFormSuccess` and `crmFormError` | triggered on the `af-form` element | triggered on the renderer's wrapper element, so a listener bound to `af-form` itself hears nothing; `document` or an ancestor hears both |
| Calculated default (`afform_default` with tokens) | calculated when the field initialises and whenever a referenced field changes, until an input of the field was touched; a route value lands afterwards and outlasts the first calculation, a loaded record's value does not (upstream bug below) | a field holding a value when it mounts (route, loaded record) keeps it until a referenced field changes |
| `afFormPreSubmit` | broadcast to Angular widgets such as a captcha before the submit | not sent; such widgets are Angular directives, which the renderer reports as unsupported |
| Confirmation message | replaces the form; the focus is lost with the button | replaces the form and takes the focus |
| Prefill on load | the fields show at once under a blocking overlay (`$element.block()`) until `Afform.prefill` lands, then its records are merged over the data | the fields show at once and take input; the form is `aria-busy` with "Loading…" in its status line and the submit, draft and reset buttons wait; the records then land over the data, so a prefilled field typed into meanwhile takes the stored value; a token default waits for the prefill |
| Reset button | `resetForm()` tells the fields to reset (`afFormReset`) and prefills again | the form loads afresh, so repeats, conditions and draft state start over too |
| Grid displays | boxes in plain `<div>`s | the same boxes with `role="list"` and `role="listitem"`, named by the display label where the display is loaded by name (a form's layout carries no label), as list displays are |
| Field labels and help texts (`label`, `help_pre`, `help_post`) | set as HTML (`af-markup`), tokens such as `[Individual1.0.first_name]` show the field's value inside `af-form` | the same, with the HTML rebuilt from a list of plain elements and attributes: scripts, event handlers and inline styles are dropped, other unknown tags keep their text; a token updates while the user types, where Angular waits for the input's `change` |
| Display-only fields (`DisplayOnly`) | option labels, dates in the site format, reference labels from `<Entity>.autocomplete`, rich text as HTML, URL and file links; a value matching no option, or not of the option's type (`"2"` for `2`), shows nothing, as does a date it cannot format | the same, with values compared as text and a value without option or a date that cannot be formatted shown as stored; rich text keeps what `ng-bind-html` keeps (no `id`, `role` or `aria-*`, links and images of plain schemes only), and a URL of another scheme stays text; a failed label lookup shows its error |
| Route parameters | the hash (`#?first_name=…`), for the fields and for the server's `args` | the same for the fields; `args` also carry the page's query string, with the hash over it |
| Reference field whose dynamic entity has no mapping for the controlling value | disabled, without a word | disabled, with "No entity to search for …" |
| Checkout block (`CheckoutBlock`, the donation form's `checkout_params`) | `afCheckoutBlock`: test-mode warning, the chosen option's description, template and fields; the details start empty and a change of option empties them; the block reads `CRM.afCheckout` from its own Angular module | the same from the page's `afreact.afCheckout` variable (`Civi\Afreact\Assets`), set while contributions through forms are enabled; the fields' labels are tied to their controls and the expiry pair is a group; an option cleared to none also empties the details (Angular leaves the stale ones in the data, which the server ignores); a new country empties the billing state and a country without states frees a required one; drafts never carry the details (see upstream bugs) |
| Tree items | `<li>` without `data-entity-id` | `<li data-entity-id>`, as list items have it, so focus can return to the row after a reload |

## Accessibility

`tests/browser/a11y.spec.ts` runs axe on both pages in light and dark mode and
fails when the React page breaks a rule on more elements than the Angular page.
Findings only on the Angular page: the select2 widgets carry roles their
elements do not allow, the clear link carries `aria-label` without a role, and
the primary-email radio has no label. Both pages share the theme's contrast
findings and the layouts' own headings and links listed under upstream bugs;
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
- FormBuilder's own widgets (`af-admin-list-menu`) and the message template
  editor's `crm-monaco`: both need the Angular application they belong to
- include columns: a column of type `include` is an `ng-include` of any Angular
  template, used by SearchKit's own admin listings, which stay Angular
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
| Confirmation dialog | jQuery UI dialog through `dialogService` | native modal `<dialog>`: focus moves in and back to the menu button, Escape cancels before the run starts |
| Progress bar | moves forward every second while a batch runs | moves per finished batch |
| Update dialog | select2 pickers add a clause as soon as a field is picked, and pick each clause's field; `crm-search-input` for the value, unlabelled; fields of every writable type; the success alert is titled "Saved" | a native select plus an Add button; the value input of the in-place editors, labelled by the field; a field whose input the in-place editor lacks would stay in the list, disabled, with the reason as its title; values a hook presets in `task.values` start the dialog; the batch then runs in the task dialog with the same title |
| Task input fields (`apiBatch.fields`) | `crm-search-input` per field, started from its default, serialized, Boolean or first option; the task button waits for a valid form | the in-place editors' inputs with the same start values, native validation; a task with a field those editors lack stays disabled with the note |
| Changing a clause's field in the update dialog | keeps the value typed for the previous field | starts the new field's value afresh, as when added |
| Update from a row link | a row link's single-row update runs `SearchDisplay.inlineEdit`; the update dialog's batch always runs `Entity.update` on the row's id | the same |
| Update dialog preset on a field `getFields` does not list | the clause shows an empty picker and its value is sent | the clause shows the field's name, can be removed, and its value is sent |
| Download dialog | format select; a progress bar grows by 10 % each second whatever the server does; the dialog's close button is hidden while it runs | the same format select; a full striped bar in a status region while the file loads, the title takes the focus; Escape and both buttons are off while it runs |
| Tag dialog | add or remove; the plain tags in a select2 tree, each tagset's tags in an entityref search; the batch runs inside the dialog; looks tags up for the search's entity name (see upstream bugs) | the same choice; the tags in a native multi-select with the tree indented, each tagset's tags in a multi-select of their own; the batch then runs in the task dialog; looks tags up for "Contact" on any contact-type search; the result message counts as core's |
| Relationship dialog | relationship type in a select2, the contact in a `crm-autocomplete` filtered by the type's contact sub-type, then the type's description, dates and custom fields as `crm-search-input`; the batch runs inside the dialog; a failed batch leaves the dialog on its progress bar (see upstream bugs) | the same choice in a native select, the same autocomplete and filter, the type's fields as the in-place editors' inputs (fields they lack are noted); the batch then runs in the task dialog; the result message counts added and existing relationships as core's; a failed batch alerts with the server's message |
| Mailing dialog | name and type, a recipient check (`Contact.get` with an e-mail join) colouring an alert; "Create Mailing" makes a hidden group with the mailing and its include group chained, a second batch adds the contacts, then the browser opens the mailing; a failed step alerts core's message and closes | the same inputs and check; the group and mailing are made from the dialog, the contacts join in the task dialog's batch, then the browser opens the mailing; a failed group alerts core's and the server's message in the dialog, which stays open for another try (each try that got as far as the group leaves a hidden group behind); a failed batch alerts both and closes |
| Open case dialog (`contact.addCase`) | the new case's fields as `crm-search-input`, starting with the required ones without a default and the subject; a choice between a case per contact and one joint case where `civicaseAllowMultipleClients` allows it; `CaseContact.get` for the selected contacts with a case not closed, counting a contact once per open case, with a choice to skip them (the default); Save is enabled before that lookup answers (see upstream bugs); "No cases to open." when every contact is skipped; the batch runs inside the dialog with "Opening case..." / "Opening %count cases..."; a failed batch leaves the dialog hanging (see upstream bugs); the success alert counts the cases and links "View case" for a single one | the same fields as the in-place editors' inputs, the same choices as native radios; the lookup runs afresh each time the dialog opens and counts each contact once; Save waits for the fields and the lookup; a case per contact runs in the task dialog's batch with "Opening cases...", a joint case is created from the dialog, where a failed create stays with the server's message and a failed batch alerts and closes; the success alert counts the cases without the link |
| Assign case role dialog (`case.addRole`) | the role in a select2 over the case types' roles, the contact in a `crm-autocomplete` on the role's contact type and sub-type; `Relationship.get` counts the selected cases holding the role, with "Checking...", "The selected cases do not yet have this role assigned." or "%1 cases already have this role assigned." and a choice between adding and replacing; replacing fires `Relationship.update` ending the other holders without waiting for it; `CaseContact.get` over the cases with `Relationship.create` chained per client runs inside the dialog with "Adding roles..."; a failed batch leaves the dialog hanging (see upstream bugs); the success alert counts the roles added and those the contact held already | the role in a native select with the description as title, the contact in the in-place editors' entityref input with the same filter; the count runs afresh each time the dialog opens and shows the same three states as alerts, the choice as a radio group; Save waits for the role, the contact and the count, and for a choice where cases hold the role; replacing ends the other holders first and keeps the dialog with the server's message when that fails; the batch runs in the task dialog with "Adding roles..." and a failed batch alerts and closes; the same success alert; a hook's preset role, contact and choice are taken over, the role locked by `disableRelationshipSelect`; changing the role clears the contact, whose type may not fit the new role (core keeps it) |
| Delete task without `confirmMsg` (changed by a hook) | runs at once | asks with core's delete question; a delete the renderer's own dialog settled (the removal of tags) runs at once |
| Actions menu longer than the space below its button | the page scrolls to the rest | the menu scrolls within the viewport, or opens above its button when that leaves more room |
| After a row link updates its row | reloads that row (`refreshAfterEditing`) | reloads the table |
| Select-all control | icon buttons | the same buttons with `role="checkbox"` and `aria-checked` (`mixed` for some) |
| Selection count, task result | visible count only | also announced in a live region |

### Batch display

The batch display (`crm-search-display-batch`, core's contribution batch
entry) starts a batch with `SearchDisplay.createBatch`, edits its rows in the
`Import_<id>` table and hands them to `SearchDisplay.importBatch`, whose queue
runner the browser then opens. `tests/browser/batch.spec.ts` enters the same
two contributions with both renderers and compares what the import stored.

| Area | Angular | React |
|---|---|---|
| New batch form | Name, Rows and a target per column with `tally.target`; the Name label points at an id the input lacks (see upstream bugs); a failed create leaves the button spinning (see upstream bugs); the new batch adds a history entry, so Back returns to the form | the same fields, each labelled; a failed create shows the server's message under the button; the new batch replaces the history entry, as every URL key of the renderer does |
| A batch that does not load | the error alert above an empty table | the server's message and a New Batch button that clears `batch` |
| Cells | `crm-search-input` per editable column, unlabelled; a display-only column reads the row by its key, not its import column (see upstream bugs) | the in-place editors' inputs, labelled "Column, Row n"; a column whose input they lack shows its value with the note; a display-only column shows the stored value of its import column |
| Formulas (`input_attrs.formula`) | built into an Angular expression and evaluated; a joined entity's fields read 0 (see upstream bugs) | parsed as fields, numbers and arithmetic, computed on numbers, each field read from the column showing it; anything else is noted |
| Totals | summed in binary floating point and compared with `==` (see upstream bugs) | summed to 15 significant digits, so typed amounts meet their target |
| Saving | every 10 seconds and before the import; a failed save drops the changes, and the import can run without the edits made during a save (see upstream bugs); leaving the page drops what was not saved yet (see upstream bugs) | the same rhythm; a failed save keeps the rows unsaved and shows the server's message until a save succeeds; the import saves until no edit is left and stops when a save fails; the page asks before it is left with unsaved rows and saves them when the display closes |
| Removing a row | removed at once, the delete sent without waiting (see upstream bugs) | removed once the delete succeeds; the focus moves to the next row's remove button, or the previous one, or Add Rows |
| Copy column | copies the first row's value and sends `Import.update` for the later rows; formulas fed by the column keep their old value (see upstream bugs) | copies the value, recomputes the formulas and saves the rows with the next save |
| Required values | checked on the rows of the current page (see upstream bugs); a CRM alert lists the first three rows | checked on every row; an alert under the table lists the same messages, the pager moves to the first row missing a value and focuses it, invalid inputs get `aria-invalid` |
| Totals mismatch | `CRM.confirm` "Totals Mismatch" | a native modal dialog with the same text and buttons |
| While importing | the display is blocked | the table is inert |
| A failed import | the display stays blocked (see upstream bugs) | shows the server's message and lets the import run again |
| Status | visible only | saving, adding rows and importing also announced in a live region |

### Chart display

The chart display (`crm-search-display-chart-kit`, from the chart_kit
extension) is drawn by core's own `<civi-search-display-chart-kit>` element on
both renderers; Angular's directive only wraps it. React creates the same
element and hands it the display, the form's name and the merged filters.
`tests/browser/chart.spec.ts` draws a pie chart with both renderers, with and
without a filter, and compares title, legend and slices.

| Area | Angular | React |
|---|---|---|
| Loading | chart_kit's scripts (d3, dc, crossfilter) load with the form's Angular modules, before the form renders | the same scripts load when the first chart on the page is drawn, with a "Loading…" status until then; the server lists them from chart_kit's bundle, and an entry it cannot load (inline markup, an ES module) shows as the chart's alert, leaving the rest of the page alone |
| Filters | the element reads the form's values from the `afFieldset` controller; an empty filter list from the server breaks the search (see upstream bugs) | the element gets the form's values in its `filters` attribute, an empty list as `{}`; a changed value updates the attribute, and the element reruns |
| Hidden tab, filters not final | the element runs as soon as it is attached | the element is attached once the display may run, and stays while its tab is hidden again; its filters update when it is shown |
| Removed chart | its pending search still runs (see upstream bugs) | its pending timers are cleared |
| Without chart_kit | no module defines the directive, nothing is drawn | an alert says that charts need the chart_kit extension, and the support report notes it |
| Drawing, download links, accessibility | core's element (see upstream bugs) | the same element |

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

### Every page of the tour

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

### Reading the numbers

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
  after it has run; lazy chunks (comboboxes, drag and drop, the compare page)
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

**Saving a case summary block also submits the case form.** The case
summary screen is a QuickForm `<form>`, so `CaseSummaryBlockPlacement` wraps
the Afform in a `div` instead of a form. The Save button has no `type`
(`ng-click="afform.submit()"`), which makes it a submit button of the case
form: a click, or Enter in a field, runs `Afform.submit` and submits the case
form as well (`master` as of 2026-10-05; read from the code, not run). The
React renderer keeps its own `<form>` inside the case form: controls submit
that form, and its submit event stops there.

**Minetta's dark mode greys the primary button below contrast.** RiverLea's
default stream sets `--crm-primary-color` to its grey 500 (`#919297`) with
light text on it (`streams/minetta/_dark.css`), 3.1:1 where WCAG AA asks 4.5:1;
the other streams keep a passing pair in both modes. Every `btn-primary` and
`crm-button` on a core page is affected, measured on 6.18.2 with axe; the
variable is the same on `master` as of 2026-10-07. The React pages keep the
theme's button classes rather than colours of their own, and the a11y spec
accepts the finding where a core page in the same theme shows it too.

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

**Repeat buttons without a name.** `afRepeat.html` gives the remove button
only its icon, and the add button only the `af-repeat` value, which may be
empty; `crm-icon` hides the icon from assistive technology, so screen readers
meet a button without a name (`master` as of 2026-10-05; read from the code,
not run). The React renderer shows the same content and adds a screen-reader
name, "Add" or "Remove".

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
set's values never reach the search; fix proposed in
[civicrm-core#37200](https://github.com/civicrm/civicrm-core/pull/37200). The
React renderer keeps them (fields the URL leaves out take the set's values).

**Defaults overwrite loaded or copied values.** A block behind `af-if` that
opens after prefill gets its field defaults over the loaded values, and
copying a repeat item overwrites the copied values with defaults; fix proposed
in [civicrm-core#37199](https://github.com/civicrm/civicrm-core/pull/37199).
The React renderer keeps the loaded and copied values.

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

**"Draft Saved" before any draft.** afForm starts its draft watcher after
prefill, and Angular's first call of a `$watch` listener, made with the
unchanged data, marks a pristine draft as saved (`setupDraftWatcher`,
`afForm.component.js` on 6.18; read from the code, not run). Every save-draft
button therefore reads "Draft Saved", disabled, as soon as the form has
loaded. The React renderer keeps the button's own text, disabled, until the
form holds a change no draft has saved.

**Field labels and help texts are set as unfiltered HTML.** afField puts the
label, `help_pre` and `help_post` into `af-markup`, which assigns them to
`innerHTML` (`afMarkup.element.js`). Nothing purifies them on the way:
`Afform.get` purifies only `confirmation_message`. Script in an `on…`
attribute therefore runs for every visitor of the form. Only users who edit
forms or custom fields can write these texts, so this is a hardening gap
rather than an escalation (read from the code on `master` as of 2026-10-06,
not run). The React renderer keeps the HTML but only plain elements and
attributes, and React blocks `javascript:` URLs.

**An emptied field shows "null" in a token.** afForm's `getTokenValues()`
and `replaceTokens()` treat only `undefined` as empty, so a token for a field
set to `null` (a cleared number, or a cleared select of an Integer or Float field; a cleared date is `""`, a cleared String select `""`, a cleared Boolean one `false`) reads
"null" in labels, content blocks and calculated defaults (read from the code
on `master` as of 2026-10-06, not run). The React renderer shows nothing and
leaves the default's text without it.

**Search labels stay in the page title.** A search display adds the labels of
its filters to the title of a search page (`searchDisplayBaseTrait`, afCore's
`addTitle`), but only when there are any, so clearing the filter keeps the old
labels in the title. The React renderer shows the plain title again.

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

**"Column undefined" in the column picker.** `getColumnToggleLabel()` numbers
a column without label or key with `col.index`, which nothing sets
(`crmSearchDisplayTable.component.js:187`), so such a column is listed as
"Column undefined", and a saved filter set stores that label. React numbers it
by position ("Column 3"); a set saved by Angular for such a column therefore
does not match it in React.

**The primary radio of a repeat has no name.** In a repeated join, afField
gives `is_primary` a single option with an empty label
(`afField.component.js:72-74`), and `fields/Radio.html` names each radio by
`aria-label="{{opt.label}}"`, so screen readers announce an unnamed radio
(6.18.1). The React renderer names the radio by the field's label.

**Tab forms put an h3 under the page's h1.** The contact summary tabs for
memberships and relationships start their second section with a literal
`<h3>` (`civicrm_admin_ui/ang/afsearchTabMember.aff.html:3`,
`afformTabMember.aff.html:3`, afform's `afsearchTabRel.aff.html:3`), which
skips h2 (axe `heading-order`, 6.18.1). Both renderers show the layout's markup
as it is.

**A token default overwrites the loaded value.** afField watches the values
of the fields a token default refers to (`afField.component.js:118-128`) and
recalculates on any change. `Afform.prefill` merges the loaded record in one
step, so when it fills a referenced field too, the next digest recalculates
and replaces the record's own value: a contact with nickname "Stored" and a
field defaulting to `Dear [Individual1.0.first_name]` opens as "Dear Ada" and
saves that (reproduced on civikitchen 6.18.1 with `afformAfreactDemoRules`,
`tests/browser/rules.spec.ts`). The React renderer keeps the loaded value
until a referenced field changes.

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

**Dashboard layout needs a mouse.** Core's dashboard moves dashlets between
columns and adds them from "Available Dashlets" only by drag and drop
(`ui-sortable`, jQuery UI sortable, in `ang/crmDashboard/Dashboard.html`),
which has no keyboard path; an available dashlet has no other way onto the
dashboard. Present on 6.18 and `master` as of 2026-10-05. afreact renders
listed Afform dashlets inside core's dashboard and leaves its layout alone,
so the gap remains until the dashboard screen itself moves to React
(architecture.md, "Dashlets").

**Month dates in a format other than `yy-mm`.** For a date format without a
day, `crm.datepicker.js` stores the displayed text plus `-01`, so a custom
field with the format `M yy` saves `Mar 2001-01` instead of `2001-03-01` (read
from the code, not run). The React renderer stores `2001-03-01` for every
format without a day.

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

**A submit can cross a running draft save.** afForm lets Submit run while
`submitDraft` or a draft's upload is in flight, so the late draft answer can
leave a draft behind the submission, or the draft's upload fails with "Draft
not found" after a successful save (`afForm.component.js`, `master` as of
2026-10-06; read from the code, not run). The React renderer keeps the submit
button disabled until the draft save has ended.

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

**A copied repeat item is the same record.** `af-copy` appends
`angular.copy()` of the last item (`afRepeat.directive.js` `copyItem()`; read
from the code, not run), including a loaded record's `id` and its
`is_primary`, so the copy and the original submit under one ID and two join
records are primary. The React renderer copies the values without `id` and
with `is_primary` off.

**Clearing a Yes/No select stores "No".** afField's `getSetSelect()` turns a
Boolean field's value into `val === 'true'`, so an emptied select (`""` or
`undefined`) stores `false` (read from the code on `master` as of 2026-10-06,
not run). The React renderer stores `null`.

**The download dialog never ends a failed download.** `crmSearchTaskDownload`
posts the file request without a rejection handler, so a server error leaves
the bar at 90 % and the dialog open, with its title-bar close button hidden
(read from the code on `master` as of 2026-10-06, not run). Its Cancel and
Download buttons are disabled by `$ctrl.run`, which that controller never
sets, so a second click starts a second download; Cancel and Escape still
close the dialog. The React renderer shows the server's error and closes the
dialog, and disables the buttons while the file loads.

**A URL field is never disabled.** `fields/Url.html` has no `ng-disabled`, so
`af-disabled`, a saving form and a read-only autofill field leave URL inputs
editable (read from the code, not run). The React renderer disables them like
every other input.

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

**A paged form's submit button has no text without `page-nav-submit-text`.**
`afTabset.html` (6.20) writes `{{ $ctrl.pageNavSubmitText }}` into the
button on the last page with no fallback; FormBuilder shows "Submit" as the
attribute's default in the editor only, so a tab set with `page-nav-buttons`
and no `page-nav-submit-text` renders an empty, unnamed button (read from the
code, not run). The React renderer labels it "Submit".

**`url-arg` loses to a literal `selected-tab`.** `afTabset.component.js`
(6.20) binds `selected-tab` two-way (`=?`) and `$onInit` overwrites
`selectedTab` with the URL's tab. A string literal cannot be assigned back, so
the first digest's binding watch finds the child changed, resets it to the
literal and throws `nonassign` (`initializeDirectiveBindings` in AngularJS
1.8): the URL's tab is dropped with a console error (read from the code, not
run). The React renderer opens the URL's tab and starts on `selected-tab`
only without one.

**A date range shows a time input on each bound.** `afField.component.js`
fills `inputAttrs` for a `search_range` date in a `$timeout`, but
`fields/Date.html` binds each bound's `crm-ui-datepicker=":: $ctrl.inputAttrs[n]"`
once, when it links, before that timeout; the datepicker starts from empty
options and shows date and time even for a field whose `input_attrs` say
`time: false`, and the bounds' placeholders are lost (`master` as of
2026-10-08; seen on the demo's birth date range). The React renderer renders
the bounds from the field's own attributes: a date input for a date field.

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
