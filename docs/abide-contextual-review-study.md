# Hapsland and Abide: readable rule examples and measured outcomes

**Purpose:** Show concrete examples for all nine bundled Noul rules and explain their comparative validation.
**Status:** Draft for publication review; current resource-rule batch completed on 2026-10-03 (UTC).
**Authority:** Comparative research advisory and validation evidence; not an accepted product contract or release certification.
**Expected use:** Read the code, inspect measured differences and limitations, and assess relevance to your workflow.
**Lifecycle:** Review when rules, review inputs, feedback policy or scoring change. Replace this account when its supporting validation is superseded; update inbound links and delete obsolete narrative and uncited snapshots. Retain evidence supporting current claims.

[Studies and examples](./review-studies.md) → Compact nine-rule coverage

This report covers all nine rules through two separate matrices: duplicate-fact rule `r4`, and the eight other rules. The [larger-declaration scenario pages](./review-studies.md#choose-a-scenario) belong to a separate five-rule study.

## What this comparison establishes

All native sessions used **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning effort `max`**. Each product supplied its own response instructions during the same maintenance task. Abide 0.0.7 used a custom active rubric expressing the same target Noul concern; both reviewers used Jev.

The four selected cross-file duplicate-fact designs produced **12/12 checked repairs with Hapsland and 1/12 with Abide** across three repetitions. Hapsland also warned on all six clean-control observations. This advantage belongs to those selected conditions, not all rules.

Across seven retained rule families plus the replacement resource-rule batch, with two constructed defects per rule and one native session per case and arm, the current results are **6/16 checked repairs with Hapsland and 3/16 with Abide**. Results by rule, including ties and failures, are below. Detection and native repair are different measurements; their denominators differ. Some examples are local and do not need cross-file context.

A separate [larger-declaration and layout study](./abide-large-declaration-study.md) tests six selected domains with compact and expanded inputs. Its matrix is reported separately and is not pooled with the counts here.

## Start with one example

A stored audio track has one native encoding rate, but this type permits two copies to disagree:

```typescript
// subject.ts — edited public record
import type { AudioTrack } from "./support";
export interface CaseState {
  label: string;
  track: AudioTrack;
  sampleRate: 44100 | 48000;
}

// support.ts — unchanged related definitions
export interface AudioTrack { encoding: AudioEncoding; }
export interface AudioEncoding {
  sampleRate: 44100 | 48000;
  channels: 1 | 2;
}
```

For example, the root can say `44100` while `track.encoding.sampleRate` says `48000`. The domain says both describe the stored track. A repair removes a redundant copy or constrains their relationship while retaining independent channel count.

Read all four defective starting examples:

- [Build provenance](./examples/duplicate-encoding/build-provenance.ts): two copies of the source commit.
- [Audio encoding](./examples/duplicate-encoding/audio-encoding.ts): two copies of the native rate.
- [Stored compression](./examples/duplicate-encoding/storage-envelope.ts): two copies of the stored format.
- [Session access](./examples/duplicate-encoding/session-grant.ts): two copies of the granted permission.

The [audio resampling](./examples/duplicate-encoding/clean-audio-resampling.ts) and [future repack](./examples/duplicate-encoding/clean-storage-repack.ts) controls look similar but contain independent current and requested values. Those values must be allowed to differ.

## Examples for every other rule

Each TypeScript file combines the starting declaration and its related definitions for reading, and explains the permitted problematic value or observable dependency. The files show **inputs**, not claimed repairs. `CaseState` is the study harness export name; function examples explain the operation it represents.

| Rule concern | Two defective examples | Nearby correct control |
| --- | --- | --- |
| Name alternative operations | [retention action](./examples/inferred-case/retention-action.ts) · [render destination](./examples/inferred-case/render-destination.ts) | [clean profile attributes](./examples/inferred-case/clean-profile-attributes.ts) |
| Prevent meaningless combinations | [cache retention](./examples/meaningless-combinations/cache-retention.ts) · [document signature](./examples/meaningless-combinations/document-signature.ts) | [clean cache variant](./examples/meaningless-combinations/clean-cache-variant.ts) |
| Keep parts of one fact together | [color channels](./examples/split-correlations/color-channels.ts) · [calibration pair](./examples/split-correlations/calibration-pair.ts) | [clean independent measurements](./examples/split-correlations/clean-independent-measurements.ts) |
| Give absence one meaning | [muted topics](./examples/absence-confusion/muted-topics.ts) · [required recipients](./examples/absence-confusion/required-recipients.ts) | [clean known empty set](./examples/absence-confusion/clean-known-empty-set.ts) |
| Distinguish domain values | [seat class](./examples/bare-domain-value/seat-class.ts) · [account project identities](./examples/bare-domain-value/account-project-identities.ts) | [clean free form description](./examples/bare-domain-value/clean-free-form-description.ts) |
| Enforce what a name promises | [worker count](./examples/name-wider-than-type/worker-count.ts) · [http endpoint](./examples/name-wider-than-type/http-endpoint.ts) | [clean worker count](./examples/name-wider-than-type/clean-worker-count.ts) |
| Declare the resource an operation names | [publish bulletin](./examples/name-claims-resource/publish-bulletin.ts) · [load preview](./examples/name-claims-resource/load-preview.ts) | [clean explicit channel](./examples/name-claims-resource/clean-explicit-channel.ts) |
| Declare the resources a body uses | [clock sensitive expiry](./examples/body-reaches-undeclared/clock-sensitive-expiry.ts) · [hidden audit write](./examples/body-reaches-undeclared/hidden-audit-write.ts) | [clean explicit time](./examples/body-reaches-undeclared/clean-explicit-time.ts) |

The [frozen fixtures](../evidence/abide-rule-coverage-current/abide-rule-coverage-fixtures.mjs) own the tested inputs. For naturally contextual cases, related definitions were in unchanged `support.ts`; the [offline preparation record](../evidence/abide-rule-coverage-current/preflight.json) records which definitions entered Hapsland's graph. Count/HTTP-prefix examples are local. A related-definition example is not by itself proof that context caused an advantage.

## Results by rule

In each paired cell, **Hapsland / Abide** is the order. The following matrix uses two defective designs and one clean design per rule, **three detection repetitions and one native repetition**. The three observations of a clean design are not three independent controls. Seven families retain their existing results. The function-resource family uses a replacement batch after its signature/body evidence requirement and shared question wording changed. This is not a full rerun; batches are not pooled as repetitions. Detection counts use a probability threshold of 0.7; lower-band notices do not count as flagged defects.

| Rule concern | Defects flagged (each /6) | Clean warnings (each /3) | Completed repairs (each /2) | Clean domain preserved (each /1) |
| --- | ---: | ---: | ---: | ---: |
| Name alternative operations | H 0/6 · A 3/6 | H 0/3 · A 0/3 | H 0/2 · A 0/2 | H 1/1 · A 1/1 |
| Prevent meaningless combinations | H 6/6 · A 3/6 | H 0/3 · A 0/3 | H 1/2 · A 0/2 | H 1/1 · A 1/1 |
| Keep parts of one fact together | H 3/6 · A 3/6 | H 0/3 · A 0/3 | H 0/2 · A 0/2 | H 1/1 · A 1/1 |
| Give absence one meaning | H 3/6 · A 3/6 | H 0/3 · A 0/3 | H 0/2 · A 0/2 | H 1/1 · A 1/1 |
| Distinguish domain values | H 3/6 · A 3/6 | H 0/3 · A 0/3 | H 1/2 · A 1/2 | H 1/1 · A 1/1 |
| Enforce what a name promises | H 6/6 · A 6/6 | H 0/3 · A 0/3 | H 2/2 · A 0/2 | H 1/1 · A 1/1 |
| Declare the resource an operation names | H 6/6 · A 3/6 | H 0/3 · A 0/3 | H 0/2 · A 0/2 | H 1/1 · A 1/1 |
| Declare the resources a body uses | H 6/6 · A 6/6 | H 0/3 · A 0/3 | H 2/2 · A 2/2 | H 1/1 · A 1/1 |

The resource-rule target reviews visible dependencies in the exact signature/body and included helpers. Unsupported references remain explicit omissions; their behavior must not be invented. This batch tests the corrected configuration on the same previously tested examples; it does not test larger declarations.

The [coverage comparison](../evidence/function-resource-native-current/effective-comparison.json) retains every cell. Clean artifacts were preserved in 8/8 Hapsland and 8/8 Abide sessions. Two Hapsland artifacts remained unassessed: `color-channels` and `publish-bulletin`; Abide had no unassessed artifacts. Neither receives repair credit. There were 0 actor timeouts, 0 recorded native review transport errors and 0 native request-budget stops. Successfully completed sessions: 72/72; final compilations: 72/72.

The duplicate-fact matrix has a separate fixed declaration: four defective designs and two controls, each repeated three times. Detection was Hapsland 12/12 versus Abide 0/12; clean warnings were 6/6 versus 0/6; native repairs were 12/12 versus 1/12. Both preserved 6/6 clean domains. See its [comparison](../evidence/abide-contextual-current/comparison.json). These counts are not pooled with the eight-rule matrix.

## Inspect final code

These links show one defective design per remaining rule after the native session. Open adjacent `support.ts` where present. The comparison JSON maps all cases and arms to anonymous artifact IDs; the duplicate-fact [repetition indexes](../evidence/abide-contextual-current/repeat-1/index.json) provide its mappings.

| Example | Hapsland final code | Abide final code |
| --- | --- | --- |
| retention action | [final source](../evidence/abide-rule-coverage-current/r1_inferred_case/native/blind/bdf1c1b346aa/subject.ts) | [final source](../evidence/abide-rule-coverage-current/r1_inferred_case/native/blind/5ea9a71f91ef/subject.ts) |
| cache retention | [final source](../evidence/abide-rule-coverage-current/r2_meaningless_combinations/native/blind/5a60c78905ac/subject.ts) | [final source](../evidence/abide-rule-coverage-current/r2_meaningless_combinations/native/blind/171e4547ae98/subject.ts) |
| color channels | [final source](../evidence/abide-rule-coverage-current/r3_split_correlations/native/blind/9bc8cad0a592/subject.ts) | [final source](../evidence/abide-rule-coverage-current/r3_split_correlations/native/blind/536aba90b34d/subject.ts) |
| muted topics | [final source](../evidence/abide-rule-coverage-current/r5_absence_confusion/native/blind/f56cc6c1b448/subject.ts) | [final source](../evidence/abide-rule-coverage-current/r5_absence_confusion/native/blind/7da41fbd726a/subject.ts) |
| seat class | [final source](../evidence/abide-rule-coverage-current/r6_bare_domain_value/native/blind/51258a96bc4a/subject.ts) | [final source](../evidence/abide-rule-coverage-current/r6_bare_domain_value/native/blind/dfdddd59d704/subject.ts) |
| worker count | [final source](../evidence/abide-rule-coverage-current/r7_name_wider_than_type/native/blind/38136ab3a4c0/subject.ts) | [final source](../evidence/abide-rule-coverage-current/r7_name_wider_than_type/native/blind/270bb386ae73/subject.ts) |
| publish bulletin | [final source](../evidence/abide-rule-coverage-current/r8_name_claims_resource/native/blind/3ad513f3d2a1/subject.ts) | [final source](../evidence/abide-rule-coverage-current/r8_name_claims_resource/native/blind/a077ba850a2c/subject.ts) |
| clock sensitive expiry | [final source](../evidence/function-resource-native-current/r9_body_reaches_undeclared/native/blind/eeb4686d071f/subject.ts) | [final source](../evidence/function-resource-native-current/r9_body_reaches_undeclared/native/blind/f28446bb4b49/subject.ts) |

## Methodology and interpretation

This is a team-authored, selected synthetic study, not an external or held-out production benchmark. The duplicate-fact designs were previously tested; the remaining-rule candidates were reviewed and frozen before their live outcomes. Two defects and a nearby valid control were chosen per remaining family. The case set stayed fixed; the declared resource-rule configuration change prompted its replacement batch, and all outcomes from that batch are retained.

The flaws were seeded before the maintenance edit; this tests review of a touched declaration, rather than discovery of newly introduced bugs. Native agents renamed `label` to `displayLabel`, preserved the documented domain, and ran compiler checks. Their task did not add a repair-response protocol. Every arm received the same diagnostic reporting instructions; fresh neutral receipt markers were appended only to rule-bearing reviewer output. These markers change the messages and establish cooperative recorded receipt, not correctness or causation. This measures maintenance with diagnostic instrumentation.

Hapsland supplied selected declaration graphs; Abide supplied its released diff/task review boundary. Its custom rubric targeted `subject.ts`; Hapsland could reassess changed supporting declarations. Context collection, input boundaries and response instructions therefore vary together. This comparison cannot isolate context alone. All synthetic source files were eligible for Hapsland; file exclusions, data-access policy and simultaneous use of both products were not tested.

The [coverage declaration](../evidence/abide-rule-coverage-current/declaration.json) owns the seven unchanged families; the [replacement declaration](../evidence/function-resource-native-current/declaration.json) owns r9. The replacement batch has 18 detection cells, nine native sessions, a 54-request ceiling, no retries and five-minute actor timeouts; it used **30 requests**. The retained full coverage execution used 220 requests. The separate duplicate-fact matrix used 98; preparatory detection and the eligibility smoke check used another 28 and six respectively. These execution totals include superseded observations; reported outcomes use only the batches named above. Versions and hashes are recorded in their declarations and the [platform record](../evidence/abide-rule-coverage-current/platform.json). These are source-checkout observations, not installed-package or platform certification.

### Independent checking

The [fixed oracle](../evidence/abide-rule-coverage-current/score-abide-rule-coverage.mjs) used independent TypeScript 5.9.3 and passed 67 pre-execution self-checks. It tests predefined valid and invalid structural variable assignments, retained domain fields and clean-control independence. An excess-property error alone cannot earn repair credit. Compilation failure, valid-domain restriction and unknown adaptations receive no repair credit. These are finite checks, not a proof for every possible value.

Operation naming, nominal identity separation and resource declarations require additional semantic judgment. Their [acceptance rubric](../evidence/abide-rule-coverage-current/manual-scoring-declaration.json) was fixed before live execution. AI-assisted adjudicators within the research team inspected anonymous artifacts without reviewer identities, then retained source reasoning and concrete compiler/runtime probes under [seven-family manual evidence](../evidence/abide-rule-coverage-current/manual/) and [resource-rule manual evidence](../evidence/function-resource-native-current/manual/). Source judgments and executed checks are distinguished in each record. Judgments were frozen before the [seven-family arm join](../evidence/abide-rule-coverage-current/unblinding-receipt.json) and [resource-rule arm join](../evidence/function-resource-native-current/unblinding-receipt.json); anonymity reduces identity bias but does not make this study external.

The no-review arm is a methodology control, not a third review product: 1/16 defective artifacts were repaired without reviewer feedback in the coverage matrix. Finding, emitted message, confirmed receipt and verified repair are recorded separately. Hapsland had 6 coverage repairs following confirmed receipt and reported application; Abide had 2. A repaired artifact without verified receipt cannot be attributed to the advice.

### What reaches the agent

Hapsland's [shared formatter](../src/feedback/message.ts) sends:

```text
Hapsland
Check these findings. Fix valid issues and verify; otherwise explain why.
subject.ts :: CaseState: <configured rule message>
```

`hapsland --feedback-preview` shows an offline synthetic example. IDs and probabilities remain internal metadata. Claude and Codex carry the same text in their native envelopes.

Abide 0.0.7 uses its [shared formatter](https://github.com/coldteadotai/abide/blob/ea6d0976a0cbac70f71a460ece348bd68d777350/packages/cli/src/lib/reason.ts#L14), naming the rule, source and verdict, followed by a request to repair the file and continue. At turn end it asks for repair before finishing. Uncertain-result notices are separate from actionable advice.

Under the [comparative research methodology](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-METHODOLOGY.md), advisory classifications remain **BORROW** for relevant-definition collection, readable feedback and independent checking; **OPTIONAL INTEGRATION** for Abide as a neighboring tool subject to separate coexistence validation; **REJECT** for unconditional application or general superiority claims; no new **DEPEND ON** recommendation.

Observed results are **RUN / RUNTIME-TESTED** within their stated checks. Source-only judgments are **SRC / SOURCE-INSPECTED**. Explanations assigning a causal role to context are **INFERRED**. False warnings and incomplete graphs limit any claim of advantage.

## Replay offline

```sh
node scripts/score-abide-rule-coverage.mjs --self-check
node scripts/score-abide-rule-coverage.mjs --score \
  --blind-root=evidence/abide-rule-coverage-current/r2_meaningless_combinations/native/blind \
  --output=/tmp/hapsland-replayed-rule-scores.json --expected-count=9
```

The scorer requires TypeScript 5.9.3 at `/tmp/hapsland-quality-scorer/node_modules/typescript`. This calls no reviewer. A live rerun of the [fixed runner](../scripts/run-abide-rule-coverage.mjs) needs credentials and a fresh destination; it incurs review requests.
