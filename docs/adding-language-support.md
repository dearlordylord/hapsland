# Adding a source-language adapter

**Purpose:** Describe the current adapter architecture and the repeatable workflow for adding a source language to Hapsland.
**Audience:** Contributors, including coding agents implementing source-language adapters.
**Status:** Maintained contributor guidance.
**Authority:** Implementation guidance and links to validation evidence. The [accepted type/function review contract](type-function-review-proposal.md), [rule evaluation model](../PRODUCT-RULE-EVALUATION-MODEL.md), and runtime contracts own product requirements; this guide does not amend them.
**Expected use:** Implement, test, and review a source-language adapter.
**Lifecycle:** Update with adapter interfaces, analysis profiles, validation tools, or new binding counterexamples. Review whenever parser/compiler assumptions, capture boundaries, rule capabilities, or agent-runtime profiles change.

## Current implementation

TypeScript, Rust, and Bend use the shared review pipeline. The
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
| Extraction, references, exact source/ranges, shadowing, syntax omissions | [TypeScript](../src/direct-event/analyzer.test.ts), [Rust](../src/direct-event/rust-analyzer.test.ts), [Bend](../src/direct-event/bend-analyzer.test.ts) |
| Attribution, rendering, rule admission, supporting captures and freshness | [TypeScript](../src/direct-event/pipeline.test.ts), [Rust](../src/direct-event/rust-pipeline.test.ts), [Bend](../src/direct-event/bend-pipeline.test.ts) |
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

## Real-agent verification

The [native runner](../scripts/run-native-crossfile-current.mjs) contains
TypeScript, Rust, and Bend cross-file payment-state fixtures and compiler probes.
The [testing matrix](testing-matrix.md) owns the commands for its controlled,
paid, and negative scenarios across both agent runtimes and all three languages.
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
`a241eb5f554c112609047df97079bc404580d339`: Codex CLI 0.155.1 and Claude Code
2.1.218 each exercised all three languages and reached a clear follow-up.
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
