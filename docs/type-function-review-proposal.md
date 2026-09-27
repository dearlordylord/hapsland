# Diff-selected type and function review proposal

Status: **Owner decision (2026-09-24): accepted as the complete-evidence
type/function contract for future prototype planning only.** This does not
authorize implementation, live Jev evaluation, or expanded source egress. All
prototype and adoption gates below remain open. The current profile remains
`direct-event/same-file-named-types/v1` until implementation and adoption are
separately decided after those gates. Jev is the external review backend.

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
gates (context-only 0/3 and whole-file-dilution 0/2). Thus neither that experiment
nor this specification authorizes a production extractor, new source egress, or a
claim that declaration input is superior. The current same-file named-type profile
is an implemented, separately bounded direct-event path; its existence does not
turn #16's outcome into approval of the broader branches proposed here.

### Accepted constraints carried into this proposal

- A review is advisory after an edit; it never blocks or rolls back the edit.
- One selected root with complete evidence yields one review unit and at most one
  logical Jev evaluation for its selected rule batch. Several complete changed
  roots yield independent units.
- Stable eligible capture, exact advicee attribution, repository consent at
  dispatch, bounded source egress, and publication revalidation are mandatory.
- Unsupported analysis, uncertain attribution, any incomplete candidate graph,
  and clear assessments yield no agent-facing advice. Human status retains only
  bounded, source-free reason codes and counts.
- Directly changed roots are the only targets. Checkpoint reconciliation,
  shell/Stop discovery, and re-review of unchanged dependents are outside #93.

The remaining sections are **proposed requirements**, subject to the acceptance
decisions at the end. They are not statements of current behavior.

## Supported event and selection contract

`direct-root-selection/v2` takes an attributed, completed direct edit event,
canonical working root, eligible repository-relative named paths, stable post-edit
snapshots, and bounded patch structure. The only currently evidenced native event
mapping is the controlled-writer Codex CLI `PostToolUse` `apply_patch` Add and Update
path in the version/platform profile named in the supported-profile document.
Claude Code and OpenCode mappings require their own #94 evidence and explicit
host-profile declarations; this contract does not presume those hosts expose the
same patch or delivery semantics. Delete, move, metadata-only, unattributed writes,
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
partial or unstable capture. Existing v1 matching remains unchanged until an
accepted migration explicitly replaces it.

## Branch contracts

| Contract | Artifact root | Proposed evidence projection | Inapplicable examples |
| --- | --- | --- | --- |
| `direct-event/type-shape/v2` | One uniquely named TypeScript `interface` or `type` alias in `.ts`, `.tsx`, `.mts`, or `.cts` | Exact root declaration and complete finite same-file outbound named-type reference graph | Declaration merging, ambiguous binding, unsupported graph syntax, imported/cross-file graph evidence |
| `direct-event/function/v1` | One uniquely named, top-level TypeScript function declaration in those extensions | Exact signature and body and complete finite same-file directly referenced type and named local-function graph | Anonymous functions, methods, overload groups without unique implementation, dynamic/computed calls, imported/cross-file graph evidence |

These contract IDs are distinct from the current
`direct-event/same-file-named-types/v1`. A type declaration and function with the
same spelling remain different artifacts. Function-like values assigned to
variables, class methods, callbacks, constructors, accessors, schemas, namespaces,
and cross-file roots are deferred. The function branch must identify its body and
signature together; signature-only input cannot answer body-dependent rules.

The candidate projection walks outbound references from the root. A first visit
to a same-file target is `expanded`; a later visit or back-edge is `included`.
The root is not counted as a reference. Cycles terminate. Branch-specific
reference binding must be syntax-aware and deterministic; a text-name match
does not establish a binding. Imports and external declarations are never loaded
implicitly. If any graph edge is unresolved, ambiguous, unsupported, capped, or
unknown, the **whole candidate unit is incomplete** and is not evaluated.
Omission reasons may be kept only as bounded, source-free local status; no
partial graph or omission metadata is rendered for Jev.

The initial proposed ceilings are the present 32 KiB stable source capture and
64 parsed declarations per file, at most 16 distinct outbound targets per root,
at most four reference edges in a path, and at most 64 KiB encoded Jev input per
unit. Count the root, expanded nodes, edge metadata, path/domain text, and JSON
encoding toward the input bound. Apply caps before recursive materialization and
before source egress. Record extraction elapsed time and stop at a separately
configured finite analysis deadline; the prototype must choose and test its exact
value before live evaluation. The existing 15-second Jev deadline, zero automatic
retries, queue capacity, and host response limits remain independent ceilings.
No candidate budget is a production default merely because it appears here.

`EvidenceCompleteness` is a gate on the **entire candidate review unit** before
rule selection. `complete` means its branch-defined root and every discovered
outbound graph edge have been resolved and represented within all bounds.
`incomplete` covers any missing, unresolved, ambiguous, unsupported, capped, or
unknown graph evidence, even when a particular rule might not inspect that edge.
An incomplete candidate produces no `ReviewWorkItem`, `ReviewInput`, or backend
request. It never becomes a clear/no-finding result. Only complete units proceed
to applicable rule selection; if no rule remains, there is no backend request.
This retains an all-or-nothing evidence gate rather than introducing per-rule
partial evaluation. The prototype must specify and test the graph boundary so
"complete" is a checkable claim, not an assumption about unparsed syntax.

## Rule pack and configuration contract

