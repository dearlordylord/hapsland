# Issue #93: diff-selected type and function review target specification

**Purpose:** Define the direct-edit type and function review behavior.
**Status:** Accepted target, amended by owner decision on 2026-09-29.
**Authority:** Accepted product contract. Implementation and tests are separate evidence.
**Expected use:** Build and review the supported direct-edit path.
**Lifecycle:** Maintained as that path changes; review after a new owner decision or a changed runtime boundary.

The owner approved the bounded cross-file type and function path for users on
2026-09-29. The one-file named-type input is retired as a production route.
The owner did not require a comparative study before this change. A later study
can measure advice quality as a separate task. The file-selection, complete-evidence,
source-size, request-size, freshness, and Jev-request limits below still apply.
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
- One selected root with complete evidence yields one review unit and at most one
  logical Jev evaluation for its selected rule batch. Several complete changed
  roots yield independent units.
- Stable eligible capture, exact advicee attribution, file selection before
  every source read, bounded source sent to Jev, and a fresh check before
  advice are mandatory. There is no separate repository approval step in
  the target behavior.
- Unsupported analysis, uncertain attribution, any incomplete candidate graph,
  and clear assessments yield no agent-facing advice. Human status retains only
  bounded, source-free reason codes and counts.
- Directly changed roots are the only targets. Checkpoint reconciliation,
  shell/Stop discovery, and re-review of unchanged dependents are outside #93.

The remaining sections specify the accepted behavior. Validation and later
study work are named at the end. Runtime claims require separate test evidence.

## Supported event and selection contract

`direct-root-selection/v2` takes an attributed, completed direct edit event,
canonical working root, eligible repository-relative named paths, stable post-edit
snapshots, and bounded patch structure. Codex CLI `apply_patch` supplies checked
post-edit hunks. Claude Code `Edit` and `Write` derive exact changed spans from
the verified before and after text captured by the adapter. Host delivery
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

| Contract | Artifact root | Proposed evidence projection | Inapplicable examples |
| --- | --- | --- | --- |
| `direct-event/type-shape/v2` | One uniquely named TypeScript `interface` or `type` alias in `.ts`, `.tsx`, `.mts`, or `.cts` | Exact root declaration and complete finite outbound named-type reference graph, following supported local imports across selected files | Declaration merging, ambiguous binding, unsupported graph syntax, unresolved or excluded required imports |
| `direct-event/function/v1` | One uniquely named, top-level TypeScript function declaration in those extensions | Exact signature and body and complete finite directly referenced type and named-function graph, following supported local imports across selected files | Anonymous functions, methods, overload groups without unique implementation, dynamic/computed calls, unresolved or excluded required imports |

These contract IDs replace the former production
`direct-event/same-file-named-types/v1` input. A type declaration and function with the
same spelling remain different artifacts. Function-like values assigned to
variables, class methods, callbacks, constructors, accessors, schemas, namespaces,
and independently selected cross-file roots are deferred. A referenced declaration
in another file is supporting evidence, not a new changed root. The function branch must identify its body and
signature together; signature-only input cannot answer body-dependent rules.

The candidate projection walks outbound references from the root, including
statically bound local imports of supported declarations. Resolve an import to a
canonical repository-relative path and declaration identity; a text-name match
alone never establishes a binding. Before reading **each** newly discovered
source file, check root containment,
protected/privacy exclusions, Git ignore, and configured file selection. Capture
an eligible file stably, at most once per observation snapshot, without treating
it as an independently edited root. Unsupported package/external resolution,
ambiguous binding, or unavailable authority makes the dependent unit incomplete.
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
Check C's path but never read C's source. Record the blocked edge as a bounded,
source-free local reason; A's dependent unit is incomplete and makes no Jev
request. An independently selected B root is likewise incomplete if it requires
C. Independent complete roots may continue. No excluded source is copied into
an allowed file's review input.

