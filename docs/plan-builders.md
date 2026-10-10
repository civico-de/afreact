# Plan: the builders in React

Status: proposal, nothing built yet (2026-10-10). Numbers are measured
against civicrm-core master (6.21 alpha), its release tags and this
repository on that date.

afreact renders Afforms and SearchKit displays. The SearchKit admin and
FormBuilder, where admins make them, stay Angular. This plan brings those
builders to React, so that with every switch on, no afform or search_kit
screen needs Angular. The server does not change: the React builders save
through the same APIv4 calls as core's Angular builders, and core's builders
stay installed and reachable.

## Decisions

| Question | Decision | Alternative |
|---|---|---|
| Scope | everything afform and search_kit ship in Angular, plus the core extensions that plug into their builders (chart_kit, civi_case, civi_contribute, recaptcha) | also core's other Angular apps (table below), about 11,500 lines more, each better served by a plan of its own |
| Order | SearchKit admin first, then FormBuilder | FormBuilder first; but its search forms place SearchKit displays, which admins make and edit in the SearchKit admin, so a React FormBuilder would keep sending them to the Angular one |
| Core versions | 6.19.0 and every release after it, minor and patch, for the builders as for the runtime (`info.xml`), since sites run several side by side once the builders are released (see "Core versions") | the runtime on an older floor and the builders on 6.19: two support ranges and a floor check in the builder pages, while the runtime's tests already need 6.19 (`\Civi::router()`) |
| Fallback | per page: the Angular builder stays at a route of its own, and React links a record there when it holds something React cannot edit; an extension's display type editor runs as an Angular island inside the React display page (see "Angular islands for display type editors") | islands for every builder part, which would run the Angular builder anyway (same section) |
| Packages | no new runtime package | `@tanstack/react-virtual`, only if a measurement shows a slow list |
| UI | free: the React builders save what core's save, but their screens need not copy core's layout or flow, and improve on it where core is awkward; accessibility, core's permissions and the warnings that prevent data loss stay | a copy of core's screens, which would carry its jQuery UI interactions and inaccessible parts into React |
| Home | in afreact, as a second entry `afreact-admin.js` | a separate extension, which would copy or re-export the runtime's displays, widgets and API types |

## Scope

### In scope

| Area | Core | Angular lines (JS + HTML) |
|---|---|---|
| SearchKit admin at `civicrm/admin/search`: search and segment listings; segment editor; search editor (entity, joins, conditions, group by, functions, subsearches, entity sets, settings, query info, templates); results preview; display editors (table, list, grid, tree, autocomplete, DB entity, data entry); import and export; tags and smart groups | `crmSearchAdmin` | 8,300 |
| SearchKit display page `civicrm/search#/display/<search>/<display>` | `crmSearchPage` | 70 |
| FormBuilder at `civicrm/admin/afform`: form listing (`afAdminFormList`, itself an Afform; revert and delete are SearchKit tasks of its display), editor (canvas, palette, entities and behaviors, fields, containers, tab sets, conditions, search forms, markup), form settings, undo and redo | `afAdmin`, `afGuiEditor` | 6,624 |
| FormBuilder submissions at `civicrm/admin/afform/submissions`: a table display with inline settings | `CRM_AfformAdmin_Page_Submissions` | (page markup) |
| chart_kit's display editor | `crmChartKitAdmin` | 920 |
| civi_case's case-role autofill settings, appended to a core builder template | `afCaseGuiEditor` | 48 |
| recaptcha's element settings | `afGuiRecaptcha2` | 27 |
| civi_contribute's checkout block input type on the canvas (a fixed text) | `afCheckout`, only `inputType/CheckoutBlockAdmin.html`; the runtime renders the block | 5 |
| gear menus with edit links on placed forms (`Civi\AfformAdmin\AfformAdminInjector`) | ChangeSet on every `*.aff.html` | small |
| runtime pieces that are still Angular: the filter-set picker `af-search-param-sets` (afform; the runtime applies a set from `#?_s=`, but has no picker); the bulk-action dialogs for tag merge (search_kit), add grant (civigrant) and add translation (message_admin); the `crm-recaptcha2` element | `af`, only `afSearchParamSets`; `crmSearchTasks`, only `crmSearchTaskTagMerge`; `civiGrantTasks`, `crmMsgadmTasks`, `crmRecaptcha2` | 774 |

### Outside this plan

Core's other Angular apps are neither afform nor search_kit; they stay Angular
after this plan, and so do the shared modules `crmUi` (1,413 lines) and
`crmUtil` (393) they need.

| App | Module | Angular lines |
|---|---|---|
| CiviMail composer and A/B tests | `crmMailing`, `crmMailingAB`, `crmAttachment` | 4,604 |
| API v4 explorer | `api4Explorer` | 2,215 |
| case types | `crmCaseType` | 1,255 |
| message templates, including the Afform `crmMsgadmMonaco` it embeds | `crmMsgadm` | 1,146 |
| import | `crmCiviimport` | 644 |
| contact dashboard (sketched in [architecture.md](architecture.md), "Dashlets") | `crmDashboard` | 472 |
| export field mapping | `exportui` | 314 |
| standalone login, password change and reset | `crmLogin`, `crmChangePassword`, `crmResetPassword` | 506 |
| status page, oEmbed sharing, OAuth, queue monitor | `crmStatusPage`, `crmOembedSharing`, `oauthUtil`, `crmQueueMonitor` | 351 |

