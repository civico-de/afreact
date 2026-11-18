---
title: afreact
---

# afreact

![afreact: FormBuilder forms, SearchKit displays and both editors drawn with React, on the same data and permissions](images/cover.png)

> **Status: alpha.** Settings and behaviour can still change between releases. Try it on a test site before you use it in production.

CiviCRM has two tools for building screens without programming. FormBuilder makes forms, such as a sign-up form, a contact edit form or a tab on the contact summary. SearchKit makes lists and tables, such as members, open donations or a report with totals. Both draw their screens with AngularJS, a browser technology that is no longer developed.

afreact draws the same forms and tables with React. It does not change what is stored, who may see what, or how a form is built: a form made in FormBuilder stays the same form, and only how it appears and behaves in the browser changes. Each form is switched over on its own, and back, with one setting.

afreact also rebuilds the two editors, the SearchKit editor and the FormBuilder editor. They save exactly the same records as the originals, so a search or a form can be edited in either one.

## What users notice

Mostly nothing: forms and tables use the same page structure and the same theme. Where people do notice a difference, it is meant as an improvement:

- **Screen readers and keyboards work.** Fields are named and grouped, tabs and lists work with the arrow keys, rows can be reordered from the keyboard, and screen reader users hear when a search has finished and how many results it found.
- **Mistakes are explained where they happen.** A form that cannot be sent lists every field that needs attention and says under each field what is wrong.
- **Less is lost by accident.** Removing a repeated block can be undone, and values typed while a form is still loading are kept.
- **Tables stay visible.** While the next page loads, the current rows stay on screen instead of turning into grey placeholders.
- **The editors are easier to use.** The FormBuilder palette shows what a field does before it is added, drag and drop works with the keyboard, and removing an entity asks first when other parts of the form still use it.

While rebuilding the screens, well over a hundred faults in CiviCRM's own screens turned up. afreact does the correct thing instead of copying them.

## Requirements

afreact needs FormBuilder and SearchKit, which ship with CiviCRM. The React FormBuilder editor is offered only where FormBuilder's own editor (afform_admin) is enabled. The supported CiviCRM and PHP versions are listed in the extension's `info.xml`.

## Install

Download the release archive from the [releases page](https://github.com/civico-de/afreact/releases), unpack it into your CiviCRM extensions directory and enable it:

```bash
cv ext:enable afreact
```

Nothing changes yet: every form stays with Angular until you switch it over, see [Switching forms over](switching.md).

## Permissions

afreact adds no permissions of its own. Its two administration pages need **administer CiviCRM**. A form drawn with React keeps the permissions set in FormBuilder, and the React editors need the same permissions as the originals.