The target per-source-file stable-capture ceiling is **256 KiB inclusive**. The
target evidence-tree ceiling is **20 KiB of canonical UTF-8 encoded root, nodes,
edges, and required metadata per review unit**, including evidence reached from
multiple files. Use the checked canonical encoding. Check the
remaining tree budget before accepting a captured contribution. If a supporting
node cannot fit, skip that import's tree contribution, record the skipped target,
and continue inspecting later pending edges within the finite file, read, work,
depth, and deadline budgets. Keep the accepted tree at or below 20 KiB. A unit
with any skipped import remains incomplete after its pending edges are examined
and makes no Jev request. Keep at most
64 parsed declarations per file, 16 distinct outbound targets per root, and four
reference edges in a path as initial ceilings; enforce finite total-file,
total-read, analysis-work, and deadline ceilings. The complete serialized
Jev request has a **separate** bound covering the tree, root source, questions,
options, and provider overhead. The earlier 64 KiB draft value is not a proven
wire limit; [#140](https://github.com/dearlordylord/hapsland/issues/140)
owns the later query/provider-aware refinement. Check the
actual encoded request before egress. The existing 15-second Jev deadline,
zero automatic retries, queue capacity, and host response limits remain
independent ceilings. Source and ledger limits must be reconciled so the
256 KiB target can be admitted without an unbounded parser or resident workspace.

`EvidenceCompleteness` is a gate on the **entire candidate review unit** before
rule selection. `complete` means its branch-defined root and every discovered
outbound graph edge have been resolved and represented within all bounds.
`incomplete` covers any missing, unresolved, ambiguous, unsupported, capped, or
unknown graph evidence, even when a particular rule might not inspect that edge.
An incomplete candidate produces no `ReviewWorkItem`, `ReviewInput`, or backend
request. It never becomes a clear/no-finding result. Only complete units proceed
to applicable rule selection; if no rule remains, there is no backend request.
This retains an all-or-nothing evidence gate rather than introducing per-rule
partial evaluation. The implementation must test the graph boundary so
"complete" is a checkable claim, not an assumption about unparsed syntax.

## Rule pack and configuration contract

`rule-pack/v2` adds a required, explicit `reviewTargets` declaration
to each rule. Each target names `artifactKind` (`typeShape` or `function`), exact
`inputContract`, and an enumerated set of evidence capabilities the rule expects
from an already complete branch unit. These declarations select compatible
rules; they cannot relax the unit-wide completeness gate. Type
capabilities include `root-declaration`, `resolved-outbound-types`, and
`selected-source-type-closure`; function capabilities include `signature`, `body`,
`resolved-local-calls`, and `resolved-outbound-types`. These capabilities describe
what a complete branch projection can support; a root with no outbound references
can still be complete. A rule applying to both branches declares
two targets and branch-specific requirements. Neither a broad
kind wildcard nor an unversioned contract alias is allowed. Unknown target or
capability makes the selected pack invalid before egress.

Path applicability continues to intersect global file selection. The compiler
selects a rule only for a complete unit after artifact kind, exact contract,
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
- One fingerprint of the complete, ordered evidence tree that Jev will see.
- Whether all required evidence is present, and which evidence types the unit
  supports.

The event ID and advicee do not change the meaning of identical review
evidence. A review work item still records the observation, the advicee, the
selected rules, and the exact input format so the result goes to the right
agent.

`ReviewInput` is versioned separately for each branch. The Jev payload is
a JSON value containing `artifact` (`kind`, `name`, repository-relative `domain`,
exact root `source`), `evidence` (complete bounded ordered nodes and typed edges),
and `inputContract` (`id`, `completeness: "complete"`, projection fingerprint).
For a function, `artifact.source` contains the full declaration including body;
its evidence may contain local function and type nodes. Rule questions and criteria
remain in the one provider-neutral Effect `DecisionModel` call, using
`Decision.probability` for the active branches. A different typed result form
requires a separate #96 contract decision. No before-source, raw patch, task transcript, unrelated
file, or absolute path is sent. The renderer must have a deterministic version and
digest; UTF-8 request bytes are checked at the final JSON representation before
dispatch. The versioned renderer defines the exact wire shape; changes to it
require contract review. Internal `ReviewUnit` records are not serialized directly.

Before Hapsland sends a review unit to Jev, it checks that the root and every
supporting file are still allowed and still match the captured source. Before
Hapsland gives advice, it reads those files again and rebuilds the review
unit under the current file settings and rules. If a required file, root,
rule, or review input has changed, Hapsland discards the old Jev result.
It also discards the result if it can no longer identify the advicee or
working root with confidence.

Hapsland may reuse an earlier result only when the selected root, complete
evidence tree, selected rules, effective settings, and exact Jev input format
are the same. A comment outside the review unit can change the file's exact
bytes without changing the review question; reuse is allowed only after the
fresh checks above confirm that the complete unit is still the same. The
unit's exact input identity must include the input format, renderer, root,
evidence-tree fingerprint, rules, effective settings, and complete state.
Keep each contributing file's fingerprint so Hapsland can perform the checks.

## Quiet skip and human coverage

Agent-facing output contains actionable findings only. Ordinary inapplicability,
analysis uncertainty, and incomplete unit evidence produce no advice or generic
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
   fixture names its expected unit completeness; only complete, checked
   fixture/rule pairs name an expected probability band and rationale. Missing
   labels mean unchecked; incomplete fixtures have skip expectations, not
   probability bands.
2. Deterministic offline checks establish unique attribution, finite expansion,
   unit-wide completeness, schema-v1 isolation and strict v2 target validation,
   exact request shape, per-path file selection before any source read
   (including A → B → excluded C),
   no read of excluded C, continued bounded traversal after a contribution
   exceeds the remaining tree budget,
   accepted tree size at or below 20 KiB, stale suppression, and source-free
   coverage. A controlled backend checks one request per eligible unit and no
   request for any incomplete or rule-empty unit. Typecheck and run the
   focused and full suites as implementation validation.
3. A later paired, pre-registered live plan can compare each branch input with
   the currently supported input where applicable and an honest focused-diff or
   whole-file baseline on the *same* fixtures, rules, backend, and rule batch.
   Incomplete units and other inapplicable arms are marked before execution and
   excluded from semantic denominators; they may be tested offline without a
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

- Keep the narrow function scope and unit-wide completeness policy. Tests must
  establish the capabilities claimed for each maintained rule; a rule cannot
  exempt an omitted edge.
- Revisit graph, request, and resident limits only with bounded evidence and
  contract review.
- If a later paired study is run, declare its thresholds and source scope
  before live calls. The final #16 outcome remains prior evidence.
- Continue host-specific advice delivery validation for Claude Code and
  OpenCode, informed by #97 and #94 rather than inferred from Codex.
