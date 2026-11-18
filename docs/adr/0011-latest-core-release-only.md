# 11. Support the latest core release only

Status: accepted

## Context

Core ships a minor release a month, and each one changes Afform and SearchKit
markup, metadata and fixes that React mirrors. Supporting several minors at
once means version checks in the code, parity specs that work around old core
bugs and a weekly test run per minor.

## Decision

Each afreact release supports the latest CiviCRM release only; the floor in
info.xml is that minor. A version check exists only for the next minor and
goes once the floor reaches it. [builders.md](../builders.md), "Core versions",
describes the test runs.

## Consequences

- Sites upgrade core before they take a newer afreact.
- Raising the floor removes the checks and workarounds for the old minor in
  the same change.
- Supersedes the version span of [ADR 0006](0006-same-core-releases-as-the-runtime.md);
  runtime and builders still share one floor.