afform's test extension `ext/afform/mock` is no screen of a site and stays
out as well.

## Cost

| | Angular (core) | React (afreact) |
|---|---|---|
| runtime, built | 7,000 lines: `af` without the filter-set picker, `afCore`, `afformStandalone`, the `crmSearchDisplay` modules, `crmSearchTasks` without tag merge, `crmChartKit`, `civiCaseTasks`, `afCheckout` | 18,300 lines of TypeScript without generated API types; 17,100 lines of unit tests, 6,750 of browser tests |
| builders, this plan | 16,000 lines | about 30,000 to 40,000 lines of TypeScript, tests in the runtime's ratio |
| runtime pieces, this plan | 800 lines | about 2,000 lines of TypeScript |

The runtime needed 2.6 lines of TypeScript per Angular line, partly because
it also does what core's shared modules (`crmUi`, select2, jQuery UI) do for
the Angular code. The builders reuse the runtime's displays for their
previews, its comboboxes, field inputs and API types, and their Angular code
is a larger share of templates (30% against 17% in the runtime), so the
estimate takes 2 to 2.5. With tests, the repository grows to about three
times its size.

Upstream moves fast in these files. Non-merge commits on civicrm-core master
in the twelve months to 2026-10-10:

| Paths | Commits |
|---|---|
| the paths this plan adds to `scripts/core-watch.txt` (below) | 294 |
| of these, SearchKit admin (`crmSearchAdmin*`, `Civi/Search`, `CRM/Search/Page`) | 153 |
| of these, FormBuilder admin (`ext/afform/admin`) | 121 |
| of these, not already touching a path followed today | 191 |
| the paths `scripts/core-watch.txt` follows today | 394 |

The plan adds 191 commits a year to the 394 the weekly core-watch review
reads today, about half as many again.

## Server contracts

The React builders call what core's Angular builders call, with the same
parameters, and need no new server API. The one departure: FormBuilder saves
and converts layouts as `shallow`, not `deep` (see "Round trip").

