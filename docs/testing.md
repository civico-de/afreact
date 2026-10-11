# Tests

Unit tests (Vitest, jsdom) run with `bun run test`; the PHP gates and the headless
PHPUnit suite with `ck ci` inside the container (README, "Checks"). The
browser tests below run with Playwright against the dev stack, logged in as
`admin`:

```sh
CIVICRM_BASE_URL=http://localhost:8080 bun run test:e2e
```

## Browser specs

| Spec | Checks |
|---|---|
| `tests/browser/parity.spec.ts` | the same scenarios against both renderers: empty submit is rejected client-side, create with a joined email submitted by Enter, prefill and update from the URL, equal saved records, equal table rows after sorting and paging |
| `tests/browser/compare.spec.ts` | cold and warm load metrics for every React layout source and Angular (printed as a table), a cold request waterfall, and one round of the in-browser compare page |
| `tests/browser/pages.spec.ts` | cold and warm ready times of every tour page on both renderers (printed as a table and written to `test-results/pages.md`) |
| `tests/browser/sources.spec.ts` | every layout source renders the demo page to the same DOM; `page` and `bundle` never call `getForm` |
| `tests/browser/visual.spec.ts` | the React page matches the Angular page part by part in position, size and main styles; differences by design are listed with a reason |
| `tests/browser/rules.spec.ts` | the rules form on both renderers: expressions, `af-if` (and the values it drops), `af-required`, `af-disabled`, a token default |
| `tests/browser/details.spec.ts` | the finer points of a form on both renderers: HTML in labels and help, a live token in a content block, hash values, a display-only date, a text area's character count, a required checkbox list, a container's style, the primary flag in repeated joins and an extra field in the submission |
| `tests/browser/fields.spec.ts` | every field type of the fields demo saves the same record on both renderers, and the search ranges send `SearchDisplay.run` the same filters |
| `tests/browser/tabs.spec.ts` | a tab set with fields in two tabs, a Toggle and a display whose row count is the tab's badge, on both renderers |
| `tests/browser/submission.spec.ts` | after a submission on both renderers: the confirmation message with a token, the redirect with tokens, a form closed for submissions |
| `tests/browser/joins.spec.ts` | the joins form on both renderers: a Home and a Work email block with Home hidden by `af-if`, the location each saves to on create, and the record each shows and updates from the URL; Angular's deviation is core's (see upstream-bugs.md) |
| `tests/browser/table.spec.ts` | SearchKit tables on both renderers: equal cells, links, classes, toolbar, counts and totals on the demo fixtures and the core forms the React table renders without a note; row menus, the menu keyboard path, collapsible rows, a `crm-popup` link and the reload after a popup form |
| `tests/browser/displays.spec.ts` | list, grid and tree displays on both renderers: equal items, columns, labels, classes, grid tracks and pager on the demo fixtures; tree branches opening alike, and on React their `aria-expanded` state and the keyboard path |
| `tests/browser/editable.spec.ts` | in-place editing on both renderers: a text cell saved with Enter and an option list saved with the Save button store the same values; the column picker hides and shows the same columns; on React, opening by keyboard, focus back on Escape and a failed save that keeps the editor open |
| `tests/browser/fullrow.spec.ts` | full-row editing (`editableRow.full`) on both renderers: one click opens every editable cell, the control column saves them in one go, Escape drops the changes |
| `tests/browser/newrow.spec.ts` | the Add row of `editableRow.create` creates the option through `SearchDisplay.inlineEdit` as core's row does |
| `tests/browser/actions.spec.ts` | bulk actions on both renderers: select, download, update, disable and delete rows, then equal tables and records |
| `tests/browser/case.spec.ts`, `caseRole.spec.ts`, `mailing.spec.ts`, `relationship.spec.ts`, `tags.spec.ts` | the open case, assign case role, mailing, relationship and tag tasks on both renderers store the same case, relationship, mailing, group and tag rows; the role spec builds its case search and form through the API and removes them after |
| `tests/browser/batch.spec.ts` | core's contribution batch entry on both renderers: a batch with a target total, two rows with contact, amounts, fee and financial type, then the import; the stored contributions are equal, and Angular's float total asks "Totals Mismatch" (see upstream-bugs.md) |
| `tests/browser/chart.spec.ts` | a chart_kit pie of contacts per type on both renderers, built through the API and removed after: the same title, legend and slices, unfiltered and after a filter in the URL hash, which the open page takes as a live change; each search names the form; the dev stack installs chart_kit in `.docker/init.d/50-chart-kit.php` |
| `tests/browser/reorder.spec.ts` | drag to reorder on the demo options table: keyboard moves with announcements in React, pointer moves on both renderers, the stored weights and the order after a reload |
| `tests/browser/navtree.spec.ts` | drag in the hierarchical demo table of navigation entries on both renderers: a row moved with its sub-rows among its siblings by keyboard and pointer, the stored weights, the refused drops with their announcements |
| `tests/browser/checkout.spec.ts` | the checkout block of core's donation form shows the pay-later option's description on both renderers |
| `tests/browser/treedrag.spec.ts` | drag in the demo tree of navigation entries: keyboard steps through every line and first place with announcements and store the weight and parent; a pointer drop after an item of another branch stores the same weight and parent as Angular does |
| `tests/browser/filters.spec.ts` | search filters on both renderers: the same filters and rows from the defaults, the URL, stored values and a saved filter set, with one page request and no excluded row shown on first load; typed filters and a reload; the first-row time of each renderer |
| `tests/browser/takeover.spec.ts` | a listed form rendered by React on its page, a contact summary tab and block, the contact actions popup, a case summary block and an event tab observes the same as the form left to Angular |
| `tests/browser/dashboard.spec.ts` | on core's dashboard a listed Afform dashlet renders with React next to an unlisted one in Angular, without the listed form's Angular module; refresh and fullscreen render it again; unlisted, both are Angular |
| `tests/browser/support.spec.ts` | the support report checks every form but blocks, links both renderers, lists what the rendered form flags, and its button writes every form without a finding into the setting, whose `post_change` rebuilds the routes; the builders section names the dev stack's island display type and its two modules, and nothing else |
| `tests/browser/builders.spec.ts` | the React builder's own route links each screen to the classic builder; with a builder taken over, core's route opens React and the classic route core's builder |
| `tests/browser/search-list.spec.ts` | the React SearchKit listing filters, exports, deletes and imports a saved search, and creates and deletes a search segment |
| `tests/browser/search-editor.spec.ts` | the React search editor creates, previews and saves a search, builds conditions and joins, asks before leaving unsaved changes; every search on the site and a search with join, conditions, group by and smart group save as core's editor saves them |
| `tests/browser/search-display.spec.ts` | the React display editors: table columns, a DB entity with its refresh job, data entry columns and totals, a chart as core's editor saves it, a grouped list; a plugin editor element and an Angular island; no display on the site has settings React names as unknown, and a display that has some names them, links the classic builder and saves them back |
| `tests/browser/search-display-page.spec.ts` | the display page shows a named display with hash filters, title and edit link, and the default display when the URL names none |
| `tests/browser/display-sweep.spec.ts` | every search with displays, opened in core's builder and in React's with each display tab visited, sends the same save; the save is caught and dropped. `SWEEP_SEARCHES=id1,id2` limits it to those searches |
| `tests/browser/a11y.spec.ts` | axe in light and dark mode finds nothing on the React demo and rules forms, the demo tables (menu and subsearch open), the editable table with its column picker and a filtered search form that the Angular ones pass; nothing on the support report that core's settings form does not share |
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

## Demo video

```sh
CIVICRM_BASE_URL=http://localhost:8080 bun run video   # needs ffmpeg
```

`tests/browser/demo.video.ts` records the same session on both renderers:
cold browser cache on a warm server, typing a contact, saving it, sorting
and paging the table. The contact is deleted afterwards. Both recordings end
up side by side in `video/angular-vs-react.mp4`, and the label in each
half shows when that page was ready. The suite does not run it.

```sh
CIVICRM_BASE_URL=http://localhost:8080 bun run video:tour
```

`tests/browser/tour.video.ts` records a longer tour: a bulk action, editing
in place, the column picker, drag to reorder, collapsible rows, tabs, list,
grid and tree displays, range filters, several of core's own search pages
and a form with a slider and a rich text editor. Each scene has a fixed
slot, so both halves of `video/tour-angular-vs-react.mp4` show the same
scene at the same time; the label names the scene and how long the page
took. The tour creates its groups, options and contact and removes them.

