# Project instructions

**Purpose:** Define repository-wide instructions for contributors and coding agents.
**Status:** Active repository guidance.
**Authority:** Maintained guidance; accepted product contracts remain in their named specification owners.
**Expected use:** Apply these instructions when creating or changing repository artifacts.
**Lifecycle:** Maintained with changes to repository policy, tooling, and product boundaries; review whenever an accepted workflow or product-boundary decision changes these instructions.

## Product identity

The repository checkout may still be named `jev`, but the product is **Hapsland**.
**Jev** is TypeSafe's external realtime review/classification tool that Hapsland uses
to evaluate edits. Refer to the product as **Hapsland**, **the product**, or **the review
integration** when the context is unambiguous.

Keep these terms separate:

- Jev: the external review backend/tool.
- Hapsland: our runtime-neutral integration and user-configurable review system.
- Agent runtime: Claude Code, Codex CLI, OpenCode, Kimi Code, Pi, or another program that
  owns the tool loop.
- Model provider: secondary metadata about which inference service an agent runtime or review
  backend uses. It is not a first-class product target in the current phase.

Hapsland works at the agent-runtime boundary. Model-provider details matter only when
they change runtime behavior, authentication/egress, cost, or the Jev backend configuration;
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

Comparative research must use the methodology in the sibling research repository,
[`PRODUCT-RESEARCH-METHODOLOGY.md`](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-METHODOLOGY.md)
(`../hapsland-research/PRODUCT-RESEARCH-METHODOLOGY.md` in this workspace). Classify each
candidate use as `BORROW`, `DEPEND ON`, `OPTIONAL INTEGRATION`, or `REJECT`. Record source
class separately from verification state; documentation establishes a project claim, not
runtime behavior.


## Markdown lifecycle

Every new Markdown document must state near its top **Purpose**, **Status**,
**Authority**, **Expected use**, and **Lifecycle**. Authority must distinguish
accepted product contract, maintained guidance, design proposal, and
implementation or validation evidence; a report does not become a product
contract merely by describing implemented behavior.

A temporary document must name a concrete cleanup trigger (an issue, milestone,
or replacement artifact), the required action (**delete** or **consolidate**),
and where any still-useful decision will move. Creating a temporary document
without that exit path is incomplete.

When the trigger arrives, transfer any current contract or decision to its
proper owner, update inbound links, and delete the obsolete snapshot. Git
history retains its chronology. Do not keep a snapshot solely as a change log.

A maintained document must say what keeps it current and what event requires
review. Do not label a report “maintained” merely to avoid specifying cleanup.

An issue requesting a plan, evidence, or report does not by itself require a new
`.md` file. Use an issue comment, executable evidence, or an existing maintained
document when that satisfies the task more clearly. Keep executable traces,
generated inventories, and diagrams in their appropriate formats; do not
convert them to Markdown to satisfy this rule. Preserve pre-execution
declarations as declarations made at that time, with later outcomes or
amendments identified separately.
