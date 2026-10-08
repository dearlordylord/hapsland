# Declaration-extraction deferred work

**Audience:** Contributors, including coding agents working on declaration extraction; Product and specification owners.

## Re-reviewing unchanged dependents

Discussion decision: 2026-09-20.

The initial extraction experiment targets added or directly changed declarations.
Reviewing an unchanged declaration because a referenced type or schema changed is
deferred unless investigation establishes a deterministic, reliable approach that
requires little implementation effort. This capability must not become a prerequisite
for the initial experiment or expand into a substantial dependency-tracking project.

For example, changing `Status` could affect an unchanged `Operation` that references
it. The initial experiment need not discover and re-review `Operation` automatically.

This deferral concerns selecting additional review targets. It does not defer the
bounded collection of referenced types and schemas as context for a directly changed
review target.

Revisit only when tooling evidence demonstrates that affected declarations can be
identified reliably and deterministically within the supported scope at low effort.
Until then, this remains deferred work, not a coverage guarantee.
