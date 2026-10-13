# 4. Native controls and few libraries

Status: accepted

## Context

core's Angular forms rely on select2, the jQuery UI datepicker and jQuery UI
sortable. These are heavy, partly inaccessible (sortable has no keyboard
support) and tie the page to jQuery. The builders add further needs: pickers,
a code editor, rich text, icons and undo.

## Decision

afreact uses the browser's own controls where they suffice (select, date
input, dialog, popover) and three small headless libraries where they do not:
Downshift for comboboxes, dnd-kit for drag and drop with keyboard support,
nuqs for state in the URL. All of them render core's markup and classes.

The builders add no runtime package: they use these three and what core
already ships (Monaco, `CRM.wysiwyg`, the icon list). A list virtualiser
would be added only if a measurement shows a slow list.

## Alternatives considered

A full widget library (React Aria; Zag, Ariakit, Radix and Headless UI
compared alongside) for tabs, menus, the combobox and dates. Measured in
October 2026, React Aria's tabs, menu and combobox each weighed more than our
own code or Downshift and added no behaviour these widgets need; only its
date field closes a visible gap. Its checkboxes, radios and select hide the
native element, so the site theme would no longer style them, and its press
handling stops click propagation that core's delegated handlers rely on. A date
field built on React Aria remains the one candidate, loaded only on forms
with a date field.

## Consequences

- The site theme styles React forms as it styles Angular ones.
- Some widgets look slightly different (a native date input instead of the datepicker); these are listed as differences by design.
- No library covers Afform and SearchKit semantics; that code is our own, as are a few small pieces (an MD5, a parser for Angular literals), each with tests of its own.
