# Update business context (#258)

**Purpose:** Give developers and coding agents the accepted goals and constraints for resident and runtime-hook updates.
**Status:** Accepted business context; feature specification is owned by issue #258.
**Authority:** Accepted product contract for these outcomes, from owner decisions on 2026-10-08; not implementation or validation evidence.
**Expected use:** Guide #258 design, implementation, review, and check selection. This is internal context, not customer installation instructions.
**Lifecycle:** Maintain with accepted update-goal decisions. Review when resident or hook update scope, warning behavior, or technical constraints change; keep implementation evidence in its own owners.

## Update scopes

A **resident update** is initiated for the shared resident and naturally affects
all callers of that resident. A **runtime-hook update** targets the selected
runtime's integration: updating Codex hooks changes Codex hooks, without breaking
other runtime integrations or requiring them to reinstall. These are distinct
scopes; a runtime-hook update does not implicitly request a resident update.

## Business goals

| Goal | Required outcome |
| --- | --- |
| Make intended fixes available | The selected resident build is serving, or its pending/unavailable state is explicit. Equal package versions do not prove equal builds. |
| Avoid repeated setup | A release with no hook-facing changes leaves installed hook definitions unchanged and requires no hook reinstall or renewed native trust. |
| Give agents actionable update guidance | Ordinary hook/resident communication identifies actual incompatibility so capable hooks can guide the agent to update. Compatible deprecated hooks work silently. |
| Avoid distracting reminders | Each agent, including reliably identified subagents, has an independent ten-minute warning budget shared across hook events. Bounded resident-memory state may reset on resident restart. |
| Keep hook updates scoped | Updating one runtime's hooks leaves other runtimes' hook installations working and requires no reinstall from them. |

## Correctness and technical constraints

[Correctness and transient work loss](advicing-target-contract.md#correctness-and-transient-work-loss)
owns the general business principle: losing transient work in corner cases is
acceptable while correctness remains intact. Lossless updates, durable replay,
and seamless state transfer are not goals of this feature.

Simplicity, development experience, check performance, and bounded hook overhead
are technical goals and constraints. Choose the smallest design that satisfies
the accepted outcomes. Use deterministic focused checks for policy and timing,
and real installed consumers for the affected installation/process boundaries,
following [CHECKS.md](../CHECKS.md) and the [testing matrix](testing-matrix.md).

Published installed updates are required. Development updates are optional only
when they naturally share the same simple design. Journal build/version identity
is optional best-effort enrichment of already-available information; no new
inspection infrastructure is required.

[Issue #258](https://github.com/dearlordylord/hapsland/issues/258) owns the feature
specification: independent selections, explicit actual compatibility, bounded
replacement outcomes, and no automatic rollback. Replacement mechanics remain
an implementation choice; the normal automatic inactivity-retirement contract
remains separately scoped. This context is not evidence of shipped behavior.
