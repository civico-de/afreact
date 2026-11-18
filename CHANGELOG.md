# Changelog

All notable changes to this extension are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The manual lives in `docs/handbook/`. CiviCRM shows it with handbook 0.5.0 or newer.

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

[Unreleased]: https://github.com/civico-de/afreact/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/civico-de/afreact/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/civico-de/afreact/releases/tag/v0.1.0
