# Issue #93: diff-selected type and function review target specification

**Purpose:** Define the direct-edit type and function review behavior.
**Audience:** Contributors, including coding agents; Rule authors; Product and specification owners.
**Status:** Accepted target.
**Authority:** Accepted product contract. Implementation and tests are separate evidence.
**Expected use:** Build and review the direct-edit path.
**Lifecycle:** Maintained as that path changes; review after a new owner decision or a changed runtime boundary.

Direct-edit review selects types and functions and captures related cross-file
source within the file-selection, rule-evidence, source-size, freshness, and
Jev-request limits below. Contract identifiers distinguish backend inputs;
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
selected context passed context-required accuracy, focused-diff controls, negative
controls, timing, and request size, but failed both required paired superiority
gates (context-only 0/3 and whole-file-dilution 0/2). The 2026-09-29 owner
decision authorizes cross-file source use within graph limits despite that result. The result
still does not show that the new input gives better advice.

### Accepted constraints carried into this specification

- A review is advisory after an edit; it never blocks or rolls back the edit.
- One selected root yields one candidate review unit. Rules whose declared
  evidence needs are met may share one logical Jev evaluation. Several changed
  roots yield independent units.
- Stable capture, exact advicee attribution, file selection before
  every source read, source sent to Jev within graph limits, and a fresh check before
  advice are mandatory. There is no separate repository approval step in
  the target behavior.
- Unsupported analysis, uncertain attribution, missing evidence needed by a rule,
  and clear assessments yield no agent-facing advice. Human status retains only
  source-free reason codes and counts.
- Directly changed roots are the only targets. Checkpoint reconciliation,
  shell/Stop discovery, and re-review of unchanged dependents are outside #93.

The remaining sections specify the accepted behavior. Validation and later
study work are named at the end. Runtime claims require separate test evidence.

## Source-analysis assumption

Source analysis assumes the completed agent edit leaves syntactically valid
source. Hapsland does not validate syntax and does not guarantee review of
incomplete or malformed source. Recovering unfinished edits or repairing syntax
is outside the review contract. No compiler invocation is required to establish
this assumption at runtime.

Syntactic validity does not establish complete review evidence. A valid program
can use types, bindings or dependencies outside the analysis profile;
those remain unsupported or explicitly incomplete. Rule evidence gates still
apply, and missing evidence is never a clear review result.

## Event and selection contract

`direct-root-selection` takes an attributed, completed direct edit event,
canonical working root, eligible repository-relative named paths, stable post-edit
snapshots, and patch-size and structure limits. Codex CLI `apply_patch` supplies patch
hunks; Hapsland verifies their location against the captured post-edit snapshot.
Claude Code `Edit` and `Write` supply edit data; Hapsland verifies it against the
captured snapshot and derives post-edit spans. Host delivery
behavior still needs host-specific evidence; OpenCode mapping remains separate.
Delete, move, metadata-only, unattributed writes,
and paths outside the existing capture/selection boundary are inapplicable.

The adapter must preserve each patch hunk's file and changed-line coordinates or
derive an equivalent verified location against the stable post-edit snapshot.
Textual line equality alone is insufficient when the same line occurs in multiple
declarations. Every changed post-edit span maps to the smallest eligible enclosing
root declaration. A signature/header change maps to its declaration. A change in
shared top-level material, an unmatched deletion with no stable root location,
or any location with more than one possible root is `ambiguous-attribution` and
selects no root for that span. Do not guess from the nearest declaration. If a
candidate contains both uniquely attributed and ambiguous spans, the unique roots
may proceed independently; the ambiguous spans remain unreviewed and counted.

For Add, every eligible named root in the newly added file is selected. For Update,
deduplicate the uniquely mapped roots across hunks. If no eligible root maps,
the path is quietly `no-supported-root`. A change only to a reference declaration
selects that declaration; it does not automatically select unchanged users of it.
Selections are deduplicated by canonical path, branch, root identity, and captured
snapshot within the event. Selection must not infer a complete change set from a
partial or unstable capture.

## Source-language adapter boundary

Source-language support stays at cohesive adapters, including TypeScript.
Adapters own grammar setup, syntax extraction, name-binding context, and import
candidate conventions. The shared analysis and traversal host consumes common
artifact, reference, visibility, and location facts. Language context remains
inside adapter sessions; generic traversal does not carry Rust-specific flags,
interpret Cargo manifests, or select TS/TSX grammars. A static registry selects
adapters and supplies their offline parser probes. Shared selection,
stable capture, canonical graph budgets, rule admission, freshness, rendering,
and backend dispatch remain product responsibilities. This boundary does not
expand syntax coverage, external crates, Bend hub imports, or ambiguous binding.

