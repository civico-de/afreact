# Changelog

All notable changes to this extension are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.2] - 2026-11-24

### Fixed

- Recognized CiviCRM 6.20.1's `<span ng-non-bindable>` wrapper inside `afform_admin`'s edit menu
  so forms with edit menus render in React and are reported as supported on 6.20.1.
- Evaluated `af-if` and `afreact-if` on `<af-tab>` and `<div crm-ui-tab>`, fell back to the first
  visible tab when the active tab hides, restored the initial tab on browser Back, and parsed
  `crm-ui-tab-set` URL fragments with query parameters.
- Guarded property lookups in `conditions.ts` and `rowConditions.ts` with `Object.hasOwn`,
  validated condition operands in the support report, and fixed `expressions.ts` parsing for
  commas, braces, and escaped quotes in string literals.
- Used `splitHash()` in `routeParams()`, preserved query values containing `?` in
  `popupLocation()`, isolated `isOnlyElement()` per popup dialog, caught malformed percent-encoding
  in builder routes and download filenames, prevented off-DOM mounting of hidden filter fields,
  captchas and tabsets, and cleared appended error alerts on `ReactElement` reconnect.
- Fixed `BatchDisplay` save-failure vs row-deletion race, duplicate Enter submissions in
  `NewRecordDialog` and `CaseRoleDialog`, forced-close task resurrection in `MailingDialog`,
  dependent option reloading in `LoadedSelect` and `NewRow`, parent-cycle handling in `buildTree()`
  and `tagTree()`, stale selection clearing on `searchAgain()`, and same-page Shift-click range
  selection.

## [0.3.1] - 2026-11-24

### Fixed

- Guarded `Afform.submit` with a synchronous ref to prevent duplicate submissions or payments on
  rapid double-submits, and stopped `CheckoutBlock` from marking untouched forms dirty on mount.
- Prevented stale search results and cross-entity pagination races in dynamic `EntityRef`
  comboboxes, and allowed decimals on `Float`/`Money` number inputs, numeric boolean values on
  `Select`/`Radio`, numeric country IDs in checkout state pickers, and string/number ID matches
  when filtering conditional options.
- Cleaned up `RichTextEditor` instances that finish initializing after unmount, cleared restored
  file names when removing a file during upload retry, and matched autofill prefill records by
  row index.
- Blocked dropping new fieldsets inside existing fieldsets in FormBuilder, showed conditional
  required/disabled menu items for `afreact-required`/`afreact-disabled`, quoted empty and
  digit-prefixed object keys, guarded the Markup tab against stale refresh responses, escaped
  entity names in reference checks, and cleaned up drag body classes on unmount.
- Keyed SearchKit display editors and previews per display so state and ChartKit initialization
  do not leak across tabs, added ChartKit's `dataLabelDecimalPlaces` and
  `dataLabelMoneyFormatString` to known settings, synced `LocationInput` address drafts on
  external changes, handled errors in subsearch selection, checked RHS join/column references on
  removal, validated import record objects, and updated `fieldIndex` when removing function
  arguments.

## [0.3.0] - 2026-11-24

### Added

- `afreact-if`, `afreact-required` and `afreact-disabled`: conditions on a field of the element's
  own repeat row, or comparing two fields, checked in the browser and on submit. The FormBuilder
  editor offers "this row" and "Compare with a field" and writes them only where a rule needs
  them.

### Changed

- The manual lives in `docs/handbook/`. CiviCRM shows it with handbook 0.5.0 or newer.
- Back-office forms show each fieldset as a block and each repeat item as a panel, and fields
  side by side stand on shared columns in every section.

### Fixed

- Texts core translates in the SearchKit and FormBuilder catalogs show translated on every
  screen, such as a search display's result count on a form, and bulk-action progress messages are
  extracted into the bundle's string list.
- Plural messages such as "%count tags removed." show translated on a core that translates
  them for its own screens (civicrm/civicrm-core#38172).
- A form with row conditions no longer fails after an afreact upgrade until the caches are
  cleared, and `afreact-required` on extra fields inside repeated fieldsets reads each item's
  extras.
- Confirmation messages are no longer double-escaped on CiviCRM 6.20.1 and later.
- `civicrm/afreact/render` neutralizes AngularJS interpolation delimiters in `options`, and
  non-admin routes (`civicrm/admin/afform/submissions`, `civicrm/search`) no longer expose
  FormBuilder/SearchKit admin module settings.
- ContactLayout blocks load the React bundle when no other taken-over form is on the page.
- Required file fields clear their inline error text once a file is picked, the FormBuilder leave
  guard warns on unapplied Markup edits, and back-office CSS handles nested repeat panels and
  themes without Riverlea variables.

## [0.2.0] - 2026-11-18

### Added

- React editors for SearchKit and FormBuilder, with the SearchKit listing (segments, tags,
  import and export) and a chart display editor. A setting lets them replace core's editors;
  core's editors stay reachable, and display settings the React editor does not know are saved
  back unchanged.
- Other extensions' Angular display editors and checkout templates run as embedded islands, and
  the support report gains a section on what the React editors cannot take over.
- The kit: React, TanStack Query and afreact's components for other extensions' modules through
  core's import map.
- Charts render with core's chart display, the formprotection captcha renders on React forms, and
  images and HTML from the rich content editor are drawn in layouts.
- Tokens of joined records are filled and offered in the editor on CiviCRM 6.21 and later.
- A per-viewer debug mode shows the links to core's screens.
- `civi.afreact.assets` dispatches `Civi\Afreact\AssetsEvent`, which documents its `builder`,
  `panels` and `replaces` properties for listeners and static analysis.

### Changed

- Licensed under AGPL-3.0-or-later.
- Requires CiviCRM 6.20, the latest release, and PHP 8.2 or later; each release supports the latest CiviCRM release only.
- React forms are laid out alike in every Riverlea stream, and tables keep their columns in place
  while the next page loads.

### Fixed

- Many fixes to search filters and their URL state, conditional fields, autofill, drafts,
  selection and inline editing, smart groups built from grouped or combined searches, and bulk
  task results.

## [0.1.0] - 2026-10-07

### Added

- First release: FormBuilder forms and SearchKit displays render with React instead of Angular,
  while form and search definitions, APIs and permission checks stay those of core.
- Forms with blocks, joins, repeats, live rules, drafts and the checkout block; table, list, grid
  and tree displays with filters, in-place editing, drag ordering and bulk actions.
- Forms switch to React one by one through a setting; a support report lists every form and what
  the renderer cannot draw in it, and a form notes any part it cannot draw instead of dropping it.
- Markup and classes follow core's Angular templates, so the CiviCRM theme styles both alike.

[Unreleased]: https://github.com/civico-de/afreact/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/civico-de/afreact/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/civico-de/afreact/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/civico-de/afreact/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/civico-de/afreact/releases/tag/v0.2.0
[0.1.0]: https://github.com/civico-de/afreact/releases/tag/v0.1.0