The proposed `rule-pack/v2` adds a required, explicit `reviewTargets` declaration
to each rule. Each target names `artifactKind` (`typeShape` or `function`), exact
`inputContract`, and an enumerated set of evidence capabilities the rule expects
from an already complete branch unit. These declarations select compatible
rules; they cannot relax the unit-wide completeness gate. Type
capabilities include `root-declaration`, `resolved-outbound-types`, and
`same-file-type-closure`; function capabilities include `signature`, `body`,
`resolved-local-calls`, and `resolved-outbound-types`. These capabilities describe
what a complete branch projection can support; absence of any discovered graph
evidence still skips the entire unit. A rule applying to both branches declares
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

Schema-v1 packs and existing user configurations retain their present supported
behavior. They do not silently opt into either new contract. A migration must
produce explicit v2 targets, update documentation/setup previews, and preserve
unknown-version rejection. Project configuration cannot grant consent or enlarge
source eligibility, host support, egress destination, or analysis ceilings.

## Review unit, identity, input, and publication

The type branch's unit is one type-shape root and its type projection. The function
branch's unit is one function root (signature plus body) and its function/type
projection. Both retain stable repository-relative path, branch kind, exact file
snapshot fingerprint, root span/identity, artifact source fingerprints, canonical
projection fingerprint, `complete` evidence state, and evidence capabilities. The
snapshot fingerprint identifies exact captured file bytes; each artifact source fingerprint
identifies its exact declaration source; the projection fingerprint identifies the
sorted, canonical root/edge/source projection. Neither event ID nor advicee is part of
semantic reuse identity. `ReviewWorkItem` additionally freezes observation and
advicee, selected rule identities, and exact input contract.

`ReviewInput` is versioned separately for each branch. The proposed Jev payload is
a JSON value containing `artifact` (`kind`, `name`, repository-relative `domain`,
exact root `source`), `evidence` (complete bounded ordered nodes and typed edges),
and `inputContract` (`id`, `completeness: "complete"`, projection fingerprint).
For a function, `artifact.source` contains the full declaration including body;
its evidence may contain local function and type nodes. Rule questions and criteria
remain in the one provider-neutral Effect `DecisionModel` call, using
`Decision.probability` for this branch prototype. A different typed result form
requires a separate #96 contract decision. No before-source, raw patch, task transcript, unrelated
file, or absolute path is sent. The renderer must have a deterministic version and
digest; UTF-8 request bytes are checked at the final JSON representation before
dispatch. The exact wire shape is a prototype acceptance item, not an invitation
to serialize current internal `ReviewUnit` records by accident.

The semantic evaluation key includes exact contract/renderer identity, canonical
path, branch/root identity, projection fingerprint, selected rule-definition and
effective-policy identities, and the complete evidence state. The exact file fingerprint
is retained for observation and revalidation even if a harmless unrelated edit
leaves the projection unchanged. Before backend dispatch, recheck consent,
advicee/working-root authority, and captured snapshot validity. Before advice
publication, recapture the named path and re-run selection, extraction, rule
selection, and rendering under current configuration. Publish only if the same
root remains attributable and the semantic evaluation key matches. A changed
root, referenced evidence, rule, renderer, contract, consent, or advicee makes
the result stale. An unrelated comment or sibling edit may retain a result only
when the canonical projection and all authority checks still match. An uncertain
recapture or root mapping suppresses publication. No whole-file equality shortcut
or raw-diff fallback substitutes for this check.

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

## Prototype and adoption checks

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
   exact request shape, consent/egress gating, stale suppression, and source-free
   coverage. A controlled backend checks one request per eligible unit and no
   request for any incomplete or rule-empty unit. Typecheck and run the
   focused and full suites before any adoption claim.
3. A paired, pre-registered live plan compares each proposed branch input with
   the currently supported input where applicable and an honest focused-diff or
   whole-file baseline on the *same* fixtures, rules, backend, and rule batch.
   Incomplete units and other inapplicable arms are marked before execution and
   excluded from semantic denominators; they may be tested offline without a
   paid call. Report semantic value, false advice on clear negatives,
   availability, extraction/render/backend/end-to-end timing, encoded request
   bytes, and source-egress scope separately. Require an explicit finite call and
   retry ceiling against remaining authorization. Keep ordinary tests offline and
   retain only sanitized aggregate live evidence.
4. Before production adoption, approve the fixture corpus, acceptance thresholds,
   capability vocabulary, exact renderer/wire contract, budgets, consent/egress
   preview, and host delivery strategy. A result that lacks coverage or available
   repetitions is inconclusive; failure of pre-registered semantic or safety gates
   rejects or narrows the branch. #16's failed paired gates cannot be silently
   replaced with retrospective easier thresholds. An approved branch then needs
   a separate implementation decision and host-profile conformance evidence.

## Open choices requiring review

- Prototype planning adopts the proposed narrow function scope and unit-wide
  completeness policy. The prototype must establish which capabilities are
  sufficiently checkable for each maintained rule; a rule cannot exempt an
  omitted edge.
- Exact analysis deadline, depth/reference/input ceilings, and whether the
  current 32 KiB/64-declaration capture envelope is enough for useful fixtures.
- Exact v2 schema syntax and renderer JSON shape after prototype fixtures expose
  the required fields. These must be frozen before implementation or live calls.
- Pre-registered paired semantic thresholds and permissible added egress for each
  branch. The final #16 outcome makes this a real adoption decision.
- Host-specific Add/Update mapping and advice delivery for Claude Code and
  OpenCode, informed by #97 and #94 rather than inferred from Codex.
