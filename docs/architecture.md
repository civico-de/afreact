# Architecture

How the React renderer is built, where the Angular runtime's behaviour is
kept and where it is not. The README says what the extension does and where
each part lives; [comparison.md](comparison.md) lists the differences and
[load-metrics.md](load-metrics.md) the measured load times.

## Boundary

Every Afform a site shows can render with React instead of Angular, switched
on per form (`afreact_forms`), with the same server contracts: the compiled
layout as the Angular runtime sees it, the APIv4 actions `Afform.prefill`,
`Afform.submit` and `SearchDisplay.run`, and the form's own permission.
The takeover leaves core's Angular builders and their previews alone; the
React builders are a separate switch (`afreact_builders`, see
[plan-builders.md](plan-builders.md)). The dashboard screen around the
dashlets stays Angular (see below).

## State

- **URL.** Search displays keep filters, sort, page, page size and the
  selected tab in the URL hash (the README's "Search state in the URL" has the
  keys). Core's links use hash parameters (`#?Individual1=5`, `#?_s=3`, the
  tab `url-arg`), and nuqs's built-in adapters only know the query string, so
  `src/url/` is a custom adapter over the hash: `URLSearchParams` from
  `location.hash`, `replaceState` on write, `hashchange` to read back. nuqs
  brings typed parsers, one URL write for several keys, defaults kept out of
  the URL and `urlKeys` for the per-display prefix; its adapter API is marked
  `unstable_`, so the version is pinned in `package.json`.

  Keys get the display name as a prefix (`<display>._page=2`) once a form
  holds several displays or other forms or displays share the page
  (`useUrlPrefix`). A plain `<field>` key from a link leaves the URL once one
  fieldset writes its own prefixed key, even where a second fieldset read it
  too. A form in a popup reads the dialog's own `urlHash`, as `afCore` does,
  and keeps its changes in memory. React reads the URL differently from core
  in three places: `_s` fills the fields the URL leaves out from the saved
  set, where core loads the set and then resets the fields to their defaults
  (upstream-bugs.md); an empty value (`is_active=`) means no filter, where
  core reads an empty Yes/No as No; and a value with another operator than
  the field's, or a range, is written as JSON (`type={"NOT IN":["1"]}`),
  which only React reads.
- **A fieldset.** Filter fields and the displays they filter share one
  context with `useReducer` (`src/afform/SearchFieldset.tsx`); a form's
  entities, joins and conditions live in `src/afform/model.ts`. Both are
  local to one form; no store library.
- **Server state.** TanStack Query, one client for every element on the page.
  A save invalidates the queries it affects, where core fires jQuery events
  (`crmPopupFormSuccess`); an element that leaves the page drops the answers
  no other element observes, which is why a dashlet's refresh loads its form
  afresh. Search displays follow SearchKit's request rules
  (`src/search/AfreactSearch.tsx`): placeholder rows while a page loads; a
  `row_count` request only when the pager or the header count needs it,
  unless the first page came back short and gave the count; a `tally` request for a totals row; and a reload of
  all three when a popup form of the display (`crmPopupFormSuccess`)
  succeeds.

## The first search

