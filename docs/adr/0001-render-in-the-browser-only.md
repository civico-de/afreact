# 1. Change only the browser side

Status: accepted

## Context

FormBuilder and SearchKit draw their screens with AngularJS, which is no
longer developed. Their server side (APIv4 actions, permissions, the stored
form and search definitions) is sound and shared with everything else in
CiviCRM.

## Decision

afreact replaces only what runs in the browser. Forms and displays are read
and saved through core's own APIv4 actions, permission checks stay core's,
and the stored records keep core's format. The one server addition,
`Afreact.getForm`, runs a form's layout through core's own pipeline.

## Consequences

- Switching a form or a builder back to Angular loses nothing; both can run on one site.
- Every core bug on the server stays, and is reported upstream rather than worked around.
- Two renderers of the same records must be compared continuously (parity tests, sweeps).
