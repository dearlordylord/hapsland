# Jev use cases across active TypeScript projects

Scope: canonical projects under `/Users/firfi/work/typescript/` with activity since ~2026-06-16.
Worktree/experiment variants (`dalph-*`, `dnd-cleanroom-*`, `degrees-*`, `hulymcp-*`, `piglatin-*`) are
collapsed into their canonical repository. Jev model assumptions come from
`/Users/firfi/work/typescript/jev/JEV.md`.

## Summary

| Project | What it is | Last activity | Jev fit | Best candidate |
| --- | --- | --- | --- | --- |
| `authoring` (Chekhow) | Evidence-traceable Chekhov-gun index over a private narrative corpus | 2026-08-28 | strong | Replace the batched Kimi "editorial disposition" pass with per-candidate atomic Jev questions |
| `degrees` | Headless Effect/jsdom harness driving Degrees of Lewdity for an agent player | 2026-09-10 | strong | Routine divergence guard: does the current scene still match the routine's situation |
| `hulymcp` | MCP server + CLI for Huly, 255 operation modules, proxy tool mode | 2026-09-13 | strong | Replace the substring-token `toolScore` tool search with intent-to-category routing |
| `dnd` | Formally specified D&D 5e SRD rules SDK (Quint + TS reducers), MCP server, model-backed "raw swarm" benchmark | 2026-09-15 | strong | Pre-screen raw-swarm scenario transcripts into the nine verdict classes before the expensive reviewer |
| `dalph` | Graph-native delivery orchestrator supervising bounded concurrent coding-agent task attempts | 2026-09-15 | moderate | Classify an attempt's terminal report to choose retry / integrate / escalate |
| `voila` | SDK + MCP + CLI for a grocery site (search, cart, slots, order history) | 2026-08-24 | moderate | Judge whether a search hit actually satisfies the shopper's stated item |
| `piglatin` | Oneshot experiment comparing LLM-derived Quint specs from code vs tests vs prose | 2026-09-12 | weak | Cheap triage of derived-spec clauses as implementation-detail vs specification |
| `crap4ts` | Rust-core CRAP (complexity × coverage) scorer for TS/TSX with CI thresholds | 2026-09-11 | weak | Suppression-justification plausibility check |
| `obs-mcp` | MCP server for OBS Studio automation over obs-websocket | 2026-09-13 | none | — |
| `jikan` | Pure TS timer/workout state machines with clock adapters and React bindings | 2026-09-12 | none | — |
| `emulate` | Stateful local drop-in emulators for 14 SaaS APIs (Stripe, GitHub, Slack, …) | 2026-08-26 | none | — |
| `drdice` | Deterministic PRNG and dice-expression evaluation with literal-computing types | 2026-08-26 | none | — |

`chekhov` is the `authoring` directory; the project calls itself Chekhow (`authoring/README.md:3`).
All three projects the user named (`dnd`, `dalph`, `chekhov`) fall inside the activity window.

---

## authoring (Chekhow)

Builds a complete, evidence-traceable Chekhov-gun index from a private narrative corpus, keeping
corpus evidence strictly separate from analytical inference (`authoring/README.md:3`,
`authoring/CONTEXT.md`). Pipeline: BM25 + personalized-PageRank retrieval over passages
(`authoring/src/retrieval.ts:50`), candidate harvest, identity reconciliation, mechanical citation
validation, then a model-graded editorial review and a benchmark/eval harness.

### 1. Editorial disposition of gun candidates

Today one Kimi call per batch assigns a label from a five-way taxonomy plus a 1-5 usefulness score and
a global priority (`authoring/src/review.ts:101`, `authoring/src/review.ts:116`). Batching means
candidates are judged in each other's context, and the code then has to assert that the final ranking
did not silently mutate preliminary labels (`authoring/src/review.ts:145`).

