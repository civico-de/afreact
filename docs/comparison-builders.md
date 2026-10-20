# React vs Angular builders

The React builders edit the same records as core's Angular ones: the
SearchKit admin (searches and their displays) and the FormBuilder editor.
A part a React screen cannot edit shows a notice with a link to the same
record in the classic builder instead of being dropped; the debug mode links
every screen there. The
renderer's differences are in [comparison.md](comparison.md), the bugs in
core found on the way in [upstream-bugs.md](upstream-bugs.md). Where React
does better than core, a section lists it under "Improvements over core", with
the test that pins it.

## Visual parity

React writes the markup of core's builder templates with the same classes,
so the theme styles both builders, and the FormBuilder page loads core's
`afGuiEditor.css` for the canvas. Where Riverlea keys its selectors on
Angular's element names or runtime markers, React renders them too: the
elements `af-gui-container`,
`af-gui-field`, `af-gui-edit-options`, `af-gui-clause` and
`af-gui-container-multi-toggle`, and the `ng-binding`, `[ui-sortable]` and
`[crm-ui-editable]` markers. The colours React adds in `src/afreact.css` come
from the theme's `--crm-*` variables, so they follow the stream and dark mode.

`tests/browser/a11y.spec.ts` runs axe on the React and the Angular FormBuilder
editor in light and dark mode (pairs "FormBuilder editor", "FormBuilder
entity tab" and "FormBuilder tab set") and fails when React breaks a rule on
more elements than core. The search builder's specs compare what both
builders save: `tests/browser/display-sweep.spec.ts` opens every search with
displays in both and compares the save request, and
`tests/browser/search-editor.spec.ts` saves searches with joins, conditions
and group by as core's editor saves them. `docs/testing.md` lists the rest.

## FormBuilder editor

### Improvements over core

| Area | Angular | React | Pinned by |
|---|---|---|---|
| Token menu (`afGuiTokenSelect`) | a select2 box with a code icon; its groups are collapsed until clicked or until the user searches; a group is named by the entity's label, or else by the entity type's label ("Individual"), so two unlabelled entities of one type read alike | the same box and icon; the list opens with a search and shows the groups expanded, each an ARIA group; a group is named by the entity's label, or else by its name ("Individual1") `deviation:token-groups-by-entity-name` | `tests/browser/formbuilder-editor.spec.ts`: "appends a token to a field label from the label's token menu" |
| Canvas drag and drop | jQuery UI sortable, pointer only; the bar shows while the pointer is over the canvas; the element leaves the layout, a small half-transparent copy follows the pointer, and a 30-pixel drop zone box opens where the element would land; a drop the form does not allow (a field into another entity's fieldset) is undone after it is made | dnd-kit, by pointer or keyboard. The pointer drags by the element's bar, except on its buttons and inputs; a grip at the bar's left edge is the keyboard control (Space or Enter to pick up, arrow keys, screen-reader announcements), and the bar also shows while it holds focus. A full-size copy of the element follows the pointer. Where it would land a gap of its size opens, boxed in the theme's focus colour, which keeps its contrast in dark mode; a pointer drag takes the element out of the layout meanwhile, as core does, and over its own place leaves the gap there, where a drop changes nothing. Targets are measured as the gap moves the layout; each gap between two items is one target, and free space counts as the gap by the nearest item. A keyboard drag keeps the element in place, outlined, so the grip keeps the focus. A place the form does not allow is outlined in red before the drop. Palette entries are picked up the same way. `deviation:canvas-drag-drop` | `tests/browser/formbuilder-editor.spec.ts`: "moves a field by keyboard with the grip on its bar", "moves a field by pointer to the gap shown, its copy beside the pointer, and not at all over its own place" |
| Palette entries | a list of titles; an entry says nothing about what it adds | a grid of tiles. A field's tile shows its input type with an icon and its settings: required, several values, read only, the entity it refers to, the first three options, a length limit. A block's tile shows its entity's icon and lists its fields and inner blocks, its layout loaded once the tile scrolls into view. An element's tile shows its icon (a button's own) and a short line on what it does; an extension's element gets a generic icon. The description is the tile's accessible description `deviation:palette-tiles` | `src/admin/afform/palette/tiles.test.tsx`, `summary.test.ts`; `tests/browser/formbuilder-editor.spec.ts`: "describes each palette entry on its tile", "has no axe finding on the palette tiles and value cards" |
| Search in the palette's add list | a search that matches nothing leaves the list empty, without a word | the list says "Nothing matches" with the term, as a status that screen readers announce `deviation:palette-search-none` | `src/admin/afform/palette/sections.test.tsx`: "say when nothing matches a search, and only then"; `tests/browser/formbuilder-editor.spec.ts`: "has no axe finding on the palette tiles, value cards and a search without match" |
| Pasting a page route | focusing the empty Page Route offers "civicrm/"; a whole path pasted after it doubles the start ("civicrm/civicrm/…"), so the form route leads nowhere | a pasted path that already begins with "civicrm/" replaces the offered start `deviation:route-paste-replaces-offer` | `src/admin/afform/palette/SettingsTab.test.tsx`: "takes a whole path pasted into the offered start of a page route" |
| Dialog focus on close | jQuery UI dialogs return focus to the element that opened them; when that element has gone, focus falls to the page | dialogs and confirmations return focus to the element focused when they opened; when that sat in a menu that has since closed, to the menu's button `deviation:dialog-return-focus` | `src/admin/widgets/Dialog.test.tsx`, `src/admin/search/dialogs.test.tsx` |
| Display limit, page size and placeholder count | an entry that breaks the field's `min` or `step` ("1.5", "-5") leaves the model empty, so the limit drops to 0 and the pager switches off | such an entry is not saved; the field shows the saved number again. An emptied field still means 0 `deviation:number-input-rejects-invalid` | `src/admin/search/display/common.test.tsx` |
| Deleting a canvas element | the element and its menu go; focus falls to the page | focus moves to the grip of the element that took its place, else of the one before, else of its container `deviation:delete-keeps-focus` | `src/admin/afform/canvas/common.test.tsx` |
| Removing an entity | the entity and its fieldsets go at once; other entities' data, conditions and tokens that name it stay and point at nothing | when the form still names the entity elsewhere, a confirmation lists those places before removing it; otherwise it goes at once `deviation:remove-entity-references` | `src/admin/afform/model.test.ts`, `src/admin/afform/palette/EntityTab.test.tsx` |

### Differences by design

| Area | Angular | React |
|---|---|---|
| Tab sets on the canvas (`af-tabset`) | a gear button inside each tab's link opens that tab's menu (title, icon, count, delete) | the same menu, for the active tab, behind one gear button at the end of the tab bar, titled "Configure" and the tab's title; an ARIA tab list may own only tabs (see [upstream bugs](upstream-bugs.md)) |
| Palette entity tabs | the active entity's label is edited in place inside its tab, the trash button sits in the tab's panel; the add-entity and add-search "+" menus are tabs of the same list | each tab always shows the entity's label; the open entity's panel starts with a head showing its icon and label, where the label is edited in place and the trash button sits; the "+" menu sits beside the tab list (see [upstream bugs](upstream-bugs.md)) `deviation:entity-label-in-panel-head` |
| Palette tab widths | `adjustTabWidths()` sets a `max-width` on the inactive tabs from the measured free space, on load, on resize and when tabs change, cutting their names short | the tabs wrap onto further rows, each showing its full name; no script `deviation:palette-tabs-wrap` |
| Entity tab, "Add value" picker | lists every field of the entity; fields already on the form or set as a value are shown disabled | leaves those fields out `deviation:entity-add-value-omits-used` |
| In-place edit placeholders ("No title" and the like) | `crmUI.css` grey, which fails contrast (see [upstream bugs](upstream-bugs.md)) | italic, in the text colour |
| Option editor (`af-gui-edit-options`) | options are reordered by dragging, and dragged between the enabled and the deleted list; remove and restore buttons | move-up and move-down buttons per option instead of dragging; the same remove and restore buttons `deviation:option-move-buttons` |
| Conditional rules dialog | clauses are dragged within and between groups (`ui-sortable`) | move-up and move-down buttons that also move a clause into and out of the groups beside it `deviation:condition-clause-move-buttons` |
| Other extensions' builder parts (an element's `admin_tpl`, an input type's `admin_template`, a behavior's template, an entity's `options_tpl`) | the extension's Angular template inside core's editor | the extension's `afreact-afform-admin-*` element where it defines one; else a notice in place with a link to the classic builder, and the part saved back unchanged `deviation:afform-plugin-parts` |
| Other extensions' changes to the editor (a decorator, a config or run block, a ChangeSet on an editor template) | run inside core's editor | not run; the editor lists them in a warning, links the classic builder and refuses to save `deviation:form-editor-classic-only` |
| Builder panels | no extension point of its own | an extension's custom elements get the form as it would be saved; a non-empty `validationMessage` blocks saving and its `saveNotes` are asked to confirm `deviation:form-builder-panels` |
| Undo and redo keys | a `keyup` handler on the window, also inside text fields; Ctrl+Shift+Z does nothing (see [upstream bugs](upstream-bugs.md)) | Ctrl+Z and Ctrl+Shift+Z undo and redo outside text fields and leave text fields to the browser; the same 20 states, each restoring the palette tab it was made in |
| Entity and search tabs of the palette | "Values:" and "Add:" ("Hidden Filters:" and "Form Filters:") side by side in two columns; an entity's options and behaviors below them, a search's options as a third column; the add list scrolls inside a box 400 pixels high, its search cleared on every tab switch; the fieldset entry heads the list on its own; the settings tab is one long form | sections one above the other, each the palette's full width: Values, Options and Add (Hidden Filters, Options and Form Filters). Each heading shows and hides its section and states its content: the number of values or filters, the security mode, actions, ID from URL and active behaviors. A section shut stays shut in the other tabs of its kind; Options start shut. A shut section tells of a missing or invalid value or an error it holds, and once open marks an invalid input; the warning on records anyone can open by their id in the URL stays in view. The add list grows with the panel; its search box stays in view on scrolling and keeps each tab's term while another tab is open; the fieldset entry is the first tile of the entity's own fields. The settings tab keeps the title on top, then the sections General, Placement Options and Submissions `deviation:palette-sections` |
| An entity's values and a search's hidden filters | a plain list of rows, the remove button after the input | each a card in the palette tiles' style, its remove button in the top right corner `deviation:palette-value-cards` |

## SearchKit builder

### Improvements over core

| Area | Angular | React | Pinned by |
|---|---|---|---|
| Relative date offset in a condition ("Before now", "After now") | a number input bound to the offset through an Angular number model | the typed text stays on show; only a whole number of 1 or more is stored, and leaving the input brings back the last stored offset, so a cleared input or a typed "1.5" or "-5" never stores 0, a fraction or a negative offset `deviation:relative-date-offset-draft` | `src/admin/search/SearchInput.test.tsx` |
| A display's sort rows | every row's direction select has no name and its remove link is titled "Clear" (`crmSearchAdminDisplaySort.html`), so a screen reader cannot tell the rows apart | each row names its field: "Direction of %1", "Clear sorting by %1" `deviation:sort-controls-named` | `src/admin/search/display/DisplayEditor.test.tsx`: "names each sort row's direction and clear button by its field" |
| Editing a label or description in the search listing | the editable cell focuses its input when it opens; once saved or cancelled the input goes and the focus falls to the page | the focus returns to the cell's edit button after saving, Escape or Cancel `deviation:inline-edit-returns-focus` | `src/admin/search/SearchList.test.tsx`: "returns focus to the label's edit button after saving or cancelling" |
| A condition or filter value no option has (an option removed since, or a name stored where the field compares ids) | the select reads as empty while the value stays stored | the value stays selected and on show as "%1 (no such option)" until another option is chosen `deviation:option-value-unknown-shown` | `src/admin/search/SearchInput.test.tsx`: "shows and keeps a stored value that no option has" |

### Differences by design

| Area | Angular | React |
|---|---|---|
| Display type editors of other extensions | the extension's Angular component inside core's builder | the extension's `afreact-search-admin-display-<type>` element where it defines one; else its Angular component runs as an island inside the React display page, booted through core's loader; else the display tab offers the label only and links the classic builder `deviation:search-display-plugin-editors` |
| Display settings the React editor does not know | kept by core's builder, and editable where its templates or an extension's offer them | listed in a notice with a link to the classic builder, and saved back unchanged `deviation:display-settings-unknown-kept` |
| Other extensions' changes to the builder (a decorator on a builder directive, a ChangeSet on a builder template) | run inside core's builder | not run; the builder lists them in a warning, links the classic builder and refuses to save `deviation:search-builder-classic-only` |
| Builder panels | no extension point of its own: an extension changes core's templates with a ChangeSet | an extension registers custom elements, which get the record on every change; a panel's non-empty `validationMessage` blocks saving and its `saveNotes` go into the save confirmation `deviation:search-builder-panels` |
| Reordering columns, autocomplete search fields, links, clauses and segment items | dragging (`ui-sortable`), pointer only (see [upstream bugs](upstream-bugs.md) for segment items) | move-up and move-down buttons that keep focus on the moved item; a clause moves into and out of the groups beside it `deviation:builder-reorder-buttons` |
| Search listing | tabs with count badges nested in their links (see [upstream bugs](upstream-bugs.md)) | an ARIA tab list with arrow keys |
| A column's custom date format | taken with every keystroke; an emptied format stays a custom one, its input open | an empty format reads as the default, as the "Default" choice of CiviCRM 6.19 stored it, so the custom format is taken once its input is left and emptying it to type another keeps the input open `deviation:date-format-custom-on-blur` |
| Clearing a subsearch column's saved search | `search` becomes `""`, `display` `null`, and the filters on the old search's fields stay | `search` is removed, `display` becomes `null` and the filters are emptied, as choosing another search empties them in both `deviation:subsearch-cleared-drops-filters` |
| A subsearch column whose saved search no longer exists | on opening the display, `search` and `display` are deleted without a word | both stay and an alert names the missing search until another is chosen; its filters get the same start-up cleanup as those of an existing search `deviation:subsearch-missing-search-kept` |
