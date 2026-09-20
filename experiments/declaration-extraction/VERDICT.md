# Declaration-extraction feasibility verdict

Date: 2026-09-20  
Scope: the disposable TypeScript 7.0.2 source-parser plus native LSP experiment  
Candidate decision: **CONDITIONAL ACCEPT**

This is a feasibility result for the candidate composition only. It is not a
production architecture decision, a Jev/classification result, a latency or cost
SLO, or a continue-versus-Abide decision. The checked-in observations are synthetic
and source-free in [`evidence/records.jsonl`](./evidence/records.jsonl). The complete
machine-readable record can be regenerated with
`npm run --silent experiment:extract:evidence`.

## Evidence index

| Record or test | What it establishes |
|---|---|
| `typescript-interface`, `typescript-type-alias` | edited roots, exact ranges/source hashes, local/imported/renamed/namespace/re-exported references |
| `zod`, `zod-opaque-operations`, `zod-shadow`, `effect-schema`, `cross-framework-context` | provenance-based schema roots, cross-framework context, false positives, opaque unsupported operations |
| `degradation-malformed`, `degradation-missing-config`, `degradation-unresolved-import`, `degradation-cycle` | edit-loop and resolution degradation behavior |
| `identity-*` | formatting, rename, import retarget, multiple roots, move, deletion, and generic-reference observations |
| `fault-timeout-cancellation`, `fault-server-crash`, `fault-stale-document` | controllable native-server fault seams |
| `cap-*`, `profile-*` | every traversal cap and representative depth/source-size profiles |
| `extract.test.ts` | deterministic black-box assertions for the records above; no parser-query or message-order assertions |

### What the records measure

Each direct command record separates numeric process-startup, initialize,
open/synchronization, cold-extraction, and warm-extraction timings. Checked-in
`evidence/timing-summary.json` retains coarse numeric upper-bound distributions by
fixture class; scalar timings remain in the local command output. Positional
`textDocument/definition` counts, observed depth/source/file/package totals, omission
reasons, and fixture classes remain in the checked-in records. The cold path includes
the first synchronized navigation; the warm path reuses the same server after the cold
traversal. Profiles compare depth 0/1 and source-character 1/500 alongside the default
caps. No value is proposed as a production budget or completeness threshold.

The file observation reports fixture entries enumerated and direct workspace source
reads. The subprocess observation reports the exact direct child spawn by this harness.
Descendant processes, plugins, filesystem writes, and network egress are null or marked
not instrumented. The module marker remains absent during extraction, but no host-wide
process, socket, or filesystem tracer was installed.

### States not testable with the selected seam

| State | Evidence status | Why it is not testable here | Follow-up |
|---|---|---|---|
| native server acknowledges cancellation | untestable beyond client notification | the controlled nonresponding seam withholds the response; the released server does not expose a deterministic test hook for an acknowledgement | validate with a supported server test harness |
| arbitrary native-server crash modes | untestable beyond controlled process kill | the experiment can kill its child, but cannot induce every internal panic, OOM, or transport failure reproducibly | add fault injection only if the native server publishes one |
| stale-response identity/correlation guarantee | untestable as a correctness contract | the stale `didChange` seam records a reproducible changed response, but no protocol oracle says which version a definition result represents | require an explicit synchronization/version contract before use |
| host-wide file/process/network activity | untestable by this harness | no OS-level syscall, process, or socket tracer is installed | use sandboxed/traced qualification if this becomes a security gate |
| semantic rule accuracy or Jev behavior | untestable in this experiment | no Jev call or classifier run is allowed in the extraction scope | define a separate classification experiment |

## #5 specification gates

The #5 body has 32 numbered user stories. Each row records the observed result,
limitation, and the follow-up boundary. “Observed” describes this experiment; it does
not promote an advisory finding into a product requirement.

