# Adding a source-language adapter

**Purpose:** Describe the current adapter architecture and the repeatable workflow for adding a source language to Hapsland.
**Audience:** Contributors, including coding agents implementing source-language adapters.
**Status:** Maintained contributor guidance.
**Authority:** Implementation guidance and links to validation evidence. The [accepted type/function review contract](type-function-review-proposal.md), [rule evaluation model](../PRODUCT-RULE-EVALUATION-MODEL.md), and runtime contracts own product requirements; this guide does not amend them.
**Expected use:** Implement, test, and review a source-language adapter.
**Lifecycle:** Update with adapter interfaces, analysis profiles, validation tools, or new binding counterexamples. Review whenever parser/compiler assumptions, capture boundaries, rule capabilities, or agent-runtime profiles change.

## Current implementation

TypeScript, Rust, Bend and the partial Go active-package profile use the shared review pipeline. Go resolves package bindings across eligible active sibling files, preserving file-local imports and generic parameter shadows. It never resolves another package or assumes a closed set of interface implementers. See the [Go authority profile](type-function-review-proposal.md#go-active-package-constraint-subset). The
[README language table](../README.md#languages-and-limits) describes user-facing
support; the [branch contracts](type-function-review-proposal.md#branch-contracts)
own exact syntax, binding, and omission rules. External crates, Bend hub imports,
and unsupported or ambiguous bindings remain outside resolution scope. Bend’s
pinned Base `List` is the bounded bundled-evidence exception, owned by the
[Bend profile](type-function-review-proposal.md#branch-contracts).

Source-language code lives in
[`src/direct-event/languages/`](../src/direct-event/languages). The static
[registry](../packages/source-analysis/src/direct-event/languages/registry.ts) selects adapters by their
extension metadata. It is not a dynamic plugin system.

Analysis assumes syntactically valid source after a completed agent edit, as
defined by the [source-analysis assumption](type-function-review-proposal.md#source-analysis-assumption).
Hapsland is not a syntax checker and does not guarantee analysis of incomplete or
malformed source. Do not introduce editor-style recovery merely to support such
inputs. Keep syntax validity separate from evidence completeness: unsupported
types and missing or ambiguous dependencies still require omissions and rule
gating. For Bend, unrelated def/law bodies and literals must not obscure datatype declarations or create bindings from literal text.

| Responsibility | Owner |
| --- | --- |
| Grammar setup, extraction, exact declaration source and locations, bindings, import candidates, parser smoke probe | Source-language adapter |
| Language-specific module authority and session context | Adapter `prepareGraph` and its graph-session closure |
| Common declaration/reference/location interfaces | [Adapter contracts](../packages/source-analysis/src/direct-event/languages/contracts.ts) |
| Selection, containment, stable captures, exclusions, graph budgets, cycle termination, freshness | Shared host and resolver |
| Edited-root attribution, evidence capability gates, rendering, Jev dispatch, advice delivery | Shared review pipeline and runtime adapters |
| Native parser artifacts and clean release installation | Packaging and conformance tooling |

TypeScript type and function extraction share native grammar setup. Rust keeps
Cargo/module authority inside its adapter. Bend uses an independent surface
extractor returning common facts; it does not fabricate TypeScript syntax nodes
or execute the compiler on edited files. Generic traversal must not acquire
language flags, grammar selection, or filename conventions. Bundled declarations
use explicit library origins and supporting-only identities, never invented
project captures. Their catalog is generated from the selected build toolchain;
runtime analysis does not invoke that toolchain.

## Adding a language

1. Decide the analysis profile in the contract owner: extensions, root families,
   syntax, builtin assumptions, bindings, module authority, omissions, and rule
   capabilities. Supporting a parser does not establish language-wide support.
2. Implement a cohesive adapter against `LanguageAdapter`. Return exact source,
   locations, declaration kinds, visibility, references, and explicit omissions.
   Keep reference spelling distinct from canonical target identity. Keep
   language-specific context in the graph session.
3. Establish module identity before traversal. Identify aliases, exports,
   visibility, shadowing, target roles, and path conventions. Authority reads
   must use shared capture eligibility and budgets; retain their fingerprints
   for freshness even when their contents do not go to Jev. Never infer
   cross-language bindings from a recognized extension.
4. Register the adapter with its extensions and smoke probe. Change shared
   artifact/schema contracts only when a real semantic distinction requires it.
   Follow repository pre-release policy: update version-one formats in place and
   remove superseded paths.
5. Add extraction and pipeline coverage, then run regression, packaging, and
   native-agent validation described below. Review the complete adapter boundary,
   accepted scope, and failures before claiming support.
6. Update user-facing support and limitations in the README and contract owner.
   Keep evidence in executable tests and sanitized records rather than a second
   research report or a narrative change log.

## Binding and attribution checks

The Bend lexical boundary borrows the separation of literal/comment tokens from
declaration recognition in [bend-idea's lexer](https://github.com/dearlordylord/bend-idea/blob/499fecb8dd9fbc8ea9e77c7ab75b4454cab6221b/src/main/scala/com/dearlordylord/bend/idea/syntax/lexer/BendLexer.scala).
It uses a separate boundary projection and a semantic projection with literal
markers, while source and positions come from the original capture. This adopts
neither the editor's malformed-input recovery nor its JVM/IntelliJ dependency.
Compare new lexical examples with the development compiler when changing the
profile; compiler acceptance and available evidence are separate assertions.

Test plausible-looking bindings as well as happy paths:

- Builtin names can be shadowed by declarations, aliases, traits, constructors,
  or unsupported bindings. A spelling alone cannot justify a leaf assumption.
- Generic wrappers still require payload and default traversal. Type syntax can
  contain values, computed sizes, discriminants, dependent fields, or proofs;
  unsupported dependencies must remain visible omissions.
- Expansion features can affect bindings beyond the selected root. State the
  attribute/macro boundary explicitly; do not silently treat uncertain names as
  complete evidence.
- Preserve full binding identities before checking conflicts. Bend `type T`
  competing with `def T` or `law T` is ambiguous; `def T.show` is a distinct name.
  Relative aliases resolve the first dotted segment and can collide with Base
  namespace prefixes or local binders.
- Verify module authority and candidate uniqueness before reading. Rust custom
  crate roots, ordinary modules named `lib.rs`, and explicit binary targets
  require role evidence rather than filename guesses. Test ambiguous candidate
  paths, dormant targets, excluded ancestors, and changed binding metadata.
- Attribute Update spans only to uniquely enclosing declarations. Import changes
  and other top-level spans can remain `ambiguous-update`. Preserve imports when
  a fixture intends to test a declaration-only repair; test ambiguous spans
  separately. Add selects eligible named roots in the added file.
- Closure-dependent rules must skip missing evidence. Root-only rules may accept
  marked partial evidence only when their declared capabilities permit it.
  Verify the absence of a provider call for inadmissible units.

## Offline verification

| Coverage | Existing examples |
| --- | --- |
| Extraction, references, exact source/ranges, shadowing, syntax omissions | [TypeScript](../src/direct-event/analyzer.test.ts), [Rust](../src/direct-event/rust-analyzer.test.ts), [Bend](../src/direct-event/bend-analyzer.test.ts), [Go](../src/direct-event/go-analyzer.unit.test.ts) |
| Attribution, rendering, rule admission, supporting captures and freshness | [TypeScript](../src/direct-event/pipeline.test.ts), [Rust](../src/direct-event/rust-pipeline.test.ts), [Bend](../src/direct-event/bend-pipeline.test.ts), [Go](../src/direct-event/go-pipeline.unit.test.ts) |
| Cohesive adapter ownership | [Architecture guard](../src/direct-event/language-boundary.test.ts) |
| Shared graph authority and traversal | [Authority tests](../src/direct-event/graph-resolver-authority.test.ts), [resolver tests](../src/direct-event/graph-resolver.test.ts) |

Include transitive imports, alias/binder conflicts, cycles, declaration/reference
limits, supporting-file read sharing, and mutation/restore freshness checks.
Excluded, ignored, symlinked, outside-root, or cross-language targets must not be
read. Cycle termination in static evidence does not prove compiler loadability.
Native parser nodes may have distinct JavaScript wrappers for the same syntax
node; compare syntax identity using kind and source spans.

Run focused tests, `npm run typecheck`, and the required repository checks.
[Clean-package conformance](../scripts/run-clean-package-conformance.mjs) and
[native artifact verification](../scripts/verify-native-release.mjs) establish
separate packaging properties. Current adapter-layout package checkpoints are
recorded for [Linux arm64](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/cross-file-support/adapter-linux-package.json)
and [macOS arm64](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/cross-file-support/adapter-macos-package.json);
the [offline preparation record](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/cross-file-support/adapter-offline-preparation.json)
covers split-file compiler and freshness checks. Each record identifies its
own revision and artifact; none substitutes for validation after a new change.

## Retained Go partial-profile qualification

The #271 package slice was qualified on 2026-10-09 with Node 24.20.0,
Bun 1.3.14, pinned tree-sitter runtime 0.25.0 and Go grammar 0.25.0,
Claude Code 2.1.218 and Go 1.27.2 on Linux arm64. Analysis target authority
remains the frozen configuration described in the contract; the installed
fixture is unconditional, and its compiler used GOOS=linux, GOARCH=arm64,
CGO_ENABLED=0. No review-host target was inferred.

`npm run typecheck`, `npm run check:fast` (71 unit tests plus source types,
assets and changed-file lint), the affected shared/language consumer checks,
120 focused native-owner/receipt/loader/boundary tests and 3 native binding
probes passed. Product assembly and native-release validation covered Linux
arm64 and Darwin arm64 assets; only Linux execution was tested. Clean-package
conformance passed including partial update recovery, exact independently
selected resident executable/hash/lifetime and controlled review. Earlier
missing workspace exports, submodule/native-input prerequisites, loader
allowlists and inherited-home harness failures did not qualify.

The installed controlled Go adoption witness demonstrated native Write/Edit
attribution, sibling evidence at provider input (3 evidence nodes, 3 expanded
edges, no omissions), delivered advice, agent acknowledgement, repair,
compiler acceptance, rejected interface composite literal and completed clear
follow-up. Archive SHA-256 was
`baa575a9f8819d0b4cd1a7efbeb5bfd90f773e266c6eb6352bb5534fe9da2677`;
its 44 runtime assets had digest
`2763246aa7c06c9d3c30e3f0518fa75c7c3afa939d8a3ea2e1d9abde99b5bbcc`.
The executable source and harness fixes were present in the worktree while
HEAD was d8204ffc; the later handoff documentation does not change those
runtime inputs. Source-free local witness
`claude-go-adoption-controlled-offline-1791589588864.json` reported
`demonstrated`, zero Jev requests and no retained source/provider body/raw host
stream/credentials. Normal interactive trust and live Jev quality were not
tested. The open-interface repair proves the observed loop and compiler case,
not a closed hierarchy or exclusion of every invalid runtime state.

This is a parent #267 handoff for the local-package slice, not the #268 coverage
study. External packages, cgo authority and unknown build constraints remain
explicit omissions; functions/methods and constant-only review demand remain
outside this profile. The shared V1 artifact, rule, native and packaging owners
must merge both Go and Python registrations/pins/assets at integration. These
checks qualify this slice, not the combined Python/Go candidate.

## Go continuation qualification

The continuation reapplies retained candidate `f564aa221007e6a52ebf642e645e4a1db0c4c3be`
onto base `47fdf0f0afffc6eca9f613813eee7e533808e082`, preserving the Astro
website changes. The retained observations above keep their original source,
archive and runtime identities; they are not new-base execution claims.
Their original source-free declaration and result are retained locally under
`evidence/native-languages/` (ignored validation artifacts).

A fresh independent review found a missing constant group for parenthesized
explicit named types and aliases. The fix preserves those identities, including
instantiated aliases, without rewriting source or computing constant values.
The second review found that a generic alias parameter could be mistaken for
a same-named package type. Alias identity now uses the same parameter scope as
type references; analyzer and provider regressions exclude unrelated constants.
The original imported-source shared consumer run passed 222 tests. The fixed
source passed all 73 unit tests, including the new analyzer and actual provider
projection regressions, and `check:fast` with `VITEST_MAX_WORKERS=1`; test and
product deadlines were unchanged. The original parallel unit run timed out in
an existing directory-budget test; serial qualification passed that case.
The current native owner, loader, receipt, loading/packaging and hook-boundary
selection passed 139 checks. Manual `docs:generated:check` passed after preparing
current exports. Missing-export and overlapping-preparation attempts do not
qualify. These are focused local checks, not full-project coverage.
After the binder fix, all 75 source unit tests and 39 focused Go tests against
rebuilt workspace exports passed. The first new-base package attempt exceeded
its internal packing deadline while building; it does not qualify installation.

## Real-agent verification

The [native runner](../scripts/run-native-crossfile-current.mjs) contains
TypeScript, Rust, Bend, and Go cross-file payment-state fixtures and compiler probes.
The partial Go adoption fixture captures sibling defined types and an original
typed iota group. Its repair uses an open interface: the compiler rejects a
composite literal of that interface, but this does not establish a closed set
of implementers or eliminate every invalid runtime state.
The [testing matrix](testing-matrix.md) owns the commands for its controlled,
paid, and negative scenarios across the declared agent and language profiles.
Paid runs require a checkout with dependencies, compiler tools, agent
authentication, and a Jev credential available.

Each invocation writes its declaration before execution: at most 6 Jev requests,
4 minutes for the host, and no automatic host retries. Six invocations have a
36-request ceiling. The runner checks exact runtime versions; supply its pinned
Codex executable through `HAPSLAND_TEST_CODEX` if needed. The Claude executable
is pinned in the runner. Updating a profile requires new validation.

Require observed draft editing, cross-file evidence at the actual provider
boundary, delivered advice, agent acknowledgement and subsequent repair,
compiler acceptance, rejection of an invalid construction, and completed
follow-up review. Count actual transport requests, including retries, rather
than admissions. Use the production Effect integration. A completed hook write
alone does not establish model visibility, and compiler acceptance alone does
not establish advice delivery.

The [current matrix index](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-languages/index.json) points to six
successful final runs on implementation commit
`a241eb5f554c112609047df97079bc404580d339`: Codex CLI and Claude Code each exercised all three languages and reached a clear follow-up.
Final runs used 12 Jev requests; retained earlier attempts used another 8.
Six subsequent controlled offline host runs also completed the adoption path
without Jev requests; an earlier Claude Bend attempt that did not repair
remains recorded separately.
These are prompted synthetic integration demonstrations on Linux arm64, using
source-checkout entry points and explicitly configured lifecycle hooks. They do
not establish normal Codex trust onboarding, installed-package behavior, newer
runtime compatibility, general review accuracy, or unprompted agent quality.
Bend compiler checks do not establish formal proofs.
The [negative matrix](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-negative/index.json) separately covers
reviewer failure, failed or slow edit hooks, and an older finding after a newer
edit, all with real agents and a controlled offline reviewer. It makes no Jev
requests and does not extend the paid adoption claim.

Declarations and source-free results stay under `evidence/native-languages/`.
Discard source repositories, copied credentials, raw host streams, and provider
bodies. Preserve experiment declarations and incomplete outcomes as evidence;
distinguish scope omissions, product defects, harness errors, and unknown causes.
After a harness correction, make a new declared attempt rather than relabeling
an earlier failed measurement. Keep the current summary in the index, with
historical details in the records.