| Builder | Reads | Writes |
|---|---|---|
| SearchKit editor | `CRM.crmSearchAdmin` from `Civi\Search\Admin::getAdminSettings()` (pager size, modules, cache key, tags); `civicrm/ajax/admin/search` with `getAdminMetadata()` (schema, joins, functions, operators, display types, styles, permissions, …); `SavedSearch.get`, `SearchDisplay.get`, `SearchDisplay.getSearchTasks`; `<Entity>.getFields` with `loadOptions` for the option lists of the search's entities, and with the entity's API parameters when one that controls the fields changes (`ui_params` with `dynamicFieldControl`); `Afform.get` for the forms that embed the search or one of its displays (`search_displays` `CONTAINS`) | one `SavedSearch.save` with the chains `Group.save` (smart group), `SearchDisplay.replace` and `EntityTag.replace` or `.delete`; in the same request, for a search already saved, `Group.delete` whenever it has no smart group and `SearchDisplay.delete` whenever it has no display left, as core sends them on every such save. `replace` deletes every display it is not given, so a display React cannot edit goes in unchanged. Deleting a display also reverts every search form that embeds it (afform's `hook_civicrm_pre`), which deletes a form the site made, so React names those forms when a display is removed, as core does |
| SearchKit DB entity display | `SK_<name>.getRefreshDate`; `Job.get` for its refresh job | before saving, core's confirmation for a removed entity and removed or renamed columns; the preview's `limit`, `pager` and `classes` leave the settings; `Job.save` matched on `api_entity` and `api_action`, in the same request as `SavedSearch.save`; afterwards `SK_<name>.refresh` and a reload of the admin metadata, which now holds the entity |
| SearchKit listing | `SearchDisplay.run` with the listing's display defined in code | `SavedSearch.delete`; `SavedSearch.revert` chained with `SearchDisplay.revert` and `.delete` for a packaged search |
| SearchKit segments | `SearchDisplay.run` for the listing; `SearchSegment.get` | `SearchSegment.save` chained with the entity's `getFields` for its segment fields; `SearchSegment.delete` |
| SearchKit preview | `SearchDisplay.run` with the unsaved search and display as arrays, as core's preview does (needs `manage own search_kit`) | none |
| SearchKit display page | `SavedSearch.get` chained with `SavedSearch.checkAccess` (for the edit link); `SearchDisplay.get`, or `SearchDisplay.getDefault` when the URL names no display; `SearchDisplay.run` | none |
| FormBuilder | `CRM.afAdmin` from `AfformAdminMeta::getAdminSettings()`; `CRM.afGuiEditor` from `getModuleSettings()`, which holds `getMetadata()` with the `civi.afform_admin.metadata` additions; `Afform.loadAdminData` (the layout `shallow`, whitespace formatted); `Tag.get` for the tags used for Afforms | `Afform.save` with `formatWhitespace` and `layoutFormat: 'shallow'` (core: `deep`), also for saving a container as a block; `Afform.convert` between `shallow` and `html` for the markup tab (core: `deep`); `Tag.create` for a tag made in place; the listing's revert and delete run as SearchKit tasks |

Permissions stay core's. The SearchKit admin opens for `manage own
search_kit`, which edits one's own searches, and for `administer search_kit`
(implied by `administer CiviCRM data`), which edits all; Query Info shows
the SQL only with `view debug output`. DB entity displays and displays that
bypass ACLs are for `all CiviCRM permissions and ACLs` only: core's editor
offers the entity type to no one else, and the server refuses everyone else
creating or editing such a display and saving a search that has one.
FormBuilder opens for `manage own afform`, which edits one's own forms, and
for `administer afform` (implied by `administer CiviCRM`), which edits all;
editing the markup tab needs `edit afform html` (implied by `administer
CiviCRM`). The display page and the submissions page need `access CiviCRM`,
and the display behind each then checks its own access. The React
builders show what core's show to the same user; the server checks
regardless.

## Switching and fallback

- **Own routes.** From the first phase on, the React builders run at
  `civicrm/admin/afreact/search` and `civicrm/admin/afreact/afform`, with
  core's permissions, next to core's builders. The parity tests drive both
  builders on one site without changing a setting.
- **Takeover.** A setting `afreact_builders` lists the builders React takes
  over (`search_kit`, `afform`); a builder becomes selectable once its last
  phase is done. For a listed builder, `hook_civicrm_alterMenu` points core's
  route at the React page, as `FormPage` does for forms, so every link to
  `civicrm/admin/search#/edit/5` (navigation menu, gear menus, listings)
  lands in React; `search_kit` takes the display page `civicrm/search`
  along, and `afform` the submissions page. Core's page classes move to
  `civicrm/admin/search/classic`, `civicrm/search/classic`,
  `civicrm/admin/afform/classic` and `civicrm/admin/afform/submissions/classic`.
- **Modules follow the route.** Core's builder pages name no module:
  `CRM_Search_Page_Admin` and `CRM_AfformAdmin_Page_Base` call `useApp()`,
  and the loader adds every module whose `basePages` holds the current path
  or `*` (`Civi\Angular\Manager::resolveDefaultModules`, exact match). The
  loader runs on every full page, because `CRM_Core_Resources::addCoreResources`
  queues `crmResource`. Left alone, core's route would load the Angular
  builder under the React page, and the classic route would load nothing.
  For a listed builder, an `angularModules` listener therefore replaces the
  builder path with the classic path in each module's `basePages`: on
  master `crmSearchAdmin`, `crmChartKitAdmin` and `crmSearchPage`, or
  `afAdmin`, `afCaseGuiEditor` and `afGuiRecaptcha2`, plus any extension's
  module that names the path. Modules that core adds to a builder module's
  `requires`, such as an input type's admin module, follow that module. A
  module with `*` loads on every page anyway and is left alone. Core caches
  the module list with the `basePages` the listener wrote, so a change to
  `afreact_builders` rebuilds the menu and clears that cache, as
  `afreact_forms` does (`post_change`). Measured on 6.19.0 with a throwaway
  extension and a browser: with the takeover on, core's routes load none of
  the builder modules and the classic routes load all of them, civi_case's
  and recaptcha's included; switching either way needs no manual cache
  flush.
- **Per record.** Before opening a record, React checks it against what it
  can edit: display types, settings keys, elements, input types, behaviors
  and entity options with a React editor or a plugin element (below), and
  display types whose Angular editor runs as an island. A part
  it cannot edit shows a notice in place, naming the part, with a link to the
  same record in the classic builder (the same hash route on the classic
  path). The rest of the record stays editable, and the part React does not
  know is saved back unchanged. Keys that core's own packaged records carry
  without an editor offering them (`label_hidden` on a column, `autoOpen` on
  a toolbar link) count as known and pass through without a notice.
- **Structural changes.** A display React cannot edit may name the search's
  entity, joins and columns, and React cannot carry it along when they
  change. Before saving a search whose entity, joins, columns or group by
  changed while it has such a display, React names those displays, asks, and
  links each to the classic builder.
- **Always reachable.** Each React builder's header links to the classic
  builder.
- **Support report.** The report at `civicrm/admin/afreact` gets a builders
  section listing the display types whose editor runs as an island, and
  what React would hand to the classic builder: display types without a
  React editor, plugin element or Angular editor component; elements, entities, input types
  and behaviors with an `admin_tpl`, `options_tpl`, `admin_template` or
  `getTemplate()` that React neither builds nor finds a plugin element for;
  the builder modules' own partials that differ from their file on disk,
  taken from the `angular-modules.json` asset so that ChangeSets and
  `buildAsset` rewrites both show; a partial counts as changed only when it
  differs from its file both as it is and passed through core's
  `Civi\Angular\Coder`, because a ChangeSet re-encodes every partial it
  matches, changed or not, and leaves all others verbatim (forms' partials
  stay out: core's gear-menu ChangeSet matches every `*.aff.html`); and
  every Angular module the classic builder page loads
  (`resolveDefaultModules` and `resolveDependencies` on the builder path)
  that afreact does not know, because a module can decorate a builder
  directive without touching a template. The report reproduces core's own
  changes to builder templates (core's `afformAdmin` ChangeSet on
  `Location.html`, civi_case's case-role settings) on the file before it
  compares, so it lists only other changes.

A part React cannot edit is never hidden, emptied or guessed: it gets a
notice or the save stops with a message. On a supported core release (see
"Core versions"), with only core's extensions, a notice in the builder or an
entry in the report is a bug (see "Testing").

### Angular islands for display type editors

A display type editor from another extension, such as chart_kit's
`search-admin-display-chart-kit`, runs as an island: React loads its module
through core's loader, boots it with `angular.bootstrap()` on an element of
the display page, and compiles the editor there once `searchMeta.loadMetadata()`
has resolved, as core's routes do before they render. Stand-ins stored as
controller data on the island's root replace the controllers it `require`s:
`$crmSearchAdminDisplayController` with `displayType` (icon, description),
`savedSearch.name`, `isSuperAdmin`, `aclBypassHelp` and
`crmSearchAdmin.displayIsViewable`, which core's shared display header
reads, and an empty `$crmSearchAdminController`. These members are core
internals, so the parity runs per core release cover the island.

The display object exists once. React hands its object to the island's
scope; a React change mutates it and runs `$rootScope.$apply()`, an editor
change reaches React through a deep `$watch` on it. Undo hands in a
restored object, which the editor shows at once. The editor derives its
column list from the search's `select` in `$onInit` only, so React rebuilds
the island when the search's columns change.

Measured on 6.19.0 with a throwaway page (dev stack, assets not
aggregated): the editor compiled with the stand-ins above and nothing else,
both directions and undo showed on the other side without a second copy,
and the browser reported no errors. Against the same page without the
island, the page loaded 1.9 MB more in 132 more requests, and
`DOMContentLoaded` came about 115 ms later; booting took 11 ms, the
metadata request about 1.1 s with an empty cache, compiling 11 ms.

Islands stop at display type editors. Other builder plugins assume the
whole Angular builder around them, so a record that needs them opens in
the classic builder:

- civi_case appends its case-role settings to core's template
  `~/afGuiEditor/behaviors/autofillRelationshipBehavior.html` by rewriting
  the `angular-modules.json` asset (`ContactAutofillBasedOnCase`), and its
  component injects the `afGui` service;
- preflight alters `~/crmSearchAdmin/crmSearchAdmin.html` and
  `~/afGuiEditor/afGuiEditor.html` with a ChangeSet; smartchart decorates
  `crmSearchAdminDirective`.

## Plugin contract

Core's own extension points stay what they are; React builds the core
extensions' parts itself (chart_kit's display editor, the DB entity
display's save hooks, civi_case's case autofill, civi_contribute's checkout
block, recaptcha's element, GroupSubscription's entity options, the
filter-set picker `af-search-param-sets`, which core's palette calls "Saved
Search Picker"). For other extensions, afreact offers custom elements in
light DOM, which need neither React nor the bundle's internals and follow
core's newer pieces: chart_kit's `civi-search-display-chart-kit` on the
`CiviSearchDisplay` base, afform's `af-markup` and `af-token`.

Wherever afreact loads its bundle, it dispatches `civi.afreact.assets` (a
`GenericHookEvent` whose `builder` is `search_kit` or `afform` on a builder
page and empty elsewhere). A plugin adds its scripts and styles with
`Civi::resources()`, and on a builder page its panels by element name. A
renderer loads heavy libraries itself when it first connects, as React loads
chart_kit's d3 only when a chart draws. React looks an element up with
`customElements.get()`; where none is defined, the fallback above applies,
and at runtime the form stays unsupported as today.

| Extension point | Core's Angular hook | Custom element | Receives | Sends |
|---|---|---|---|---|
| display type editor | component `search-admin-display-<type>` | `afreact-search-admin-display-<type>` | `display`, `savedSearch`, `columns` (the search's columns with label and data type) | `change` with `detail.settings`; a non-empty `validationMessage` blocks saving |
| display type renderer, at runtime and in the preview | directive `crm-search-display-<type>` | `civi-search-display-<type>` | what React gives chart_kit's element today: `search` and `display` by name, or in the preview as JSON of the unsaved records (as core's preview passes them); `settings`; `filters` with the form's values; the form's name through an `afFieldsetCtrl` property, so elements on core's `CiviSearchDisplay` base work unchanged | |
| search save hooks | `findCriticalChanges`, `preSaveDisplay`, `postSaveDisplay` (a decorator on `crmSearchAdminDirective`) | events of the same names, dispatched on the builder element and bubbling to `document` | core's arguments in `detail` (original and updated displays and a message list; a display and the request's API calls; a display and the results) | messages to confirm; API calls added to the save request; changes to the display before it is saved (core's own listener removes the preview's `limit`, `pager` and `classes`); a request to reload the admin metadata after saving |
| element settings | element `admin_tpl` | `afreact-afform-admin-<tag>` | `node` (the element's attributes) | `change` with `detail.node` |
| input type on the canvas | `admin_template` | `afreact-afform-admin-input-<type>` | `node` (the field), `defn` (its definition) | `change` with `detail.node` |
| behavior settings | `getTemplate()` | `afreact-afform-admin-behavior-<behavior>` | `entity`, `modes` | `change` with `detail.entity` |
| entity options | `options_tpl` | `afreact-afform-admin-entity-<Entity>` | `entity` | `change` with `detail.entity` |
| builder panel | ChangeSet on a builder template | the element name the plugin gives in the event | `record` (search with displays, or the form) | `validationMessage` |

An input type's `admin_template` is more than its picture on the canvas:
core's own hold editing controls (placeholder and default values in
`Select.html`, default values and the label in `CheckBox.html`). React builds
core's input types itself; another extension's input type without an element
shows a notice in place of its canvas controls, and the field's settings
menu stays editable.

afreact's own builder plugins move to the contract in their repositories:

- **smartchart**: its display code and admin panel are framework-free
  TypeScript behind Angular components; they register as
  `civi-search-display-smart-chart` and
  `afreact-search-admin-display-smart-chart`, and the `crmSearchAdminDirective`
  decorator becomes the panel reacting to `savedSearch` changes. The
  Angular components stay for the classic builder.
- **preflight**: its two ChangeSet panels become builder panels.

Other extensions' builder plugins keep working in the classic builder until
they adopt the contract; the support report lists them.

## Libraries

| Need | How | New package |
|---|---|---|
| field, entity, function and option pickers with search and groups | Downshift, already in the bundle | no |
| drag and drop: palette to canvas, nested containers, reordering columns, joins, conditions and links | dnd-kit core and sortable, already in the bundle; nested containers need a collision strategy and keyboard coordinates of their own | no |
| code editor for the markup tab | core's Monaco (`bower_components/monaco-editor`, AMD loader as `crmMonaco` loads it) behind a small component | no |
| rich text | `CRM.wysiwyg` | no |
| icon picker | core's icon list, read from `bower_components/font-awesome/css/all.css` as `crmIconPicker` does, in a Downshift combobox | no |
| colours | `<input type="color">` | no |
| dialogs, menus | `<dialog>`, `popover` | no |
| undo and redo | snapshots of the immutable editor state | no |
| layout edits (insert, move, update a node) | pure functions on the layout tree, without immer | no |
| hash routes (`#/list`, `#/edit/5`, `#/create/Contact`) | a small matcher on `location.hash`, beside the existing adapter for `#?key=value` | no |
| attribute values written as Angular literals (`defn="{label: 'Name'}"`), which core's builder evaluates with `$parse`; entity defaults, which it evaluates against the editor (`source: afform.title`) | a parser for the literal subset (objects, arrays, strings, numbers, booleans, `null`, `ts()`) and `afform.*` paths, beside the runtime's `src/afform/expressions.ts`, tested against `$parse` on every attribute of core's packaged forms and every entity's `defaults`; for edited values an encoder writing `CRM_Utils_JS::encode`'s notation, tested against it | no |
| the DB entity column-name preview, which core computes with MD5 (`searchMeta.createSqlName`, mirroring `Civi\Search\Meta::createSqlName`) | MD5 in about 60 lines, tested against RFC 1321's vectors | no |
| long lists (fields of an entity with many custom fields) | Downshift renders the filtered matches | `@tanstack/react-virtual` only if measured slow |

Builder code loads only on builder pages: `afreact-admin.js` is a second
entry, shared code sits in the `vendor` chunk, and the build check that no
chunk imports an entry, which names `afreact.js` today, covers both entries.
The runtime entry does not grow.

### Canvas drag and drop

The canvas extends the search tree's `TreeDnd` (`src/search/Sortable.tsx`):
a drop lands after a field, or at a slot, and the arrow keys step through
the targets in document order. A phase 0 prototype in a browser, with
containers in containers, a row of fields side by side and an empty
container, moved every item to every place by keyboard and by pointer once
the canvas follows these rules:

- Each container has two slots, first in it and after it, the second behind
  its last child. A container's own box is no target, otherwise "after the
  container" would come before its children in the key order.
- The dragged item's subtree is no target, except its own place, where a
  drop changes nothing; the arrow keys jump past the rest of it.
- The arrow keys skip a target that would leave the layout as the previous
  stop left it, so each press changes the result.
- In a row, the pointer's half of an item decides: the left half is before
  it, the right half after it. A slot in a row takes no width.

## Round trip

A builder loads a record through core's calls, edits a copy and sends it
with only the edited keys changed.

- **Forms.** React loads the layout from `Afform.loadAdminData`, as core's
  builder does: `shallow`, so a node core's builder cannot edit arrives as
  markup (`#markup`) and stays markup in React too, and every attribute
  arrives as text. React keeps that text and parses a copy for the editor
  (the values core's `afGui` service evaluates: `{…}`, `[…]`, `ts(…)`,
  `filters` excepted). An attribute the admin edits is written back by the
  type core's `CRM_Afform_ArrayHtml` gives it, which
  `Civi\Afreact\AttributeSchema` already exposes, behavior attributes
  included: a `js` attribute (`defn`, `data`, `actions`, …) in
  `CRM_Utils_JS::encode`'s notation, its other `ts()` values still as calls;
  a `text` attribute (`class`, `af-title`, …) as plain text. Every other
  attribute keeps its text to the byte, and saves send `layoutFormat:
  'shallow'`, so the server writes that text unchanged. A `js` value the
  parser cannot read keeps its text, and the part of the editor that needs
  it shows a notice; a `text` value it cannot read shows as text, as in
  core. Elements accept any HTML attribute, so an attribute React does not
  know is kept without a notice.
- **Core's builder loses attribute values** on this path, because it saves
  the evaluated values `deep`: it stores what `ts()` returns in its place,
  translated where the page holds the translation (8 `defn` values in 3
  packaged forms, two tab titles in a fourth); it drops a value `$parse`
  resolves to `undefined` (`afform_default: options.search_query`); its
  markup tab's `deep` conversion turns a `ts()` inside `defn` into `null`;
  and a `defn`, `data` or `actions` value `$parse` cannot read stays a
  string, on which the `deep` save fails. These go into upstream-bugs.md
  with phase 5.
- **Searches and displays.** Keys React does not know (from a newer core, a
  plugin) pass through unchanged, and the per-record check names a display's
  in a notice.
- **On load and save,** React does to an unedited record what core's
  builder does, listed per record type from core's code. For a form it
  fills in `icon`, `placement`, `placement_filters`, `permission_operator`,
  `confirmation_type` and each entity's `actions` and `security` (on
  multilingual sites `Afform.loadAdminData` adds `locale` itself), and the
  save sends `server_route` as `''` when the form has none and sets
  `create_submission` whenever `manual_processing` or
  `allow_verification_by_email` is set. For a search it fills in an empty
  `form_values.join` and turns each display's empty `pager` from `[]` back
  into `{}`. A display's editor, once the display is opened and not before,
  fills in its type's defaults, removes columns the search no longer
  selects and moves the old `addButton` into `toolbar`. A save without
  edits thus sends what core's builder would send, apart from the losses
  above.
- **What the server keeps** is core's, the same for both builders:
  `Afform.save` keeps only an Afform's registered fields, and
  `formatWhitespace` rewrites the file's indentation.

## Testing

- **Round-trip sweep.** For every saved search, display and form a site has,
  React's builder loads the record and builds the payload it would save
  without an edit, without sending it, and compares the payload with the
  stored record: the search with its displays, smart group and tags, each
  display once unopened and once opened in its editor; a form's layout after
  `Afform.convert` turns both sides from `shallow` into `html` with
  `formatWhitespace` (which writes nothing), the stored side read as
  `Afform.loadAdminData` reads it (`Afform.get`, `shallow`,
  `formatWhitespace`). Expected: no difference besides what core's builder
  also does to an unedited record (see "Round trip"), each change pinned by
  a browser test against core's builder. The sweep reports record IDs and
  the paths that differ, never values, because a search's conditions can
  hold personal data. It runs in unit tests on fixtures of core's packaged
  searches and forms, and on a site as part of the support report, in the
  admin's browser. It checks loading and the payload; real saves are the
  parity tests' job.
- **Parity on saved records.** Browser tests make the same change in core's
  builder and in React's (a search with a join, conditions, group by and a
  smart group; each display type with links, styles, tasks and in-place
  editing; an individual form, a search form, a block, conditions,
  behaviors) and compare the stored records, normalised for IDs, timestamps
  and generated names.
