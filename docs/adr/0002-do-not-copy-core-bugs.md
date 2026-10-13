# 2. Do not reproduce core's bugs

Status: accepted

## Context

Rebuilding core's screens line by line turns up behaviour that is plainly
wrong: values lost or overwritten, wrong filters, unescaped output,
inaccessible controls. Exact parity would mean rebuilding those faults.

## Decision

Where core is wrong, React does the correct thing. Each such case is listed
in [upstream-bugs.md](../upstream-bugs.md) with what React does instead, and carries a
`deviation:<slug>` marker in the docs, at the code and at the test, which a
unit test keeps in step.

## Consequences

- Parity tests state each deviation instead of expecting the bug.
- The list is a ready bug report for core.
- A user switching a form over may notice a behaviour change; the docs name it.
