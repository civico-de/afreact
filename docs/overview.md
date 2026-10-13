# afreact in plain words

This page is for people who use or run CiviCRM and want to know what afreact
does for them. It leaves out the technical detail; the other documents in this
folder carry it.

## What it is

CiviCRM has two tools for building screens without programming. FormBuilder
makes forms: a sign-up form, a contact edit form, a tab on the contact
summary. SearchKit makes lists and tables: members, open donations, a report
with totals. Both draw their screens with a browser technology called
Angular, which is old and no longer developed.

afreact draws the same forms and tables with React, a current technology. It
does not change what is stored, who may see what, or how a form is built. A
form made in FormBuilder stays the same form; afreact only changes how it
appears and behaves in the browser. Switching a form over, or back, takes one
setting and loses nothing.

afreact also rebuilds the two building tools themselves: the SearchKit editor
and the FormBuilder editor. They save exactly the same records as the
originals, so a search or form can be edited in either one.

## What users notice

Mostly nothing, which is the point: the forms and tables look the same,
because they use the same page structure and the same theme. Where people do
notice a difference, it is meant to be an improvement:

- **Screen readers and keyboards work properly.** Fields are named and
  grouped, tabs and lists can be used with the arrow keys, rows can be
  reordered from the keyboard, and the screen reader hears when a search has
  finished and how many results it found.
- **Mistakes are explained where they happen.** A form that cannot be sent
  lists every field that needs attention and says under each field what is
  wrong, instead of pointing at the first one only.
- **Less is lost by accident.** Removing a repeated block can be undone.
  Values typed while a form is still loading are kept. Choosing an existing
  contact keeps what was already typed for its emails or phones.
- **Tables feel faster.** While the next page loads, the current rows stay
  visible instead of turning into grey placeholders, and a page starts loading
  as soon as the pointer reaches its link.
- **The editors are easier to work with.** The FormBuilder palette shows what
  each field does before it is added, drag and drop works with the keyboard,
  and removing an entity first asks when other parts of the form still use it.

The full list, with the original behaviour next to the new one, is in
[comparison.md](comparison.md) for forms and tables and in
[comparison-builders.md](comparison-builders.md) for the editors.

## Faults in CiviCRM it does not copy

Rebuilding the screens meant reading CiviCRM's own code line by line, and
that turned up well over a hundred faults in the original. Some of them:

- values typed by the user overwritten when the page address changes;
- a saved filter with the value "No" or "0" silently ignored;
- a right-hand icon in a table shown only in the first column;
- required fields that can be sent empty;
- a style setting with a web address in it cut short when saved.

afreact does the correct thing in each case, and each fault is listed, with
what afreact does instead, in [upstream-bugs.md](upstream-bugs.md). The list
can be passed on to the CiviCRM project.

## What it cannot do yet

afreact refuses rather than guesses. When a form uses something it cannot
draw, it shows a visible note naming that part, and the support report lists
such forms before anyone switches them over. The main gaps:

- forms that contain hand-written Angular code beyond plain text and
  translations;
- field types and page elements that other extensions add in Angular;
- bulk actions whose dialog another extension provides in Angular;
- a few rarely used settings in the batch entry and chart displays.

In the editors, a setting afreact cannot edit is kept and saved back
unchanged, with a link to the original editor. When another extension brings its
own Angular editor for a display type, such as the chart editor, afreact runs
just that editor in Angular inside the React page, so it stays usable. The complete list is under
"Not implemented" in [comparison.md](comparison.md).

## Switching it on and off

Two administration pages control it. They have no menu entry yet; open them
by their address on the site:

1. **React renderer support** (civicrm/admin/afreact): lists every form and
   says whether afreact can draw it. One button switches over every form it
   can.
2. **React renderer settings** (civicrm/admin/setting/afreact): "Forms
   rendered with React" lists the forms afreact draws, "Builders opened with
   React" decides whether the React editors replace the original SearchKit
   and FormBuilder editors.

A form taken off the list is drawn by the original again at once, in every
place it appears: its own page, contact tabs, dashboard and popups. When the
React editors are switched on, the originals stay reachable under the same
address with "/classic" added.

## Status

afreact is in alpha. It covers forms with blocks, repeated sections,
conditions, drafts and payment; tables, lists, grids, trees, batch entry and
charts with filters, in-place editing and bulk actions. It is tested
automatically against both the oldest and the newest supported CiviCRM
release, and every form on a test site is compared screen by screen with the
original.

## Further reading

| Document | For whom |
|---|---|
| [comparison.md](comparison.md), [comparison-builders.md](comparison-builders.md) | anyone checking a specific difference |
| [upstream-bugs.md](upstream-bugs.md) | CiviCRM developers |
| [reference.md](reference.md) | administrators and developers integrating afreact |
| [architecture.md](architecture.md), [testing.md](testing.md) | developers working on afreact |
