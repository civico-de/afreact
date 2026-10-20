# Technical reference

How afreact plugs into CiviCRM: the elements it renders, the state it keeps in
the URL, how a form or builder is taken over, the pages it adds and where the
code lives. For what afreact is and what it changes for users, see
[overview.md](overview.md).

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
  the user may open. [load-metrics.md](load-metrics.md) compares them.
- **Custom elements** are the entry point. They render the markup and classes
  of core's Angular templates into the light DOM, so CiviCRM's theme styles
  them as it styles the Angular forms:

  | Element | Attributes | Renders |
  |---|---|---|
  | `<afreact-form>` | `name`, `source`, `options` (JSON object of a placement's arguments), `page-title` (the form the page is made of) | a FormBuilder form or search page |
  | `<afreact-search>` | `search`, `display` | a SearchKit table, list, grid, tree, batch or chart display |
  | `<afreact-support>` | `listed` (JSON list of form names), `settings` (URL) | the support report |
  | `<afreact-builder>` | `builder`, `route`, `classic`, `core-version` | a React builder (admin bundle) |
  | `<afreact-builders-report>` | `report`, `afform` (JSON findings per builder) | the support report's builder sections (admin bundle) |

- **Search displays** render what core's `crmSearchDisplay*` components
  render: toolbar, counts, totals, collapsible and hierarchical rows, in-place
  editing, the column picker, bulk actions and task dialogs, and drag
  ordering by pointer or keyboard. Server state is TanStack Query, one query
  per API call; [architecture.md](architecture.md) has the request rules.
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
| `_page=2`, `_limit=50` | page and page size; a page counts only on a display with a pager and a size only where the pager offers one (`expose_limit`), the controls core offers for them; the server ignores any other size `deviation:url-pager-needs-pager` |
| `<field>=value` | a filter, the key afField reads: lists comma-separated, Yes/No as `1`/`0` |
| `<display>.<field>=value` | the same filter for one fieldset; wins over the plain key |
| `_s=<id>` | a saved filter set; the first change of a filter removes it |

With more than one display on the page, keys carry the display name as a
prefix (`<display>._page=2`); popups and differences from core are in
[architecture.md](architecture.md#state).

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
dashboard screen) is in [architecture.md](architecture.md). Forms rendered
by React show afform_admin's edit menu to users who may follow its links.

The **support report** (`civicrm/admin/afreact`) lists every form but blocks
with what React cannot show, using the same checks the renderer words its
notes with (`src/afform/support.ts`), so the report and the rendered form
agree. Its button **Render every supported form with React** writes every
form without a finding into the setting. Below the forms, the builder
sections list what the React builders would hand to the classic ones. How
the checks work: [architecture.md](architecture.md#support-report).

## Checkout templates

A checkout option can bring an Angular partial of its own (`template` in
`getAfformSettings()`, from the module `getAfformModule()` names), such as a
card form or a wallet button. React runs it unchanged as an Angular island in
the checkout block (`src/afform/fields/CheckoutIsland.tsx`, booting and
teardown shared with the builders in `src/angular/island.ts`). How it loads
and what it costs: [architecture.md](architecture.md#checkout-templates).

- **DOM.** The block holds a host `<div>`, the island's root `<div>` inside it
  (jqLite data `$afCheckoutBlockController` and `$afFormController`, where
  `require: '^^afCheckoutBlock'` and `'^^afForm'` find them), and in that a
  `<div ng-include="template">` whose scope has `$ctrl` (the block's
  controller), `ts` (`CRM.ts('civi_contribute')`) and `template`, as
  afCheckoutBlock's own template gives the partial.
- **The block's controller.** Every member reads React's state when called:

  | Member | Returns |
  |---|---|
  | `checkout_params` | the details, one object for the island's life: the template writes into it, and React's own fields of the option write into it in place |
  | `afForm` | the form's controller below, which afCheckoutBlock requires into itself |
  | `getContributionValue(key)` | the value the submit saves: the af-entity's `data` where it has the key, else the contribution's field on the form; `null` while empty (afCheckoutBlock reads the field first, see [upstream bugs](upstream-bugs.md#checkout)) |
  | `getCheckoutOptionKey()` | `getContributionValue('checkout_option')` |
  | `getCheckoutOption()` | the option's settings, `{}` without an option |
  | `getCheckoutOptionLabel()`, `…Description()`, `…Template()`, `…Fields()` | that setting, or `null` |
  | `getCheckoutIsTestMode()` | the checkout's test mode |
  | `exportParamValues()` | hands the details to the form at once, so an `afForm.submit()` right after sends them; nothing without an option |

  A deep watch hands every other change of `checkout_params` to the form
  after the digest that made it. The stand-in has no `afFieldset` and none of
  the helpers core's own field templates use (the expiry patterns, the billing
  state lookups): React renders an option's `fields` itself.
- **The form's controller.** `submit()` runs the submit button's path: React's
  check of every control (with the error summary and the browser's pointer)
  and `Afform.submit`; it does nothing while the submit button is disabled
  (loading, saving, a closed form, a running draft save, a checkout template
  still loading or failed), so a second call
  while the first submit runs sends nothing. `ngForm.$valid` and
  `ngForm.$invalid` tell whether a submit would go through now, without
  showing errors: `$valid` is false while that check fails or the button is
  disabled, where afForm's overlay would block a template's own button.
  An `ngModel` directive of the island's own module gives each control's
  Angular validity to the browser (`setCustomValidity`), so `ng-pattern` and
  other Angular validators hold the submit as they hold afForm's.
- **Loading and locking.** In core the partial ships in the form's bundle; here
  its modules load once the option is chosen, and until the island is up the
  submit button stays disabled with "Loading <option>…" in the form's status
  line. When they fail to load, the block shows the error and the status line
  says the form cannot be submitted until another option is chosen. The island
  sits in a borderless `<fieldset>` that is disabled whenever React's own
  checkout fields are (saving, a closed form, `af-disabled`), so the
  template's controls take no input and skip the browser's checks.
- **Form events and markup.** `crmFormSuccess` (with `afform`, `data` and
  `submissionResponse`) and `crmFormError` (the same and `error`, with the
  failing submit's response, none when `Afform.submit` failed) are
  triggered on `af-form` and bubble to its ancestors and the document, where
  the popup, EntityRef, search links and tasks listen. The form's submit
  `<button>` carries `ng-click="afform.submit()"`, which nothing compiles, so
  a template finds it by that attribute (a wallet hides it while shown).
  `CRM.$.fn.block` is on every page (core's jQuery BlockUI). A submit that
  answers with neither redirect nor message keeps the form with a "Saved"
  status, as afForm does.
- **Lifecycle.** A change of React's state digests the island again
  (`$applyAsync`). A change of option, or the block leaving the page,
  destroys the island's scopes and removes its DOM before React removes the
  form, so a template's `$onDestroy` still finds `af-form`; the next option
  boots a fresh island with empty details.
- **Failure.** A script, module or template that does not load leaves an
  alert in the block, "<option> could not load: <reason>"; the next choice
  of a templated option tries again. A page whose variable lists no Angular
  assets says so for the option.
- **Debug mode.** The form's section lists each island under "Angular
  islands" as `<template> (<module>)`.

## The builders in React

React rebuilds core's SearchKit admin (listing, search editor, display
editors, display page) and FormBuilder (listing, form editor at core's
`#/create/…`, `#/edit/…` and `#/clone/…` routes, submissions) at routes of
their own ([Pages](#pages)). Both save the same records through the same
APIv4 calls as core's builders. The classic builder is one link away in
the [debug mode](architecture.md#debug-mode).
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
[builders.md](builders.md#plugin-contract); differences from
core's builders: [comparison-builders.md](comparison-builders.md).

## Pages

| Route | Content |
|---|---|
| `civicrm/afreact/render?name=…&renderer=react\|angular` | any form the user may open, with the renderer named; `&options={…}` (JSON) stands for a placement's arguments, else a picker passes them (`&placement_contact_id=…`), a contact that is the only argument defaulting to the user's own |
| `civicrm/admin/afreact` | support report |
| `civicrm/admin/setting/afreact` | the forms React renders and the builders it takes over |
| `civicrm/admin/afreact/search`, `civicrm/afreact/search` | React SearchKit admin and display page |
| `civicrm/admin/afreact/afform`, `…/afform/submissions?name=…` | React FormBuilder and a form's submissions |

The dev and CI stacks add demo pages from the `afreactdemo` fixture (see the README's
Development section): `civicrm/afreact/demo` renders its forms and tables with React
(`?source=page` or `?source=bundle` picks the layout source),
`civicrm/afreact/angular` the same with the Angular runtime; both share one
markup (`PagesHeadlessTest`). `civicrm/afreact/demo/join` and `…/demo/members`
are a membership sign-up and a members page built from core parts only.
`civicrm/afreact/kit` puts a module built on the kit (`js/kit-consumer.js`)
beside an afreact form; `civicrm/afreact/kit-only` shows it without afreact's
bundle, and `civicrm/afreact/kit-host` loads that page as a snippet.

## Layout

| Path | Content |
|---|---|
| `Civi/Api4/Afreact.php`, `Civi/Api4/Action/Afreact/` | `Afreact.getForm` and `Afreact.getTaskSettings` |
| `Civi/Afreact/LayoutCompiler.php`, `Afforms.php` | Afform partial → layout array, blocks inlined; shared cache and typed records |
| `Civi/Afreact/Assets.php`, `AttributeSchema.php`, `Checkout.php`, `AngularAssets.php` | bundle loading, the `civi.afreact.assets` event, the layouts handed to the page, the checkout settings and islands |
| `Civi/Afreact/Takeover.php`, `FormPage.php`, `Placements.php`, `PlacedSnippets.php`, `Dashlets.php` | the `afreact_forms` takeover per placement |
| `Civi/Afreact/AdminPage.php`, `Builders.php`, `BuilderRoutes.php`, `BuilderPanels.php`, `BuilderReport.php` | builder pages, takeover, plugin panels, report findings |
| `Civi/Afreact/RenderPage.php`, `SupportPage.php`, `Chrome.php`, `xml/Menu/afreact.xml` | render and support routes and their shared chrome |
| `settings/`, `templates/afreact/` | the two settings; page and inline templates |
| `src/afform/` | form renderer (layout, fields, form model, conditions, expressions, layout sources, support checks) |
| `src/angular/` | Angular islands: core's Angular assets loaded on demand, an island's module, boot and teardown |
| `src/search/` | SearchKit display renderer: columns, row menus, toolbar, totals, editing, tasks, pager, filters and URL keys |
| `src/url/` | the URL hash as state for all elements of a page |
| `src/admin/` | the React builders (`search/`, `afform/`) |
| `src/kit/`, `Civi/Afreact/Kit.php`, `tsconfig.kit.json` | the kit other extensions import through `afreact/` ([kit.md](kit.md)) |
| `src/compare/`, `src/support/` | load metrics the browser tests measure; support report |
| `tests/browser/`, `tests/phpunit/` | browser tests; headless PHPUnit suite |
| `scripts/` | type generator, inventory, core watch |

