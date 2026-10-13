# 5. The builders live in afreact

Status: accepted

## Context

The React builders need the runtime's displays for previews, its
comboboxes, field inputs and API types.

## Decision

The builders are a second bundle (`afreact-admin.js`) in the same
extension, loaded only on builder pages. A separate extension would have to
copy or re-export the runtime's parts.

## Consequences

- One release carries runtime and builders; the runtime bundle does not grow.
- The repository is larger; the build checks that no chunk imports an entry.
