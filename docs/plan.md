# Plan: React for every Afform

Goal: every Afform a site shows can render with React instead of Angular,
switched on per form, with the same server contracts (definitions, APIv4
actions, permissions) and the same look. FormBuilder and the SearchKit admin
stay Angular.

## Inventory

`npm run inventory` compiles every Afform of a site and counts what the
compiled layouts use, each with the number of forms using it. On the dev stack
(CiviCRM 6.18, core extensions only, 2026-09-29) all 87 forms compile: 61
search pages, 13 forms, 11 blocks, 2 system forms. The counts below are forms
using a feature, not occurrences.

| Area | Used by | Supported now |
|---|---|---|
| page (`server_route`) | 64 | yes, for forms in `afreact_forms` |
| contact summary tab | 7 | yes, for forms in `afreact_forms` |
| contact summary block and actions, case summary block, event tab | 0 | yes, for forms in `afreact_forms` |
| dashboard dashlet | 0 | yes, for forms in `afreact_forms`, inside core's Angular dashboard screen |
| SearchKit table | 61 | columns, sort, pager with page size, links (with `crm-popup`), images, header count, totals (`tally`), description, `placeholder`, `hideThead`, search button; reload after a popup form; sort, page and page size in the URL |
| … row menu column (`menu`) | 45 | yes (native popover, menu button keys) |
| … bulk actions (`actions`) | 60 | API batches, popup and redirect tasks; tasks that are Angular dialogs (download, update, tag, …) stay disabled with a note |
| … toolbar buttons (`toolbar`) | 44 | yes, with dropdowns, `autoOpen` and task links |
| … in-place editing (`editable`) | 34 | yes for text, number, date, option lists and colours; contact references, locations, multi-value fields and row editing (`editableRow`): no |
| … conditional styles (`cssRules`) | 33 | yes (row, cell, header) |
| … button column (`buttons`) | 15 | yes |
| … drag to reorder (`draggable`) | 13 | yes, by pointer and keyboard; hierarchical tables and the tree display: no |
| … HTML / include / subsearch columns | 10 / 1 / 2 | yes / no (Angular template) / yes (table displays) |
| … hierarchy, collapsible rows | 4 / 3 | yes, in tables and in the tree display |
| search filters from form fields (`filters`) | 23 | yes: defaults, URL, `store-values`, saved filter sets (`_s`), exposed operators, a display's own `filters`, EntityRef and ChainSelect filters; range inputs, Location filters |
| list, grid, tree display | 0 / 1 / 1 | yes; drag in the tree: no. No display knows its label on a form page, so lists and table captions have no name there |
| `{{ :: ts('…') }}` text and `{{ crmUrl(…) }}` links | 33 | yes |
| submit button (`ng-click="afform.submit()"`) | 12 | yes |
| `ng-if="afform.showSubmitButton"` | 3 | yes |
| conditions (`af-if`) | 2 | yes |
| tabs (`af-tabset`, `crm-ui-tab`) | 2 / 1 | yes; `page-nav-buttons`, `page-nav-submit-text` and `selected-tab` (6.20): no |
| field types Text, Select, Radio, Email, CheckBox, TextArea, Url, Date, DisplayOnly, Hidden | 40 … 1 | yes |
| field type EntityRef | 6 | yes, single and multiple, `autoOpen`, `dfk_entities`, autofill of the selected record, quick-add links |
| field type ChainSelect | 5 | yes |
| field type Toggle | 1 | yes |
| admin-only widgets (`af-admin-list-menu`, `crm-monaco`) | 1 / 1 | no: they belong to FormBuilder and the message template editor, which stay Angular |

The `{{ }}` expressions are all of two shapes: `:: ts('literal')` and
`crmUrl('path', {params})`. Core also ships field types no dev-stack form uses:
File, Location, Range, RichTextEditor; the renderer has them too. Afforms on a real site add custom fields
and forms built in FormBuilder; run the inventory there before choosing the
order.

## Work packages