- `state`: `{ candidate: {id, title, statement, significance_rationale, evidence_passages[]}, scope }` — one candidate per call, the exact cited passages inline.
- questions (one call per candidate, batched as questions, not as candidates):
  - `disposition` = `choice`: `useful` ("a live setup a writer must still pay off"), `false-positive-already-resolved` ("later corpus evidence pays it off or neutralizes it"), `intentional-ambiguity` ("the work treats the gap as the point"), `insignificant` ("trivial detail with no narrative obligation"), `misunderstood-evidence` ("the statement misreads what the cited passages say").
  - `evidence_supports_statement` = `noul`: "Do the passages in `candidate.evidence_passages` literally support `candidate.statement` without added authorial intent?"
  - `branch_safety` = `noul`: "Does `candidate.statement` combine mutually exclusive branch variants into one story history?"
  - `false_closure` = `noul`: "Does the rationale treat later silence as demonstrated closure?"
  - `usefulness` = `score`, levels as situations: "restates a passage", "open detail with no promise", "open promise a reader would expect answered", "structural obligation the work sets up and does not discharge".
- code: `disposition.confidence < 0.55` → route to the existing Kimi reviewer instead of accepting; any
  of the three `noul` guards > 0.6 → force `misunderstood-evidence`/hold regardless of the choice;
  `usefulness.score` becomes the sort key, replacing the model-assigned global 1..N priority so priority
  is computed in code and cannot drift between calls.

### 2. Retrieval passage relevance / reranking

BM25 + graph propagation picks top_k purely lexically (`authoring/src/retrieval.ts:50`), and the
retrieval eval harness exists precisely because required passage IDs get missed
(`authoring/src/retrieval-evaluate.ts:67`, `classifyRetrievalRun` at :73).

- `state`: `{ question, passage: {id, text} }`, one passage per question id, ~30 candidates in one call.
- questions: `p_<id>` = `noul` "Does this passage contain evidence bearing on `question`, not merely shared vocabulary?" plus `establishes` = `noul` "Does it *establish* something (introduce an object, promise, or obligation) rather than merely mention it?"
- code: rerank the BM25 top-50 by `0.6*noul_relevant + 0.4*noul_establishes`, keep top_k. The
  existing `missed_required_ids` diagnostic is the ready-made offline metric for whether this helps.

### 3. Grader pre-filter in the eval harness

`graderInstructions` (`authoring/src/grader-prompt.ts:5`) enumerates flat, independent rejection
conditions: evidence/inference/creative boundary violation, invented authorial intent, sequence
promoted to causality, invented facts, ignored source authority. These are exactly atomic `noul`s.

- `state`: `{ benchmark_case, analyzer_answer }`.
- questions: `violates_evidence_boundary`, `invents_authorial_intent` ("including hedged with 'may'"),
  `promotes_sequence_to_causality`, `invents_future_events`, `ignores_stipulated_source_authority` —
  all `noul`; plus `grader_disagreement` = `noul` "Do the benchmark obligations conflict here?"
- code: any violation `noul > 0.7` → fail without calling the LLM grader; all < 0.3 and
  `grader_disagreement < 0.3` → pass; otherwise call the existing grader. `classify()`
  (`authoring/src/evaluate.ts:54`) already merges a mechanical pass-bit with a grade, so the wiring point
  exists.

Not a fit here: `regression-audit.ts:31` classifies H01-H10 dispositions against a *complete-corpus*
record set with cross-passage bookkeeping. That is multi-step evidence reconciliation, not a snap
judgment.

---

## degrees

Headless kernel that loads the local DoL build in jsdom and exposes observe/act to a "guardian angel"
agent, which plays the character and authors reusable routines (`degrees/README.md:3-5`,
`degrees/CONTEXT.md`). Routines must return control on **divergence** — an observed situation that
does not match what the automated sequence expects (`degrees/CONTEXT.md`, `degrees/src/routine-runner.ts:15`).

### 1. Routine divergence guard

`forcedAction` only handles the structurally unambiguous case — one enabled passage link and nothing
else — and bails with `stopReason: 'dialog' | 'input' | 'choices' | 'no-actions'`
(`degrees/src/forced-progression.ts:20`). Everything semantic is left to the agent, i.e. a full LLM
turn per step.

