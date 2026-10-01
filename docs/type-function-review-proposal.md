# Issue #93: diff-selected type and function review target specification

**Purpose:** Define the direct-edit type and function review behavior.
**Status:** Accepted target, amended by owner decisions on 2026-09-29 to restore rule-level evidence checks and remove the total-request byte ceiling, and by the 2026-09-30 request to add bounded Rust support and the 2026-10-01 request for cross-file Rust evidence.
**Authority:** Accepted product contract. Implementation and tests are separate evidence.
**Expected use:** Build and review the supported direct-edit path.
**Lifecycle:** Maintained as that path changes; review after a new owner decision or a changed runtime boundary.

The owner approved the bounded cross-file type and function path for users on
2026-09-29. The one-file named-type input is retired as a production route.
The owner did not require a comparative study before this change. A later study
can measure advice quality as a separate task. The file-selection, rule-evidence,
source-size, freshness, and Jev-request limits below still apply.
This decision is about product behavior; it is not a claim that live Jev results
have been measured. Contract identifiers distinguish incompatible backend inputs;
they are not product release names. Jev is the external review backend.

## Decision boundary and prior evidence

The edit diff identifies **which semantic roots changed**. It is attribution
evidence, not the Jev review input. No raw-diff fallback is defined.

Issue #19 established the vocabulary: one `Artifact` is the root of one
`ReviewUnit`, whose finite recursive projection is evaluated in one logical Jev
request. `ReviewWorkItem` freezes the unit, observation, rule set, and input
contract; `ReviewInput` is the rendered backend input. `SourceFingerprint` covers
exact captured source and `ReviewProjectionFingerprint` covers canonical semantic
evidence. Queues and pending advice are memory-only and may be lost on restart.

Issue #16's **final** input comparison was `reject-or-narrow`: declaration plus
bounded context passed context-required accuracy, focused-diff controls, negative
controls, timing, and request size, but failed both required paired superiority
gates (context-only 0/3 and whole-file-dilution 0/2). The 2026-09-29 owner
decision authorizes bounded cross-file source use despite that result. The result
still does not show that the new input gives better advice.

### Accepted constraints carried into this specification

- A review is advisory after an edit; it never blocks or rolls back the edit.
- One selected root yields one bounded candidate review unit. Rules whose declared
  evidence needs are met may share one logical Jev evaluation. Several changed
  roots yield independent units.
- Stable eligible capture, exact advicee attribution, file selection before
  every source read, bounded source sent to Jev, and a fresh check before
  advice are mandatory. There is no separate repository approval step in
  the target behavior.
- Unsupported analysis, uncertain attribution, missing evidence needed by a rule,
  and clear assessments yield no agent-facing advice. Human status retains only
  bounded, source-free reason codes and counts.
- Directly changed roots are the only targets. Checkpoint reconciliation,
  shell/Stop discovery, and re-review of unchanged dependents are outside #93.

The remaining sections specify the accepted behavior. Validation and later
study work are named at the end. Runtime claims require separate test evidence.

## Supported event and selection contract

`direct-root-selection` takes an attributed, completed direct edit event,
canonical working root, eligible repository-relative named paths, stable post-edit
snapshots, and bounded patch structure. Codex CLI `apply_patch` supplies patch
hunks; Hapsland verifies their location against the captured post-edit snapshot.
Claude Code `Edit` and `Write` supply edit data; Hapsland verifies it against the
captured snapshot and derives post-edit spans. Host delivery
behavior still needs host-specific evidence; OpenCode mapping remains separate.
Delete, move, metadata-only, unattributed writes,
and paths outside the existing capture/selection boundary are inapplicable.

The adapter must preserve each patch hunk's file and changed-line coordinates or
derive an equivalent verified location against the stable post-edit snapshot.
Textual line equality alone is insufficient when the same line occurs in multiple
declarations. Every changed post-edit span maps to the smallest supported enclosing
root declaration. A signature/header change maps to its declaration. A change in
shared top-level material, an unmatched deletion with no stable root location,
or any location with more than one possible root is `ambiguous-attribution` and
selects no root for that span. Do not guess from the nearest declaration. If a
candidate contains both uniquely attributed and ambiguous spans, the unique roots
may proceed independently; the ambiguous spans remain unreviewed and counted.

