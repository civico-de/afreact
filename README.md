# afreact

Renders FormBuilder (Afform) forms and SearchKit displays with React. The form
and search definitions, the APIs and the permission checks stay those of core;
only the browser side changes. The builders (FormBuilder, SearchKit admin) stay
Angular.

Status: alpha. Forms with blocks, joins, repeats, live rules, drafts and the
checkout block; table, list, grid and tree displays with filters, in-place
editing, drag ordering and bulk actions; batch entry. What is left out:
[comparison.md](docs/comparison.md#not-implemented-in-the-react-renderer).

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
  | `<afreact-search>` | `search`, `display` | a SearchKit table, list, grid, tree or batch display |
  | `<afreact-compare>` | `pages` (JSON list of `{label, url}`) | the comparison page |
  | `<afreact-support>` | `listed` (JSON list of form names), `settings` (URL) | the support report |

- **Data layer:** TanStack Query, one query per API call, keyed by its
  parameters. Search displays follow SearchKit's rules: placeholder rows while a
  page loads, a `row_count` request only when the first page is full or the
  header shows the count, a `tally` request for a totals row, and a reload of
  all three when a popup form of the display (`crmPopupFormSuccess`) succeeds.
- **Search displays** render what core's `crmSearchDisplay*` components
  render, column type by column type, with the toolbar, counts, totals,
  collapsible and hierarchical rows, in-place editing
  (`SearchDisplay.inlineEdit`, whole rows, the Add row), the column picker,
  the bulk actions and task dialogs, and drag ordering by pointer or
  keyboard. Menus are native popovers with the menu button keyboard pattern.
- **Types:** `src/api/entities.gen.ts` is generated from APIv4
  `getFields` (see [Development](#development)).
- **Unsupported layout** is never dropped silently: the renderer shows a
  visible "Not supported by the React renderer" note naming the directive,
  attribute or field type.

- **Search forms:** an `af-fieldset` without entity holds filter fields; their
  values are the filters of the displays inside, merged with a display's own
  `filters` attribute as SearchKit does. The first search runs at once with
  every source in (architecture.md, "The first search"); typing searches
  after a 300 ms pause.
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
which core only places inside other forms, with what React cannot show. It
walks each form's layout with the same checks the renderer words its notes
with (`src/afform/support.ts`), so the report and the rendered form agree
(pinned by `tests/browser/support.spec.ts`). The notes come in two kinds:
parts of the layout vocabulary not yet in React (plain HTML, display, column
and setting names), and Angular code — any note naming a directive (`ng-`,
`af-`, `crm-`), an attribute holding an expression, a template or a dialog —
that only the Angular application runs. A display filtering on a placement's
options in a form core shows nowhere is listed apart. The status line counts
the first two kinds and the forms core shows nowhere. A form core shows somewhere is
checked as shown there, where `options.x` in a display's filters names the
placement's arguments or nothing; a form shown nowhere, and the preview of any
form, has no placement, so a display filtered by `options.x` shows a note
there only. Its button **Render
every supported form with React** writes every form without a finding into
the setting and drops those with one; a listed form that is missing or whose
check failed keeps its state. The button writes the list as the page saw it,
over any edit made on the settings form meanwhile.

## Pages

| Route | Content |
|---|---|
| `civicrm/afreact/demo` | demo form and table, React renderer; `?source=page` or `?source=bundle` picks the layout source |
| `civicrm/afreact/angular` | the same forms, Angular runtime |
| `civicrm/afreact/compare` | loads every React variant and the Angular page in iframes and compares metrics |
| `civicrm/afreact/render?name=…&renderer=react\|angular` | any form the user may open, with the renderer named (React with `source="page"`); `&options={…}` (a JSON object) stands for a placement's arguments |
| `civicrm/admin/afreact` | support report: every form with what React cannot show, by kind |
| `civicrm/admin/setting/afreact` | the forms React renders |

Both demo pages share one markup; only the elements that mount the forms
differ (pinned by `PagesHeadlessTest`). The demo forms live in `ang/`.

## React vs Angular

Every search display is ready about 600 ms sooner on React (roughly 200
against 800 ms from a cold cache): SearchKit's filter debounce before the
Angular table's first request. Forms come out within 40 ms of each other.

| Document | Content |
|---|---|
| [docs/comparison.md](docs/comparison.md) | parity gaps, differences by design, the measured load times, upstream bugs found |
| [docs/architecture.md](docs/architecture.md) | state, the first search, libraries and chunks, dashlets |
| [docs/testing.md](docs/testing.md) | every browser spec, the sweep, the demo videos |

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

### Browser and video tests

```sh
CIVICRM_BASE_URL=http://localhost:8080 npm run test:e2e
CIVICRM_BASE_URL=http://localhost:8080 npm run video:tour   # needs ffmpeg
```

[docs/testing.md](docs/testing.md) lists every spec with what it checks, the
sweep over all forms, the measurement rounds and the two demo videos.

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
