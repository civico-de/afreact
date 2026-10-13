# afreact

Draws CiviCRM's FormBuilder forms and SearchKit tables with React instead of
Angular, and rebuilds the two editors that make them. Forms, searches, stored
data and permissions stay exactly those of CiviCRM; only what happens in the
browser changes. Each form is switched over on its own, and back, with one
setting.

What users get from it: screens that work with keyboards and screen readers,
mistakes explained at the field, less work lost by accident, tables that stay
visible while the next page loads, and none of the faults in CiviCRM's own
screens that were found while rebuilding them.
**[overview.md](docs/overview.md) explains all of this without technical
detail** and is the place to start.

Status: alpha. The supported CiviCRM releases are pinned in `info.xml`.

## Using it

1. Install the extension. Nothing changes yet: every form stays Angular.
2. Open the support report at `civicrm/admin/afreact`. It lists every form
   and what afreact cannot draw in it; its button switches over every form
   without such a finding.
3. Fine-tune at `civicrm/admin/setting/afreact`: the forms drawn with React,
   and whether the React editors replace core's SearchKit and FormBuilder
   editors (core's stay reachable under `…/classic`).

A part afreact cannot draw is never dropped silently: the form shows a note
naming it. A setting the React editors cannot edit is saved back unchanged.

## Documentation

| Document | Content |
|---|---|
| [docs/overview.md](docs/overview.md) | what afreact is and changes for users, in plain words |
| [docs/reference.md](docs/reference.md) | the elements, URL state, takeover per placement, builder plugins, pages and code layout |
| [docs/architecture.md](docs/architecture.md) | boundary, state, the first search, libraries and chunks, dashlets, the support report, the debug mode |
| [docs/comparison.md](docs/comparison.md) | the renderer's parity gaps, improvements, differences by design, what is not implemented and why |
| [docs/comparison-builders.md](docs/comparison-builders.md) | the builders' differences from core's SearchKit admin and FormBuilder editor |
| [docs/upstream-bugs.md](docs/upstream-bugs.md) | bugs in core found on the way, by area, and what React does instead |
| [docs/searchkit-format.md](docs/searchkit-format.md) | the SearchKit records as a format: the query, field names and joins, display settings, columns, links, text templates, what a run returns |
| [docs/afform-markup.md](docs/afform-markup.md) | the Afform markup as a language: vocabulary, attribute types, the three layout formats, what core could change for a second renderer |
| [docs/load-metrics.md](docs/load-metrics.md) | measured load times of both renderers and the layout sources |
| [docs/testing.md](docs/testing.md) | every browser spec, the sweeps, the demo videos |
| [docs/builders.md](docs/builders.md) | the React builders: server contracts, takeover and fallback, Angular islands, plugin contract, round trip, testing, core versions |
| [docs/adr/](docs/adr/) | decision records: why afreact is built the way it is |

## Development

The dev stack is civikitchen (CiviCRM standalone, MariaDB, maildev); see the
header of `.docker/docker-compose.yml`. Its profile, `.docker/profiles/dev/`,
enables the core extensions some specs need and seeds synthetic contacts,
memberships, events with participants and contact sub-types at first boot. It also opens both builders with React (`afreact_builders`), so editor links lead to the React builders. Two extensions under `.docker/fixtures/` are mounted in the dev and CI
stacks and never released: `afreactdemo` holds the demo forms, searches and
pages the browser tests use, `afreactisland` exercises the builder plugin
contract.

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

## Licence

Proprietary, © civico GmbH. See [LICENSE.txt](LICENSE.txt).