| #5 gate | Observed record | Limitation | Follow-up |
|---|---|---|---|
| U01 edited declaration recovery | `typescript-interface`, `typescript-type-alias` select `Order` and `OrderPayload` with exact ranges | only fixture edits and Tree-sitter declaration forms were exercised | broaden the corpus before a product contract |
| U02 root versus context | roots and context are separate fields in every record | unchanged dependents are not selected | keep incoming-dependent review deferred |
| U03 one black-box seam | direct command emits one JSON record; 27 deterministic tests exercise it | experiment schema is disposable | retain only observable concepts during later specification |
| U04 exact versions | records report TS, parser, grammar, native bindings, runtime, Zod, Effect | one pinned environment | rerun after any tool upgrade |
| U05 TypeScript 7+ | native `tsc --lsp --stdio` is the only semantic process | TS 7.0.2 only | re-run against later released TS 7 versions |
| U06 interfaces and aliases separately | two representative edits and separate records | no broader declaration family | expand only if a later scope requires it |
| U07 imported alias | `RenamedShape -> ImportedShape` resolves to project source | no exhaustive module-resolution claim | add path/package edge cases before production use |
| U08 rename/namespace/re-export indirection | `RenamedShape`, `Types.UserId`, and `PublicShape -> ReExported` are visible | only synthetic local fixtures | preserve identity evidence as a regression corpus |
| U09 Zod composition | Zod direct, namespace, alias, re-export, composition, wrapper, and operation records are present | no runtime schema execution in extraction | keep framework recognizers conservative |
| U10 Effect Schema composition | Effect direct, namespace, alias, re-export, composition, wrapper, transform, and declaration records are present | provenance can be multiple or partial | preserve ambiguity and opaque source |
| U11 no module evaluation | marker stays absent; positive controls evaluate only copied modules outside extraction | no host-wide syscall audit | retain marker control and add OS tracing only if required |
| U12 exact ranges/source | roots, edges, and opaque segments carry byte/line/UTF-16 ranges and source hashes | parser binding behavior is version-sensitive | pin and rerun on upgrades |
| U13 edge reason/depth | every edge carries reason, depth, resolution, inclusion, and omission | no final closure semantics chosen | use records to define any later contract |
| U14 explicit incomplete context | null, multiple, external, unresolved, parser-error, and cap omissions remain visible | some native responses are position-only | never convert incomplete extraction to a complete verdict |
| U15 deterministic traversal | repeated evolution runs preserve roots, order, omissions, completeness, and hashes; cold/warm stable is recorded | scalar timings are intentionally variable; checked-in values are coarse buckets | add corpus-wide replay checks before shipping |
| U16 depth/size budgets | `cap-*` and `profile-*` records compare representative caps | no production values selected | establish product budgets separately |
| U17 diff-sufficient controls | `classifier-diff-sufficient-control` and `identity-formatting` retain the changed `Money`/`Formatting` root without outbound context | no Jev quality measurement | compare inputs only in a later classification experiment |
| U18 missing imported context | `classifier-missing-context`, representative, and `identity-import-retarget` require project definitions; unresolved fixture shows the missing path | no semantic rule accuracy claim | keep context necessity as a later review question |
| U19 half-written/unresolved edits | parser-error root and unresolved-import records are bounded and explicit | malformed grammar coverage is small | add more edit-loop mutations if needed |
| U20 recursive cycles | `degradation-cycle` terminates with `already-visited` | only a two-node cycle | retain cycle termination as a hard regression |
| U21 null/multiple definitions | representative records `MissingShape` null and `Merged` multiple | native server controls the exact multiplicity | preserve both states in any future adapter |
| U22 cold/warm startup separation | each record separates process startup, initialize, open/synchronization, cold extraction, and warm extraction; `timing-summary.json` has numeric class distributions | no cross-machine benchmark | measure under a declared benchmark protocol later |
| U23 positional request cost | counts are recorded per cold/warm traversal and fixture class | only definition requests are counted | add resource telemetry only where reliable |
| U24 timeout/cancel/crash/stale behavior | timeout record suppresses client response and emits a cancel notification; crash and stale `didChange` seams are explicit | native-server cancellation acknowledgement is null/unobserved; injected faults are not arbitrary failures | validate server behavior with a supported harness |
| U25 file/process/network observations | direct source reads and direct child spawn are reported; descendant/plugins/writes/egress are null or not instrumented | no OS-wide audit | treat as experiment evidence, not a security guarantee |
| U26 sanitized checked-in evidence | records contain synthetic names/hashes and no source-bearing responses or secrets | hashes are still fixture-derived metadata | review evidence before every publication |
| U27 opaque framework constructs | Zod and Effect transforms/refinements/declarations remain partial/opaque | unsupported surface is intentionally incomplete | grow allowlists only with fixture evidence |
| U28 failures count as evidence | malformed, unresolved, ambiguous, capped, timeout, and crash records remain non-complete | no claim that failure modes are exhaustive | prefer explicit unsupported outcomes |
| U29 extraction/classification separation | no Jev calls; no rule probabilities in this experiment | no semantic quality result | keep classification as a separate future gate |
| U30 incoming dependents excluded | traversal follows outbound references only | unchanged dependent selection is not tested | do not add incoming review selection here |
| U31 language-neutral artifact concepts | record uses source/range/hash/kind/edge/budget concepts, not TS analyzer objects | no other language frontend | revisit only in a future language-specific study |
| U32 written verdict | this file maps #5 and #6–#8 criteria with limitations and follow-ups | a product decision is intentionally absent | discuss evidence before architecture work |

