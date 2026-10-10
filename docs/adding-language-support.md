# Adding a source-language adapter

**Purpose:** Describe the current adapter architecture and the repeatable workflow for adding a source language to Hapsland.
**Audience:** Contributors, including coding agents implementing source-language adapters.
**Status:** Maintained contributor guidance.
**Authority:** Implementation guidance and links to validation evidence. The [accepted type/function review contract](type-function-review-proposal.md), [rule evaluation model](../PRODUCT-RULE-EVALUATION-MODEL.md), and runtime contracts own product requirements; this guide does not amend them.
**Expected use:** Implement, test, and review a source-language adapter.
**Lifecycle:** Update with adapter interfaces, analysis profiles, validation tools, or new binding counterexamples. Review whenever parser/compiler assumptions, capture boundaries, rule capabilities, or agent-runtime profiles change.

## Current implementation

TypeScript, Rust, Bend, the bounded Python model profile and the bounded Go local-module profile use the shared review pipeline. Go resolves package bindings across eligible active sibling files, preserving file-local imports and generic parameter shadows. It resolves ordinary/default/aliased imports only within one captured eligible local module and never assumes a closed set of interface implementers. See the [Go authority profile](type-function-review-proposal.md#go-active-package-constraint-subset). The
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

## Python and Go bounded profiles

Python resolves explicitly declared model classes, aliases and NewType roots through
eligible flat/src local packages, named imports and aliases, initializer reexports,
local supporting stubs and transitive bases. Its [local authority contract](type-function-review-proposal.md#python-local-module-authority-amendment-270)
and [model contract](type-function-review-proposal.md#python-same-file-explicit-model-amendment-267)
own marker bindings, attribution and omissions. Go resolves named types and relevant
typed constants through active sibling files and one eligible captured local module,
using actual declared package names and file-scoped imports. Its [authority contract](type-function-review-proposal.md#go-active-package-constraint-subset)
owns explicit build context and omissions.

Both profiles use the existing V1 review units, shared capture/privacy/freshness
limits and per-rule evidence gates. The shipped type criteria are
`meaningless_combinations`, `absence_confusion` and `bare_domain_value` when their
required evidence is complete. System and installed dependencies remain opaque.
Neither profile adds independent function/method roots, runtime execution, whole-file
fallback or re-review of unchanged dependents. Constant-only and validator-only edits
remain coverage questions.

Tree-sitter runtime 0.25.1 and Python/Go grammars 0.25.0 are exact production pins.
Python type-parameter defaults and compact Go constant blocks remain explicit parser
omissions. Grammar loading, exact extraction, binding authority, installed delivery
and classifier accuracy are distinct claims.

The [acceptance evidence index](../evidence/python-go/README.md) identifies source
revisions, executed checks, sanitized native records and limitations. Child witnesses
qualify their recorded revisions; merged-candidate qualification is labeled separately.
Linux arm64 Codex qualification uses a controlled provider and explicit fixture trust
settings. Go's qualified setup route selects pinned Bun: a previous packaged identity
probe took 3516 ms against the default 2000 ms bound, while the Bun control took
183 ms. No baseline attribution, default/cold installation, ordinary interactive trust,
Darwin execution, Claude qualification or classifier-accuracy claim follows.

[Coverage follow-up #268](https://github.com/dearlordylord/hapsland/issues/268)
starts from attributed target-user edits and an explicit denominator. Retained source
inventories establish discovery only: Go's 53.1% directory-size statistic and Python's
59.5% methods statistic are neither adapter misses nor user edit frequency. No fixed
corpus, percentage gate or mandatory expansion chain is accepted.
