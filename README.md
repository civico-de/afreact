# afreact

Renders FormBuilder (Afform) forms and SearchKit displays with React. The form
and search definitions, the APIs and the permission checks stay those of core;
only the browser side changes. The builders (FormBuilder, SearchKit admin) stay
Angular.

Status: proof of concept. It covers one contact form with a joined email block
and one SearchKit table, and measures both against the Angular runtime.

## How it works

```
<afreact-form name="afformX">          custom element, React inside (light DOM)
        │
        ├─ layout                       as the Angular runtime sees it (see below)
        ├─ Afform.prefill / .submit     unchanged core actions
        └─ SearchDisplay.run            unchanged core action (tables)
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
  | `<afreact-form>` | `name`, `source` | a FormBuilder form or search page |
  | `<afreact-search>` | `search`, `display` | a SearchKit table display |
  | `<afreact-compare>` | `pages` (JSON list of `{label, url}`) | the comparison page |

- **Data layer:** TanStack Query, one query per API call, keyed by its
  parameters. Search tables follow SearchKit's rules: placeholder rows while a
  page loads, and a `row_count` request only when the first page is full.
- **Types:** `src/api/entities.gen.ts` is generated from APIv4
  `getFields` (see [Development](#development)).
- **Unsupported layout** is never dropped silently: the renderer shows a
  visible "Not supported by the React renderer" note naming the directive,
  attribute or field type.

`Civi\Afreact\Assets::load()` adds the bundle to a page and
`Assets::layouts()` hands over layouts; the demo pages in `Civi\Afreact\Pages`
show how.

## Pages

| Route | Content |
|---|---|
| `civicrm/afreact/demo` | demo form and table, React renderer; `?source=page` or `?source=bundle` picks the layout source |
| `civicrm/afreact/angular` | the same forms, Angular runtime |
| `civicrm/afreact/compare` | loads every React variant and the Angular page in iframes and compares metrics |

Both demo pages share one markup; only the elements that mount the forms
differ (pinned by `PagesHeadlessTest`). The demo forms live in `ang/`.

## React vs Angular

[docs/comparison.md](docs/comparison.md) holds the parity gaps, the measured
load numbers and what they mean.

## Development

The dev stack is civikitchen (CiviCRM standalone, MariaDB, maildev); see the
header of `.docker/docker-compose.yml`. A first-boot hook seeds 25 synthetic
contacts for the table.

```sh
cd .docker && docker compose up -d        # or civikitchen's ckup for free ports
npm ci
npm run build                             # type check + bundle into dist/
npm test                                  # unit tests (Vitest, jsdom)
npm run coverage
npm run types                             # regenerate entities.gen.ts from the stack
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
| `tests/browser/sources.spec.ts` | every layout source renders the demo page to the same DOM; `page` and `bundle` never call `getForm` |
| `tests/browser/visual.spec.ts` | the React page matches the Angular page part by part in position, size and main styles; differences by design are listed with a reason |
| `tests/browser/a11y.spec.ts` | axe in light and dark mode finds nothing on the React page that the Angular page passes |

`compare.spec.ts` switches `debug_enabled` off for the measurement, so all
pages load as in production, and restores the previous value afterwards.
`COMPARE_ROUNDS` sets the number of rounds (default 5).

### Demo video

```sh
CIVICRM_BASE_URL=http://localhost:8080 npm run video   # needs ffmpeg
```

`tests/browser/demo.video.ts` records the same session on both renderers:
cold browser cache on a warm server, typing a contact, saving it, sorting
and paging the table. The contact is deleted afterwards. Both recordings end
up side by side in `video/angular-vs-react.mp4`, and the label in each
half shows when that page was ready. The suite does not run it.

## Layout

| Path | Content |
|---|---|
| `Civi/Api4/Afreact.php`, `Civi/Api4/Action/Afreact/` | the `Afreact.getForm` action |
| `Civi/Afreact/LayoutCompiler.php` | Afform partial → layout array, blocks inlined |
| `Civi/Afreact/Afforms.php` | shared cache (core's Angular cache), block list, typed record fields |
| `Civi/Afreact/Assets.php`, `Civi/Afreact/AttributeSchema.php` | bundle loading and the layouts handed to the page |
| `Civi/Afreact/Pages.php`, `xml/Menu/afreact.xml` | demo and compare routes |
| `ang/` | demo form and search page |
| `src/afform/` | form renderer (layout, fields, form model, layout sources, module file parser) |
| `src/search/` | SearchKit table renderer and its pager |
| `src/compare/` | comparison page and metric helpers |
| `tests/browser/` | browser tests |
| `tests/phpunit/` | headless PHPUnit suite |
| `scripts/gen-types.php` | APIv4 → TypeScript generator |

## Licence

Proprietary, © civico GmbH. See [LICENSE.txt](LICENSE.txt).