## Issue #6 criteria

| Criterion | Observed record | Limitation | Follow-up |
|---|---|---|---|
| command accepts fixture/edit and emits one sanitized record | direct `experiment:extract` command; all fixture records | direct output contains source for local inspection | keep source-free summaries for checked-in evidence |
| exact TS/parser/grammar/binding/runtime versions | `versions` in every record | one environment | rerun after upgrades |
| interface and alias with indirections | representative records | synthetic module graph | add repository-scale fixtures later |
| exact roots and deterministic context edges | roots/context/edges and black-box tests | exact graph depends on server version | treat edge output as evidence, not permanent contract |
| null/multiple/external/unresolved explicit | representative plus unresolved fixture | native LSP may return position-only data | preserve unresolved states |
| six traversal caps terminate | `cap-declarations`, `cap-depth`, `cap-source-characters`, `cap-files`, `cap-external-packages`, `fault-timeout-cancellation` | cap values are experiment values | choose production caps separately |
| cold/warm timings and positional counts | phase-specific numeric timings, `timing-summary.json` distributions, and counts are recorded | buckets are sanitized and no cross-machine benchmark is claimed | publish benchmark protocol before comparing hosts |
| no module initialization | marker fields false/absent in extraction; copied positive controls are separate | no OS-level audit | retain marker and add stronger isolation if required |
| deterministic offline black-box tests | `npm run test:extract`, 27 tests | no paid backend | keep tests offline |
| failed navigation and no legacy API | `lsp.unexpectedOrFailedNavigation`; native subprocess only | server crash is controlled | do not treat this as a stable TS API guarantee |

## Issue #7 criteria