- **Restricted users.** The parity tests also run as a user with only
  `manage own search_kit` (own searches, no DB entity display, no ACL
  bypass, no SQL in Query Info), as one with only `manage own afform` (own
  forms, the markup tab read-only), and as one with only `access CiviCRM` on
  the display and submissions pages: React offers and refuses what core does.
- **No false notices.** On every core release the test runs cover, with
  only core's extensions, every search, display and form core ships, and
  every record core's builder makes in the parity tests, opens in React
  without a single notice; each display type, element and input type has one
  such test. On the same site the support report's builders section is
  empty. On a core newer than the tests covered or with other extensions'
  builder plugins, notices are expected and name the part.
- **Versions.** Which core releases the suites run on, and when, is under
  "Core versions".
- **Accessibility.** axe in light and dark mode on each builder screen. Core's
  canvas uses jQuery UI sortable, which has no keyboard support; React gives
  every drag a keyboard path and an equivalent menu action, and the gap goes
  into [upstream-bugs.md](upstream-bugs.md) as the repository's rule wants.
- **Strings.** The builders use core's English strings verbatim. The first
  phase pins how the bundle's `ts()` strings reach core's translations of
  `org.civicrm.search_kit` and `org.civicrm.afform_admin`; a de_DE browser
  test checks one screen of each builder.