- `state`: `{ objective, routine_expectation: "<the routine's stated situation>", scene: {passage, prose, actions: [{label, kind}]}, character: {arousal, stress, trauma, time, money, location} }`.
- questions:
  - `still_in_situation` = `noul`: "Does `scene` still match `routine_expectation`?"
  - `intended_action` = `choice` over the current `scene.actions` labels, plus `none-of-these`.
  - `danger` = `score`: "nothing threatening", "an NPC is pressing but the character can leave", "the character is cornered or restrained", "a non-consensual scene is in progress".
  - `objective_satisfied` = `noul`: "Has `objective` been achieved in this scene?"
- code: `still_in_situation < 0.6` → `outcome = 'divergence'`, hand back with the reason string the
  handback CLI already takes (`degrees/src/cli/main.ts:121`). `danger.score >= 2` → hand back
  unconditionally regardless of budget. `objective_satisfied > 0.8` → `'completion'`.
  `intended_action.confidence < 0.5` → hand back rather than click. This turns a per-step LLM call into
  a ~100ms call and keeps the four-outcome handback contract untouched.

### 2. Scripting-opportunity detection

`createScriptingPolicy` finds repeated work by exact `JSON.stringify` equality of action sequences and
by counting identical `[kind, label]` pairs ≥ 3 in a 12-action window
(`degrees/src/scripting-policy.ts:58`, :66). Its own message admits the weakness: "These are similar
labels, not evidence of interchangeable decisions."

- `state`: `{ window: [{label, kind, passage, objective}] }` (last 12 manual actions).
- questions: `same_decision` = `noul` "Do the repeated entries in `window` represent the same decision under the same conditions, rather than the same label under different circumstances?"; `scriptable` = `score`: "each repetition needs a fresh judgment", "repetition with a simple resource/time guard", "mechanical repetition with a fixed stop condition".
- code: only surface the `scripting-review` suggestion when `same_decision > 0.7 && scriptable.score >= 1`.
  Directly removes the false-positive class the comment names.

### 3. Observation delta significance

`observation-delivery.ts` diffs prose at sentence granularity and deliberately never discards an edit,
"even a single digit" (`degrees/src/observation-delivery.ts:19`). Correct as a transport guarantee,
but the agent then has to read every trivial delta.

- `state`: `{ changes: [{before, after, contextBefore, contextAfter}], character_delta }`.
- questions per change: `decision_relevant` = `noul` "Does this change alter what the character should do next?"; `kind` = `choice`: `stat-drift`, `time-passing`, `new-threat`, `new-opportunity`, `cosmetic-rewording`.
- code: presentation-layer only — order changes by `decision_relevant`, collapse `cosmetic-rewording`
  above 0.8 into a count. Never drop data: the full delta stays retrievable by prose reference, which the
  `Prose` union already supports (`degrees/src/observation-delivery.ts:11`).

---

## hulymcp

Feature-complete MCP server and CLI for Huly, sharing one operation registry
(`hulymcp/README.md:11`). 255 operation modules under `src/huly/operations/`. Because the native
tool surface is too large for most clients, there is a `proxy` exposure mode
(`hulymcp/src/mcp/tool-mode.ts:3`) where the client searches a tool catalog instead of seeing all tools.

### 1. Tool search in proxy mode

`toolScore` is `tokenHitCount` over name/category/description/params with hand-tuned weights, where
`NAME_TOKEN_WEIGHT = 1_000` (`hulymcp/src/mcp/proxy-tool-catalog.ts:295`, :305). A query like "why is
this ticket stuck" scores zero and returns nothing (`searchToolDefinitions` returns `[]` when no token
hits, :331).