Sizes are rough estimates in lines of TypeScript or PHP including tests.

### 1. Takeover (≈ 450)

- Setting `afreact_forms`: the forms React renders. Forms not on the list stay
  Angular.
- **Pages** (`server_route`): `hook_civicrm_alterMenu` swaps core's
  `CRM_Afform_Page_AfformBase` for an afreact page callback on listed forms.
  Title, breadcrumb and public-page handling stay the same.
- **Contact summary tabs and blocks, case summary blocks, contact actions**:
  listeners after core's placement listeners replace the template for listed
  forms.
- **Dashboard**: see work package 8.
- **Not taken over**: SearchKit and FormBuilder previews, which belong to the
  Angular builders.
- **Support report**: an admin page lists every form with what the React
  renderer cannot show yet, from the same walk the renderer uses. A listed
  form with an unsupported part shows the visible "Not supported" note.

### 2. Expressions and conditions (≈ 400)

- `{{ :: ts('…') }}` and `{{ crmUrl(…) }}` in text and attributes, parsed as
  those two call shapes. Any other expression stays unsupported.
- `af-if` conditions with core's operators, `af-required`, `af-disabled`,
  `ng-if="afform.showSubmitButton"`.
- Token defaults (`defn.afform_default` with tokens), after checking where
  core resolves them.

### 3. Fields (≈ 1,000)

- **EntityRef**: combobox on APIv4 `autocomplete`, the same call core's
  select2 widget makes, with the ARIA combobox pattern. Single and multiple.
  `input_attrs.autoOpen` lists results before typing; with `dfk_entities`,
  the value of `input_attrs.control_field` picks the entity to search.
- **ChainSelect**: country → state/province and similar dependent lists,
  filtered by the field named in `input_attrs.control_field`.
- **Toggle, Range**.
- **File**: upload through `Afform.submitFile` after submit, as core does.
- **RichTextEditor**: core's `CRM.wysiwyg` on a textarea.
- **Location**: `afLocationInput`.

### 4. Submission behaviour (≈ 250)

- Confirmation message, redirect, submit limits (`submit_limit`,
  `submit_enabled`), the "Contact saved." style status as core shows it.
- Behaviours that run client-side (autofill of the current user or an ID
  from the URL, dedupe feedback) checked one by one against core's
  `Behavior/` classes.

### 5. SearchKit table (≈ 1,700)

In order of use: row menus, bulk selection with the actions menu, toolbar
buttons, in-place editing, `cssRules`, button columns, drag to reorder,
HTML / include / subsearch columns, hierarchy and collapsible rows, tally and
header counts, and search filters bound to form fields.

Run result and settings the renderer does not read yet:
- `labels`: core appends them to the page title.
- `editable` and `editableRow.createLabel`: in-place editing and the
  "add row" button.

**Bulk actions.** Core's actions come in two kinds:
- Legacy task forms open in `CRM.loadForm` popups, which are jQuery and work
  without Angular.
- API tasks (delete, update, tag, download, …) are Angular dialogs.

The API tasks are rebuilt in React (≈ 600 more).

### 6. Other display types and layout (≈ 700)

List, grid, tree, batch (data-entry grid) displays; `af-tabset`, `crm-ui-tab`.

### 7. Parity sweep (≈ 300)

One Playwright scenario over every form in the inventory:
- It renders each form with both renderers and compares text, fields and table
  rows.
- It runs axe on both.
- It fails on any "Not supported" note for a form marked as supported.

This replaces the demo-only `parity.spec.ts` as the gate for the takeover.

### 8. Dashboard (≈ 600)

Core's dashboard is an Angular screen (`crmDashboard`). The React version
must provide:
- the same `Dashboard` / `DashboardContact` APIv4 data, columns and drag
  between columns;
- adding and removing dashlets;
- Afform dashlets rendered by React;
- URL dashlets loaded as core does, through `CRM.loadPage`.