## Branch contracts

For current adapter implementation guidance and a reusable validation workflow, see
[Adding a source-language adapter](adding-language-support.md). That guide does not
amend the contracts below.

| Contract | Artifact root | Proposed evidence projection | Inapplicable examples |
| --- | --- | --- | --- |
| `direct-event/type-shape/v1` | One uniquely named TypeScript `interface` or `type` alias in `.ts`, `.tsx`, `.mts`, or `.cts` | Exact root declaration and outbound named-type reference graph within graph limits with marked omissions, following local imports the analyzer resolves across selected files | Declaration merging, ambiguous binding, unsupported graph syntax, unresolved or excluded evidence needed by a selected rule |
| `direct-event/type-shape/v1` | One uniquely named, explicit top-level Bend `type` in `.bend` | Exact datatype declaration, constructors, and outbound named-type references within the same file or through explicit relative `.bend` alias imports, subject to graph limits | Dependent/computed types, unsupported surface syntax, hub/bare/absolute imports, ambiguous binding, or missing evidence required by a selected rule |
| `direct-event/type-shape/v1` | One uniquely named, explicit top-level Rust `struct`, `enum`, or `type` alias in `.rs` | Exact root declaration and outbound named-type references within graph limits across verified local Cargo modules | Conditional compilation, macro-dependent declarations, unsupported type syntax, ambiguous binding, unresolved module/external paths, or missing evidence needed by a selected rule |
| `direct-event/function/v1` | One uniquely named, top-level TypeScript function declaration or supported immutable const callable in those extensions | Exact signature and body and directly referenced type and named-function graph within graph limits with marked omissions, following local imports the analyzer resolves across selected files | Unbound anonymous functions, methods, overload groups, mutable/dynamic callable bindings, dynamic/computed calls, unresolved or excluded evidence needed by a selected rule |

These contract IDs replace the former production
`direct-event/same-file-named-types/v1` input. A type declaration and function with the
same spelling remain different artifacts. Mutable or unsupported function-like values,
class methods, callbacks, constructors, accessors, schemas, namespaces,
and independently selected cross-file roots are deferred. A referenced declaration
in another file is supporting evidence, not a new changed root. The function branch must identify its body and
signature together; signature-only input cannot answer body-dependent rules.

### Named TypeScript callables (#254)

The #254 implementation request expands the existing function contract in place;
input, rule, IPC and inspection formats remain version 1. A supported const
callable is a single top-level `const` declarator with an identifier binding and
an arrow initializer, including async arrows, expression/block bodies, generic
parameters and an explicit callable type annotation. Its artifact retains the
exact complete declaration, export marker, signature and body. The declaration's
half-open location includes its header, so a verified body or header edit selects
that root; an unrelated sibling does not become a changed root. Ordinary binding,
type/call reference, graph, confidentiality, source and resident limits apply.

The same representation supports a single inline arrow, anonymous function or
generator argument to `Effect.fn`, `Effect.fn("literal label")` or
`Effect.fnUntraced`. `Effect` must be established by a value import of
`{ Effect }` from `effect`, or a namespace import from `effect/Effect`; import
aliases are supported. The known wrapper is part of the exact artifact source,
not a separately expanded external-package dependency. References inside the
inline callable and its signature remain subject to ordinary evidence gates.
Type-only imports, shadowed wrapper bindings, computed/dynamic wrapper names or
labels or wrapper type arguments, additional transform arguments, multiple declarators and mutable
bindings do not establish supported callable roots. Methods, top-level test
callbacks, factories and arbitrary wrapper composition remain deferred.

Overload groups are excluded as a group, including their implementation. A
supported neighboring root may proceed independently; referencing an excluded
implementation remains incomplete evidence. The inspector reports
`function-overload` for an edited excluded group and `unsupported-callable` for
an observed unsupported callable form. Unavailable function analysis and absence
of supported function roots have function-specific explanations rather than
borrowing a failed type analyzer's `import` reason. Missing or ambiguous binding
evidence remains explicit in completeness and omission records. A rule lacking
required evidence does not run and cannot receive a clear/no-finding result;
rules whose required evidence is present retain the existing
`incomplete-irrelevant` path. These facts survive the existing
version-one inspection validation, rendering and replay boundaries.

Preflight reserves the newly supported roots before materialization. The existing
64-declaration ceiling is retained, including functions, types and named callable exclusions; a file that
exceeds it cannot publish a partial function map. Large ordinary files may still
be refused by declaration or workspace limits. Supporting new callable syntax
is not a promise to review every declaration in an arbitrarily large file.

