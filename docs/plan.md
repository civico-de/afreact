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
| SearchKit table | 61 | basic: columns, sort, pager, links |
| … row menu column (`menu`) | 45 | no |
| … bulk actions (`actions`) | 60 | no |
| … toolbar buttons (`toolbar`) | 44 | no |
| … in-place editing (`editable`) | 34 | no |
| … conditional styles (`cssRules`) | 33 | no |
| … button column (`buttons`) | 15 | no |
| … drag to reorder (`draggable`) | 13 | no |
| … HTML / include / subsearch columns | 10 / 1 / 2 | no |
| … hierarchy, collapsible rows | 4 / 3 | no |
| search filters from form fields (`filters`) | 23 | no |
| grid, tree display | 1 / 1 | no |
| `{{ :: ts('…') }}` text and `{{ crmUrl(…) }}` links | 33 | no |
| submit button (`ng-click="afform.submit()"`) | 12 | yes |
| `ng-if="afform.showSubmitButton"` | 3 | no |
| conditions (`af-if`) | 2 | no |
| tabs (`af-tabset`, `crm-ui-tab`) | 2 / 1 | no |
| field types Text, Select, Radio, Email, CheckBox, TextArea, Url, Date, DisplayOnly, Hidden | 40 … 1 | yes |
| field type EntityRef | 6 | no |
| field type ChainSelect | 5 | no |
| field type Toggle | 1 | no |
| admin-only widgets (`af-admin-list-menu`, `crm-monaco`) | 1 / 1 | no |

The `{{ }}` expressions are all of two shapes: `:: ts('literal')` and
`crmUrl('path', {params})`. Core also ships field types no dev-stack form uses:
File, Location, Range, RichTextEditor. Afforms on a real site add custom fields
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
- **ChainSelect**: country → state/province and similar dependent lists.
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

Total: roughly 6,000 lines, several weeks of work.

## Libraries

Browsers now provide the modal dialog (`<dialog>` with `showModal()`: focus
trap, Escape, inert background) and light-dismiss popups (`popover`), so
dialogs and menus need no library. Core provides `CRM.wysiwyg` for rich text
and `CRM.loadForm` / `CRM.loadPage` for legacy screens.

Three parts are hard to get right by hand, so they take a library; the two
widgets are headless and render core's markup and classes:

| Widget | Library | Size (min + gzip) | Replaces |
|---|---|---|---|
| EntityRef, multi-select (ARIA 1.2 combobox, async options) | Downshift | 13 kB | ≈ 300 lines |
| drag to reorder (rows, dashlets) with keyboard and announcements | dnd-kit core + sortable | 15 kB | ≈ 250 lines |
| URL state (see State above) | nuqs | 5 kB | ≈ 150 lines |

Measured 2026-09-29 with esbuild over React 19 (downshift 9.4, @dnd-kit/core
6.3, @dnd-kit/sortable 10.0). The current bundle is 89 kB. React Aria
covers everything in one library but costs 87 kB for the needed hooks (44 kB
for the combobox alone); Radix adds dialog, menu and tabs that the platform
already provides.

The two widget libraries load only on pages that need them. That needs code splitting, which
`vite.config.ts` turns off today because chunks would miss CiviCRM's cache
code. Content-hashed chunk names make that code unnecessary for chunks.

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
reliably. The demo table has no filters yet, so its lead does not prove that
React keeps the gain.

React keeps it if one pure function computes a fieldset's complete initial
values before the first `SearchDisplay.run`, from these sources in core's
order:

| Source | Core | React |
|---|---|---|
| field defaults | `defn.afform_default` | from the layout, synchronous |
| URL | `#?name=value` via Angular's `$location.search()`; in a popup, the dialog's `urlHash` | `URLSearchParams` on `location.hash`, synchronous |
| stored filters (`store-values`) | `CRM.cache` key `afform:<form><fieldset>` | the same `CRM.cache` key, synchronous |
| saved filter set (`#?_s=<id>`) | `SearchParamSet.get`, then a form reset | the display query waits for that request (`enabled`), so one search runs |

The parity sweep pins each source: one search request, with the final
filters, and no flash of unfiltered rows. `#35683`'s failure case is the
test: stored filters, then reload.

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
