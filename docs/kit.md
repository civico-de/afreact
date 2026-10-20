# The kit

Other extensions can build React screens with afreact's React, TanStack Query
and components. Their modules import everything shared through import map
entries under `afreact/`, so a page holds one React however many extensions draw on
it, and afreact's own elements on the same page run on that React too.

## On a page

afreact maps each module under `dist/kit/` into core's import map with
`hook_civicrm_esmImportMap` (`Civi\Afreact\Kit`): `afreact/kit.js` to
`dist/kit/kit.js?r=<cache code>`, and so on. A specifier the kit does not
list resolves to nothing. Core writes the import map into the head of a page
that a module was added to while it was built, which `addModuleFile()` does:

```php
\Civi\Afreact\Kit::load();
\Civi::resources()->addModuleFile(E::LONG_NAME, 'dist/segments.js');
```

`Kit::load()` adds `dist/afreact.css` and the translations of the kit's
texts, such as the "Loading..." of a count: the build lists afreact's `ts()` texts in
`dist/strings.json`, and `Kit::load()` puts their translations into
`CRM.strings`, from afreact's own `l10n/` first, then SearchKit's and core's.
afreact's own files hold only the texts core does not translate ("at least",
"Try again", …), so a site without core's files for its language shows the
others in English.

A snippet loaded into an open page (a popup from `CRM.loadForm()`, a tab or a
dashlet loaded by AJAX) cannot bring a module: core's jQuery inserts its
`<script type="module">` without running it, and the page head with the import
map is already written. The extension adds both calls above for the outer
page instead, for instance in `hook_civicrm_pageRun` of the contact summary,
and its module defines a custom element that mounts wherever the snippet's
markup puts it, as afreact's own `<afreact-form>` does:

```js
customElements.define("segment-builder", class extends HTMLElement {
  connectedCallback() {
    this.root = createRoot(this);
    this.root.render(<QueryClientProvider client={queryClient}><Segments /></QueryClientProvider>);
  }
  disconnectedCallback() {
    this.root.unmount();
  }
});
```

## Modules

| Import | Content | Alias for |
|---|---|---|
| `afreact/react.js` | React's exports, default included | `react` |
| `afreact/react-dom.js` | `createPortal`, `flushSync` and React DOM's other exports | `react-dom` |
| `afreact/react-dom-client.js` | `createRoot`, `hydrateRoot`, `version` | `react-dom/client` |
| `afreact/jsx-runtime.js` | `jsx`, `jsxs`, `Fragment` | `react/jsx-runtime` |
| `afreact/compiler-runtime.js` | `c`, which React Compiler output calls | `react/compiler-runtime` |
| `afreact/react-query.js` | everything `@tanstack/react-query` exports | `@tanstack/react-query` |
| `afreact/kit.js` | afreact's API helpers and components, below | |

The React modules pass on every export of React's production build, the
`unstable_…` ones included, except the internals (`__…`) that only React's
own packages use, which share afreact's React chunk; `src/kit/exports.test.ts`
fails when a React update adds one they miss. The versions are the ones afreact's
`package.json` pins.

`afreact/kit.js` exports:

