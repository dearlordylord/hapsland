# Adding a source-language adapter

**Purpose:** Describe the current adapter architecture and the repeatable workflow for adding a source language to Hapsland.
**Audience:** Contributors, including coding agents implementing source-language adapters.
**Status:** Maintained contributor guidance.
**Authority:** Implementation guidance and links to validation evidence. The [accepted type/function review contract](type-function-review-proposal.md), [rule evaluation model](../PRODUCT-RULE-EVALUATION-MODEL.md), and runtime contracts own product requirements; this guide does not amend them.
**Expected use:** Implement, test, and review a source-language adapter.
**Lifecycle:** Update with adapter interfaces, analysis profiles, validation tools, or new binding counterexamples. Review whenever parser/compiler assumptions, capture boundaries, rule capabilities, or agent-runtime profiles change.

## Current implementation

TypeScript, Rust, Bend, the bounded same-file Python profile and the bounded Go local-module profile use the shared review pipeline. Go resolves package bindings across eligible active sibling files, preserving file-local imports and generic parameter shadows. It resolves ordinary/default/aliased imports only within one captured eligible local module and never assumes a closed set of interface implementers. See the [Go authority profile](type-function-review-proposal.md#go-active-package-constraint-subset). The
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

The continuation archive has SHA-256
`9ff4c0aa2dd4816c218ec281943dd5ce7dca1a9032cbc98deb0d63ef2269c032`.
Its runtime source revision is `4c33862e5d9b1fb82b20fc21fd59c96f929a7191`;
later continuation changes affect native witness tooling and documentation.
The owned build and release-native checks passed, including packaged Linux and
Darwin arm64 assets; this establishes assets, not Darwin execution. The exact
archive passed clean-package conformance (`clean-package-passed-real-host-not-requested`).
A prior pending-activity failure remains an unsuccessful observation.

The current-archive Claude attempt reached a Go edit but did not establish the
provider/advice/repair loop; it does not qualify installed Go delivery. The
Codex Go profile uses the existing installed inspection seam with an isolated
user home, controlled offline reviewer and prepared installed runtime/resident.
It requires exact original typed-group provider evidence, independently
correlated outcomes, actual agent acknowledgment and an exact quotation of the
controlled finding absent from the task prompt, and a compiling open-interface
repair. The default profile runs standard installed hooks without command
interposition. Private finding fate alone is not delivery evidence. It does not exercise
the browser, cold startup, ordinary interactive trust, Darwin execution or live
Jev review quality. Its fixture assertions include rejection of missing receipts,
controlled policy, provider evidence and delivery; model-input fixtures decode
through the current version-one inspection contract. Initial witness reader
errors (raw JSON versus transport encoding) were corrected separately from
intermittent installation compatibility failures. No product probe deadline was
changed. The prepared Go fixture explicitly selects pinned Bun for installation
compatibility probing through the existing runtime override; launcher bindings
still select the exact installed native hook and resident. An optional comparison
observer delegates registered commands, preserves flags and deadlines, forwards
successful stdout unchanged, and records only submission booleans; it is not
required for qualification. Finding suppression or staleness alone cannot
establish delivery; the agent must
acknowledge and quote actual advice before its repair qualifies. A direct retained
native identity check took 3.49 seconds, exceeding the unchanged two-second
installation probe. This fixture does not qualify default installation startup.
Source-free local declarations/results preserve each failed attempt.

The earlier current-archive attempts below did not qualify installed advice and
agent repair; the completed final witness is recorded after them.
Codex attempt `1791606247590` passed exact typed-package provider evidence and
both controlled outcomes, then failed the delivery assertion. Subsequent
bounded disposition observation showed collection suppression and staleness,
which alone do not prove delivery. The stdout-observed attempt ending
`2026-10-10T04:53:30Z` reported an unavailable native selection, zero prepared
units, zero advice submissions, and no agent acknowledgment or quoted advice.
It is a failed witness, not a delivery claim. Installation failures additionally
confirmed a timeout even with the pinned probe selected. A direct bounded
control on the selected Bun invocation succeeded in 183 ms; the current-assets
packaged hook identity succeeded in 3,516 ms. A verified installed #269 baseline
was not available for the matched control, so regression attribution remains
open. These source-free controls are retained under `.test-runs/`; no broader
startup or host compatibility investigation is qualified here. The observer
owner and Go consumer selection passed 35 checks with no skips, including failed-hook stdout,
missing-provider, missing acknowledgment and missing unseen-quotation controls.
A subsequent interrupted 90-second selection diagnostic retained selected
candidates, one prepared unit, one provider input and one outcome in its private
journal; only enum/count projections are retained, and the interrupted run does
not qualify delivery. Matched direct child controls passed in both checkout and
synthetic working directories; they do not establish the cause of intermittent
installed-preview timeouts. The native acknowledgment reader initially combined every agent response and
rejected an earlier negative marker even when the final response affirmed use.
Attempt `1791609961545` measured marker order `absent, negative, absent, affirmed`,
with an unseen controlled finding quotation and both correlated provider outcomes.
The reader now requires an affirmative final response without a final negative
marker and correlates its actual quotation with interpreted Go findings. Negative
controls cover reversed marker order, mixed final markers, and missing receipt,
quotation and follow-up. A stale stdout-observer variable in the success return
was removed; the focused success-return regression executes the real synthetic
compiler and returns demonstrated. The final fast gate passed all 75 unit tests.

The isolated fixture compiler is official Go 1.27.2 Linux arm64, archive SHA256
`94f3e30b8e374bc285e7dadc11e0865726b9bc6e85b841ccceaabc0214c6b7c8`,
checked against the preparation record and executable version. Only the specific
test environment selects its bin path, local toolchain and isolated caches;
product analysis does not execute the compiler. Attempt `1791610458512` failed
installation because the unchanged pinned-runtime probe timed out and adds no
native delivery evidence. The 05:39–05:42 preparation
pause produced no native declaration: an interrupted documentation prerequisite
had left local owner exports incomplete. The owned export cohort subsequently
recovered, the manual generated-document check passed, and full runner import
validation passed before any installation.

The final owned watcher began within the fresh Python preparation pause at
`2026-10-10T05:56:54.447Z` and completed at `05:57:39.896Z`, without a retry.
Current-archive witness `1791611817055` returned `demonstrated` on actual
Codex CLI 0.155.1, Linux arm64, with standard installed hooks and zero Jev calls.
All ten independent checks passed: attributed native edits, complete package
closure, exact original typed iota group, controlled reviewer, initial finding,
delivered advice, correlated clear follow-up, actual final agent acknowledgment
and unseen finding quotation, repaired open interface, and real Go compilation.
The declaration/result identify witness source
`dc1d0ad03c4d46a62e275c7dc52fd52d320016d6`, runner/profile digests and
44 matching native assets (digest
`7cbda648fb8417ce3f87c805548cb4fc04b0cd8181b15b869491e9586b051c7e`).
That witness source includes tooling and qualification records; the archive's
runtime source remains `4c33862e5d9b1fb82b20fc21fd59c96f929a7191`.
The source-free declaration/result remain under ignored `evidence/inspection/`;
raw host streams, source and provider bodies were not retained. This qualifies
the bounded installed Go package-model slice through the explicit pinned-Bun
setup route. It does not qualify default installation startup, Claude delivery,
Darwin execution, browser behavior, cold startup or live Jev review quality.
The preparation pause declares only the Python owner's compiler inactivity,
not the absence of foreign load. The next Go package-import slice remains #272;
#268 must retain these measured setup limitations and the precise partial profile.

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

Python same-file selection, marker forms, expression limits and shipped rule matrix
are owned by the [Python amendment](type-function-review-proposal.md#python-same-file-explicit-model-amendment-267). Python performs no cross-file or system traversal.

### Python qualification for parent #267

The same-file Python slice has local implementation evidence from 2026-10-09–10.
Keep this qualification current when its grammar, runtime, installed entrypoints,
or model evidence contract changes; rerun the affected checks before extending it.
The production-code candidate was `bcbbd110a133db37679364ae997fb83f85fd4758`.
Its reviewed Linux arm64 archive SHA-256 was
`d1564c1375f5c802713d97523306ad20f21e0a31ab10369e35358e77810a2290`.
Subsequent runner corrections isolate HOME, check the stable hook launcher and
catalog-defined `exec` prefixes, and exercise a distinct hook-payload update while
preserving the independently selected resident, as required by the
[update contract](update-context.md). They do not change installed product bytes.

Executed evidence:

- Twenty-six focused Python/profile tests passed: eight admitted root families with
  the three shipped rules, exact root/support source at the controlled provider,
  finding/clear/failure delivery, defining-edit selection, lexical shadows and
  generic bounds, conditional schema and type-parameter marker omissions,
  independent omissions, exclusions, budgets and stale advice. The final controls
  also cover opaque schema mutation/deletion and unsupported class statements,
  while preserving comments and docstrings in complete class source.
- The fast gate passed; 257 selected existing TS/Rust/Bend, attribution, renderer,
  rule and format consumer tests passed. Ninety-five native packaging/loader/
  assembly/distribution tooling tests passed. Documentation generation and
  documentation checks passed. These are selected checks, not full-suite coverage.
- The Linux arm64 build verified six native executable assets. Clean installed
  conformance passed with Node 24.20.0 as harness and packaged Bun 1.3.14,
  without Node/Bun on the installed PATH. It loaded Python same-file evidence,
  preserved Rust/Bend preparation, and exercised installed hooks, controlled
  advice, interrupted update recovery, resident reuse and scoped uninstall.
- The installed controlled Python adoption scenario passed all eleven assertions
  with Codex CLI 0.155.1, OpenAI `gpt-6-luna`, Python 3.11.2, Tree-sitter 0.25.1
  and Python grammar 0.25.0. Six controlled review inputs comprised five added
  classes and one repaired alias; support expanded at the provider boundary,
  advice was delivered/quoted, the agent repaired the model, and follow-up was
  clear. There were zero Jev requests. Python compilation and rejection of a
  missing constructor argument establish only those exercised runtime boundaries.

Earlier installed attempts failed because inherited HOME selected another
installed resident and because conformance assumed obsolete direct hook command,
semver-only update and coupled resident-update behavior. Retained failed fixture
state was preserved; exact-command resident cleanup passed. Corrected runs passed
with isolated homes and unchanged custody checks. Subsequent synthetic Add
fixtures sometimes admitted incomplete evidence; investigation found that the
target already existed before capture. Conformance now creates each target between the pre-edit
and post-edit hooks, and bounded provider-handoff waits retain source-free
diagnostics on failure. Official conformance passed on the archive above after
that correction. One subsequent native attempt created source without an edit-hook
event or provider handoff and remains recorded as incomplete. A new attempt
with the unchanged runner and final archive demonstrated all eleven assertions;
the source-free result was `codex-python-adoption-controlled-offline-1791592321569.json`.

Recovery qualification on the production candidate above passed the 26 focused
tests and fast gate. Host replacements interrupted archive preparation; documented
stopped-writer reconciliation preserved the abandoned custody records. A later
product assembly hit its inherited admission-lock deadline; no custody check was
weakened. The final archive preparation passed workspace/native compilation,
product assembly, package validation and packing. Clean installed conformance
passed on that archive. The first native attempt had no edit-hook event or provider
handoff and remains incomplete in
`codex-python-adoption-controlled-offline-1791594765757.json`. One newly declared
attempt with unchanged runner and archive passed all eleven assertions in
`codex-python-adoption-controlled-offline-1791594816312.json`. These native attempts
used no automatic host retry and made zero Jev requests.

Darwin execution and the full two-target archive remain unqualified here: the
required Darwin arm64 native input bundle was unavailable on this Linux host.
This evidence does not establish cross-file/system traversal, runtime framework
validation, ordinary native trust onboarding, other hosts/platforms, or live
classifier accuracy. Known grammar gaps remain explicit unsupported outcomes.
No coverage study (#268) was performed. Integration with the parallel Go slice
must retain both grammar pins/registrations/assets and additive loader/build
policies, then rerun the affected shared and installed checks on the merged base.

### Rebased Python qualification, 2026-10-10

The complete retained Python commit sequence was applied to base
`47fdf0f0afffc6eca9f613813eee7e533808e082`, preserving its Astro website changes.
The acceptance candidate tested here was
`256115f854cfdce0d3f3c78edb51f75be663abd1`; the only rebase conflict was resolved
by retaining both Astro and Python grammar catalog entries. Product code matches
the retained candidate above. A fresh medium-reasoning review of the base-to-head
diff against #269, #267 and repository instructions found no reasonable blockers.

Fresh local checks passed on Linux arm64 with Node 24.20.0 and Bun 1.3.14:

- `npm run typecheck`, `npm run check:fast`, and explicit base-to-head lint/format
  checks passed. Build commands removed inherited `NODE_PATH`, as required by the
  Bend producer's environment contract.
- The focused runner passed 286 tests in 13 files, including 21 Python pipeline
  and five language-boundary tests, plus existing TS/Rust/Bend, attribution,
  renderer and rule consumers. Run: `20261010032740501-4151494-6bfb56`.
- Selected native task, input/receipt, binding, loader, build-boundary, assembly,
  distribution and native installation tooling checks passed. Early probes lacked
  the current native bundle or overlapped workspace output preparation; rebuilding
  current inputs and running affected probes after preparation resolved them.
  Offline documentation links and heading anchors passed with Lychee 0.24.2.
- `HAPSLAND_BUILD_PROFILE=linux-arm64 node scripts/prepare-package.mjs --timeout-ms=300000`
  passed fresh build, six-native-asset validation, packing and integrity checks
  in run `20261010032928563-4161301-bc6cec`. Archive SHA-256:
  `62e3eb42a0ff02da4775c0c14a4f995f67a97e1294f93d2fa712c21d520ee308`.
- `npm run conformance:package -- --archive=PATH` passed against that archive.
  The existing installed Codex Python adoption command from the
  [testing matrix](testing-matrix.md) passed all eleven assertions using the same
  archive, Codex CLI 0.155.1 and OpenAI `gpt-6-luna`, with zero Jev requests.
  Source-free native record:
  `codex-python-adoption-controlled-offline-1791603151742.json`.

This fresh evidence supersedes reliance on the predecessor archive for this base.
Darwin execution, a full two-target archive, other native hosts, ordinary native
trust onboarding and classifier accuracy remain unqualified. The grammar pins,
same-file support boundaries and #270/#268 continuation scope remain unchanged.
No full coverage gate or remote CI result is claimed.


## Go local-module continuation for #267 and #268

**Authority:** Implementation and validation evidence for the accepted #272 profile;
[the Go contract](type-function-review-proposal.md#go-active-package-constraint-subset)
owns behavior. Update this maintained handoff after changes to the Go adapter,
shared graph, rule capabilities or installed witness. Existing qualification
records above retain their original revisions and narrower scopes.

| Dimension | Current bounded Go profile | Explicit omission or continuation question |
| --- | --- | --- |
| Edited roots | Named top-level structs, interfaces, defined types and aliases; exact single/grouped source and attributed header/field edits | No independent functions/methods, unchanged dependents or whole-file fallback |
| Package | Unique eligible active production package; private supporting declarations and complete relevant typed/iota groups | More than the shared file/work budget or incomplete/ambiguous membership omits required evidence |
| Module/imports | Captured nearest eligible `go.mod`; actual declared package names, default/aliased imports, exported entry types/constants, `internal` visibility | Nested modules, workspaces, replacements, external/cache/vendor/outside-root and ambiguous imports |
| Build | Frozen explicit GOOS/GOARCH/user-tag snapshot and #271 constraint subset reused across packages | Unknown constraints/cgo/generated source; no host-inferred target or Go invocation during analysis |
| Constants | Exact complete groups, alias/conversion/constant propagation including resolved local imported bindings; comparisons remain untyped | Constants do not exhaust scalar values; constant-only edits remain a demand gap |
| Rules | `meaningless_combinations`, `absence_confusion`, `bare_domain_value` where declared closure requirements are met; root-only custom rules can retain marked omissions | Required external types prevent closure-dependent rule admission, rather than a fake complete/clear result |
| Freshness/privacy | Context selection for every source/manifest; bounded positive/absent metadata and package alternatives plus captured source/build/configuration identity | No excluded source read; missing authority is an omission, not permission for wider discovery |
| Budgets | Existing 8-file, 20 KiB encoded-tree, 4-depth, 16 outgoing-target, 128-work, source/read/deadline ceilings; 128 entries per package directory | Large-package selective authority is an open coverage experiment, not an automatic full-package upload |

The shared V1 artifact/rule/provider contracts and existing grammar/runtime pins
remain in place. The module implementation extends `go-adapter`, `go`, the
adapter-owned `go-module-context` and shared graph lookup; it does not add a review
pipeline or dependency resolver. `go.mod` is a narrowly eligible metadata basename,
with the same supporting-source exclusion, ignore and physical gates.

The reproducible installed command is the existing native runner with
`--host=codex --provider=openai --model=default --language=go
--scenario=go-module-model-review --archive=PATH`. It uses standard installed
hooks, actual-name `models-v2` → `domain` binding, aliased internal state evidence,
an exact iota group and only the required supporting declarations. Acceptance
requires correlated controlled finding, final completed-agent acknowledgement
and actual advice quotation, repair and a distinct clear evaluation. The fixture
retains source-free evidence; its isolated compiler is a qualification tool only.

Coverage measurement is not an implementation gate. For #268, begin with attributed
supported/missed model edits from immutable target-user project revisions and an
explicit denominator. Prioritize constant-only demand, external-type rule omissions,
large-package authority, unsupported metadata/constraints and grammar gaps. Do not
convert parser success, declaration counts or this controlled witness into edit
coverage, classifier accuracy, interactive trust or another platform claim.
