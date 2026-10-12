# React vs Angular builders

The React builders edit the same records as core's Angular ones: the
SearchKit admin (searches and their displays) and the FormBuilder editor.
Each React screen links to the same record in the classic builder, and a part
it cannot edit shows a notice with that link instead of being dropped. The
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
| Canvas drag and drop | jQuery UI sortable, pointer only; the bar shows while the pointer is over the canvas; a drop zone box opens where the element would land, shifting the layout under the pointer; a drop the form does not allow (a field into another entity's fieldset) is undone after it is made | dnd-kit, by pointer or keyboard. The pointer drags by the element's bar, except on its buttons and inputs; a grip at the bar's left edge is the keyboard control (Space or Enter to pick up, arrow keys, screen-reader announcements), and the bar also shows while it holds focus. The element stays in place, outlined, and a label with its name follows the pointer. The landing place shows as one line in the theme's focus colour, which keeps its contrast in dark mode, without moving the layout: each gap between two items is one target, free space counts as the gap by the nearest item, and over the element's own place nothing is marked and a drop changes nothing. A place the form does not allow is outlined in red before the drop. Palette entries are picked up the same way. `deviation:canvas-drag-drop` | `tests/browser/formbuilder-editor.spec.ts`: "moves a field by keyboard with the grip on its bar", "moves a field by pointer to the line shown, and not at all over its own place" |

### Differences by design

| Area | Angular | React |
|---|---|---|
| Tab sets on the canvas (`af-tabset`) | a gear button inside each tab's link opens that tab's menu (title, icon, count, delete) | the same menu, for the active tab, behind one gear button at the end of the tab bar, titled "Configure" and the tab's title; an ARIA tab list may own only tabs (see [upstream bugs](upstream-bugs.md)) |
| Palette entity tabs | the active entity's label is edited in place inside its tab; the add-entity and add-search "+" menus are tabs of the same list | the label editor sits beside the tab list, and the tab names the entity for screen readers only while it is open; the "+" menu sits beside the tab list as well (see [upstream bugs](upstream-bugs.md)) |
| Palette tab widths | `adjustTabWidths()` sets a `max-width` on the inactive tabs from the measured free space, on load, on resize and when tabs change | the tab list is a flex row in which inactive tabs shrink and the active one does not; no script `deviation:palette-tabs-flex-row` |
| Entity tab, "Add value" picker | lists every field of the entity; fields already on the form or set as a value are shown disabled | leaves those fields out `deviation:entity-add-value-omits-used` |
| In-place edit placeholders ("No title" and the like) | `crmUI.css` grey, which fails contrast (see [upstream bugs](upstream-bugs.md)) | italic, in the text colour |
| Option editor (`af-gui-edit-options`) | options are reordered by dragging, and dragged between the enabled and the deleted list; remove and restore buttons | move-up and move-down buttons per option instead of dragging; the same remove and restore buttons `deviation:option-move-buttons` |
| Conditional rules dialog | clauses are dragged within and between groups (`ui-sortable`) | move-up and move-down buttons that also move a clause into and out of the groups beside it `deviation:condition-clause-move-buttons` |
| Other extensions' builder parts (an element's `admin_tpl`, an input type's `admin_template`, a behavior's template, an entity's `options_tpl`) | the extension's Angular template inside core's editor | the extension's `afreact-afform-admin-*` element where it defines one; else a notice in place with a link to the classic builder, and the part saved back unchanged `deviation:afform-plugin-parts` |
| Other extensions' changes to the editor (a decorator, a config or run block, a ChangeSet on an editor template) | run inside core's editor | not run; the editor lists them in a warning, links the classic builder and refuses to save `deviation:form-editor-classic-only` |
| Builder panels | no extension point of its own | an extension's custom elements get the form as it would be saved; a non-empty `validationMessage` blocks saving and its `saveNotes` are asked to confirm `deviation:form-builder-panels` |
| Undo and redo keys | a `keyup` handler on the window, also inside text fields; Ctrl+Shift+Z does nothing (see [upstream bugs](upstream-bugs.md)) | Ctrl+Z and Ctrl+Shift+Z undo and redo outside text fields and leave text fields to the browser; the same 20 states, each restoring the palette tab it was made in |

## SearchKit builder

### Differences by design

| Area | Angular | React |
|---|---|---|
| Display type editors of other extensions | the extension's Angular component inside core's builder | the extension's `afreact-search-admin-display-<type>` element where it defines one; else its Angular component runs as an island inside the React display page, booted through core's loader; else the display tab offers the label only and links the classic builder `deviation:search-display-plugin-editors` |
| Display settings the React editor does not know | kept by core's builder, and editable where its templates or an extension's offer them | listed in a notice with a link to the classic builder, and saved back unchanged `deviation:display-settings-unknown-kept` |
| Other extensions' changes to the builder (a decorator on a builder directive, a ChangeSet on a builder template) | run inside core's builder | not run; the builder lists them in a warning, links the classic builder and refuses to save `deviation:search-builder-classic-only` |
| Builder panels | no extension point of its own: an extension changes core's templates with a ChangeSet | an extension registers custom elements, which get the record on every change; a panel's non-empty `validationMessage` blocks saving and its `saveNotes` go into the save confirmation `deviation:search-builder-panels` |
| Reordering columns, autocomplete search fields, links, clauses and segment items | dragging (`ui-sortable`), pointer only (see [upstream bugs](upstream-bugs.md) for segment items) | move-up and move-down buttons; a clause moves into and out of the groups beside it `deviation:builder-reorder-buttons` |
| Search listing | tabs with count badges nested in their links (see [upstream bugs](upstream-bugs.md)) | an ARIA tab list with arrow keys |