For Add, every eligible named root in the newly added file is selected. For Update,
deduplicate the uniquely mapped roots across hunks. If no supported root maps,
the path is quietly `no-supported-root`. A change only to a reference declaration
selects that declaration; it does not automatically select unchanged users of it.
Selections are deduplicated by canonical path, branch, root identity, and captured
snapshot within the event. Selection must not infer a complete change set from a
partial or unstable capture.

## Branch contracts

For advisory lessons and a reusable validation workflow for future languages, see
[Adding another source language](adding-language-support.md). That guide does not
amend the contracts below.

| Contract | Artifact root | Proposed evidence projection | Inapplicable examples |
| --- | --- | --- | --- |
| `direct-event/type-shape/v1` | One uniquely named TypeScript `interface` or `type` alias in `.ts`, `.tsx`, `.mts`, or `.cts` | Exact root declaration and bounded outbound named-type reference graph with marked omissions, following supported local imports across selected files | Declaration merging, ambiguous binding, unsupported graph syntax, unresolved or excluded evidence needed by a selected rule |
| `direct-event/type-shape/v1` | One uniquely named, explicit top-level Rust `struct`, `enum`, or `type` alias in `.rs` | Exact root declaration and bounded outbound named-type references across verified local Cargo modules | Conditional compilation, macro-dependent declarations, unsupported type syntax, ambiguous binding, unresolved module/external paths, or missing evidence needed by a selected rule |
| `direct-event/function/v1` | One uniquely named, top-level TypeScript function declaration in those extensions | Exact signature and body and bounded directly referenced type and named-function graph with marked omissions, following supported local imports across selected files | Anonymous functions, methods, overload groups without unique implementation, dynamic/computed calls, unresolved or excluded evidence needed by a selected rule |

These contract IDs replace the former production
`direct-event/same-file-named-types/v1` input. A type declaration and function with the
same spelling remain different artifacts. Function-like values assigned to
variables, class methods, callbacks, constructors, accessors, schemas, namespaces,
and independently selected cross-file roots are deferred. A referenced declaration
in another file is supporting evidence, not a new changed root. The function branch must identify its body and
signature together; signature-only input cannot answer body-dependent rules.

Rust uses the active type-shape v1 input, with bounded local cross-file projection. Rust
functions and external-crate resolution are deferred. Parsing a
file does not establish Rust compiler validity or macro expansion. Unsupported
syntax and unresolved references must remain explicit limitations; rules needing
that evidence cannot run. Rust source does not authorize a separate legacy
named-type route or a new format version.

Rust primitive types, unqualified `String`, `str`, `Option`, `Result`, `Vec`,
and `Box`, and declared type parameters may contribute type context; generic
payloads and defaults still require reference resolution. Same-file declarations
take precedence over these wrapper names; same-file trait and union names cannot
be treated as builtins and remain unresolved supporting evidence. Explicit qualified local paths and aliases resolve through the module bindings
described below. Trait bounds, `where` clauses, const generics, and dynamic or
abstract types are unsupported evidence. Arrays require integer-literal lengths; named
constants and computed lengths are omitted. Non-integer enum discriminants and
const generic arguments are also unsupported evidence. Raw identifiers are
conservatively rejected by this parser profile. Unsupported imports or modules, an extern-crate
declaration, foreign extern block, macro definition/invocation, or attribute
anywhere in the file makes the scope uncertain for every root. This includes
`derive`, `cfg`, and attributes on unrelated functions: procedural expansion can
introduce type bindings. Ordinary doc comments do not create this uncertainty.
These roots remain selectable, but only rules whose declared evidence needs
permit the omissions can run; root-declaration-only rules may review partial
evidence, while rules requiring complete type closure cannot.

