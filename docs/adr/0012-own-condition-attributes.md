# 12. Conditions core cannot express go into afreact's own attributes

Status: accepted

## Context

Core's conditions name every value by an absolute row index, such as
`Entity1[0][joins][Block][0][type]`. Inside `af-repeat` the markup is one
template for all rows, so a condition cannot refer to a field of its own row.
Its server side reads the comparison value as a literal only, so comparing two
fields is not reliable either.

`af-if`, `af-required` and `af-disabled` cannot take a richer syntax: core
decodes them as JSON on the server and in the browser, and a value it cannot
read either fails the submit or is evaluated against the wrong row.

civicrm-core master moves conditions to tokens such as
`[Individual1.0.first_name]`. A full expression language (as civicrm-core PR
36708 drafts) would need one parser in TypeScript and one in PHP that agree on
every input.

## Decision

afreact reads three attributes of its own beside core's: `afreact-if`,
`afreact-required` and `afreact-disabled`. Their value is a condition list in
core's JSON form (clauses `[value, operator, value]`, groups `AND`, `OR`,
`NOT`), where values are master's tokens with two additions:

- `@` in place of a row index is the row of that `af-repeat` the element is
  drawn in: `[Individual1.0.Email.@.location_type_id]`.
- A token is read on both sides of a clause, so a field can be compared with
  another field. Any other value is a literal.

Tokens resolve to values first; the comparison is the browser's evaluator in
`src/afform/conditions.ts`, which the server repeats in `RowComparison` rather
than core's looser `compareValues()`, so `2` and `"2"` differ on both sides.
Both read the values the browser sent, before core merges an entity's or
join's `data` into them. An extra field's conditions read the row it is drawn in,
and its value counts where the browser keeps it; `afreact-disabled` has nothing
to keep out of one, since core saves no extra field. An element shows only when its
`af-if` and its `afreact-if` both hold; it is required when core requires it or
its `afreact-required` holds while it shows and is not disabled.

On submit, a `civi.afform.validate` listener evaluates the same attributes for
every submitted row and reports a field that `afreact-required` requires and
the submission leaves empty, with core's message "%1 is a required field."
Like core with `af-disabled`, a disabled field is exempt and its value is not
saved where it shows. `afreact-disabled` does not lift a requirement core makes
itself (`required` or `af-required`): core still rejects such a field empty. The builder reads a required or disabled rule set in both
core's and afreact's attribute as either of the two, as the runtime applies it.

## Consequences

- Core and Angular ignore the attributes: under Angular such an element always
  shows and is never required by them. The support report marks a form that
  uses them as needing React.
- A field hidden by `afreact-if` that core itself requires is still demanded by
  core's submit. The support report flags that combination.
- The React builder's condition editor offers "this row" for fields of the
  repeat an element sits in and a field as comparison value, and writes the
  afreact attribute only when a condition uses either.
- Should core gain row-relative conditions, the builder can move the attributes
  to core's syntax, and this decision is superseded.