| Criterion | Observed record | Limitation | Follow-up |
|---|---|---|---|
| exact Zod/Effect versions | version fields and schema fixture records | pinned package cohort only | rerun on dependency changes |
| Zod constructors/imports/aliases/re-exports/composition/wrappers | `zod`, `zod-shadow` | no exhaustive Zod surface | retain positive and negative fixtures |
| Effect constructors/imports/aliases/re-exports/composition/wrappers | `effect-schema`, `cross-framework-context` | multiple provenance occurs | preserve multiple locations |
| false-positive ordinary values excluded | negative controls in Zod/Effect records | source recognition is intentionally narrow | expand only with false-positive tests |
| schema roots/context use common record and traversal | schema records contain same roots/context/edges/caps | schema interpretation is experiment-only | no production schema contract yet |
| native provenance and null/multiple/unsupported states | schema provenance fields and records | semantic location is position-based | keep source plus provenance together |
| unsupported operations partial/opaque | `zod-opaque-operations`, transformed/declaration roots | interpretation coverage is incomplete | add fixtures before widening |
| no schema module evaluation | marker absent; copied positive controls separate | no OS-level audit | preserve extraction/evaluation boundary |
| schema cold/warm and positional evidence | Zod/Effect records include phase-specific numeric timings, class buckets, and counts | no benchmark threshold | compare only with declared method |
| deterministic offline tests, no Jev/production integration | schema tests and command | framework package versions can change output | rerun offline after upgrades |

## Issue #8 criteria

| Criterion | Observed record | Limitation | Follow-up |
|---|---|---|---|
| malformed/half-written, missing config, unresolved imports, cycles, null/multiple, every cap | `degradation-*`, representative, and `cap-*` records | malformed corpus has one syntax shape | add mutations if edit-loop scope expands |
| cancellation, timeout, crash, stale document | client-side response suppression and cancel notification, crash, and stale `didChange` records are present | real server cancellation acknowledgement is null/unobserved; other faults remain uncontrolled | validate against supported server fault injection later |
| repeated root/order/omission/completeness/hash determinism | repeated `identity-import-retarget` test and `deterministicColdWarm` fields | timings excluded from equality | add corpus replay in CI if retained |
| formatting, rename/move, import-retarget, multiple-root, merged, deletion, generic references | `identity-*` plus representative merged record | no materiality policy chosen | use as identity/materiality input only |
| missing-context and diff-sufficient classifier/rule controls | `classifier-missing-context` follows imported `DeliveryStatus`/`DeliveredAt`; `classifier-diff-sufficient-control` is local `Money`; both are derived from the shape/context distinction in `TYPE-DESIGN-RULES.md` and `JEV-TYPE-CLASSIFIER.md` | no Jev classification or accuracy claim | define classification gates separately |
| representative depth/source profiles | `profile-depth-1`, `profile-source-500`, plus cap records | no production budget | establish budgets later |
| cold/warm latency, positional counts, resource observations by fixture class | every summary has numeric phase buckets/counts; `timing-summary.json` distributes them by fixture class | scalar timing and host resources are not committed | run declared benchmark/resource protocol later |
| file/subprocess/network observations and tracing limits | direct-read/direct-spawn fields plus null/not-instrumented fields are in `observations` and the evidence README | no OS-level tracer; inherited activity cannot be ruled out | use sandbox/traced qualification if security becomes a gate |
| synthetic sanitized checked-in evidence | 30 JSONL summaries plus numeric timing sidecar contain no absolute paths, source, credentials, or paid output | synthetic hashes are not privacy proof for arbitrary input | sanitize any future corpus separately |
| written verdict maps #5/#6/#7/#8 and limits candidate decision | this file plus evidence index | no product architecture/classification decision | review with product owner before next phase |
| out-of-scope boundaries | this file excludes incoming-dependent review, other languages, Phase F, and final product decision | future work may reopen them explicitly | create separate scoped issues |

## Candidate boundary and residual risk

The evidence is sufficient to show that the composition can recover useful TypeScript
and schema roots, follow a bounded outbound context graph, preserve ambiguity, and
degrade without silently claiming completeness. It is not sufficient to establish a
stable TypeScript 7 public semantic API, complete schema interpretation, stale-response
correctness, host-wide security properties, production budgets, or classification value.

The conditional result therefore carries these follow-ups: rerun the corpus against
supported TypeScript upgrades; define a supported synchronization/stale-document
contract; choose budgets only after product-level criteria exist; and independently
design the later diff/whole-file/declaration classification experiment. Incoming
dependent selection, other languages, Phase F work, and the final product decision stay
outside this verdict.
