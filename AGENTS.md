# Project instructions

**Purpose:** Define repository-wide instructions for contributors and coding agents.
**Status:** Active repository guidance.
**Authority:** Maintained guidance; accepted product contracts remain in their named specification owners.
**Expected use:** Apply these instructions when creating or changing repository artifacts.
**Lifecycle:** Maintained with changes to repository policy, tooling, and product boundaries; review whenever an accepted workflow or product-boundary decision changes these instructions.

Start with the [repository map](docs/agents/navigation.md) to find each task's
contract, implementation, tests, website, and research assets. Use the
[testing matrix](docs/testing-matrix.md) to select checks.

Agent work is complete when the required local checks selected from the testing
matrix pass. Do not wait for GitHub CI or treat it as an additional completion
gate unless the user explicitly requests it or an accepted release contract
requires it. Report any known GitHub CI status separately, and make validation
claims only for checks actually run.

## TypeScript quality gate

Choose local checks by changed behavior and physical boundaries using the
[testing matrix](docs/testing-matrix.md#which-gate-to-run). For TypeScript changes,
run `npm run check:fast` and focused tests for the changed owners and affected
consumers. Run affected integration checks when transport, process lifetime,
installation, packaging, or cross-component wiring changes.

Mandatory verification order:

- Before checks over one minute: record risk, cheapest adequate existing check,
  additional evidence, expected duration and absolute stop. Relevant cheap
  prerequisites MUST pass first. Reuse runners; tooling changes need measured
  bottleneck or missing task diagnostic.
- Build/test/coverage changes MUST pass a real affected consumer with matching
  environment, instrumentation and product deadlines. Helper tests insufficient.
  Owner/fixture moves MUST pass affected fixtures against current exports/paths.
- Full `npm run quality:check`: release, declared milestone, explicit request,
  changed end-to-end evidence boundary, or cross-cutting impact unbounded by
  focused checks. Known failed prerequisite blocks full run.
  Documentation, filenames, literals and
  bounded configuration alone do not require it. CI retains the full gate.
- Failed gate: read `npm run test:status` and logs; classify every independent
  failure (preparation/build/proof/test/analysis). Relevant focused checks MUST
  pass on current inputs before another full run. Failures missed by preflight
  MUST get a focused reproduction; use checks matching the failed stage.
- Two attempts without evidence distinguishing causes or verifying a fix:
  name competing causes; change experiment. Edits/reviewers/broad runs alone
  insufficient. After 30 minutes active fixture repair without such evidence,
  record changed experiment and unique acceptance value before continuing.
  Renaming/delegating work does not reset budget.
- Finite deadlines; at expiry retain evidence and name next diagnostic. Freeze
  verification inputs during full runs. Missing exit/interruption/timeout/changed
  inputs never qualify. Release locks after owner processes and descendants stop.
  Claim executed evidence only; focused passes are not full-project coverage.

The pinned crap4ts gate regenerates coverage, then enforces `crap4ts.json`.
Exit 2: threshold breach. Exit 1: test/configuration/analysis/coverage failure.
Resolve failures before claiming a pass; report out-of-scope failures explicitly.
Improve behavioral tests or simplify branching. Preserve source selection,
strict missing-evidence handling, thresholds and product guarantees.
Documentation/tooling changes use affected tool/consumer, type and documentation
checks; full gate only when the criteria above apply. Same selection under `src`.

## Review requests and acceptance decisions

When requesting owner review of a diagram or other visual artifact, present the
specific before/after difference to inspect, identify the exact case or panel,
and explain the observable behavior that should change. Link the relevant view
and state the concrete decision requested. If the artifact did not change, say
so and distinguish an existing design review from validation of new code; do not
imply that there is a new visual diff. A link to the whole page is insufficient.

For an acceptance decision, state the proposed scope, observed limitations, and
what acceptance permits next. Cite the source requiring owner approval. Separate
design acceptance from empirical validation and release/platform support claims.

## Pre-release compatibility and code review

During this pre-release phase, update Hapsland-owned formats in place. Rule packs,
direct-review input contracts, persisted records, and resident IPC remain at
version 1.
Delete superseded production code, schemas, and maintained documentation;
do not keep legacy paths, migration shims, or parallel versions. Code review
must flag leftovers. Keep compatibility only when an accepted product contract
explicitly requires it.
Name agent runtimes and behavior variants directly. Reserve version numbers for
actual format changes, not for Claude, Codex, or future adapter branches.

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
Effect 4 stable cohort. Pin `effect` and companion Effect packages to the same exact
release; do not use an open range. As of 2026-10-01, that cohort is `4.0.0`.

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