| Name | What it is |
|---|---|
| `api4(entity, action, params)` | APIv4 through `CRM.api4`; resolves to the rows with `count` and the other result properties |
| `get(entity, { select, where, orderBy, limit })` | typed APIv4 get for core's entities |
| `asRows`, `isApiError`, `errorMessage` | checks an answer is a list of rows; tells an APIv4 error; the message of any rejection |
| `queryClient`, `createQueryClient()` | the page's shared TanStack Query client (no retries, answers stay fresh until invalidated); a fresh one, as tests use |
| `useEntityFields(entity)`, `loadEntityFields(entity)` | an entity's own and custom fields from `getFields`, no joins, as `KitField`s: label, data and input type, options flag, foreign entity, a custom field's group title in `group`; fails when a custom field's group is not found |
| `useFieldOptions(entity)` | the option lists of the entity's fields that have a `:name` suffix, by field name |
| `useRelativeDateFilters()` | the active `relative_date_filters` options (`this.month`, …) as `{ id, text }` |
| `searchOperators()` | SearchKit's operators with their translated labels |
| `FieldPicker` | one field of an entity, custom fields under their group; props `id`, `entity`, `label`, `value` (field name), `onChange(field \| null)`, `hiddenLabel`, `filter` |
| `FieldCondition` | operator and value of a where clause `[name, operator, value]` for a `KitField`, with the input its data type takes: option lists, entity references, dates with core's relative date terms, ranges for `BETWEEN`; props `field`, `clause`, `onChange(clause)`, `label`, `optionKey` (the option suffix a value holds, such as `name` for a clause on `status_id:name`; `id` by default), `invalid` and `describedBy` (set `aria-invalid` and `aria-describedby` on the operator and value inputs). A field whose `options` is a list uses it without asking the server |
| `EntityPicker` | records of one entity through its `autocomplete` action, as core's entity references search them; props `id`, `entity`, `label`, `value` (a list of ids), `onChange(ids)`, `multiple`, `params` (further `autocomplete` parameters such as `filters`), `hiddenLabel`, `invalid` and `describedBy` (set `aria-invalid` and `aria-describedby` on its input) |
| `Picker` | a combobox over a fixed list of `PickerOption`s, single or several, with optgroups; props `id`, `label`, `placeholder`, `options`, `value`, `onChange`, `single`, `className`, `hiddenLabel`, `externalLabel`, `clearable`, `openOnMount`, `disabled`, `invalid` and `describedBy` (set `aria-invalid` and `aria-describedby` on its input) |
| `Dialog` | a native modal dialog with title, body and Cancel; props `title`, `buttons`, `onClose`, `wide`, `className` |
| `ConfirmDialog` | a confirmation with Cancel and one confirm button |
| `Notice` | CiviCRM's message box; `type` `info`, `status`, `success`, `warning` or `error`, an error announced at once |
| `CountBadge` | a count in a badge; `count` (`null` while counting), `label` naming what is counted for screen readers; it announces nothing itself, so a count that changes in view sits in a live region such as `<p role="status">` |
| `Select` | a native select over a short fixed list, where typing to search would only be in the way (an operator, "all of / any of", a date field); props `id`, `label`, `hiddenLabel`, `options` (`PickerOption`s: `id`, `label`, `group` for an optgroup), `value` (an option's id or `null`), `onChange(id \| null)` with the option's own id, `placeholder` (a first, empty choice that hands back `null`), `className`, `disabled`, `invalid` and `describedBy` |
| `QuantityInput` | how many: an operator ("at least", "at most", "exactly") and a whole number of 0 or more; props `id` (the box; the operator is `<id>-op`), `value` (`Quantity`: `{ op: ">=" \| "<=" \| "=", n: number \| null }`), `onChange(value, { invalid })`, `operatorLabel`, `numberLabel`, `hiddenLabel`, `operatorText` (the operators' texts by op), `invalid` and `describedBy` (on both inputs). An empty box reports `n: null`, text that is no whole number (`1.5`, `-1`) `n: null` with `invalid: true` and stays in the box marked `aria-invalid`; it is never turned into 0 |
| `ConditionGroup` | a fieldset of conditions whose first line says how they combine, "Match [all of] these conditions"; props `id` (the select), `legend`, `op` (`"AND"` or `"OR"`), `onOpChange(op)`, `opLabel` (names the select), `before` and `after` (the sentence around the select, so the caller sets the word order of its language), `opText` (the operators' texts by op; "all of" and "any of" by default), `children` (the conditions), `add` and `remove` (slots for the controls below them), `className`, `invalid` and `describedBy` |
| `StepCounts` | how many remain after each step, in a polite live region; props `label` (names the list), `steps` (`Step`: `key`, `label`, `count`, `error`), `countLabel` (what is counted, for `CountBadge`), `busy` (`aria-busy` on the region; a step without a count shows a spinner instead of "Not counted"), `error` (the whole request failed: shown as an error notice), `onRetry` (a "Try again" button with any error) |

Types: `KitField`, `ConditionField`, `Operator`, `DateRange`, `FieldOption`,
`PickerOption`, `NoticeType`, `ApiResult`, `ApiError`, `Quantity`, `QuantityOp`,
`GroupOp`, `Step`.

`Picker` and `Select` both take `PickerOption`s. `Picker` filters as the user
types, which pays off from about ten options (record types, relative dates);
`Select` is the browser's own select for a handful.

Tables are SearchKit displays. A column whose value only PHP can compute per
row, such as whether a saved search can be read back into a builder, becomes an
APIv4 field of type `Extra` with an output formatter, added by the entity's spec
provider: `setColumnName()` names the column the formatter receives,
`addOutputFormatter()` turns it into the value. Core's `FileGetSpecProvider` adds
`File.url` and `File.content` this way. A display then shows the field like any
other.

A display's row links are named for screen readers by their SearchKit link
`title` where it differs from the link text, so a title with the row's tokens
("Edit [label]") tells the rows' "Edit" links apart; a link without a title is
named by its text.

The components use CiviCRM's classes and the global `ts()`, so they belong on
CiviCRM pages; a module wraps its root in
`<QueryClientProvider client={queryClient}>` so its queries share the cache
with afreact's elements.

## Building a consumer

The consumer's build leaves the shared packages out and rewrites their names
to the kit's modules. With Vite:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SHARED: Record<string, string> = {
  react: "afreact/react.js",
  "react-dom": "afreact/react-dom.js",
  "react-dom/client": "afreact/react-dom-client.js",
  "react/jsx-runtime": "afreact/jsx-runtime.js",
  "react/compiler-runtime": "afreact/compiler-runtime.js",
  "@tanstack/react-query": "afreact/react-query.js",
};

export default defineConfig({
  plugins: [react({ compiler: true })],
  base: "./",
  build: {
    rolldownOptions: {
      input: { segments: "src/main.tsx" },
      external: [...Object.keys(SHARED), /^afreact\//],
      output: { entryFileNames: "[name].js", paths: SHARED },
    },
  },
});
```

The source imports `react` and `@tanstack/react-query` as usual and
`afreact/kit.js` for the rest. For the types, the consumer installs
`@types/react`, `@types/react-dom` and `@tanstack/react-query` in afreact's
versions as development dependencies and points the prefix at a built afreact
checkout:

```json
{ "compilerOptions": { "paths": { "afreact/*": ["../afreact/dist/kit/*"] } } }
```

`bun run build` writes `dist/kit/<module>.d.ts` beside each module, and the
declarations they point to under `dist/kit/types/`. They also declare the
global `ts()` and `window.CRM` as afreact uses them.

## Stability

The kit follows semantic versioning on afreact's version. While afreact is
alpha (0.x), a breaking change raises the minor version and anything else the
patch version; from 1.0 on, the major and minor. Breaking means an export
removed or renamed, a prop or parameter changed in meaning, a React or TanStack
Query major update, or a module renamed under `afreact/`. What `afreact/kit.js` does not
export is internal, also when it is reachable under `dist/`.

The kit's modules keep fixed names and carry core's cache code in the import
map, as afreact's own entries do; the chunks they load are named by content
hash. The cache flush an upgrade ends with renews the code, so browsers fetch
the new modules and never ask for a chunk the build removed.
