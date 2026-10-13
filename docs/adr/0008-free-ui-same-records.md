# 8. The builders' screens may differ; what they save may not

Status: accepted

## Context

Copying core's builder screens one to one would copy their awkward flows
and accessibility gaps.

## Decision

The React builders save exactly what core's builders save, through the same
API calls, but their layout and flow are free. Accessibility, core's
permissions and the warnings that prevent data loss stay.

## Consequences

- Records can be edited in either builder.
- Every improvement and difference is listed in [comparison-builders.md](../comparison-builders.md).