Rust uses the active type-shape v1 input, with local cross-file projection. Rust
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
abstract types are unavailable evidence. Arrays require integer-literal lengths; named
constants and computed lengths are omitted. Non-integer enum discriminants and
const generic arguments are also unavailable evidence. Raw identifiers are
conservatively rejected by this parser profile. Unsupported imports or modules, an extern-crate
declaration, foreign extern block, macro definition/invocation, or attribute
anywhere in the file makes the scope uncertain for every root. This includes
`derive`, `cfg`, and attributes on unrelated functions: procedural expansion can
introduce type bindings. Ordinary doc comments do not create this uncertainty.
These roots remain selectable, but only rules whose declared evidence needs
permit the omissions can run; root-declaration-only rules may review partial
evidence, while rules requiring complete type closure cannot.

Rust module resolution requires an eligible nearest `Cargo.toml` with explicit
package edition 2018, 2021, or 2024 and an accepted local library or binary target.
Accepted manifest forms include default or explicit relative library paths
and explicit binary name/path pairs. Explicit binary tables disable automatic
binary inference conservatively. Workspace-inherited editions, target edition
overrides, custom build targets, test/example/bench target tables, and source
roles in automatic test/example/bench directories are unsupported. Crate roots
come from the manifest, not source filenames. Explicit external
`mod child;` declarations establish module roles along the selected source's
ancestor chain. Exactly one of `child.rs` and `child/mod.rs` must exist. A module
named `lib.rs` or `main.rs` uses ordinary module layout when declared as a child.
Direct `use child::Type`, `self::child::Type`, their aliases and flat lists, and
qualified references through those bindings resolve. `crate::child::Type`
uses the verified crate-root module map. Re-exports, glob imports, inline modules,
external crates, path attributes, and unsupported module chains remain omitted.
Supporting declarations must have accepted public visibility. Namespace
collisions and generic parameter shadowing cannot establish a binding.

Cargo metadata and captured crate/ancestor modules count toward graph file,
read-byte, work, and deadline limits. They are freshness dependencies even when
no declaration from them appears in the rendered evidence. Cargo manifests and
module ancestors must pass the same repository containment, exclusion, ignore,
and selection checks as supporting type sources. Only referenced declarations
are included in provider input; Cargo contents and unrelated ancestor bodies
are binding evidence retained locally.

Bend uses type-shape v1 with concrete artifact kind `datatype`. This is a
Bend 2 surface extractor, not a compiler dependency or proof checker.
The header must be a single line `type Name is Data:` or `is Type:`, optionally
with ordinary or erased `Data`/`Type` parameters, such as
`type Box<A: Data> is Data:` or `type Box<-A: Data> is Data:`.
Explicit `Quant` parameters and bare quantity binders bind quantity arguments
separately from datatype names. `Kind(q)` parameters and result kinds are admitted
only when `q` is a bound quantity; computed kinds remain unsupported.
Constructors use two spaces and one line `Name{field: Type, ...}`; empty
datatypes and recursive references are permitted. Field types are simple names
or nested named datatype applications with `<...>`, including alias-qualified
references such as `R.Receipt`. Application arguments may also be the quantity
literals `&0`, `&1`, `&2`, or an explicitly bound quantity parameter. These
arguments are not datatype dependencies; nested datatype arguments still require
their own evidence. Generic parameters are local binders. Names in this profile
use ASCII letters, digits and underscores.
The exact root source and line/column ranges are retained, including comments
inside the declaration. Leading/trailing standalone comments are not part of
the declaration's attribution range.

