# afreact

Renders FormBuilder (Afform) forms and SearchKit displays with React. The form
and search definitions, the APIs and the permission checks stay those of core;
only the browser side changes. Next to core's Angular builders, afreact ships
React versions of the SearchKit admin and of FormBuilder, which save the same
records (see [below](#the-builders-in-react)).

Status: alpha. Forms with blocks, joins, repeats, live rules, drafts and the
checkout block; table, list, grid and tree displays with filters, in-place
editing, drag ordering and bulk actions; batch entry; charts. What is left out:
[comparison.md](docs/comparison.md#not-implemented-in-the-react-renderer).
The supported CiviCRM floor is pinned in `info.xml`.

## How it works

```
<afreact-form name="afformX">          custom element, React inside (light DOM)
        │
        ├─ layout                       as the Angular runtime sees it
        ├─ Afform.prefill / .submit     unchanged core actions
        └─ SearchDisplay.run            unchanged core action (displays)
```

- **`Afreact.getForm`** (APIv4) runs the form's partial through core's Angular
  pipeline, so every `af-field` carries the metadata FormBuilder injected
  (`defn`: input type, label, options, required). Blocks arrive with their
  compiled layout as children, embedded displays with their settings. Access
  is the form's own permission, checked by `Afform.get`. The compiled layout
  is kept in core's Angular cache, which saving a form or changing custom
  fields clears.
- **Layout sources.** `<afreact-form source="…">` picks where the layout comes
  from; all three give the same layout (`tests/browser/sources.spec.ts`):

  | `source` | Layout from | Needs |
  |---|---|---|
  | `api` (default) | an `Afreact.getForm` request | nothing |
  | `page` | the page's `CRM.vars.afreact.layouts` | `Assets::layouts('page', $names)` |
  | `bundle` | core's compiled `angular-modules.json`, parsed in the browser | `Assets::layouts('bundle', $names)` |

  `page` and `bundle` save the `getForm` round trip, but the server must know
  which forms the page shows. `bundle` reads the public file the Angular
  runtime loads, which browsers cache across pages; the page names only forms
  the user may open. [load-metrics.md](docs/load-metrics.md) compares them.
- **Custom elements** are the entry point. They render the markup and classes
  of core's Angular templates into the light DOM, so CiviCRM's theme styles
  them as it styles the Angular forms:

  | Element | Attributes | Renders |
  |---|---|---|
  | `<afreact-form>` | `name`, `source`, `options` (JSON object of a placement's arguments), `page-title` (the form the page is made of) | a FormBuilder form or search page |
  | `<afreact-search>` | `search`, `display` | a SearchKit table, list, grid, tree, batch or chart display |
  | `<afreact-compare>` | `pages` (JSON list of `{label, url}`) | the comparison page |
  | `<afreact-support>` | `listed` (JSON list of form names), `settings` (URL) | the support report |
  | `<afreact-builder>` | `builder`, `route`, `classic`, `core-version` | a React builder (admin bundle) |
  | `<afreact-builders-report>` | `report`, `afform` (JSON findings per builder) | the support report's builder sections (admin bundle) |

- **Search displays** render what core's `crmSearchDisplay*` components
  render: toolbar, counts, totals, collapsible and hierarchical rows, in-place
  editing, the column picker, bulk actions and task dialogs, and drag
  ordering by pointer or keyboard. Server state is TanStack Query, one query
  per API call; [architecture.md](docs/architecture.md) has the request rules.
- **Search forms:** an `af-fieldset` without entity holds filter fields whose
  values filter the displays inside, merged with a display's own `filters` as
  SearchKit does. The first search runs at once with every filter source in
  (architecture.md, "The first search"); typing searches after a short pause.
- **Unsupported layout** is never dropped silently: a visible "Not supported
  by the React renderer" note names the directive, attribute or field type.
- **Bundle:** `dist/afreact.js` (renderer) and `dist/afreact-admin.js`
  (builders) keep fixed names and CiviCRM's cache code; lazy parts sit in
  content-hashed `dist/chunks/`. `Civi\Afreact\Assets::load()` adds the bundle
  to a page, `Assets::layouts()` hands over layouts (see `Civi\Afreact\Pages`).

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

With more than one display on the page, keys carry the display name as a
prefix (`<display>._page=2`); popups and differences from core are in
[architecture.md](docs/architecture.md#state).

## Rendering forms with React

The setting **Forms rendered with React** (`afreact_forms`, at
`civicrm/admin/setting/afreact`) lists the forms React renders; every other
form stays Angular. Saving it rebuilds the route table and clears core's
Angular cache. The listeners in `Civi\Afreact` (`FormPage`, `Placements`,
`PlacedSnippets`, `Dashlets`) run after core's placement listeners and swap
only what core put there, so placement rules, filters, titles and weights
stay core's:

| Where core shows the form | What changes for a listed form |
|---|---|
| its page (`server_route`) | the route runs core's bare page with `afreact/AfformPage.tpl`; title, breadcrumb and public-page handling as in `CRM_Afform_Page_AfformBase` |
| contact summary tab, event management tab | the tab includes `afreact/InlineAfform.tpl` instead of core's |
| contact summary block, case summary block | the region snippet `afform:<name>` gets the React markup |
| contact summary block in ContactLayout | the block's template is swapped |
| contact actions popup | the popup loads the form's page; the form reads its arguments from the popup URL, triggers `crmFormSuccess` on save and closes the popup, as `afForm` does |
| dashboard dashlet | core's dashboard stays; the partial it includes for the form's directive holds `<afreact-form>`, and the form's Angular module is not loaded there |

What stays Angular around a listed form (previews, queued modules, the
dashboard screen) is in [architecture.md](docs/architecture.md). Forms rendered
by React show afform_admin's edit menu to users who may follow its links.

The **support report** (`civicrm/admin/afreact`) lists every form but blocks
with what React cannot show, using the same checks the renderer words its
notes with (`src/afform/support.ts`), so the report and the rendered form
agree. Its button **Render every supported form with React** writes every
form without a finding into the setting. Below the forms, the builder
sections list what the React builders would hand to the classic ones. How
the checks work: [architecture.md](docs/architecture.md#support-report).

## The builders in React

React rebuilds core's SearchKit admin (listing, search editor, display
editors, display page) and FormBuilder (listing, form editor at core's
`#/create/…`, `#/edit/…` and `#/clone/…` routes, submissions) at routes of
their own ([Pages](#pages)). Both save the same records through the same
APIv4 calls as core's builders. The classic builder is one link away in
the [debug mode](docs/architecture.md#debug-mode).
The setting `afreact_builders` lets React take over core's routes, each
builder on its own; core's pages then move to `<route>/classic`
(`civicrm/admin/search/classic`, `civicrm/admin/afform/classic`, …).

A part React cannot edit is never dropped: it gets a notice with a link to
the classic builder and is saved back unchanged. Display type editors of
other extensions run as their `afreact-search-admin-display-<type>` element,
else as an Angular island; FormBuilder parts of other extensions run as an
`afreact-afform-admin-*` element. An extension that changes core's builder
beyond that (a ChangeSet, an Angular decorator, a `config()` or `run()`
block) keeps its records in the classic builder: React names the changes and
does not save.

Other extensions add builder panels and declare what they replace in the
`civi.afreact.assets` event (the fixture in `.docker/fixtures/afreactisland/`
adds a working panel):

```php
\Civi::dispatcher()->addListener('civi.afreact.assets', function ($event) {
  if ($event->builder === 'search_kit') {   // or 'afform'
    $event->panels[] = 'my-panel';           // custom element, gets `record`
    $event->replaces[] = 'myBuilderModule';  // or a ChangeSet name
    \Civi::resources()->addScriptFile('myext', 'js/panel.js');
  }
});
```

A panel blocks saving through `validationMessage`, adds `saveNotes` to the
confirmation and can delay the save with a `ready` promise. Full contract:
[plan-builders.md](docs/plan-builders.md#plugin-contract); differences from
core's builders: [comparison-builders.md](docs/comparison-builders.md).

## Pages

| Route | Content |
|---|---|
| `civicrm/afreact/demo` | demo forms and tables, React renderer; `?source=page` or `?source=bundle` picks the layout source |
| `civicrm/afreact/angular` | the same forms, Angular runtime |
| `civicrm/afreact/compare` | loads every React variant and the Angular page in iframes and compares metrics |
| `civicrm/afreact/render?name=…&renderer=react\|angular` | any form the user may open, with the renderer named; `&options={…}` (JSON) stands for a placement's arguments, else a picker passes them (`&placement_contact_id=…`), a contact that is the only argument defaulting to the user's own |
| `civicrm/admin/afreact` | support report |
| `civicrm/admin/setting/afreact` | the forms React renders and the builders it takes over |
| `civicrm/admin/afreact/search`, `civicrm/afreact/search` | React SearchKit admin and display page |
| `civicrm/admin/afreact/afform`, `…/afform/submissions?name=…` | React FormBuilder and a form's submissions |

Both demo pages share one markup; only the elements that mount the forms
differ (`PagesHeadlessTest`). The demo forms live in `ang/`.

## Documentation

| Document | Content |
|---|---|
| [docs/architecture.md](docs/architecture.md) | boundary, state, the first search, libraries and chunks, dashlets, the support report, the debug mode |
| [docs/comparison.md](docs/comparison.md) | the renderer's parity gaps, improvements, differences by design, what is not implemented and why |
| [docs/comparison-builders.md](docs/comparison-builders.md) | the builders' differences from core's SearchKit admin and FormBuilder editor |
| [docs/afform-markup.md](docs/afform-markup.md) | the Afform markup as a language: vocabulary, attribute types, the three layout formats, what core could change for a second renderer |
| [docs/upstream-bugs.md](docs/upstream-bugs.md) | bugs in core found on the way, by area, and what React does instead |
| [docs/load-metrics.md](docs/load-metrics.md) | measured load times of both renderers and the layout sources |
| [docs/testing.md](docs/testing.md) | every browser spec, the sweeps, the demo videos |
| [docs/plan-builders.md](docs/plan-builders.md) | the builders in React: decisions, server and plugin contracts, round trip, core versions |

## Development

The dev stack is civikitchen (CiviCRM standalone, MariaDB, maildev); see the
header of `.docker/docker-compose.yml`. First-boot hooks in `.docker/init.d/`
seed synthetic contacts, contact sub-types and the extensions some specs
need; `managed/` holds the demo searches; `.docker/fixtures/afreactisland`
is a mounted extension that exercises the builder plugin contract.

```sh
cd .docker && docker compose up -d        # or civikitchen's ckup for free ports
bun install --frozen-lockfile
bun run build                             # type check + bundle into dist/
bun run test                              # unit tests (Vitest, jsdom)
bun run coverage
bun run types                             # regenerate src/api/entities.gen.ts from the stack
bun run inventory                         # what the site's Afforms use, per feature
bun run core-shape                        # regenerate src/api/core.gen.ts from what core sends
scripts/core-watch.sh                     # core commits touching scripts/core-watch.txt paths
```

`dist/` is not committed: the stack needs `bun run build` before it can
render, and the release workflow builds the bundle into the archive sites
install (`policy.dist.build` in `civikitchen.yaml`).

### Checks

The PHP gates, the headless PHPUnit suite and the JS lint run inside the
container:

```sh
docker compose -f .docker/docker-compose.yml exec -u www-data \
  -w /var/www/html/ext/afreact app ck ci
```

CI runs the same gates plus the unit and browser tests, on the floor release
and the current one (`.github/workflows/ci.yml`); a weekly compat run covers
every supported minor, the next release branch and core's master.

### Browser and video tests

```sh
CIVICRM_BASE_URL=http://localhost:8080 bun run test:e2e
CIVICRM_BASE_URL=http://localhost:8080 bun run video:tour   # needs ffmpeg
```

[docs/testing.md](docs/testing.md) lists every spec, the sweeps, the
measurement rounds and the demo videos.

## Layout

| Path | Content |
|---|---|
| `Civi/Api4/Afreact.php`, `Civi/Api4/Action/Afreact/` | `Afreact.getForm` and `Afreact.getTaskSettings` |
| `Civi/Afreact/LayoutCompiler.php`, `Afforms.php` | Afform partial → layout array, blocks inlined; shared cache and typed records |
| `Civi/Afreact/Assets.php`, `AttributeSchema.php` | bundle loading, the `civi.afreact.assets` event, the layouts handed to the page |
| `Civi/Afreact/Takeover.php`, `FormPage.php`, `Placements.php`, `PlacedSnippets.php`, `Dashlets.php` | the `afreact_forms` takeover per placement |
| `Civi/Afreact/AdminPage.php`, `Builders.php`, `BuilderRoutes.php`, `BuilderPanels.php`, `BuilderReport.php` | builder pages, takeover, plugin panels, report findings |
| `Civi/Afreact/Pages.php`, `RenderPage.php`, `SupportPage.php`, `Chrome.php`, `xml/Menu/afreact.xml` | demo, compare, render and support routes and their shared chrome |
| `settings/`, `templates/afreact/` | the two settings; page and inline templates |
| `ang/`, `managed/` | demo forms and search pages; demo searches and displays |
| `src/afform/` | form renderer (layout, fields, form model, conditions, expressions, layout sources, support checks) |
| `src/search/` | SearchKit display renderer: columns, row menus, toolbar, totals, editing, tasks, pager, filters and URL keys |
| `src/url/` | the URL hash as state for all elements of a page |
| `src/admin/` | the React builders (`search/`, `afform/`) |
| `src/compare/`, `src/support/` | comparison page; support report |
| `tests/browser/`, `tests/phpunit/` | browser tests; headless PHPUnit suite |
| `scripts/` | type generator, inventory, core watch |

## Licence

Proprietary, © civico GmbH. See [LICENSE.txt](LICENSE.txt).
