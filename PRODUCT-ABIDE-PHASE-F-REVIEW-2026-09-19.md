# Abide lessons for Phase F

Status: **advisory research, not a specification change**. Date: 2026-09-19.
This focused companion to [the Abide research report](./RESEARCH-ABIDE-2026-09-19.md)
compares its evidence and pinned source with [Phase F / issue #3](./PRODUCT-PHASE-F-SPEC.md),
the [evaluation model](./PRODUCT-RULE-EVALUATION-MODEL.md), and
[combinatorics tests](./PRODUCT-RULE-COMBINATORICS-TEST-SPEC.md).
It does not supersede the broader report, implement anything, or alter issues/ADRs.

## Brief and candidate boundary

Question: what does Abide validate, contradict, or improve in our agreed configuration,
rule, diagnostic, and testing design? The candidate is Abide's combined host integration,
declarative rule engine, and evaluation tooling at commit
`ec3352e873163b74aca1ac9cf3bd0ea69a97723a` (CLI 0.0.5, schema 0.0.3).
The existing-solution baseline is using Abide for advisory post-edit review; assess
whether our narrower additional requirements justify separate implementation.

Required here: Codex post-edit advisory feedback, local declarative rules, protected
source-egress consent, understandable non-interactive outcomes, offline conformance,
and explicit synthetic paid milestones. Multiple tools and remote failure remain
relevant. Pre-action blocking, additional hosts, turn-end sweeps, instruction compilation,
and distribution are outside #3: their absence cannot invalidate this milestone.
Abide is the user-selected candidate, so this pass does not repeat ecosystem discovery
or claim saturation. Stop after its pertinent source and our accepted contracts have
been compared. No dependency adoption is proposed; no license/API dependency gates
are therefore passed implicitly.

Evidence that would change our recommendation: a demonstrated Abide configuration or
small bounded extension meeting the accepted consent, exclusion, outcome, and semantic
test contracts with less ongoing cost; or labeled experiments showing that our chosen
single-file input cannot support the actual maintained rules adequately.

## Evidence ledger

All Abide source links below are immutable at the pin above. **No Abide runtime, live
host, or paid experiment was executed for this focused pass.** Earlier reported test
runs remain evidence from that earlier pass, not independent confirmation here.

| ID | Exact proposition and source | Source class / verification state | Boundary or limitation |
|---|---|---|---|
| F01 | [`groupByScope` and `runCheck`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/checkRunner.ts) group rules by their identical in-scope changed-file lists; one call per group carries its diffs and possibly task text. | SRC / SOURCE-INSPECTED | Supports scope-aware batching, not semantic equivalence of isolated and batched judgments. Unlike #3, a call can contain several files. |
| F02 | [`rubric.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/rubric.ts) records source path/line, rule text, scope, edit/turn cadence, check class, and status; questions can be boolean/choice/score. | SRC / SOURCE-INSPECTED | More expressive schema is not proof that every rule can be judged accurately from supplied input. No recommendation to add these answer kinds to F. |
| F03 | [`rubricFile.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/rubricFile.ts) merges by bare rule ID with project replacement and origin `project`/`global`; [`sources.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/sources.ts) compares source hashes for staleness. | SRC / SOURCE-INSPECTED | This provenance describes origins/freshness, not protected authority or semantic correctness. |
| F04 | [`loadRules.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/loadRules.ts) returns a merged surviving rubric plus `problems` when another rubric is invalid; [`postToolUse.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/postToolUse.ts) and [`stop.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts) debug-log the problems and proceed with loaded rules. | SRC / SOURCE-INSPECTED | Partial-policy behavior was not executed here. #3 explicitly requires whole-selected-configuration rejection. |
| F05 | [`calibration.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/calibration.ts) labels distributions weak/noisy/decisive without reference labels; [`calibrate.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/commands/calibrate.ts) writes those results into rule status. | SRC / SOURCE-INSPECTED | Five zero probabilities satisfy `decisive`; frequent correct violations can satisfy `noisy`. These are deductions from conditions, not executed experiments. |
| F06 | [`calibrate.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/commands/calibrate.ts) increments its `calls` counter once per successful runner invocation and catches failed checks; F01's runner can perform several groups and accept retries. | SRC / SOURCE-INSPECTED | That counter cannot establish all actual transport attempts or paid exposure. |
| F07 | [`jev.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/jev.ts) skips an absent/unrecognized answer for a requested rule instead of requiring a complete exact-key response. | SRC / SOURCE-INSPECTED | Missing assessment must not be interpreted as a successful clear judgment. Our product-owned exact-key boundary already covers this risk. |
| F08 | [Published replay](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/benchmarks/replay/README.md) reports 10/39 edit flags and 11/15 turn flags confirmed by an independent model reviewer; private hunks are not published. | DOC / DOCUMENTED | Different rules/context and selected reviewed outputs prevent a causal cadence comparison; inspecting 20 near-threshold clears is not overall recall estimation. No local reproduction. |
| F09 | [`jev.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/jev.ts) allows task text in state, supplies a gateway-namespaced retention option even on its direct route, and can include provider response/error text in failure messages. | SRC / SOURCE-INSPECTED | A client flag is not evidence of actual provider retention. This pass does not wire-test the option. Our existing sanitized backend errors are a stronger boundary. |
| F10 | [`git.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/git.ts) snapshots through a scratch Git index and Git object writes; [`session.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts) separately manages local session state. | SRC / SOURCE-INSPECTED | Cleaning receipts or a scratch index does not establish deletion of source-bearing Git objects. No storage experiment executed here. |
| F11 | [`checkRunner.test.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/checkRunner.test.ts) tests loudest-verdict merging; [`calibration.test.ts`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/calibration.test.ts) tests distribution classifications. | SRC / SOURCE-INSPECTED | Those inspected tests do not establish rule accuracy or exhaust configuration combinatorics. This is not an exhaustive inventory of Abide tests. |

## Comparable capability and decision matrix

Our side below describes accepted specifications, not implemented Phase F behavior.

| Area | Abide evidence | Phase F comparison | Proposed use |
|---|---|---|---|
| Declarative questions and scoped batching | F01–F02, SOURCE-INSPECTED | Confirms a practical design pattern. Ours intentionally uses binary questions and one file per logical batch. | **BORROW** scope-safe batching principle; **REJECT** adding multi-file/cadence complexity merely for parity. |
| Provenance and freshness | F03, SOURCE-INSPECTED | Our qualified identities, actual content digests, and field-level explanation are already specified more precisely. | **BORROW** visible freshness/origin principle; keep existing stronger contract. |
| Configuration failure | F04, SOURCE-INSPECTED | Our selected-policy validation must produce unavailable and zero egress, not a partial/default policy. | **REJECT** surviving-subset loader semantics for our runtime. |
| Rule quality | F05, F08, SOURCE-INSPECTED / DOCUMENTED | Validates the need for our independent positive/negative labels and realistic negative controls. | **REJECT** decisiveness/fire-rate as correctness or an automatic disable policy. |
| Batch behavior tests | F01, F11, SOURCE-INSPECTED | Batching is an optimization with a semantic hypothesis; our isolated/full/pair comparison is justified. | **BORROW** explicit grouping/call-accounting seams, not conclusions about accuracy. |
| Complete outcomes and request accounting | F06–F07, SOURCE-INSPECTED | Our exact answer keys, unavailable separation, and retry-inclusive budgets address concrete failure modes. | **REJECT** treating absent answers or unrecorded failed attempts as successful clean work. |
| Data boundary and local footprint | F09–F10, SOURCE-INSPECTED | Our no-transcript/source-free-state intent should be checked at actual transport and storage boundaries. | **BORROW** audit approach; **REJECT** copying task egress, raw provider errors, or hidden Git snapshots into F. |

No `DEPEND ON` or `OPTIONAL INTEGRATION` recommendation is made. Abide's combined runtime
has not passed our required consent, egress, outcome, or real-host gates. That is an
unresolved replacement case, not proof that using it can never be cheaper.

## What is validated, invalidated, or still weak?

### Preserve the agreed core

Abide provides source evidence that scoped declarative rules and batching are implementable
patterns, not evidence that ours already work. The highest-value confirmations are the
decisions we already recorded: explainable origins, definition/fixture digests, independent
semantic labels, isolated-versus-batched evaluation, exact answer validation, complete
configuration validation before egress, and distinct unavailable/skipped/reviewed outcomes.
Keep these as acceptance requirements, not optional polish. [F01–F07, F11]

The user's request for sturdy combinatoric tests remains justified. Example tests for
merging verdicts or assigning calibration status cannot replace our gate matrix,
exclusion laws, provenance agreement, failure sequences, and real subprocess tests.
Quint can later strengthen the deterministic state/ordering model; it cannot establish
that an unlabeled high-confidence answer is true. [F05, F11; evaluation model]

### Reject claims stronger than the evidence

“High confidence means a good rule” is not supported: distribution decisiveness is not
accuracy. “Turn-end review is better” is also not established by Abide's different
per-cadence rule sets and private labeled sample. Treat its reported false positives as
motivation for controls such as scripts/tests versus production, explanatory comments
versus restatements, and explicit applicability, not universal benchmark numbers. [F05, F08]

Likewise, explainable configuration is not tamper prevention. Our accepted contract lets
projects change ordinary review settings while protecting user privacy/consent. A future
managed-policy authority is a different requirement, not a missing part of #3. [F03;
Phase F user stories 5–6 and configuration decisions]