**How core renders a dashlet** (6.18, unchanged on `master` but for the
removal of `_` in 2026):
- `CRM_Contact_Page_DashBoard::run()` queues the Angular module
  `crmDashboard` (`DashBoard.php:42`). `DashBoardDashlet.tpl` puts
  `<crm-dashboard>` inside `<crm-angular-js>`. No dashlet data is passed in:
  the component asks for it with `DashboardContact.initialize` and
  `Dashboard.get` joined to the user's `DashboardContact` rows
  (`crmDashboard.component.js:35-50`). The last answer stays in `CRM.cache`
  (`dashboardDashlets`) for the next load.
- A dashlet with a `directive` includes the partial
  `~/crmDashboard/directives/<directive>.html` inside a `<form>`
  (`Dashlet.html:17`). The module's `partialsCallback`
  `CRM_Core_BAO_Dashboard::angularPartials` writes that partial as
  `<directive></directive>` for every Dashboard record with a directive
  (`crmDashboard.ang.php:12`). `addDashboardModuleDependencies` (an
  `angularModules` listener at -2000) adds the module exporting each
  directive to `crmDashboard`'s `requires`.
- Afform creates one managed Dashboard record per form placed as
  `dashboard_dashlet`: `name` is the form name, `directive` its dash-case
  directive, `permission` `@afform:<name>` (`afform.php:103-122`).
- A URL dashlet loads through `CRM.loadPage` into `.crm-dashlet-content`,
  cached in `CRM.cache` (`dashboard`) for `cache_minutes`
  (`crmDashlet.component.js:30-75`). "Refresh" reloads the URL; for a
  directive it removes the `<form>` and puts it back 10 ms later, which
  compiles the directive afresh (`:60-70`).
- Layout writes go through one `DashboardContact.save` 2 s after the last
  change: `records` of `{dashboard_id, id?, is_active, column_no, weight}`,
  `defaults: {contact_id: 'user_contact_id'}`, indexed by `dashboard_id`
  (`crmDashboard.component.js:129-178`). "Delete for all users" runs
  `Dashboard.delete` (`:219`). Moving and adding dashlets is jQuery UI
  sortable, mouse only (see the upstream bugs in comparison.md).

**Chosen: React dashlets inside core's dashboard.** The dashboard screen
stays core's Angular one; only the dashlets of listed forms change renderer.
- An `angularModules` listener after core's (-2100) wraps `crmDashboard`'s
  `partialsCallback`. The listed forms' partials become
  `<afreact-form name="<form>">`, and their modules leave `crmDashboard`'s
  `requires`, so their Angular code is not loaded on the dashboard.
- `hook_civicrm_pageRun` on `CRM_Contact_Page_DashBoard` adds the bundle
  when a listed form is placed as a dashlet.
- Changing `afreact_forms` clears core's Angular cache and the resource cache
  code, as saving an Afform does, so the next dashboard load gets the new
  partials.
- An element that leaves the page drops the query answers no other element
  observes. "Refresh" and "View fullscreen", which take the dashlet's markup
  away and put it back, therefore load the form afresh, as a recompiled
  directive does.
- Data, permissions, columns, drag, add and remove, fullscreen, URL dashlets
  and the writes all stay core's, unchanged. Nothing is written on install;
  the setting alone switches.
- Unlisted Afform dashlets and directive dashlets of other extensions stay
  Angular, as before.
- Inside core's dashlet the React form element sits in core's `<form>`. A
  nested form is legal in a script-built DOM; its own submit stays inside it.

Size: about 120 lines PHP, 20 lines TypeScript, 270 lines of tests.

**Follow-up: the dashboard screen in React** (≈ 1,300 including tests). It
would replace `DashBoardDashlet.tpl`'s `<crm-dashboard>` behind a setting:
- columns and the "available dashlets" drawer with its filter;
- dnd-kit drag between columns and from the drawer, with keyboard sensor and
  live announcements, plus an "Add" button per available dashlet, which core
  lacks;
- remove, collapse, refresh, fullscreen in `<dialog>`, admin delete
  (`Dashboard.delete`);
