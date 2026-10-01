# CLAUDE.md — afreact

## Core bugs are not replicated

The React renderer matches core's Angular runtime in behaviour, except where
that behaviour is a bug. When core is wrong (lost or overwritten values, wrong
filters, unescaped output, crashes), React does the correct thing:

- List the bug in `docs/comparison.md` under "Upstream bugs found on the way",
  with what React does instead.
- Tests assert the correct behaviour. Where a parity spec compares React with
  Angular, it states the deviation and why, rather than expecting the bug.
- "For parity" is no reason to keep a known defect.
