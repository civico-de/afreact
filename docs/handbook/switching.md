---
title: Switching forms over
order: 10
routes:
  - civicrm/admin/afreact
  - civicrm/admin/setting/afreact
---

# Switching forms over

Two administration pages control afreact. They have no menu entry; open them by their address on your site.

## The support report

**React renderer support**, at `civicrm/admin/afreact`, lists every form with where it is shown, what draws it now, and anything afreact cannot draw in it. Blocks have no row of their own; they are checked inside the forms that hold them. Each form can be previewed with React and with Angular before it is switched over.

**Render every supported form with React** sets the list to every form without such a note. A form already on the list that has a note goes back to Angular; a form whose check failed keeps its state.

## The settings

**React renderer settings**, at `civicrm/admin/setting/afreact`, has two fields:

| Setting                    | Effect                                                                                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forms rendered with React  | The forms afreact draws: on their own pages, on contact summary tabs and blocks, event management tabs, case summary blocks, the contact actions popup and dashboard dashlets. All other forms stay with Angular. |
| Builders opened with React | The editors whose links open the React editor. The original editor stays reachable at its own address with `/classic` added.                                                                                      |

A form taken off the list is drawn by Angular again at once, everywhere it appears. Only the preview on the support report still shows it with React. Note that conditional rules created in the React FormBuilder editor using "this row" or "Compare with a field" (`afreact-if`, `afreact-required`, `afreact-disabled`) are only evaluated by afreact and are ignored if the form is switched back to Angular.

## What afreact does not draw

afreact refuses rather than guesses. When a form uses something it cannot draw, the form shows a note that names that part, and the support report lists the form before anyone switches it over. This applies to:

- forms with hand-written Angular code beyond plain text and translations;
- field types and page elements that other extensions add in Angular;
- bulk actions whose dialog another extension provides in Angular;
- a few rarely used settings of the batch entry and chart displays.

In the React editors, a setting they cannot edit is kept and saved back unchanged. An editor that another extension brings in Angular for its own display type runs in Angular inside the React page.