- URL dashlets through `CRM.loadPage` with core's `CRM.cache` entries and the
  `cache_minutes` checker;
- the same `initialize` / `get` / debounced `save` calls, with dnd-kit as a
  lazy chunk.

What does not go away is Angular for every directive dashlet React cannot
render: unlisted Afforms and other extensions' directives. Each would need an
Angular island, `angular.bootstrap()` on the dashlet with the module that
exports its directive, and the page would still queue those modules through
`angularjs.loader`. Separate injectors per island should work, since core's
crmDashboard shares no service with its dashlets; this is not verified. So
the React screen pays off when keyboard reordering and adding is wanted, not
for the number of forms React renders, which the chosen design already
covers.

Total: roughly 6,000 lines, several weeks of work.

## Status and next steps

As of 2026-10-06:

| Package | State |
|---|---|
| 1. Takeover | done for pages, tabs, summary blocks, the actions popup and dashlets |
| 2. Expressions and conditions | done, with `BETWEEN` and `NOT BETWEEN` |
| 3. Fields | done: every field type core ships, quick-add links, search ranges; File fields outside a form show a note |
| 4. Submission behaviour | done: status, error summary, closed forms, drafts with autosave, reset, encoded redirects; draft and reset buttons outside `af-form` show a note; placed forms still load their Angular module (needs an upstream way to drop a module) |
| 5. SearchKit table | done but for the notes in the inventory: Angular-dialog tasks, row editing, reference and multi-value editors, drag in hierarchical tables, include columns |
| 6. Other display types and layout | list, grid, tree and tab sets done; drag in the tree, the batch and chart display types open |
| 7. Parity sweep | `sweep.spec.ts` renders every form with both renderers and writes `test-results/sweep.md`; it fails while a supported form differs |
| 8. Dashboard | listed dashlets render with React inside core's dashboard; a React dashboard screen is the follow-up described in package 8 |

Next, in this order:

1. **The sweep's remaining findings** on forms the support report calls
   supported, until `sweep.spec.ts` passes.
2. **The notes left in the inventory**, by number of forms they hold back:
   Angular-dialog tasks (download first), row editing, reference and
   multi-value in-place editors, drag in hierarchical tables and the tree.
3. **Display labels on form pages**, so a display placed in a form has a name.
4. **A React dashboard screen** (package 8), for keyboard access.

Join blocks behind `af-if` keep their layout position, which is how the server
reads them; core's link-order numbering is listed as an upstream bug and
`joins.spec.ts` pins both.

Known gaps outside the packages:
- Saving from a form in the case summary block, which sits inside core's case
  `<form>`, is covered by a unit test only; it needs a check on a case screen.
- Pages that place a listed form still load its Angular module, which is
  never rendered.
- `src/api/core.gen.ts` is generated from 6.18. `input_attrs.minlength`
  (6.20) is declared by hand until the stack moves.

