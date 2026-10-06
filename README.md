# afreact

Renders FormBuilder (Afform) forms and SearchKit displays with React. The form
and search definitions, the APIs and the permission checks stay those of core;
only the browser side changes. The builders (FormBuilder, SearchKit admin) stay
Angular.

Status: alpha. It renders forms with blocks, joins, repeats, live rules
(conditions, required and disabled rules, token defaults, `ts()` / `crmUrl()`
expressions), drafts and the checkout block, and table, list, grid and tree
displays with filters, in-place editing, drag ordering and the bulk actions;
what is left out is listed in [comparison.md](docs/comparison.md#not-implemented-in-the-react-renderer).
Forms listed in a setting render with React wherever core places them (see
[Rendering forms with React](#rendering-forms-with-react)), and browser tests
measure every page against the Angular runtime.

## How it works

```
<afreact-form name="afformX">          custom element, React inside (light DOM)
        │
        ├─ layout                       as the Angular runtime sees it (see below)
        ├─ Afform.prefill / .submit     unchanged core actions
        └─ SearchDisplay.run            unchanged core action (displays)
```

- **`Afreact.getForm`** (APIv4) runs the form's partial through core's Angular
  pipeline, so every `af-field` carries the metadata FormBuilder injected
  (`defn`: input type, label, options, required). Blocks (`afblock-*`) arrive
  with their compiled layout as children; embedded search displays arrive with
  their settings as an array. Access is the form's own permission, checked by
  `Afform.get`. The compiled layout is kept in core's Angular cache, which
  saving a form or changing custom fields clears.
- **Layout sources.** `<afreact-form source="…">` picks where the layout comes
  from; all three give the same layout (pinned by `tests/browser/sources.spec.ts`):

  | `source` | Layout from | Needs |
  |---|---|---|
  | `api` (default) | an `Afreact.getForm` request | nothing |
  | `page` | the page's `CRM.vars.afreact.layouts` | `Assets::layouts('page', $names)` |
  | `bundle` | core's compiled `angular-modules.json`, parsed in the browser | `Assets::layouts('bundle', $names)` |

  `page` and `bundle` save the `getForm` round trip, but the server must know
  which forms the page shows. `bundle` reads the static file the Angular runtime
  loads, which browsers cache across pages. That file is public, as it is for
  the Angular runtime; the page names only forms the user may open.
- **Custom elements** are the entry point. They render into the light DOM the
  markup and classes of core's Angular templates, so CiviCRM's theme (Riverlea
  classes, `--crm-*` variables) styles them as it styles the Angular forms:

  | Element | Attributes | Renders |
  |---|---|---|
  | `<afreact-form>` | `name`, `source`, `options` (JSON object of a placement's arguments) | a FormBuilder form or search page |
  | `<afreact-search>` | `search`, `display` | a SearchKit table, list, grid or tree display |
  | `<afreact-compare>` | `pages` (JSON list of `{label, url}`) | the comparison page |
  | `<afreact-support>` | `listed` (JSON list of form names), `settings` (URL) | the support report |

- **Data layer:** TanStack Query, one query per API call, keyed by its
  parameters. Search displays follow SearchKit's rules: placeholder rows while a
  page loads, a `row_count` request only when the first page is full or the
  header shows the count, a `tally` request for a totals row, and a reload of
  all three when a popup form of the display (`crmPopupFormSuccess`) succeeds.
- **Search tables** render what core's `crmSearchDisplayTable` renders: field,
  html, image, links, buttons, menu and subsearch columns, style rules, the
  toolbar, header count, totals, the search button, the page size input, and
  hierarchical and collapsible rows. Row and toolbar menus are native popovers
  with the menu button keyboard pattern. Cells the server marks editable open
  an editor by click, Enter, Space or F2 and save with
  `SearchDisplay.inlineEdit`; a table with `editableRow.full` edits whole
  rows, one with `editableRow.create` adds new records in a row of inputs;
  the column picker hides columns and takes them from a saved filter set.
  Bulk actions and task links run API batch, popup and redirect tasks with
  their input fields, the spreadsheet download, the update of chosen fields
  and the tag, relationship and mailing dialogs. Rows of draggable tables
  and items of draggable trees move by pointer or keyboard, a hierarchical
  row with its sub-rows among its siblings, a tree item also under another
  parent. Other tasks that are Angular dialogs and include columns show a
  note instead.
- **Types:** `src/api/entities.gen.ts` is generated from APIv4
  `getFields` (see [Development](#development)).
- **Unsupported layout** is never dropped silently: the renderer shows a
  visible "Not supported by the React renderer" note naming the directive,
  attribute or field type.

- **Search forms:** an `af-fieldset` without entity holds filter fields; their
  values are the filters of the displays inside, merged with a display's own
  `filters` attribute (literals, `routeParams.x`, `options.x`) as SearchKit
  does. The first search waits until every source is in: field defaults,
  stored values (`store-values`, kept in `CRM.cache` under
  `afform:<form><display>`), the URL, and a saved filter set (`#?_s=<id>`).
  Typing searches after a 300 ms pause (SearchKit waits 600 ms); the first
  search never waits.
- **Bundle:** `dist/afreact.js` and `dist/afreact.css` keep fixed names and load
  with CiviCRM's cache code; libraries and lazy parts sit in content-hashed
  `dist/chunks/`. The build fails if a chunk imports `afreact.js`, which would
  load it a second time without the cache code.

`Civi\Afreact\Assets::load()` adds the bundle to a page and
`Assets::layouts()` hands over layouts; the demo pages in `Civi\Afreact\Pages`
show how.

## Search state in the URL

Search displays keep their state in the URL hash, so a reload restores it and
a link opens it. Values equal to the default stay out of the URL; keys other
code writes into the hash (Angular routes, `Individual1=5`) are kept.

| Key | Meaning |
|---|---|
| `_sort=title,-created_date` | sort columns, `-` for descending |
| `_page=2`, `_limit=50` | page and page size |
| `<field>=value` | a filter, the key afField reads: lists comma-separated, Yes/No as `1`/`0` |
| `<display>.<field>=value` | the same filter for one fieldset; wins over the plain key |
| `_s=<id>` | a saved filter set; the first change of a filter removes it |

With more than one display on the page (several displays in a form, or other
afreact elements on the page), every key carries the display name as a prefix
(`<display>._page=2`). A plain `<field>` key from a link leaves the URL once one
fieldset writes its own prefixed key, even where a second fieldset read it
too. A form in a popup reads the popup's own URL, as
`afCore` does, and keeps its changes to itself.

Where React reads the URL differently from core:

- `_s` fills the fields the URL leaves out from the saved set. Core loads the
  set but then resets the fields to their defaults.
- An empty value (`is_active=`) means no filter; core reads an empty Yes/No
  as No.
- A value with another operator than the field's, or a range, is written as
  JSON (`type={"NOT IN":["1"]}`), which only React reads.

## Rendering forms with React

The setting **Forms rendered with React** (`afreact_forms`, at
`civicrm/admin/setting/afreact`) lists the forms React renders; every other
form stays Angular. Saving the setting rebuilds the route table, as core's
settings forms do, and clears core's Angular cache, as saving an Afform does.
The listeners in `Civi\Afreact` (`FormPage`, `Placements`, `PlacedSnippets`,
`Dashlets`) run after core's placement listeners and swap only what core put
there, so placement rules, filters, titles and weights stay core's:

| Where core shows the form | What changes for a listed form |
|---|---|
| its page (`server_route`) | the route runs core's bare page with `afreact/AfformPage.tpl`; title, breadcrumb and public-page handling as in `CRM_Afform_Page_AfformBase` |
| contact summary tab, event management tab | the tab includes `afreact/InlineAfform.tpl` instead of core's |
| contact summary block, case summary block | the region snippet `afform:<name>` gets the React markup |
| contact summary block in ContactLayout | the block's template is swapped |
| contact actions popup | the popup loads the form's page; the form reads its arguments from the popup URL, triggers `crmFormSuccess` on save and closes the popup, as `afForm` does |
| dashboard dashlet | core's Angular dashboard stays; the partial it includes for the form's directive holds `<afreact-form>`, and the form's Angular module is not loaded there. Refresh and fullscreen load the form afresh |

The SearchKit and FormBuilder previews, which belong to the Angular builders,
are not taken over. Except on the dashboard, core's placement listeners still
queue the listed form's Angular module on pages that place it; its directive
is never rendered. Unsupported parts of a listed form show the visible "Not
supported" note. The dashboard screen itself, with its columns and drag and
drop, and every unlisted dashlet stay core's (see
[docs/architecture.md](docs/architecture.md), "Dashlets").

The **support report** (`civicrm/admin/afreact`) lists every form but blocks,
which core only places inside other forms, with what React cannot show yet.
It walks each form's layout with the same checks the renderer words its notes
with (`src/afform/support.ts`), so the report and the rendered form agree
(pinned by `tests/browser/support.spec.ts`). A form placed only in tabs or
summary blocks is checked with its placement's options; its preview has none,
so a display filtered by them shows a note there only.

## Pages

| Route | Content |
|---|---|
| `civicrm/afreact/demo` | demo form and table, React renderer; `?source=page` or `?source=bundle` picks the layout source |
| `civicrm/afreact/angular` | the same forms, Angular runtime |
| `civicrm/afreact/compare` | loads every React variant and the Angular page in iframes and compares metrics |
| `civicrm/afreact/render?name=…&renderer=react\|angular` | any form the user may open, with the renderer named (React with `source="page"`); `&options={…}` (a JSON object) stands for a placement's arguments |
| `civicrm/admin/afreact` | support report: every form with what React cannot show yet |
| `civicrm/admin/setting/afreact` | the forms React renders |

Both demo pages share one markup; only the elements that mount the forms
differ (pinned by `PagesHeadlessTest`). The demo forms live in `ang/`.

## React vs Angular

On the dev stack with debug off, the React demo page is ready (form input and
first table row shown) sooner than the Angular one: 565–870 ms against
1215–1375 ms from a cold cache, with almost the same script and style bytes.
Absolute times drift between sessions; the order does not. Most of the lead
is SearchKit's 600 ms debounce before the Angular table's first request.
`npm run video` records both pages side by side (see [Demo video](#demo-video)).

[docs/comparison.md](docs/comparison.md) holds the parity gaps, the measured
load numbers and what they mean; [docs/architecture.md](docs/architecture.md)
how the renderer is built: state, the first search, libraries, dashlets.

## Development

The dev stack is civikitchen (CiviCRM standalone, MariaDB, maildev); see the
header of `.docker/docker-compose.yml`. First-boot hooks seed 25 synthetic
contacts and three contact sub-types for the tables; `managed/` holds the demo
searches, among them one table using every column type and a collapsible table
of contact types.

```sh
cd .docker && docker compose up -d        # or civikitchen's ckup for free ports
npm ci
npm run build                             # type check + bundle into dist/
npm test                                  # unit tests (Vitest, jsdom)
npm run coverage
npm run types                             # regenerate entities.gen.ts from the stack
npm run inventory                         # what the site's Afforms use, per feature
```

`dist/` is committed, so the extension installs without a Node toolchain.
`npm run types` runs as the stack's admin user, so the types cover every
entity an administrator can see.

### Checks

All PHP gates, the headless PHPUnit suite and the JS lint run inside the
container:

```sh
docker compose -f .docker/docker-compose.yml exec -u www-data \
  -w /var/www/html/ext/afreact app ck ci
```

CI runs the same gates plus the unit and browser tests.

### Browser tests

Playwright runs against the dev stack and logs in as `admin`:

```sh
CIVICRM_BASE_URL=http://localhost:8080 npm run test:e2e
```

| Spec | Checks |
|---|---|
| `tests/browser/parity.spec.ts` | the same scenarios against both renderers: empty submit is rejected client-side, create with a joined email submitted by Enter, prefill and update from the URL, equal saved records, equal table rows after sorting and paging |
| `tests/browser/compare.spec.ts` | cold and warm load metrics for every React layout source and Angular (printed as a table), a cold request waterfall, and one round of the in-browser compare page |
| `tests/browser/pages.spec.ts` | cold and warm ready times of every tour page on both renderers (printed as a table and written to `test-results/pages.md`) |
| `tests/browser/sources.spec.ts` | every layout source renders the demo page to the same DOM; `page` and `bundle` never call `getForm` |
| `tests/browser/visual.spec.ts` | the React page matches the Angular page part by part in position, size and main styles; differences by design are listed with a reason |
| `tests/browser/rules.spec.ts` | the rules form on both renderers: expressions, `af-if` (and the values it drops), `af-required`, `af-disabled`, a token default |
| `tests/browser/joins.spec.ts` | the joins form on both renderers: a Home and a Work email block with Home hidden by `af-if`, the location each saves to on create, and the record each shows and updates from the URL; Angular's deviation is core's (see comparison.md) |
| `tests/browser/table.spec.ts` | SearchKit tables on both renderers: equal cells, links, classes, toolbar, counts and totals on the demo fixtures and the core forms the React table renders without a note; row menus, the menu keyboard path, collapsible rows, a `crm-popup` link and the reload after a popup form |
| `tests/browser/displays.spec.ts` | list, grid and tree displays on both renderers: equal items, columns, labels, classes, grid tracks and pager on the demo fixtures; tree branches opening alike, and on React their `aria-expanded` state and the keyboard path |
| `tests/browser/editable.spec.ts` | in-place editing on both renderers: a text cell saved with Enter and an option list saved with the Save button store the same values; the column picker hides and shows the same columns; on React, opening by keyboard, focus back on Escape and a failed save that keeps the editor open |
| `tests/browser/reorder.spec.ts` | drag to reorder on the demo options table: keyboard moves with announcements in React, pointer moves on both renderers, the stored weights and the order after a reload |
| `tests/browser/navtree.spec.ts` | drag in the hierarchical demo table of navigation entries on both renderers: a row moved with its sub-rows among its siblings by keyboard and pointer, the stored weights, the refused drops with their announcements |
| `tests/browser/checkout.spec.ts` | the checkout block of core's donation form shows the pay-later option's description on both renderers |
| `tests/browser/treedrag.spec.ts` | drag in the demo tree of navigation entries: keyboard steps through every line and first place with announcements and store the weight and parent; a pointer drop after an item of another branch stores the same weight and parent as Angular does |
| `tests/browser/filters.spec.ts` | search filters on both renderers: the same filters and rows from the defaults, the URL, stored values and a saved filter set, with one page request and no excluded row shown on first load; typed filters and a reload; the first-row time of each renderer |
| `tests/browser/dashboard.spec.ts` | on core's dashboard a listed Afform dashlet renders with React next to an unlisted one in Angular, without the listed form's Angular module; refresh and fullscreen render it again; unlisted, both are Angular |
| `tests/browser/a11y.spec.ts` | axe in light and dark mode finds nothing on the React demo and rules forms, the demo tables (menu and subsearch open), the editable table with its column picker and a filtered search form that the Angular ones pass |
| `tests/browser/sweep.spec.ts` | every form but blocks on both renderers: the same headings, help, fields (label, input, required, disabled, value), buttons, table headers and first-page rows, and no axe finding that only React has; forms the support report finds nothing unsupported in must pass, the others are reported |

`sweep.spec.ts` renders each form empty, without URL arguments, and with
empty placement options where the support report checks it with them. It
submits nothing. `SWEEP_FORMS=name1,name2` limits it to those forms. Per form,
`test-results/sweep.md` and `sweep.json` give the status (identical, differs,
"Not supported" note, error), the differences, the notes, the axe findings and
what the form would read from the URL; cell and field values appear only as
their length.

`compare.spec.ts` switches `debug_enabled` off for the measurement, so all
pages load as in production, and restores the previous value afterwards.
`COMPARE_ROUNDS` sets the number of rounds (default 5). `pages.spec.ts` does
the same for the tour's pages, with `PAGES_ROUNDS`.

### Demo video

```sh
CIVICRM_BASE_URL=http://localhost:8080 npm run video   # needs ffmpeg
```

`tests/browser/demo.video.ts` records the same session on both renderers:
cold browser cache on a warm server, typing a contact, saving it, sorting
and paging the table. The contact is deleted afterwards. Both recordings end
up side by side in `video/angular-vs-react.mp4`, and the label in each
half shows when that page was ready. The suite does not run it.

```sh
CIVICRM_BASE_URL=http://localhost:8080 npm run video:tour
```

`tests/browser/tour.video.ts` records a longer tour: a bulk action, editing
in place, the column picker, drag to reorder, collapsible rows, tabs, list,
grid and tree displays, range filters, several of core's own search pages
and a form with a slider and a rich text editor. Each scene has a fixed
slot, so both halves of `video/tour-angular-vs-react.mp4` show the same
scene at the same time; the label names the scene and how long the page
took. The tour creates its groups, options and contact and removes them.

## Layout

| Path | Content |
|---|---|
| `Civi/Api4/Afreact.php`, `Civi/Api4/Action/Afreact/` | the `Afreact.getForm` action |
| `Civi/Afreact/LayoutCompiler.php` | Afform partial → layout array, blocks inlined |
| `Civi/Afreact/Afforms.php` | shared cache (core's Angular cache), block list, typed record fields |
| `Civi/Afreact/Assets.php`, `Civi/Afreact/AttributeSchema.php` | bundle loading and the layouts handed to the page |
| `Civi/Afreact/Pages.php`, `Civi/Afreact/RenderPage.php`, `Civi/Afreact/Chrome.php`, `xml/Menu/afreact.xml` | demo, compare and render routes, and the page chrome they share |
| `ang/` | demo forms and search pages |
| `managed/` | demo searches and displays |
| `src/afform/` | form renderer (layout, fields, form model, conditions, expressions, layout sources, module file parser) |
| `src/search/` | SearchKit table renderer: columns, row menus, toolbar, totals, collapsible rows, pager, filter values and URL keys |
| `src/url/` | the URL hash as state for all elements of a page |
| `src/compare/` | comparison page and metric helpers |
| `tests/browser/` | browser tests |
| `tests/phpunit/` | headless PHPUnit suite |
| `scripts/gen-types.php` | APIv4 → TypeScript generator |

## Licence

Proprietary, © civico GmbH. See [LICENSE.txt](LICENSE.txt).