- **Coverage.** As for the runtime: unit tests for models and reducers,
  browser tests for the screens, `bun run coverage` in the normal flow.

## Core versions

The builders, like the runtime, support 6.19.0 and every release after it.
Core ships a minor a month and patches in between, 45 releases of 6.x in the
twelve months to 2026-10-10 (12 minors, 33 patches), and each site upgrades
on its own schedule. Once released, the builders therefore run on several
minors and patch levels at once, and a site keeps them through every core
upgrade. An afreact release supports the core releases up to the newest
minor its test runs covered, and a release covering the next minor comes out
before core ships it.

- **Floor.** `info.xml` declares 6.19 for all of afreact. Core does not
  check that floor when it installs an extension (`CRM_Extension_Manager`
  refuses only the extensions on its own incompatibility list), so it states
  what is supported and tested, and the pages carry no check of their own.
- **Differences come from the server.** The builders take entities, fields,
  functions, display types, elements and attribute types from the running
  core (the reads under "Server contracts", APIv4's actions and parameters,
  `Civi\Afreact\AttributeSchema`), so what a newer core adds is absent on an
  older one without a check. Where nothing the server returns tells whether
  the running core has a behaviour, the page compares core's version, which
  afreact hands it, with the first release on each branch that has it. One
  comparison would not do: core ships a fix in patches of several minors,
  and the fix for dev/core#6424 is in 6.12.4 and 6.13.1 but not in 6.13.0.
  Each check names its upstream change and goes once the floor passes it.