### Strongest challenge to our chosen design

The important challenge is **what a rule can know**. Abide can present a task and several
file diffs; ours presents a single post-edit full file and its path. Neither input is
universally superior. Ours sees unchanged surrounding code, but cannot establish which
lines this action introduced, what the user requested, or relationships to unseen files.
Rules about unrelated task changes, introducing a new violation, or cross-file consistency
therefore cannot be advertised as reliably supported by that contract. Full-file checks
may also surface pre-existing problems after a harmless edit. [F01–F02, F09; current
`src/ports/review-backend.ts` and Phase F per-file batching decision]

Full-file review also sends more unchanged source than diff-only review. Better consent
controls do not establish universally better data minimization; context adequacy and
payload minimization remain a trade-off requiring labeled evidence.

This does not invalidate #3. It warrants an explicit author-facing input contract and
examples, plus context identity in evaluation evidence. If maintained rules prove unable
to work from that input, revisit input scope on empirical evidence rather than adding
task transcripts or multi-file payloads silently.

Abide also has a credible time-to-value countercase: its broader compile/replay/tuning
workflow can make user policy operational faster than manual pack authoring. Passing
our stronger contracts alone does not establish that users should prefer our product.
Onboarding and useful-feedback experiments belong in the subsequent product milestone,
not an unrequested expansion of configuration work.

