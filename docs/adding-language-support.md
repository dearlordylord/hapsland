# Adding another source language

**Purpose:** Reuse the TypeScript-to-Rust lessons when exploring another source language.
**Status:** Maintained advisory guide.
**Authority:** Product-specification advisory findings and implementation/validation evidence. Requirements remain owned by the [accepted type/function review contract](type-function-review-proposal.md), [rule evaluation model](../PRODUCT-RULE-EVALUATION-MODEL.md), and runtime contracts; this guide does not amend them.
**Expected use:** Plan a bounded language addition, identify assumptions to falsify, and assemble evidence for independent review.
**Lifecycle:** Contributors update this guide after each language addition or new counterexample. Review it whenever artifact, evidence, rule, or agent-runtime boundaries change; consolidate superseded advice into current guidance.

The Rust addition showed that much of Hapsland can remain shared while source
extraction changes. It also showed that recognizing declarations is only the
start: an apparently resolved name can hide missing evidence. A new language
needs its own explicit evidence boundary and validation cases.

## What Rust established

The active Rust scope is explicit top-level structs, enums, and type aliases,
with bounded type references across verified local Cargo modules. TypeScript retains its supported local
import traversal and function branch. TypeScript type shapes and Rust types use
the existing type-shape v1 input; TypeScript functions use their separate
function v1 contract. Rust functions, external-crate resolution, and compiler expansion
are deferred. Consult
the accepted contract for the exact current syntax and limits.

[Analyzer tests](../src/direct-event/rust-analyzer.test.ts) exercise extraction,
closure, limits, and adversarial syntax. [Pipeline tests](../src/direct-event/rust-pipeline.test.ts)
exercise attribution, rule capabilities, rendering, freshness, and refusal of
cross-language import binding. These are deterministic implementation evidence.

The [paired live record](../evidence/rust-support/paired-designs.json) demonstrates
one synthetic payment-state contrast for `r2_meaningless_combinations`: three
bad-design and three good-design requests met the declared threshold separation.
The [native record](../evidence/rust-support/native-codex.json) demonstrates a
finding, acknowledged repair, compiler checks, and a correlated clear follow-up
in a disposable source-checkout Codex CLI 0.156.0 session using `gpt-6-luna` at
max reasoning effort on Linux arm64. The prompt deliberately prescribed the
initial draft and suggested a repair; this is an integration demonstration,
not an unprompted agent-quality comparison.

These observations do not validate every Noul rule, broad Rust semantics,
reliable delivery across sessions, another agent runtime, or another platform.
The native run bypassed trust for a vetted disposable hook and did not validate
normal trust or the installed package. Provider metadata is not a language or
agent-runtime support target.

## Separate shared behavior from extraction

File selection, stable capture, changed-root attribution, rule admission,
capacity, freshness, Jev dispatch, and advice delivery remain shared boundaries.
Language extraction supplies declaration identities and kinds, exact source and
spans, reference bindings, and explicit omissions. Extend the shared artifact model only where the new
language needs a real distinction; preserve format version 1 for in-place
pre-release changes according to repository guidance.

The current Rust extractor is inline in [analyzer.ts](../src/direct-event/analyzer.ts).
It is not a public parser plugin API. Reusing this conceptual separation does
not require introducing an adapter framework before demonstrated variation
justifies one. New languages need not share Rust's declaration families.

## Assumptions to falsify first

- A builtin spelling is not proof of builtin binding. Rust structs, aliases,
  enums, traits, and unions can shadow wrapper names; an unsupported binding
  must remain unresolved rather than disappear from the reference graph.
- Generic wrappers do not make their payloads irrelevant. Traverse payloads
  and defaults; distinguish declared parameters from missing named evidence.
- Type syntax can embed value dependencies. Named or computed array sizes,
  discriminants, and const arguments must not silently become complete types.
- Macros and attributes can change names outside the selected root. Rust marks
  file scope uncertain for attributes anywhere, including unrelated functions,
  and for unsupported imports/modules, extern declarations, or macros. Ordinary doc
  comments are inert. A future language needs its own expansion boundary.
- A shared parser entry point does not authorize cross-language resolution.
  TypeScript imports cannot bind to Rust declarations just because `.rs` parses.
- Partial evidence is not a clean semantic judgment. Root-only custom rules
  may accept marked omissions; closure-dependent rules must skip missing
  evidence. Verify the exact capability gate and absence of a provider call.

## Establish module authority before traversal

