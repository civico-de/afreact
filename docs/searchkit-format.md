# The SearchKit format

A SearchKit search is not markup but two configuration records: a saved
search, which is a database query, and one or more displays, which say how its
rows look. Core documents neither as a format; their shape lives in the APIv4
query builder, the server action that runs a display and the admin screens
that write them. This page describes both as a format of their own, says what
the React renderer reads of them and where Angular still reaches in. The form
side is in [afform-markup.md](afform-markup.md).

## Two records

| Record | Holds | Edited in |
|---|---|---|
| `SavedSearch` | the entity searched (`api_entity`) and the query (`api_params`) | the search editor's top half |
| `SearchDisplay` | a type and `settings` | one tab per display |

Core's display types are `table`, `list`, `grid`, `tree` and `batch`, plus
`chart-kit` from the Chart Kit extension; extensions add more. Two further
core types never reach the browser as a display: `autocomplete` sets what a
reference field's search box finds, and `entity` writes the results into a
database table of their own.

A search has any number of displays; a display belongs to one search. Both
are ordinary APIv4 entities, so an extension can ship them as managed records
(`.mgd.php`), as the demo fixture in `.docker/fixtures/afreactdemo/` does.

## The query

`api_params` is the parameter set of an APIv4 `get` call, stored as JSON:

| Key | Meaning |
|---|---|
| `select` | the columns: field names, function expressions, and `AS` aliases for the latter |
| `where` | conditions as `[field, operator, value]`, nested groups as `["OR", [...]]` |
| `join` | further entities, see below |
| `groupBy` | fields to group by; every other selected field then needs an aggregate function |
| `having` | conditions on the grouped result, same shape as `where` |
| `orderBy` | a default order; the display's `sort` usually overrides it |

**Field names** are paths. `contact_id.sort_name` follows a reference to the
contact and reads its name. A suffix picks a form of an option value:
`status_id:label` gives the label, `:name` the machine name. Custom fields
are `<GroupName>.<FieldName>`. The same names appear in the display
settings, as column keys, in links and in text templates.

**Joins** add a further entity under an alias:
`["Email AS Contact_Email_contact_id_01", "LEFT", ["id", "=", "Contact_Email_contact_id_01.contact_id"]]`.
The second element is the join type: `LEFT` keeps rows without a match,
`INNER` drops them, `EXCLUDE` keeps only rows without one. Fields of the
joined entity are named through the alias
(`Contact_Email_contact_id_01.email`). The search editor builds the alias
from the entities and the linking field and numbers repeats; a search written
by hand may use any alias.

**Functions** are written as SQL-like expressions with an alias:
`COUNT(id) AS COUNT_id`, `GROUP_CONCAT(DISTINCT Contact_Email_contact_id_01.email) AS emails`.
The alias is the column's name for the display.

## The display settings

Settings common to every display type:

| Setting | Meaning |
|---|---|
| `columns` | the list of columns, see below |
| `limit`, `pager` | page size; pager with `show_count`, `hide_single`, `expose_limit` |
| `sort` | default order as `[field, "ASC" or "DESC"]` pairs |
| `actions` | bulk actions offered for selected rows: `true` for all, or a list of names |
| `toolbar` | buttons above the display, usually "add new" links |
| `cssRules` | row styles: `[class, field, operator, value]`, the class applies where the condition holds |
| `noResultsText`, `placeholder`, `description` | the text when nothing is found, loading placeholder rows, an intro text |

Then each type adds its own: a table's `classes`, `tally` (totals row),
`hierarchical`, `collapsible` and `toggleColumns`, and with the tree its
`draggable` (the weight field rows are reordered by) and `editableRow` (a row
for adding records, or for editing whole rows at once); a list's `style` and
`symbol`; a grid's `colno`; a tree's `parent_field`; the chart types' axes and
series.

**Columns** have a `type`:

| Type | Shows |
|---|---|
| `field` | a selected value, optionally linked, rewritten, editable in place, with icons |
| `html` | the same, but the rewritten text is HTML |
| `image` | an image from a URL field or a rewrite |
| `links`, `buttons`, `menu` | a set of links, as a list, as buttons or as a dropdown |
| `subsearch` | another display, filtered by the row's values |
| `include` | an Angular template by path; core uses it only for FormBuilder's placement column |

**Links** name a target in one of three ways: an `entity` with an `action`
(`view`, `update`, `delete`, …), which the server turns into the entity's
own path; a literal `path`; or a `task`, which opens a bulk action for the
single row. `join` makes the link refer to a joined entity. `conditions`
hide a link where they do not hold.

**Text templates.** Most texts of a column take field names in square
brackets: its `rewrite`, `empty_value`, `label` and `title`, an image's `alt`,
and a link's `text`, `title` and `path` (the last filled URL-encoded):
`[contact_id.display_name] ([status_id:label])`. A `rewrite` alone may also
hold Smarty, which the server evaluates: `{if $is_deceased}†{/if}`.

## Running a display

The browser never runs the query itself. It calls `SearchDisplay.run` with the
search and display name, the page, the sort and any filters. The server
applies the display's permissions, runs the query and formats each cell:
values become text, templates are filled in, links get their URLs and are
dropped where the user may not follow them, `cssRules` become classes, icons
and colours are resolved. The result is a list of rows, each with a key and
one formatted cell per column, plus the toolbar and, for editable columns,
what each one may edit.

A renderer therefore lays out finished cells. It decides nothing about
permissions, formatting or URLs, which is why two renderers show the same
values.

## How a form places a display

A FormBuilder form embeds a display as an element named after its type:
`<crm-search-display-table search-name="…" display-name="…">`. A `filters`
attribute adds fixed conditions, written as an Angular expression; filter
fields in a surrounding search fieldset add the conditions the user types.
Both are merged and passed to `SearchDisplay.run`, which adds them to the
saved search's conditions.

## Where Angular remains

SearchKit lets extensions bring their own browser code in three places, and
all three are Angular:

- **display types**: an extension's type is an Angular component;
- **`include` columns**: an Angular template by path;
- **bulk actions with their own dialog**, such as a download in a special
  format.

The React renderer cannot show these and names them in a note instead. The
React search editor runs an extension's display editor as an Angular island
where the extension ships no React element (see
[comparison-builders.md](comparison-builders.md)).

## What the React renderer reads

Everything above except the three Angular parts. The renderer's view of the
settings is typed in `src/search/types.ts`; the React display editor's list of
the settings it can edit is `src/admin/search/display/knownSettings.ts`. A
setting outside that list shows a note in the editor and is saved back
unchanged.

## What would make a second renderer easy

- **A schema for the settings.** Each display type's settings exist only as
  what its Angular editor writes. A published JSON schema per type would
  let any renderer and any editor check a display before running it.
- **Filters as data.** The `filters` attribute is an Angular expression; a
  JSON object would need no expression parser.
- **Extension points without Angular.** Display types, `include` columns and
  task dialogs could take a custom element name, as afreact's own builders
  do for their panels.