- `state`: `{ query, categories: {issues: "...", boards: "...", calendar: "...", documents: "...", channels: "...", cards: "...", search: "Workspace-wide full-text and structured search", ...} }` — the category descriptions already exist (`proxy-tool-catalog.ts:246`).
- questions: `category` = `choice` over the category table (values = the category descriptions, so the model sees what is under each branch); `operation_kind` = `choice`: `read`, `create`, `update`, `delete`, `attach-or-upload`, `unclear`; `is_bulk` = `noul`.
- code: hierarchical classification — call 1 picks the category, call 2 is a `choice` over only that
  category's tool names (a genuine data dependency, so the second call is justified). Union the Jev
  result with the current lexical hits rather than replacing them; when `category.confidence < 0.5`, fall
  back to today's lexical ranking over all tools. `operation_kind === 'delete'` with confidence > 0.8 is
  a useful signal for whichever admission layer gates destructive tools.

### 2. Nothing else here

The 255 operations are deterministic Huly API wrappers with typed failures and warnings. There is no
place in them where a judgment is currently faked with string matching. Fit is strong for exactly one
surface.

---

## dnd

Executable, formally specified SRD 5.2.1 rules engine: Quint models executed by TypeScript reducers,
exposed as `@dearlordylord/dnd-sdk` and an MCP server (`dnd/README.md:18-33`). The engine returns
**Holes** (required inputs) and **Acts**; callers supply dice and geometry as witnesses. Separately,
`scripts/raw-swarm/` is a model-backed benchmark that has agents play scenarios against the SDK to find
gaps, producing transcripts that a reviewer model classifies (`dnd/scripts/raw-swarm/README.md:3-6`).

### 1. Raw-swarm transcript pre-screen

`ReviewOutputSchema` demands one or more verdicts drawn from nine classes: `bug`, `adapter-defect`,
`unsupported-capability`, `assumption-divergence`, `corpus-ambiguity`, `scenario-invalid`,
`player-invalid`, `reviewer-error`, `pass` (`dnd/scripts/raw-swarm/review-contract.ts:5`). Today each
review is a 30-minute-budgeted model invocation under a lock
(`dnd/scripts/raw-swarm/README.md`, model-lane section).

- `state`: the projected turn (`sdk-player/player-turn-projection.ts`) — `{ scenario: {prose, intent}, sdk_calls: [{tool, args, result_tag, error}], last_state }`. Keep it to one turn; whole transcripts will exceed the ~32k budget.
- questions (one call, speculative fan-out):
  - `verdict` = `choice` over the nine classes, criteria taken verbatim from the reviewer prompt's definitions.
  - `sdk_refused_a_supported_mechanic` = `noul`.
  - `player_supplied_an_invalid_witness` = `noul` ("a dice result or geometry fact the runtime asked for, given in the wrong shape or out of range").
  - `scenario_needs_non_srd_content` = `noul` — directly the `contentAvailabilityIntent` distinction (`dnd/scripts/raw-swarm/scenario-campaign.ts:141`).
  - `capability_probe` = `noul` — the `SDK_CAPABILITY_INTENTS` distinction (`scenario-campaign.ts:164`).
- code: verdict `pass` with confidence > 0.85 and all guard `noul`s < 0.3 → skip the expensive reviewer
  entirely and mark the turn screened; `bug`/`adapter-defect` at any confidence → always escalate to the
  full reviewer (a missed bug is the whole point of the campaign, so the threshold is asymmetric);
  anything else → queue. Everything Jev produces here is *screening evidence*, never a verdict of record:
  the review output is SHA-bound to a transcript and git revision (`review-contract.ts:17`), and that
  binding must keep naming a real reviewer.

### 2. Authored-identity / PHB+ leakage guard

`AGENTS.md:38-56` forbids real PHB+ ids, names, slugs, prose, headings, and page references in public
source, fixtures, docs, and generated artifacts, and requires visibly synthetic renamed records. Model-
authored scenario prose and characters (`scenario-setup-authoring.ts`,
`scenario-character-client.ts`) are exactly where that policy is at risk, and it is currently enforced by
human review plus static checks.