The main runtime gain over Angular is SearchKit's 600 ms trailing debounce:
the first search of every Angular display runs through the filter watcher,
which waits so that filter defaults, URL arguments and stored filters settle
first. Upstream removed the wait twice (civicrm-core#25408 in 2023, lost in a
later refactoring; #35059 in 2026, reverted in 6.14 and 6.15 because first
loads ignored filter defaults, dev/core#6493), and the open third attempt
(#35683) doubts it can be won reliably in the watcher model.

React starts the first `SearchDisplay.run` at once because one pure function
computes a fieldset's complete initial values before it, from core's sources
in core's order:

| Source | Core | React |
|---|---|---|
| field defaults | `defn.afform_default` | from the layout, synchronous |
| URL | `#?name=value` via `$location.search()`; in a popup, the dialog's `urlHash` | `URLSearchParams` on `location.hash`, synchronous |
| stored filters (`store-values`) | `CRM.cache` key `afform:<form><fieldset>` | the same key, synchronous |
| saved filter set (`#?_s=<id>`) | `SearchParamSet.get`, then a form reset that drops the set's values again | the display query waits for that request, so one search runs; fields the URL leaves out take the set's values |

`tests/browser/filters.spec.ts` pins each source against Angular: one search
request, with the final filters, and no flash of unfiltered rows; stored
filters followed by a reload (#35683's failure case) is one of its tests.

## Libraries and chunks

Browsers provide the modal dialog (`<dialog>` with `showModal()`: focus
trap, Escape, inert background) and light-dismiss menus (`popover`), so
dialogs and menus need no library; core provides `CRM.wysiwyg` for rich text
and `CRM.loadForm` / `CRM.loadPage` for legacy screens. Three parts are hard
to get right by hand and take a library; the two widgets are headless and
render core's markup and classes:

| Part | Library | Replaces |
|---|---|---|
| EntityRef and multi-select: ARIA combobox with async options | Downshift | about 300 lines |
| drag to reorder with keyboard and announcements | dnd-kit core + sortable | about 250 lines |
| URL state (above) | nuqs | about 150 lines |

React Aria would cover all of it in one library at several times the size of
these three together; Radix adds dialog, menu and tabs the platform already
has. Sizes are in load-metrics.md; the bundle is measured there.

The two widgets load as lazy chunks with the first element that needs them.
`vite.config.ts` names chunks by content hash, so they need no cache code,
while the entry keeps its fixed name and CiviCRM's cache code. Libraries
shared with lazy chunks sit in a `vendor` chunk, because a lazy chunk that
imported the entry would load it a second time and define the elements
twice; the build fails if one does. The entry's static chunks are preloaded
from the page head (`Civi\Afreact\Assets::load`).

No library covers the rest: Afform and SearchKit semantics (conditions,
filters, tasks, placements) are where most of the code is.

The build runs the React Compiler (`oxc-transform-react`, the Rust port), so
components and hooks are memoized without `useMemo` or `useCallback` by hand.
A component it cannot compile is left as written; `bun run build` logs each
one with the reason (a `finally` clause, a `throw` inside `try`, a ref passed
as a prop), and the build fails only on a fatal diagnostic.

## Dashlets

Core's dashboard (`CRM_Contact_Page_DashBoard`) is the Angular module
`crmDashboard`; no dashlet data is in the page, the component asks for it
with `DashboardContact.initialize` and `Dashboard.get`. A dashlet with a
`directive` includes the partial `~/crmDashboard/directives/<directive>.html`
inside a `<form>`; the module's `partialsCallback` writes that partial as
`<directive></directive>` for every Dashboard record with a directive, and an
`angularModules` listener adds the module exporting each directive to
`crmDashboard`'s `requires`. Afform creates one managed Dashboard record per
form placed as `dashboard_dashlet`, named after the form. "Refresh" and
"View fullscreen" remove the `<form>` and put it back, which compiles the
directive afresh. Layout writes go through one debounced
`DashboardContact.save`; moving and adding dashlets is jQuery UI sortable,
mouse only (an upstream bug in upstream-bugs.md).

`Civi\Afreact\Dashlets` keeps all of that and swaps only the partial: an
`angularModules` listener after core's wraps `partialsCallback`, the listed
forms' partials become `<afreact-form name="…">`, and their modules leave
`requires`, so their Angular code is not loaded on the dashboard.
`hook_civicrm_pageRun` adds the bundle when a listed form is placed as a
dashlet. Data, permissions, columns, drag, add and remove, fullscreen, URL
dashlets and the writes stay core's; unlisted Afform dashlets and other
extensions' directives stay Angular. Inside core's dashlet the React form
element sits in core's `<form>`: a nested form is legal in a script-built
DOM, and its own submit stays inside it.

A dashboard screen in React would replace `<crm-dashboard>` behind a setting:
columns and the available-dashlets drawer, dnd-kit between columns and from
the drawer with a keyboard sensor and an Add button per dashlet (which core
lacks), remove, collapse, refresh, fullscreen in a `<dialog>`, URL dashlets
through `CRM.loadPage` with core's cache entries, and the same `initialize`,
`get` and debounced `save` calls. Every directive dashlet React cannot render
would then need an Angular island (`angular.bootstrap()` on the dashlet with
its module), which is not verified. It pays off when keyboard reordering is
wanted, not for the number of forms React renders.

## Support report

The report at `civicrm/admin/afreact` lists every form but blocks, which
core only places inside other forms, with what React cannot show. It walks
each form's layout with the same checks the renderer words its notes with
(`src/afform/support.ts`), so the report and the rendered form agree
(`tests/browser/support.spec.ts`). The notes come in two kinds: parts of the
layout vocabulary not yet in React (plain HTML, display, column and setting
names), and Angular code (any note naming a directive with `ng-`, `af-` or
`crm-`, an attribute holding an expression, a template or a dialog) that
only the Angular application runs. The status line counts both kinds and the
forms core shows nowhere.

A form core shows somewhere is checked as shown there, where `options.x` in
a display's filters names the placement's arguments or nothing. A form shown
nowhere, and the preview of any form, has no placement, so a display
filtered by `options.x` shows a note there only; such forms are listed
apart. The button **Render every supported form with React** writes every
form without a finding into `afreact_forms` and drops those with one; a
listed form that is missing or whose check failed keeps its state. The
button writes the list as the page saw it, over any edit made on the
settings form meanwhile.

The builder sections below the forms list what the React builders would
hand to the classic ones and what other extensions' panels replace; how
modules and changed partials are found is in
[plan-builders.md](plan-builders.md), "Switching and fallback". With only
core's extensions the sections list nothing. Without FormBuilder's admin
(afform_admin) the FormBuilder section says so, and the `afreact_builders`
setting neither offers nor applies the FormBuilder builder.

## Kept Angular on purpose

- Except on the dashboard, pages that place a listed form still queue its
  Angular module through core's placement listeners; the directive is never
  rendered. Dropping the module needs an upstream way to say so.
- A display placed in a form has no label of its own, so lists and table
  captions have no name there, on either renderer.