- **Newer than covered.** On a core release newer than the installed afreact
  release covers, the builders run as they are: a setting or element React
  does not know shows as a notice and is saved back unchanged (see
  "Switching and fallback"), and the classic builder is one link away. A
  change in what a known key means, or in how core processes it, shows no
  notice: the record then behaves as the newer core reads it, not as the
  React editor described it. The weekly runs on master and on the next
  release branch are there to meet such a change before its minor ships.
- **Test runs.** civikitchen publishes the newest patch of each minor it
  builds as `:standalone-<minor>`, rebuilt daily, and keeps each patch
  release it built under a frozen tag of its own (`:standalone-6.19.0`).
  Every push runs the unit, PHPUnit and browser suites, the parity tests
  included, on the newest release (`:standalone`) and, as a `matrix_images`
  leg, on the floor itself (`:standalone-6.19.0`). A weekly run, and the
  same run started by hand on the commit a release is tagged from, adds a
  leg for every supported minor at its newest patch, for the release before
  each patch boundary a version check names, so that both sides of the
  check run, for the release branch of the next minor (`:standalone-beta`)
  and for core's master (`:standalone-master`).
- **Lead time.** A change that reaches core through master meets the weekly
  run one to two months before its minor ships, and again on the release
  branch it ships from, which can differ from master. A backport can reach
  a patch release within days (6.18.1 carried a FormBuilder fix that had
  landed on master the day before); the minor's image moves to the new patch
  within a day, and the next push or weekly run tests it.