Only the literal leading `import Base` admits the leaf assumptions `Empty`,
`Unit`, `Bool`, `Cmp`, `Nat`, `U32`, `F32`, `Char`, and `String`. These names
are treated as known Base leaves, not expanded library declarations; this
assumption is part of the profile, not evidence of a compiler-verified import.
A same-file type, def, or law binding takes precedence over leaf assumptions.
With leading `import Base` and no shadowing, `List` resolves to its exact
declaration from the pinned compiler’s Base library,
recorded in the [generated catalog](../packages/source-analysis/src/direct-event/languages/bend/base-declarations.generated.json).
Its origin carries the compiler version and source revision plus hashes of the
Base module and declaration. It has no project path and cannot become an edited
root. Its own parameters and recursive references resolve in library scope,
without borrowing project bindings. Other composite Base types, including
`Maybe`, `Result`, and `Array`, remain unresolved unless declared locally.
Local bindings take precedence over bundled evidence.
Leading imports of the form `import ./receipt.bend as R` or
`import ../shared/receipt.bend as R` bind the first dotted segment of a type
reference to that file; `R.Receipt` resolves `Receipt` there. Paths use plain
ASCII name segments (letters, digits, underscores, and hyphens) and a `.bend`
extension. Traversal can follow resolvable aliases transitively; imported
declarations remain supporting evidence, never independently selected roots.
Aliases must be unique and cannot conflict with local binding prefixes or
constructors. With `import Base`, alias prefixes matching the inspected Base
type/def/law/constructor namespaces make every root incomplete, and their
qualified references cannot resolve as imported evidence. This conservative
name-only refusal set is generated from the pinned `bend2/base.bend` into
the same catalog. Review the curated leaf assumptions when the profile changes;
the catalog identity does not establish arbitrary installed compiler versions. Generic-parameter or earlier-field shadowing makes the affected
reference unsupported. Unsupported hub, bare, absolute, malformed, or late
imports cannot establish a binding; unsupported leading imports mark every
root incomplete, while late imports reject the file. Unknown qualified names
remain unresolved. No cross-language imports provide evidence, and extraction
never executes source or fetches packages. Before any supporting project-file
capture, the
shared resolver applies containment, selection, exclusions, Git-ignore, symlink,
and graph-budget checks. Captures are shared across roots for an observation;
freshness includes contributing source and import bindings. Bundled declarations
consume the same source-byte, declaration, traversal, and tree budgets as other
supporting evidence. Their bytes and origin participate in semantic identity;
project captures retain their ordinary freshness checks. Static reference
cycles terminate in the evidence graph; this does not establish that the compiler
can load an import cycle.

Computed kinds and quantity arguments, other term applications,
dependent fields, proof/equality terms, function/product/sum types, reusable
`+` types, and unsupported parameter forms remain explicit omissions.
Multiline constructors and other indentation styles remain incomplete evidence;
unsupported headers and unrecognized top-level syntax are outside the
profile. Bend defs/laws are not review roots; their bodies are not checked.
Comments and single/double quoted literals in unrelated bodies cannot introduce
type declarations or import bindings, and do not prevent eligible datatype
extraction. Literal-dependent syntax inside a datatype remains incomplete;
masking literal contents must not manufacture complete type evidence. Exact
datatype source and coordinates still come from the original captured text.
This lexical isolation does not add malformed-source recovery or syntax checking.
Extraction does not establish compiler validity,
termination, law coverage, or proof correctness. Rule evidence gates and all
existing shared source, graph, work, and freshness limits apply.

The candidate projection walks outbound references from the root,
including statically bound local imports of eligible TypeScript declarations.
Cross-language imports do not provide supporting evidence. Resolve an import to a
canonical repository-relative path and declaration identity; a text-name match
alone never establishes a binding. Before reading **each** newly discovered
source file, check root containment,
protected/privacy exclusions, Git ignore, and configured context selection. Capture
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
tracks the precise resolution scope and a separate dashboard
state-machine diagram. That diagram uses the same checked transition adapter
as production and distinguishes native facts from Bend decisions.

For example, if selected root A.ts refers to B.ts, B.ts refers to C.ts, context
selection permits B and denies C, capture A and B after their individual checks.
Check C's path but never read C's source. Mark the blocked edge as omitted and
keep checking later edges. Rules that need C do not run; a rule whose declared
needs are met by A and B may run with the omission marked in its input.
Independent roots pass root selection. Neither privacy-denied source nor context-denied
supporting source is copied into an allowed root's review input.

The target per-source-file stable-capture ceiling is **256 KiB inclusive**. A
lower configured ceiling applies on every declared platform; native capture
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

`EvidenceCompleteness` is checked **for each rule** against the candidate.
`complete` means no graph edge was omitted. `incomplete-irrelevant` means an edge
was omitted but the selected rule does not require that evidence. Both states may
form an input with the omission marked; a rule with missing required evidence
does not run. If no rule remains, there is no backend request. An incomplete
candidate never becomes a clear/no-finding result for a rule that did not run.
The implementation must check the graph boundary and each rule's declared needs;
"complete" cannot be assumed from unparsed syntax.

## Rule and configuration contract

