# 9. Run checkout templates as Angular islands

Status: accepted

## Context

A payment processor's checkout option can bring its own Angular partial:
card fields from the processor's script, a wallet button that submits the
form itself, a widget mounted from the submit's response. Each one reads
afCheckoutBlock's and afForm's controllers and listens to afForm's events.
Rewriting them in React would mean code for each processor, in afreact, for
modules afreact does not own.

## Decision

React runs an option's template unchanged as an Angular island, with the
mechanics of the builders' islands ([ADR 7](0007-fallback-per-page-and-angular-islands.md)).
Stand-ins for the two controllers read React's state live and send the
template's details and its submit back. The island's modules load through
core's asset builder once an option with a template is chosen, never before.
afForm's events start on `af-form`, and the submit button keeps its
`ng-click` attribute, so processors find what they look for.

## Consequences

- Processors with their own templates work with the React renderer without
  any code for them in afreact.
- The first choice of such an option fetches about 41 kB (encoded) and
  shows the template after about a third of a second on localhost; every page
  with such an option carries 1.9 kB of asset URLs and settings, and the
  renderer 2.8 kB more for every page
  ([load-metrics.md](../load-metrics.md#checkout-templates)). AngularJS
  itself is on every CiviCRM page already.
- Each choice of option boots a fresh island, so a processor's services do
  not outlive a change of option.
- A template that needs more of afForm than its submit, its validity and its
  events would need the stand-in extended.