- **Earlier patches** of a minor run only where a version check splits the
  minor. In the patch releases of 6.9 to 6.18, 14 commits reached the
  builder paths, between none and four per minor; core-watch lists each one
  (see "Upstream tracking").
- **civikitchen** carries the runs. Its `matrix_playwright` input runs the
  browser suite on every `matrix_images` leg, each leg on a stack and port
  and in a concurrency group of its own, so that the legs run side by side
  and neither two legs nor a push and the weekly run cancel each other. It
  builds `:standalone-master` and `:standalone-beta` daily from core's git.
  And once its successor ships, a minor's image follows its patches only
  while the minor is on `CK_STANDALONE_EXTRA_MINORS`
  (`toolbelt/versions.env`), so each supported minor goes on that list
  before then; 6.19 is on it.

The floor rises only by decision, announced with an afreact release, and
the checks below it go then. Until then the weekly run grows by one minor a
month.

## Phases

Each phase ends with its tests green on every core release the weekly run
covers. A builder's takeover option arrives with its last phase.

**0. Groundwork.**
The React builder routes and pages; the `afreact_builders` setting with the
classic routes and the `basePages` listener (verified on 6.19.0, see
"Switching and fallback"); the
`civi.afreact.assets` event; the version check per branch; the test runs
per core release (see "Core versions"); metadata loading for both builders;
shared widgets (pickers, icon picker, Monaco, tags, MD5); undo and redo;
layout tree functions; the round-trip sweep and the parity harness; the
support report's builders section with its registry of core's template
changes and modules; the core-watch paths and release branches; the `ts()`
question above.

Phase 0 has run two throwaway prototypes, an island with chart_kit's
display editor and a canvas with nested drag and drop; their results are
in "Angular islands for display type editors" and "Canvas drag and drop",
and their code is gone.

**1. SearchKit listings and the display page.**
`#/list` with its tabs, filters, sorting, in-place editing, links and the
per-row delete and revert, with core's confirmation naming the displays,
smart group, scheduled communications and forms that go with the search;
the cells core draws with include templates (forms using a search,
displays, tags, scheduled communications) as React cells; import and
export; the segments listing with its edit dialog and delete; the display
page through `<afreact-search>`, with the search's default display when the
URL names none, the display's label as page title and the edit link for
users who may edit the search. Exit: the listing offers core's rows, links and
actions.

**2. SearchKit search editor.**
Entity, with its own API parameters (`ui_params`, such as the form whose
submissions `AfformSubmissionData` searches) and the fields reloaded when
one that controls them changes; joins, including bridge joins; conditions
with nested groups and functions; group by; columns with functions and
flags; subsearches; entity sets; the results preview with its column
actions; smart group and tags; the settings tab (description, expiry date,
timeout); Query Info (API parameters, request time, and the SQL for
`view debug output`); the Forms menu with the forms that use the search
and links to create one in FormBuilder for the search or a display; saving
as one `SavedSearch.save`; cloning (`#/clone/<id>`); templates: create from
a template, save as or clone a template (`?is_template=1`), with the create
route's `label` and `params` in the URL; a warning before leaving unsaved
changes. Exit: parity on saved records; the sweep finds no difference in
any search on the dev stack.

**3. SearchKit display editors.**
Table, list, grid, tree, autocomplete, DB entity and data entry: columns and
their types, links and link groups, styles and conditional styles, sorting,
pager, toolbar, tasks, in-place editing, tally, placeholders; live preview
through the runtime displays, and core's own previews for autocomplete and
DB entity; the DB entity display's refresh job, refresh date and its
confirmation for removed or renamed columns; chart_kit's editor with its
chart as the preview; the confirmation before structural changes; the
warning naming the forms that embed a display when it is removed, pinned by
a browser test, since the parity tests compare records, not dialogs; the
display and save-hook contracts and smartchart's move to them. Exit: parity
per display type; no false notices; the sweep finds no difference in any
display.
`search_kit` becomes selectable in `afreact_builders`.

