# 7. Fall back per page; run foreign display editors as islands

Status: accepted

## Context

React cannot build every editor other extensions add to core's builders,
and some sites depend on them.

## Decision

core's builders stay installed and reachable at their own routes. React
opens a record, names any part it cannot edit, saves that part back unchanged
and links the classic builder. A display type editor written in Angular by
another extension runs as an Angular island inside the React page. Other
Angular changes to the builders (decorators, config blocks, ChangeSets) are
detected, named, and block saving in React. Extensions can plug in without
Angular through custom elements ([builders.md](../builders.md), "Plugin contract").

## Consequences

- Third-party builder plugins keep working in the classic builder until they adopt the contract.
- An island adds about 1.9 MB to the page that needs it.