- `state`: `{ text: "<authored scenario prose or character record>" }`.
- questions: `names_non_srd_official_content` = `noul` "Does the text name D&D content outside SRD 5.2.1 (classes, subclasses, spells, monsters, settings) by its official name?"; `looks_copied` = `noul` "Does it reproduce rulebook phrasing rather than paraphrase?"; `cites_page_reference` = `noul`.
- code: any > 0.5 → reject the candidate before it is written to the catalog (the campaign already has a
  `candidateRejected` branch, `scenario-campaign.ts:1134`). Deliberately tuned for false positives.
  This complements, never replaces, `check:authored-id-dispatch` — Jev cannot know the full PHB+ corpus,
  so a hit means "a human looks", not "this is a violation".

### 3. Natural-language act selection at the MCP boundary

The MCP surface returns discoverable Acts and Holes; a caller with a freeform intent ("I shove him off
the ledge") must map it to an Act id and fill the Holes.

- `state`: `{ utterance, acts: [{id, label, description}], holes: [{id, question, kind}] }`.
- questions: `act` = `choice` over the discovered act ids plus `none`; `target_named` = `noul`; `is_reaction` = `noul`.
- code: `act.confidence > 0.8` → pre-select; otherwise return the act list unchanged. Strictly an
  ergonomic front-end. Never let it reach the reducers: production execution is required to dispatch on
  parsed Surface shape and typed procedure facts, not names or slugs (`dnd/AGENTS.md:58`), and a
  probabilistic label is neither.

---

## dalph

Graph-native delivery orchestrator: consumes a tracker-owned task DAG, derives the runnable frontier,
and supervises bounded concurrent task attempts with exact worktree, review, retry, integration,
recovery, evidence, and cleanup semantics (`dalph/README.md:3-9`). Authorities are strictly
partitioned — tracker owns task identity, Git owns lineage, Dalph owns only its journal
(`dalph/AGENTS.md`, "Read task identity ... from the tracker").

The orchestrator is deliberately hostile to this kind of thing: an executor's inner algorithm is opaque
to generic orchestration, which sees only "executing, safely suspended, or terminal"
(`dalph/docs/CONTEXT.md`, **Dalph executor**). So Jev belongs in the *executor implementation*, never in
the orchestration core.

### 1. Terminal-report triage inside the executor

`PlannedAttemptExecutorReport` and `PlannedAttemptExecutorCommandFailure`
(`dalph/packages/contracts/src/executor.ts:170`) are the point where an agent session's outcome
becomes a typed orchestration fact. Deciding *which* terminal fact a messy Codex session produced is
a judgment.

- `state`: `{ task: {title, acceptance_criteria}, attempt: {exit_code, last_output_tail, changed_files, test_summary}, worktree_clean: bool }`.
- questions:
  - `outcome` = `choice`: `completed` ("acceptance criteria met, checks green"), `blocked-on-environment` ("toolchain, credential, or network failure unrelated to the task"), `blocked-on-specification` ("the task as written cannot be executed as stated"), `partial` ("real progress, work remains"), `no-progress`.
  - `retry_would_help` = `noul` "Would rerunning the same attempt on a clean worktree plausibly succeed?"
  - `scope_creep` = `noul` "Do `attempt.changed_files` go beyond what `task.acceptance_criteria` require?"
- code: `outcome === 'blocked-on-environment' && retry_would_help > 0.7` → retry within the existing
  bounded budget; `blocked-on-specification` at confidence > 0.7 → surface to the Operator rather than
  burning attempts; `scope_creep > 0.6` → mark the attempt for human review before integration. All of
  this is executor-private and produces only the attempt-level result the contract already defines.

### 2. Frontier prioritization — do not

Tempting (rank the runnable frontier by "likely to succeed"), but the frontier is *derived* from the
tracker DAG and Dalph is forbidden to persist derived frontier state (`dalph/AGENTS.md`, delivery
invariants). A probabilistic reordering would make admission non-reproducible against a fixed
tracker-read, breaking the replay/recovery semantics the whole design exists to preserve.

---

## voila

TypeScript SDK, MCP server, and CLI for a grocery site, exposing search, categories, discounts, cart
deltas, slots, and order history, deliberately without checkout or order placement
(`voila/README.md:10`). The SDK is a thin, schema-validating wrapper: every module's error vocabulary is
`...SchemaMismatch` (`voila/packages/voila-sdk/src/voila/catalog-search.ts:19`). No ranking,
matching, or relevance logic exists anywhere in it.

### 1. Search-hit satisfaction

The site's search returns loosely related products; the calling agent currently eyeballs them.

- `state`: `{ request: "2L organic whole milk, lactose free", results: [{name, brand, size, unit_price, promo}] }` — up to ~25 results.
- questions per result: `satisfies` = `noul` "Does this product satisfy every stated constraint in `request`?"; `constraint_violated` = `choice`: `size`, `variant`, `brand`, `dietary`, `none`.
- code: keep hits with `satisfies > 0.7`; if none clear it, return the top three by `satisfies` labelled
  as approximations rather than silently adding to the cart. Cart writes are the destructive path, so
  the threshold is deliberately high.

### 2. Substitution acceptability

`voila/packages/voila-sdk/src/voila/checkout-summary.ts:82` normalizes a `substitutions` array and tags substitution warnings, but
has no notion of whether a substitution is acceptable.

- `state`: `{ ordered: {...}, substitute: {...}, preferences: "no palm oil; lactose free; brand-agnostic" }`.
- questions: `acceptable` = `noul`; `differs_on` = `choice`: `brand-only`, `size`, `dietary-constraint`, `entirely-different-product`; `price_materially_higher` = `noul`.
- code: surface only substitutions with `acceptable < 0.6` or `differs_on === 'dietary-constraint'`.

Fit is moderate rather than strong because this judgment sits in the *consumer* of the SDK, not the
SDK; adding it inside `@firfi/voila-sdk` would put a network dependency and a probabilistic answer
inside a library whose current contract is "normalize the response or fail with a typed mismatch".

---

## piglatin

A oneshot experiment, not a product: derive Quint models and MBT from a Pig Latin translator via three
routes — from reducer code, from naive code, and from prose specs — and compare them
(`piglatin/README.md:20-24`). Finding: the reducer-derived model was "poisoned with testing
implementation, not spec"; the naive one omitted specifications; the prose-derived one was closest to
intent.

- `state`: `{ clause: "<one derived Quint invariant or action>", source_implementation: "<the function it was derived from>" }`.
- questions: `is_implementation_detail` = `noul` "Does this clause constrain how the implementation is structured rather than what the translation must produce?"; `restates_a_test` = `noul`; `derivable_from_prose_spec` = `noul`.
- code: score each derivation route by the fraction of clauses flagged, mechanizing the comparison the
  README made by hand.

Weak, not strong: the experiment is finished, the corpus is a handful of clauses, and the interesting
output (the corrected `translate-contract.qnt`) required writing a model — generation, which Jev does
not do.

---

## crap4ts

Finds complex, poorly tested TypeScript functions and fails CI when their CRAP score
(cyclomatic complexity × coverage) exceeds a limit (`crap4ts/README.md:7-14`). The core is Rust
(`crap4ts/crates/crap4ts-core`); the metric is arithmetic over an AST and an Istanbul/LCOV report.
There is no judgment in the tool and there should not be — a CI gate must be reproducible from the
inputs alone.

The one defensible candidate is adjacent: both `dnd` and `dalph` carry checked-in suppression files
(`dalph/oxlint-complexity-suppressions.json`, `dnd/cyclomatic-complexity-baseline.json`).

- `state`: `{ function_name, complexity, coverage, crap_score, suppression_justification, function_source }`.
- questions: `justification_matches_code` = `noul`; `reason` = `choice`: `irreducible-dispatch` ("an exhaustive match over a closed union"), `generated-code`, `test-gap` ("the complexity is ordinary, the tests are missing"), `genuine-complexity`, `no-justification-given`.
- code: a reviewer-facing report, `reason === 'test-gap'` first. Never a gate.

---

## obs-mcp, jikan, emulate, drdice

- `obs-mcp` — MCP server for OBS Studio over obs-websocket (`obs-mcp/README.md:10`). Every tool is a
  typed passthrough to a websocket request against a schema'd scene/source model
  (`obs-mcp/src/domain/schemas/scenes.ts`). No freeform input, no classification, no ranking.
- `jikan` — pure models for timers and workouts with optional clock adapters and React bindings
  (`jikan/README.md:3`). Deterministic FSMs; correctness is the product.
- `emulate` — stateful local replacements for 14 SaaS APIs, explicitly "not mocks", with
  production-fidelity behavior such as real Stripe webhook signatures
  (`emulate/README.md:3`, :28). Fidelity means emulators must be deterministic; a probabilistic
  response would defeat the purpose.
- `drdice` — deterministic PRNG and dice-expression evaluation with matching runtime and
  literal-computing type-level APIs (`drdice/README.md:3-6`). Pure computation with exact reproducibility
  as the contract.

---

## Where Jev does NOT fit

- **Rules adjudication in `dnd`.** Resolving an Act means applying ordered SRD procedures with
  conditions, resistances, and revisions. That is multi-step reasoning against rules already formally
  modelled in Quint — a deterministic reducer is both correct and cheaper. Jev may sit in front of the
  runtime (intent → Act id) but never inside it.
- **Dalph's admission, frontier derivation, and recovery.** These are replay-critical: a Run must be
  reconstructible from tracker reads, Git, and the journal (`dalph/README.md:19-30`). Any probabilistic
  input to those decisions makes recovery non-deterministic. Jev is admissible only in executor-private
  triage, whose output is already an opaque attempt-level result.
- **Chekhow's regression audit and gun reconciliation.** `regression-audit.ts:31` and the reconcile
  step must decide whether two candidate observations are the *same* setup across branch variants,
  then verify the classification against reopened exact passages in a second pass (:36). That is
  cross-document bookkeeping with a revision loop, not an atomic judgment.
- **Quint/MBT model authoring** (`dnd`, `dalph`, `piglatin`, `hulymcp/quint-specs`). Writing a formal
  model is generation; Jev generates nothing.
- **`crap4ts` scoring and any CI gate.** A gate must be a pure function of committed inputs. Calibrated
  probabilities are the wrong primitive for a build that has to fail identically on every machine.
- **`degrees` routine authoring.** Deciding *what* routine to write, with which guards and budget, is
  planning. Jev is useful for the per-step guard the routine then executes, not for composing it.
- **Anything needing the DoL corpus, the Huly schema, or PHB+ content from model weights.** Jev knows
  only what is in the state, and none of these projects can afford to put their full corpus in a 32k
  budget. Every application above supplies the specific passage, tool catalog slice, or scene it judges.
- **`voila` checkout.** The SDK deliberately withholds order placement (`voila/README.md:10`). Adding a
  model-gated purchase decision would reintroduce exactly the risk that exclusion removes.

## Cross-cutting note

Four of these projects (`dnd` raw-swarm, `dalph`, `authoring`, `degrees`) share one shape: an expensive,
lock-serialized, 30-minute-budgeted model call that produces a label from a small closed taxonomy. In
each, the taxonomy is already written down as a TypeScript union — `VERDICT_CLASSES`
(`dnd/scripts/raw-swarm/review-contract.ts:5`), `RoutineOutcome`
(`degrees/src/routine-lifecycle.ts:3`), the five editorial labels (`authoring/src/review.ts:101`). Those
unions map one-to-one onto a Jev `choice`'s criteria keys, and the escalation policy is a confidence
threshold. The cheapest first integration in every case is a pre-screen that only ever *avoids* a call
it is confident about, leaving the existing reviewer as the authority of record.