## Traceable specification/prototype handoff

All rows are recommendations requiring explicit adoption; existing requirements remain
unchanged by this report. Required host here is Codex; the contract should remain
host-neutral where the host does not own the behavior.

| ID | Advisory implication / evidence | Current disposition | Proposed acceptance and uncertainty |
|---|---|---|---|
| AF1 | State the rule input contract: one post-edit full file plus repository-relative path, no task/transcript or cross-file knowledge. [F01–F02, F09] | **Take to specification:** narrow clarification for F. | Document supported and unsupported examples, including pre-existing violations. Record input-contract/renderer identity with existing fixture/rule/backend identities; compare identical context. If wrong, authors will promise judgments impossible from the payload. |
| AF2 | Test egress where the actual Effect provider serializes it. [F09] | **Take to both:** bounded F acceptance tightening. | Use the real provider with fake HTTP and synthetic sentinels; assert intended source/path/questions, destination binding, and absence of transcript, unrelated prompts, absolute local paths, credentials in payload/logs, or environment dumps. Authentication credentials belong only in the intended auth channel. A passing client test proves outgoing fields, not server retention. |
| AF3 | Make absence of hidden source persistence explicit, beyond receipt schema alone. [F10] | **Take to specification:** bounded F clarification. | No review-created source snapshots/Git object writes; source-free receipts/diagnostics under documented access, retention, and failure rules. Synthetic filesystem side-effect fixtures should cover auxiliary/temp locations, not only the receipt JSON. Incorrect scope would leave a second source store despite clean receipts. |
| AF4 | Keep labeled semantic quality distinct from availability and distribution statistics. [F05, F08] | **Already covered:** preserve and sharpen fixture selection. | Positive/negative controls per rule, scope-specific contexts, ambiguous/unchecked separate; report error counts with denominators and declared repeats. Do not infer real-world precision/recall from balanced synthetic fixtures or selectively reviewed flags. No automatic rule disabling based on unlabeled fire rate. |
| AF5 | Keep grouping and paid attempts separate. [F01, F06] | **Already covered:** make counter terminology explicit during F implementation. | Assert per-file logical batches and retry-inclusive transport attempts independently; failure/cancellation cannot disappear from outcome accounting. Successful runner invocations are not a spending guarantee. |
| AF6 | Preserve whole-policy rejection, qualified identities, exact answers, and shared runtime/explain provenance. [F03–F04, F07] | **Already covered:** retain decisive regression examples. | Invalid selected pack beside a valid one means unavailable/zero sends; missing rule answer is unavailable, never clear; project review overrides cannot weaken accumulated privacy exclusions. |
| AF7 | Consider instruction-source path/line links and freshness UX. [F02–F03] | **Defer:** revisit with instruction compilation/onboarding. | Our pack/config origin and content identity already satisfy F; do not invent a compiler or require source-document metadata for hand-authored packs. |
| AF8 | Explore end-turn coverage and rule cadence only with a separate input/consent/storage design. [F01, F08, F10] | **Defer:** later host-coverage milestone. | A status receipt proves observed integration activity, not interception of shell writes/all edits. Compare identical labeled rules across contexts before claiming cadence quality gains; do not copy Git snapshots without a retention decision. |
| AF9 | Evaluate using Abide against continued building on user outcomes and total integration cost. [F01–F10] | **Defer:** broader product validation, not F parity work. | Measure time to first useful rule, labeled false positives, observed coverage, latency, and repair usefulness where repair is actually in scope. Existing source evidence alone does not settle replacement cost or product preference. |

## Limits and completion

This pass stopped after the bounded source/spec comparison. It did not search new
candidates, run Abide's tests again, measure paid behavior, reproduce private replay
labels, verify real-host enforcement, or test server retention. Source-inspected
implementation is not a live compatibility guarantee. The earlier research report's
broader comparison remains separate; no forward-link cleanup is needed for supersession
because this report supplements rather than replaces it. Primary sources are indexed
in the evidence ledger; our accepted documents are linked at the top.

Bottom line: **retain #3, clarify its input and data boundaries, and use Abide's failure
modes to sharpen acceptance tests.** No finding here justifies silently adding new
hosts, turn-end behavior, rule kinds, managed enforcement, or a compiler to Phase F.
