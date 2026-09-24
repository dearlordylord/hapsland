# Project instructions

## Product identity

The repository checkout may still be named `jev`, but the product is **Hapsland**.
**Jev** is TypeSafe's external realtime review/classification tool that Hapsland uses
to evaluate edits. Refer to the product as **Hapsland**, **the product**, or **the review
integration** when the context is unambiguous.

Keep these terms separate:

- Jev: the external review backend/tool.
- Hapsland: our host-neutral integration and user-configurable review system.
- Agent host: Claude Code, Codex CLI, OpenCode, Kimi Code, Pi, or another runtime that
  owns the tool loop.
- Model provider: secondary metadata about which inference service a host or review
  backend uses. It is not a first-class product target in the current phase.

Hapsland works at the agent-host boundary. Model-provider details matter only when
they change host behavior, authentication/egress, cost, or the Jev backend configuration;
they do not define the adapter set.

Historical filenames beginning with `JEV-` are retained for continuity and do not
change the product name to Jev.

## Effect and Jev integration baseline

The version-one implementation uses TypeScript and the latest mutually compatible
Effect 4 RC cohort. Pin `effect` and companion Effect packages to the same exact RC; do
not use an open prerelease range. As of 2026-09-19, that cohort is `4.0.0-rc.116`.

New product code integrates Jev through Effect's provider-neutral `Decision` /
`DecisionModel` API and the `@effect/ai-typesafe` provider. Use
`Decision.probability` for the initial Noul-only rule set. Runnable scripts must use
the Effect integration.

Live Jev validation is authorized at declared project milestones when credentials are
available. Bounded runs of hundreds of requests are acceptable when useful; avoid
unbounded or thousands of requests. Keep ordinary tests deterministic and offline,
do not print or commit credentials or source-bearing live responses, and record only
sanitized contract and timing evidence.
Ignored `.env` files are not copied into Git worktrees; check the primary `main`/`master`
worktree when a worktree lacks credentials, without printing or automatically sourcing them.

## Research and specification boundary

Research reports are **product-specification advisory material**. They identify evidence,
trade-offs, reusable patterns, candidate dependencies, and open questions. They are not
the normative product specification. Later specification, prototype, and implementation
work must explicitly decide which advisory findings become requirements.

Comparative research must use the repository methodology in
[`PRODUCT-RESEARCH-METHODOLOGY.md`](./PRODUCT-RESEARCH-METHODOLOGY.md). Classify each
candidate use as `BORROW`, `DEPEND ON`, `OPTIONAL INTEGRATION`, or `REJECT`. Record source
class separately from verification state; documentation establishes a project claim, not
runtime behavior.
