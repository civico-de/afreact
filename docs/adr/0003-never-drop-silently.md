# 3. Never drop what cannot be shown

Status: accepted

## Context

A form or display may use something React does not support: an
extension's Angular directive, an unknown field type, a setting from a newer
core. Leaving it out would show a form that looks complete but is not.

## Decision

Whatever the renderer cannot draw is replaced by a visible note naming it,
and the support report lists such forms before anyone switches them over. In
the builders, a part React cannot edit gets a notice and is saved back
unchanged, with a link to the classic builder.

## Consequences

- No silent data loss, at the cost of visible notes on forms that use unsupported parts.
- On a supported core with only core's extensions, any note is treated as a bug.