**4. FormBuilder listing, submissions and gear menus.**
`afAdminFormList` with `af-admin-list-menu` and its placement column (a
registry maps core's own include templates to React cells; any other include
template stays unsupported); the submissions page through `<afreact-search>`,
which learns the inline `settings`, `api-entity` and `filters` core's page
passes; the gear menus with edit links on placed forms and displays, for
users with the permission. Exit: the support report shows `afAdminFormList`
supported; parity on the listing.

**5. FormBuilder editor.**
Core's routes (`#/create/<type>/<entity>`, `#/edit/<name>`,
`#/clone/<name>`); canvas and palette; containers, text, markup, buttons,
tab sets, blocks, joins and repeats; search forms with their displays and
parameter sets; generic elements; field settings (label, help, required,
defaults, options, input type, search ranges and operators); conditions;
entity panels with their defaults (`data.source` follows the form title, as
in core) and behaviors (contact autofill with civi_case's case roles,
dedupe, group subscription options); saving a container as a block; form
settings (title, description, icon, tags stored by name with new tags made
in place, route, public access, permissions, placements with filters and
weight, navigation, language, confirmation, redirect, submissions and their
limits, email verification, drafts, authx redirect); the markup tab with
Monaco and `Afform.convert`, editable with `edit afform html`; undo and
redo; element style menus; tokens; core's input types on the canvas, the
checkout block among them; the literal parser and encoder for attribute
values, with the round trip's core bugs listed in upstream-bugs.md;
recaptcha's element; the element, input type, behavior and entity-option
contracts and preflight's move to the panel contract. Exit: parity on saved
layouts; no false notices; the sweep finds no difference in any form, core's
packaged forms included. `afform` becomes selectable in `afreact_builders`.

**6. Remaining runtime pieces.**
The filter-set picker `af-search-param-sets` (list a form's sets with
`SearchParamSet.get`, apply one through `#?_s=`, save, update and delete
them); the tag merge, add grant and add translation dialogs; the
`crm-recaptcha2` element. Each gets a parity test. This phase depends on no
other and can run at any time.

## Upstream tracking

`scripts/core-watch.txt` gets the paths this plan depends on: the builders,
their plugins, the display base class the renderer contract builds on, the
runtime pieces of phase 6, the shared widgets React rebuilds, and the
encoding the round trip and the support report follow.

```
ext/search_kit/ang/crmSearchAdmin*
ext/search_kit/ang/crmSearchPage*
ext/search_kit/Civi/Search
ext/search_kit/CRM/Search/Page
ext/search_kit/managed/SearchDisplayType.mgd.php
ext/afform/admin
ext/chart_kit/ang/crmChartKitAdmin*
ext/chart_kit/js/components
ext/civi_case/ang/afCaseGuiEditor*
ext/civi_case/Civi/Afform/Behavior
ext/civi_contribute/ang/afCheckout/inputType
ext/recaptcha/ang/afGuiRecaptcha2*
ext/recaptcha/ang/crmRecaptcha2*
ext/recaptcha/Civi/AfformReCaptcha2.php
ext/civigrant/ang/civiGrantTasks*
ext/message_admin/ang/crmMsgadmTasks*
ang/crmMonaco*
ang/crmEntityTags*
js/jquery/jquery.crmIconPicker.js
CRM/Utils/JS.php
Civi/Angular/Coder.php
```

core-watch also follows core's release branches from 6.19 on, each from its
own reviewed commit, and core's release tags. All 14 commits that reached
the builder paths in the patch releases of 6.9 to 6.18 are on master too,
but 11 of them as backports under a hash of their own, so master alone does
not show which patch releases carry a change. For each change the builders
depend on, the review records the first tag on each branch that contains
it, which is what a version check (see "Core versions") lists; a change
still unreleased, such as `0b7e59e56c` on the 6.19 branch two days after
6.19.0, gets its check once a tag contains it.

A new display setting, element or behavior in core shows up as a notice in
the React builder until React supports it, never as lost data (see "Round
trip"). Bugs found in core's builders go into upstream-bugs.md with what
React does instead.

## Risks

- **Size.** 30,000 to 40,000 lines of TypeScript for the builders plus tests
  is the largest part of the repository. Every phase delivers on its own;
  stopping after phase 3 leaves a complete React SearchKit admin next to
  core's FormBuilder.
- **Churn.** About 190 more upstream commits a year to read, on top of the
  runtime's 394. Where React lags behind core, the builder shows notices,
  and falling behind costs a trip to the classic builder; a change in what
  a known key means, or in how core processes it, shows no notice (see
  "Core versions").
- **Version spread.** Until the floor rises, each new minor adds a weekly
  test run and a civikitchen image, and each behaviour that differs between
  supported releases adds a version check.
- **Nested drag and drop.** dnd-kit's sortable preset covers lists; the
  canvas's nested containers need a collision strategy and keyboard
  coordinates of their own. A phase 0 prototype settled both (see "Canvas
  drag and drop").
- **Plugins.** Sites that depend on third-party builder plugins keep the
  classic builder for the affected records until those plugins adopt the
  contract.
- **Core replacing its builders.** The server contracts stay core's, so
  turning the takeover off brings back core's builders with every record
  intact.