Rules use one version-one JSONC document per file. Configuration owns path policy.
The [configuration guide](configuration.md#declarative-rules) describes authoring;
[compatibility contract](review-contract-compatibility.md#configuration-and-individual-rules) owns layering.

Each rule declares `inputs`: accepted combinations of `languages`, `kind`, and
`requires`. Input kinds are `type` for TypeScript/Rust/Bend and `function` for
TypeScript. The compiler maps those combinations to the exact input contracts in
this document. Authors specify semantic requirements, not wire contract identifiers.
Type requirements are `root-declaration`, `resolved-outbound-types`, and
`selected-source-type-closure`; function requirements are `signature`, `body`,
`resolved-local-calls`, and `resolved-outbound-types`. A root with no outbound
references can satisfy complete closure. Each entry has distinct, nonempty languages and distinct requirements. `requires`
may be empty: it adds no evidence requirement beyond an extracted root,
and does not establish complete dependency evidence. Duplicate language/kind combinations fail validation. Enabled inputs selected by
configured languages must have accepted combinations and requirements; otherwise
configuration fails before source capture.

Runtime validation schemas, including Zod and Effect Schema, are a separate future
input form requiring an explicitly implemented dialect and extraction contract. A disabled rule may store such an input, but enabling a selected schema input fails.
A multi-input definition may run its accepted combinations if its configured
languages exclude all unsupported inputs. This does not add schema execution support.
Concrete values are not supported roots.
The evidence model has no raw/type/schema ranking: capabilities and observed
evidence establish eligibility. Rule-file validation schemas are not review inputs.

Configuration declares each rule by path. An inherited identity can be
configured by ID without redefining its source. Settings select enablement, languages,
root paths, threshold, and message. The rule itself contains no file applicability
policy. Configured rule languages must be a subset of authored languages; a language outside
that set is a configuration error. Within that boundary, per-rule selections intersect
global root selection and cannot add an analyzer or input capability.

`includes`/`excludes` select review roots; `contextIncludes`/`contextExcludes` select
supporting files. Omitted context selection follows root file selection, so narrowing
roots does not silently expand reads. An explicit context scope may add `shared/**`
without selecting unchanged or edited roots there. Every read still passes
`privacyExcludes`, containment, protected paths, Git ignore, and capture limits.
No context or rule setting bypasses these restrictions. Language settings select
roots; dependency traversal remains subject to the root's language-adapter limits.

A selected rule runs only when its language, kind, configured paths, and required
evidence all match. No backend request is sent if no rule remains. Rule identity
includes the stable ID and exact definition digest; input identity includes the
selected input entry, renderer/contract, and effective activation, language, path,
threshold and message policy. Definition or policy changes invalidate affected reuse.
Different questions, criteria, or feedback for different branches use distinct rules.

## Review unit, identity, input, and publication

One review unit has one selected root. Its supporting evidence can come from
several files. A type root contains its declaration and referenced types. A
function root contains its full signature and body, plus required functions
and types. For each unit, record:

- The root's repository-relative path, kind, name, and location.
- A fingerprint of the exact bytes captured from each contributing file and
  each declaration used in the unit.
- One fingerprint of the ordered evidence tree and omission markers
  that Jev will see.
- Which evidence types the candidate supports and which rules need omitted evidence.

The event ID and advicee do not change the meaning of identical review
evidence. A review work item still records the observation, the advicee, the
selected rules, and the exact input format so the result goes to the right
agent.

`ReviewInput` is versioned separately for each branch. The Jev payload is
a JSON value containing `artifact` (`kind`, `name`, repository-relative `domain`,
exact root `source`), `evidence` (ordered nodes and typed edges, including
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

The compatibility contract owns [edit-owned settings](review-contract-compatibility.md#edit-owned-settings)
and [source freshness, review identity and result reuse](review-contract-compatibility.md#freshness-and-result-reuse).
The advice contract owns [recipient and physical-root identity](advicing-target-contract.md#advicee-identity-and-admission)
and [final handoff authority](advicing-target-contract.md#handoff-reoffer-and-continuation-count).

## Quiet skip and human coverage

Agent-facing output contains actionable findings only. Ordinary inapplicability,
analysis uncertainty and missing evidence needed by a rule produce no advice or generic
error message. A source-free local status may aggregate counts by branch
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
   per-rule evidence checks and strict version-one input validation,
   exact request shape, root/context selection and privacy checks before any source read
   (including A → B → excluded C),
   no read of excluded C, continued traversal within graph limits after a contribution
   exceeds the remaining tree budget,
   accepted tree size at or below 20 KiB, stale suppression, and source-free
   coverage. A controlled backend checks one request per eligible unit and no
   request when no rule has sufficient evidence. Typecheck and run the
   focused and full suites as implementation validation.
3. A later paired, pre-registered live plan can compare each branch input with
   the applicable input contract and an honest focused-diff or
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
- Revisit graph and resident limits only with evidence and
  contract review.
- If a later paired study is run, declare its thresholds and source scope
  before live calls. The final #16 outcome remains prior evidence.
- Continue host-specific advice delivery validation for Claude Code and
  OpenCode, informed by #97 and #94 rather than inferred from Codex.