Upstream bugs found so far are listed in [comparison.md](comparison.md#upstream-bugs-found-on-the-way).

## Libraries

Browsers now provide the modal dialog (`<dialog>` with `showModal()`: focus
trap, Escape, inert background) and light-dismiss popups (`popover`), so
dialogs and menus need no library. Core provides `CRM.wysiwyg` for rich text
and `CRM.loadForm` / `CRM.loadPage` for legacy screens.

Three parts are hard to get right by hand, so they take a library; the two
widgets are headless and render core's markup and classes:

| Widget | Library | Size (min + gzip) | Replaces |
|---|---|---|---|
| EntityRef, multi-select (ARIA 1.2 combobox, async options) | Downshift | 12 kB, loaded with the first EntityRef | ≈ 300 lines |
| drag to reorder (rows, dashlets) with keyboard and announcements | dnd-kit core + sortable | 15 kB | ≈ 250 lines |
| URL state (see State above) | nuqs | 5 kB | ≈ 150 lines |

Measured 2026-09-29 with esbuild over React 19 (downshift 9.4, @dnd-kit/core
6.3, @dnd-kit/sortable 10.0). The current bundle is 89 kB. React Aria
covers everything in one library but costs 87 kB for the needed hooks (44 kB
for the combobox alone); Radix adds dialog, menu and tabs that the platform
already provides.

The two widget libraries load only on pages that need them, as lazy chunks.
`vite.config.ts` names chunks by content hash, so they need no cache code; the
entry keeps its fixed name and the cache code. Libraries sit in a `vendor`
chunk, because a lazy chunk that imported the entry would load it a second
time; the build fails if one does.

No library covers the rest: Afform and SearchKit semantics (conditions,
filters, tasks, placements) are where most of the work is.

## Initial state before the first request

The main runtime gain over Angular is SearchKit's 600 ms trailing debounce.
The first search of every Angular display runs through the filter watcher,
which waits so that filter defaults, URL arguments and stored filters settle
first. Upstream removed the wait twice:
- civicrm-core#25408 (2023) was lost again in later refactoring.
- #35059 was merged in 2026 and reverted in 6.14 and 6.15, because first loads
  ignored filter defaults (dev/core#6493).

A third attempt (#35683) is open, and its author doubts the 600 ms can be won
reliably. React keeps the gain on filtered forms too: `filters.spec.ts`
measures the first row of core's group search with a title filter, and React
was ahead of Angular there (2026-09-29, dev stack, median of 5: about 2.2 s
against 2.7 s after navigation start).

React keeps it if one pure function computes a fieldset's complete initial
values before the first `SearchDisplay.run`, from these sources in core's
order:

| Source | Core | React |
|---|---|---|
| field defaults | `defn.afform_default` | from the layout, synchronous |
| URL | `#?name=value` via Angular's `$location.search()`; in a popup, the dialog's `urlHash` | `URLSearchParams` on `location.hash`, synchronous |
| stored filters (`store-values`) | `CRM.cache` key `afform:<form><fieldset>` | the same `CRM.cache` key, synchronous |
| saved filter set (`#?_s=<id>`) | `SearchParamSet.get`, then a form reset that drops the set's values again (still so on core master) | the display query waits for that request (`enabled`), so one search runs; fields the URL leaves out take the set's values |

`tests/browser/filters.spec.ts` pins each source against Angular: one search
request, with the final filters, and no flash of unfiltered rows. `#35683`'s
failure case is one of its tests: stored filters, then reload.

### State

- **URL: nuqs** (5 kB gzip, measured with 2.10.1) through a custom adapter over
  the hash. Core's links use hash parameters (`#?Individual1=5`, `#?_s=3`,
  the tab `url-arg`), and nuqs's built-in adapters only use the query string.
  - `nuqs/adapters/custom` takes about 30 lines: read `URLSearchParams` from
    `location.hash`, write with `replaceState`, listen to `hashchange`.
  - Its API is marked `unstable_`, so the version is pinned.
  - nuqs brings typed parsers, batching of several keys into one URL write,
    defaults kept out of the URL, and `urlKeys` for per-display prefixes.
- **More than core.** Core reads the hash but writes only the selected tab.
  React also writes each display's filters, sort, page and page size, and the
  selected tab, so reloads keep them and links share them. Keys carry the
  display name when a page has more than one display.
- **Fieldset state.** It is local to one form: a context with `useReducer`,
  shared by its filter fields and displays. Zustand or Jotai would add a
  dependency for the same thing.
- **Server state.** TanStack Query, one client shared by every element on the
  page; saving invalidates the affected queries, where core fires jQuery
  events (`crmPopupFormSuccess`).
- **Form library.** Reconsider TanStack Form only if work package 2
  (conditions, `af-required`) outgrows the current model in
  `src/afform/model.ts`.

## Decisions

- **React over waiting for core** (2026-09-29): the initial-state problem is
  structural in Angular's watcher model and solvable in React.
- **Everything in React** (2026-09-29): API task dialogs and the dashboard
  included.
- **Order**: search pages first (61 of 87 forms, the most reuse, and the
  debounce gain), then forms, then the dashboard.