A parser recognizing `use` is insufficient. Rust file roles come from Cargo
and `mod` declarations: custom crate roots exist, and an ordinary module can be
named `lib.rs`. Explicit binary targets can suppress an apparently standard
`src/main.rs`; a filesystem match alone can supply false evidence. Consult the
[Cargo target rules](https://doc.rust-lang.org/cargo/reference/cargo-targets.html)
and [Rust module rules](https://doc.rust-lang.org/reference/items/modules.html).
The implemented profile validates a bounded manifest subset and module chain,
then passes explicit role facts to extraction. Unsupported authority remains an
omission rather than a guessed binding.

For every new language, identify the owner of module identity, exported names,
aliases, visibility, shadowing, and extension/path choices. Keep reference-site
spelling distinct from canonical target identity. Traverse transitively using
the shared cycle and budget policy. Charge authority reads to the same budgets,
check them before reads, and retain their fingerprints for freshness even when
no source from them goes to Jev. Test custom roots, dormant targets, ambiguous
paths, excluded ancestors, alias collisions, and edits to binding metadata.
Cross-file support remains within one source language; recognizing another
extension does not authorize binding to it.

## Repeatable exploration

1. Declare scope before coding: root families, extensions, name resolution,
   builtin assumptions, supported syntax, omitted edges, size/work budgets,
   freshness, and rule capabilities. Name deferred features explicitly. Use
   the accepted contract owner for requirements; keep experiments advisory.
2. Build small positive, negative, superficially similar, ambiguous, and
   incomplete fixtures. Add adversarial shadowing, generic, expression,
   attribute/macro, cycle, limit, attribution, and import cases before relying
   on happy-path extraction. Expect unsupported cases to remain visible.
3. Run focused extraction and pipeline tests, TypeScript regression tests,
   typecheck, and required repository checks. Confirm selected files are
   checked before reads, projections stay bounded, missing evidence suppresses
   applicable rules, and stale results cannot publish. Fix failed gates.
4. Before live calls, save a finite declaration: fixtures, rules, expected
   outcomes, threshold, call/retry ceilings, time/source limits, credentials
   handling, and retained sanitized fields. Use the production Effect path.
   Count at the provider boundary; admission counts are not request counts.
5. For native execution, use the actual generated lifecycle and correlate
   edit, unit, provider completion, host output, repair, and follow-up identities.
   A completed host output write establishes submission; it does not establish
   model visibility. An agent acknowledgement and observed repair strengthen
   that run's evidence without proving reliable visibility.
6. Where a compiler can test the intended invariant, compile valid examples
   and reject explicit invalid constructions after repair. Keep these separate
   from review-quality claims. Compiler availability is not a universal
   prerequisite for every language or rule; choose independent domain checks.
7. Verify parser packaging, native assets, clean production-only installation,
   and each declared platform independently. [Package conformance](../scripts/run-clean-package-conformance.mjs)
   and [native release verification](../scripts/verify-native-release.mjs) are
   separate from live semantic validation; one cannot stand in for the other.
8. Obtain independent review of code, accepted scope, adversarial coverage,
   sanitized evidence, and failed attempts. Iterate until the declared gates
   pass or a genuine blocker is demonstrated; do not drop a gate to claim success.

## Preserve failures and classify their meaning

An intentional omission is a **scope limitation** when the contract states it
and capabilities prevent unsupported advice. A **blocker** prevents the proposed
scope from being sound or usable despite bounded iteration. A **harness artifact**
invalidates the experiment's conclusion until its observation path is repaired.
Use evidence to distinguish these outcomes; a passing final compiler check alone
cannot establish that Hapsland delivered advice.

The [first paired attempt](../evidence/rust-support/paired-attempt-1.json) failed
in result decoding and lost its in-memory request count. Preserve that unknown:
one completed decision operation does not establish exact billed attempts.
The native attempts [one](../evidence/rust-support/native-attempt-1.json),
[two](../evidence/rust-support/native-attempt-2.json), and
[three](../evidence/rust-support/native-attempt-3.json) retain incomplete outcomes.
The final native record explicitly amends attempt three's repair correlation
using the completed nonempty add after a temporary deletion, with no new paid
execution. Its amendment does not erase the earlier declaration or outcome.

Keep source, credentials, raw transcripts, and backend material out of retained
live evidence. Report known request counts and unknown billing separately, and
state the exact runtime, platform, fixture, rule, and observation limits alongside
any claimed result.