Rust module resolution requires an eligible nearest `Cargo.toml` with explicit
package edition 2018, 2021, or 2024 and a supported local library or binary target.
The supported manifest subset includes default or explicit relative library paths
and explicit binary name/path pairs. Explicit binary tables disable automatic
binary inference conservatively. Workspace-inherited editions, target edition
overrides, custom build targets, test/example/bench target tables, and source
roles in automatic test/example/bench directories are unsupported. Crate roots
come from the manifest, not source filenames. Explicit external
`mod child;` declarations establish module roles along the selected source's
ancestor chain. Exactly one of `child.rs` and `child/mod.rs` must exist. A module
named `lib.rs` or `main.rs` uses ordinary module layout when declared as a child.
Direct `use child::Type`, `self::child::Type`, their aliases and flat lists, and
qualified references through those bindings are supported. `crate::child::Type`
uses the verified crate-root module map. Re-exports, glob imports, inline modules,
external crates, path attributes, and unsupported module chains remain omitted.
Supporting declarations must have supported public visibility. Namespace
collisions and generic parameter shadowing cannot establish a binding.

Cargo metadata and captured crate/ancestor modules count toward graph file,
read-byte, work, and deadline limits. They are freshness dependencies even when
no declaration from them appears in the rendered evidence. Cargo manifests and
module ancestors must pass the same repository containment, exclusion, ignore,
and selection checks as supporting type sources. Only referenced declarations
are included in provider input; Cargo contents and unrelated ancestor bodies
are binding evidence retained locally.

The supported candidate projection walks outbound references from the root,
including statically bound local imports of supported TypeScript declarations.
Cross-language imports do not provide supporting evidence. Resolve an import to a
canonical repository-relative path and declaration identity; a text-name match
alone never establishes a binding. Before reading **each** newly discovered
source file, check root containment,
protected/privacy exclusions, Git ignore, and configured file selection. Capture
an eligible file stably, at most once per observation snapshot, without treating
it as an independently edited root. Unsupported package/external resolution,
ambiguous binding, or unavailable authority marks the dependent edge omitted.
Process edges in deterministic source order with canonical path/symbol tie-breaks.
A first visit to a target is `expanded`; a later visit or back-edge is `included`.
The root is not counted as a reference. A visited key includes canonical path,
declaration kind, and declaration identity. Cycles terminate.

