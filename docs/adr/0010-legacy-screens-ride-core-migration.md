# 10. Legacy screens reach React through core's own migration

Status: accepted

## Context

Moving CiviCRM's Smarty/QuickForm screens towards React should not depend on
getting UI replacements merged into civicrm-core, which is slow and uncertain.
A broad takeover of legacy screens in an own extension was weighed and judged
worse: every taken-over screen moves its maintenance from core to us, logic
that lives only in a form's `postProcess` has to be rebuilt (e.g.
`CRM_Admin_Form_Job` clears the next run for a past date, `Job.save` does not),
and other extensions' QuickForm hooks stop firing on that screen.

## Decision

afreact renders whatever core moves to Afform and SearchKit, with no core
change needed. A single legacy screen is taken over with an own Afform only
when a concrete user problem is shown, the screen is simple and no deployed
extension hooks it.

## Consequences

- React coverage grows with core's own Afform migration.
- Each takeover is a separate decision with its user problem on record.
