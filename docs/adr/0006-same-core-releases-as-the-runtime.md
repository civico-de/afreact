# 6. Builders support the same core releases as the runtime

Status: accepted

## Context

Sites run different CiviCRM releases side by side and upgrade on their own
schedule; core ships a minor release a month.

## Decision

Runtime and builders support the same floor, pinned in info.xml, and every
release after it. Differences come from what the running core's server
reports; where nothing reports them, a version check names its upstream
change and goes once the floor passes it. [builders.md](../builders.md), "Core versions",
describes the test runs.

## Consequences

- Each supported minor adds a weekly test run.
- A core newer than a release covers shows notices for what React does not know.
