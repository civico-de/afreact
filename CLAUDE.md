# CLAUDE.md — afreact

## Core bugs are not replicated

The React renderer matches core's Angular runtime in behaviour, except where
that behaviour is a bug. When core is wrong (lost or overwritten values, wrong
filters, unescaped output, crashes), React does the correct thing:

- List the bug in `docs/upstream-bugs.md` under its area, with what React does
  instead.
- Tests assert the correct behaviour. Where a parity spec compares React with
  Angular, it states the deviation and why, rather than expecting the bug.
- "For parity" is no reason to keep a known defect.

## Improvements over core are marked

Where React does better than core without core being wrong (interaction,
accessibility, feedback before an action instead of after it), the change is
listed under "Improvements over core" in `docs/comparison.md` (renderer) or
`docs/comparison-builders.md` (builders): what core does, what React does, and
the test that pins it. Neutral differences stay under "Differences by design";
core bugs go to `docs/upstream-bugs.md`.

## Deviations from core carry a marker

Every documented deviation (a bug fix, an improvement or a difference by
design) ends with a code span `` `deviation:<slug>` `` in its doc entry. The
same marker sits in a comment at the code that deviates and at the test that
pins it, so `grep -rn deviation:<slug>` finds all three when core changes.
`src/deviations.test.ts` fails on a slug that is missing from the code, the
tests or the docs, or that the docs name twice.
