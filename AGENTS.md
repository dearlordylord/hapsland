# Project instructions

## Product identity

The repository directory may be named `jev`, but the product being designed is **not
named Jev**. Do not call the product “Jev”.

**Jev** is TypeSafe's external realtime review/classification tool that the product uses
to evaluate edits. Until the product receives an official name, refer to it as **the
product**, **the review integration**, or **the realtime review tool** when the context
is unambiguous.

Keep these terms separate:

- Jev: the external review backend/tool.
- Product: our host-neutral integration and user-configurable review system.
- Agent host: Claude Code, Codex CLI, OpenCode, Kimi Code, Pi, or another runtime that
  owns the tool loop.
- Model provider: secondary metadata about which inference service a host or review
  backend uses. It is not a first-class product target in the current phase.

The product works at the agent-host boundary. Model-provider details matter only when
they change host behavior, authentication/egress, cost, or the Jev backend configuration;
they do not define the adapter set.

Historical filenames beginning with `JEV-` are retained for continuity; that filename
prefix does not rename the product.

## Effect and Jev integration baseline

The version-one implementation uses TypeScript and the latest mutually compatible
Effect 4 RC cohort. Pin `effect` and companion Effect packages to the same exact RC; do
not use an open prerelease range. As of 2026-09-19, that cohort is `4.0.0-rc.116`.

New product code integrates Jev through Effect's provider-neutral `Decision` /
`DecisionModel` API and the `@effect/ai-typesafe` provider. Use
`Decision.probability` for the initial Noul-only rule set. The existing vendored
`@distilled.cloud/typesafe-ai` package is historical prototype evidence and a migration
oracle, not an active workspace or production integration dependency. Runnable scripts
must use the Effect integration. Preserve the vendor evidence until equivalent live
contract fixtures and the real vertical slice are in place.

Live paid Jev validation is authorized at declared project milestones when credentials are
available. Keep ordinary tests deterministic and offline, do not print or commit credentials
or source-bearing paid responses, and record only sanitized contract and timing evidence.

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