After #117/#118 reconciliation, specify this traversal policy as Bend
transitions before implementing the cross-file pipeline. Native code supplies
syntax, import-binding, path, identity, and capture facts; Bend decides the
next eligible edge, budget progression, and complete/incomplete outcome
without retaining source. [#141](https://github.com/dearlordylord/hapsland/issues/141)
tracks the precise supported resolution scope and a separate dashboard
state-machine diagram. That diagram uses the same checked transition adapter
as production and distinguishes native facts from Bend decisions.

For example, if A.ts refers to B.ts, B.ts refers to C.ts, A and B are selected,
and C is excluded, capture A and B in that order after their individual checks.
Check C's path but never read C's source. Mark the blocked edge as omitted and
keep checking later edges. Rules that need C do not run; a rule whose declared
needs are met by A and B may run with the omission marked in its input.
Independent roots follow the same rule. No excluded source is copied into an
allowed file's review input.

The target per-source-file stable-capture ceiling is **256 KiB inclusive**. A
lower configured ceiling applies on every supported platform; native capture
enforces it before reading source.

The target evidence-tree ceiling is **20 KiB of canonical UTF-8 encoded root, nodes,
edges, and required metadata per review unit**, including evidence reached from
multiple files. Use the checked canonical encoding. Check the
remaining tree budget before accepting a captured contribution. If a supporting
node cannot fit, skip that import's tree contribution, record the skipped target,
and continue inspecting later pending edges within the finite file, read, work,
depth, and deadline budgets. Keep the accepted tree at or below 20 KiB. A
candidate with any skipped import retains an omission after its pending edges
are examined; only rules that do not need that evidence may reach Jev. Keep at most
64 parsed declarations per file, 16 distinct outbound targets per root, and four
reference edges in a path as initial ceilings; enforce finite total-file,
total-read, analysis-work, and deadline ceilings. There is no separate
total-request byte ceiling. Rule questions, criteria, and provider overhead are
outside the 20 KiB evidence budget; their encoded size may be measured without
denying dispatch. The existing 15-second Jev deadline,
zero automatic retries, queue capacity, and host response limits remain
independent ceilings. Source and ledger limits must be reconciled so the
256 KiB target can be admitted without an unbounded parser or resident workspace.

`EvidenceCompleteness` is checked **for each rule** against the bounded candidate.
`complete` means no graph edge was omitted. `incomplete-irrelevant` means an edge
was omitted but the selected rule does not require that evidence. Both states may
form an input with the omission marked; a rule with missing required evidence
does not run. If no rule remains, there is no backend request. An incomplete
candidate never becomes a clear/no-finding result for a rule that did not run.
The implementation must check the graph boundary and each rule's declared needs;
"complete" cannot be assumed from unparsed syntax.

## Rule pack and configuration contract

`rule-pack/v1` requires an explicit `reviewTargets` declaration
to each rule. Each target names `artifactKind` (`typeShape` or `function`), exact
`inputContract`, and an enumerated set of evidence capabilities the rule needs.
These declarations decide whether a candidate's evidence is sufficient for that
rule. Type
capabilities include `root-declaration`, `resolved-outbound-types`, and
`selected-source-type-closure`; function capabilities include `signature`, `body`,
`resolved-local-calls`, and `resolved-outbound-types`. These capabilities describe
what a branch projection can support; a root with no outbound references can
still be complete. A rule applying to both branches declares
two targets and branch-specific requirements. Neither a broad
kind wildcard nor an unversioned contract alias is allowed. Unknown target or
capability makes the selected pack invalid before egress.

Path applicability continues to intersect global file selection. The compiler
selects a rule only when its required evidence is present, after artifact kind, exact contract,
declared capabilities, path filter, and any built-in semantic applicability all
match. Rule identity includes the pack ID/version/content digest, rule definition
digest, target, and
effective threshold/message; changing any evaluation-affecting part invalidates
reuse. The target list belongs in the authored rule definition digest. A rule may
share a question across branches, but branch-specific criteria and messages need
separate rule IDs or explicit target-specific definitions so evidence promises
remain honest.

Schema-v1 packs keep their current rule meaning. The target uses the existing
file settings: absent settings include all otherwise eligible files, and
configured includes/excludes narrow or replace that selection under the
documented precedence. There is no separate repository grant. A migration
must produce explicit targets for new rule inputs, update setup and file
settings documentation, and continue to reject unknown configuration
versions. Project settings cannot bypass protected paths, containment,
Git ignore, supported host boundaries, or analysis limits.

## Review unit, identity, input, and publication

One review unit has one selected root. Its supporting evidence can come from
several files. A type root contains its declaration and referenced types. A
function root contains its full signature and body, plus required functions
and types. For each unit, record:

- The root's repository-relative path, kind, name, and location.
- A fingerprint of the exact bytes captured from each contributing file and
  each declaration used in the unit.
- One fingerprint of the bounded, ordered evidence tree and omission markers
  that Jev will see.
- Which evidence types the candidate supports and which rules need omitted evidence.

The event ID and advicee do not change the meaning of identical review
evidence. A review work item still records the observation, the advicee, the
selected rules, and the exact input format so the result goes to the right
agent.

`ReviewInput` is versioned separately for each branch. The Jev payload is
a JSON value containing `artifact` (`kind`, `name`, repository-relative `domain`,
exact root `source`), `evidence` (bounded ordered nodes and typed edges, including
omission markers), and `inputContract` (`id`, `completeness: "complete"` or
`"incomplete-irrelevant"`, projection fingerprint).
For a function, `artifact.source` contains the full declaration including body;
its evidence may contain local function and type nodes. Rule questions and criteria
remain in the one provider-neutral Effect `DecisionModel` call, using
`Decision.probability` for the active branches. A different typed result form
requires a separate #96 contract decision. No before-source, raw patch, task transcript, unrelated
file, or absolute path is sent. The renderer must have a deterministic version and
digest; rendered evidence input is checked against its 20 KiB budget before
dispatch. The versioned renderer defines the exact wire shape; changes to it
require contract review. Internal `ReviewUnit` records are not serialized directly.

Before Hapsland sends a review unit to Jev, it checks that the root and every
supporting file are still allowed and still match the captured source. Before
Hapsland gives advice, it reads those files again and rebuilds the review
unit under the current file settings and rules. If a required file, root,
rule, or review input has changed, Hapsland discards the old Jev result.
It also discards the result if it can no longer identify the advicee or
working root with confidence.

Hapsland may reuse an earlier result only when the selected root, bounded
evidence tree, selected rules, effective settings, and exact Jev input format
are the same. A comment outside the review unit can change the file's exact
bytes without changing the review question; reuse is allowed only after the
fresh checks above confirm that the review input is still the same. The
unit's exact input identity must include the input format, renderer, root,
evidence-tree fingerprint, omissions, rules, effective settings, and evidence state.
Keep each contributing file's fingerprint so Hapsland can perform the checks.

## Quiet skip and human coverage

Agent-facing output contains actionable findings only. Ordinary inapplicability,
analysis uncertainty and missing evidence needed by a rule produce no advice or generic
error message. A bounded source-free local status may aggregate counts by branch
and code: `unsupported-event`, `ineligible-path`, `capture-unavailable`,
`no-supported-root`, `ambiguous-attribution`, `unsupported-syntax`,
`incomplete-graph`, `expansion-limit`, `input-limit`,
`analysis-deadline`, `no-applicable-rule`, and `stale-result`. It must not retain
source, symbol names, patch text, absolute paths, or source-derived hashes intended
for display. Operational backend/capacity notices remain governed by the current
delivery policy. Coverage is never reported as a clean semantic judgment.

## Validation and later study

1. Freeze synthetic positive, valid negative, superficially similar negative,
   ambiguous, and intentionally incomplete fixtures for both branches before live
   execution. Include multi-root Add/Update, duplicate lines, hunk-boundary edits,
   cycles, imports, overloads, caps, and unrelated sibling edits. Each checked
   fixture names its expected omissions and rule eligibility. Only checked
   fixture/rule pairs with sufficient evidence name an expected probability band
   and rationale. Missing labels mean unchecked; rules needing omitted evidence
   have skip expectations, not probability bands.
2. Deterministic offline checks establish unique attribution, finite expansion,
   per-rule evidence checks and strict schema-v1 target validation,
   exact request shape, per-path file selection before any source read
   (including A → B → excluded C),
   no read of excluded C, continued bounded traversal after a contribution
   exceeds the remaining tree budget,
   accepted tree size at or below 20 KiB, stale suppression, and source-free
   coverage. A controlled backend checks one request per eligible unit and no
   request when no rule has sufficient evidence. Typecheck and run the
   focused and full suites as implementation validation.
3. A later paired, pre-registered live plan can compare each branch input with
   the currently supported input where applicable and an honest focused-diff or
   whole-file baseline on the *same* fixtures, rules, backend, and rule batch.
   Rules with missing required evidence and other inapplicable arms are marked
   before execution and excluded from semantic denominators; they may be tested offline without a
   paid call. Report semantic value, false advice on clear negatives,
   availability, extraction/render/backend/end-to-end timing, encoded request
   bytes, and source-egress scope separately. Require an explicit finite call and
   retry ceiling against remaining authorization. Keep ordinary tests offline and
   retain only sanitized aggregate live evidence.
4. Record the exact renderer/wire contract, budgets, cross-file source use, and
   host delivery behavior in implementation evidence. A later study must state
   its fixture corpus and thresholds before live calls. It may lead to a later
   product change, but it is not a prerequisite for the 2026-09-29 decision.

## Later work

- Keep the narrow function scope. Tests must establish the capabilities claimed
  for each maintained rule; a rule can proceed past an omitted edge only when
  that edge is irrelevant to its declared evidence needs.
- Revisit graph and resident limits only with bounded evidence and
  contract review.
- If a later paired study is run, declare its thresholds and source scope
  before live calls. The final #16 outcome remains prior evidence.
- Continue host-specific advice delivery validation for Claude Code and
  OpenCode, informed by #97 and #94 rather than inferred from Codex.
