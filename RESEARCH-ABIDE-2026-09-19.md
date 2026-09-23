# Abide competitor review

> Onboarding update (2026-09-22): see [the focused installation research](./PRODUCT-RESEARCH-ADVISORY-2026-09-22-ONBOARDING.md) for current installer, credential, ownership, and activation findings. This updates that scope only; other findings retain their original evidence/version boundaries.

**Date:** 2026-09-19 (America/Montreal)  
**Candidate:** [coldteadotai/abide](https://github.com/coldteadotai/abide)  
**Pinned source:** commit [`ec3352e873163b74aca1ac9cf3bd0ea69a97723a`](https://github.com/coldteadotai/abide/tree/ec3352e873163b74aca1ac9cf3bd0ea69a97723a), CLI `0.0.5`, schema `0.0.3`  
**Canonical path for this focused review:** `RESEARCH-ABIDE-2026-09-19.md`

This is product-specification advisory material, not the normative product specification or
dependency approval. The product remains unnamed. Jev is the external TypeSafe review backend;
Abide is a competing product at the agent-host/review boundary.

## 1. Executive answer

**Lifetime follow-up:** the [Abide lifetime supplement](https://github.com/dearlordylord/jevs/blob/b738a2c/RESEARCH-ABIDE-LIFETIME-2026-09-20.md)
records the host process/state findings and subsequent architecture discussion.
The current direction is useful, coherent feedback for Claude Code/Codex, with
bounded in-memory work/advice queues and permissible suggestion loss after crashes.
Recovery concerns current state; guaranteed replay and SQLite are not requirements.
A lazily started resident worker is a candidate, not a selected architecture.
[Dispatch and feedback research](https://github.com/dearlordylord/jevs/blob/b4fc85d/RESEARCH-HOOK-DISPATCH-AND-FEEDBACK-2026-09-20.md)
is complete; live conformance gaps and the process ownership/transport choice remain.
Continue at [Choose the product process lifetime and hook transport](https://github.com/dearlordylord/jevs/issues/31).

**Yes: Abide already eclipses the product in productization and breadth of the immediately useful
workflow.** It has a published package, one-command installation, instruction-to-rubric compilation,
post-edit and end-of-turn review, automatic repair prompts, three host adapters, audit/check/report,
calibration, replay, benchmark tooling, credential handling, and a coherent operator experience.
The product has a stronger runtime-evidenced Codex vertical slice and some more rigorous core
contracts, but its configuration, installer, diagnostics, and additional-host phases are not yet
complete. A basic “Jev checks edits against configurable questions” release would enter behind
Abide.

For the repository's actual motivating use case, the answer is more specific: **Abide can run a
manually ported approximation of all nine existing Noul questions today, but it cannot reproduce the
product's measured rule behavior.** All nine rendered questions fit Abide's boolean-question size
limits, yet Abide judges diffs in a different state shape, has no content/evidence-level applicability,
uses rubric-wide inclusive thresholds, does not validate a complete answer set, and does not attach
the reviewed snapshot to its findings. Installing Abide and pointing its compiler at the repository
would therefore not import `src/questions.ts` or its measurements automatically; the nine rules would
need a hand-authored rubric and a new Abide-specific semantic evaluation before its answers could be
trusted as equivalent.

Abide does **not**, however, satisfy the complete W1–W6 baseline defined in
`PRODUCT-RESEARCH-ADVISORY-2026-09-19-PASS-2.md`:

- its `block` happens after the edit and asks the agent to repair; it does not prevent the original
  write (W2);
- its rules are compiled data in one project/global rubric, not independently packaged,
  versioned rule extensions with a trust and precedence model;
- failure is hard-coded fail-open and `ask` is absent, rather than policy-selectable;
- Kimi Code and Pi are not supported;
- project configuration can weaken or disable policy, and `.abide/**` is deliberately excluded
  from review;
- the finding contract has rule ID, probability, band, optional answer, source rule and file list,
  but no source range, severity, evidence, snapshot identity, or stale marker;
- published privacy wording is contradicted by source in two important respects: the current user
  prompt is included in Jev state when available, and the direct TypeSafe path does not transmit
  the gateway-namespaced zero-retention option; turn snapshots can also write previously untracked
  working-tree contents into the repository's Git object database, while fallback/session records
  can retain original edited source under `~/.abide/sessions`.

The strongest defensible strategy is therefore **not feature parity alone**. Match Abide's onboarding
and closed-loop usability, then lead on verifiable trust, precise data-flow disclosure, actual
pre-action policy where hosts permit it, independent rule ownership, richer snapshot-bound findings,
and host-by-host conformance evidence. If those differences are not valuable to intended users, the
case for a separate product becomes weak and Abide should be treated as the existing-solution
baseline.

The planned work matters to this comparison. Product issue
[#3](https://github.com/dearlordylord/jevs/issues/3) explicitly specifies local declarative rule packs,
the bundled nine-rule Noul pack, per-rule applicability/threshold/message overrides, exact answer
validation, one logical batch per file, stale-snapshot checks, and semantic isolated-versus-batched
evaluation. Issue [#2](https://github.com/dearlordylord/jevs/issues/2) adds directory-scoped source-egress
consent after the repository-wide Phase F baseline. These are first-party roadmap commitments, not
shipped capabilities; the present-tense comparison below continues to score only implemented work.

## 2. Research brief

### Question and existing-solution baseline

Can Abide satisfy configurable realtime review across agent hosts with less new implementation than
the product? What does it already do better, which patterns should be borrowed, and what evidenced
gaps leave room to outcompete?

The comparison uses W1–W6 unchanged from the pass-2 advisory: post-edit advisory feedback, optional
pre-action blocking, coexistence with multiple tools, bounded headless behavior, explicit Jev failure,
and feedback/configuration authority. A single package satisfying all six on Codex and a second host
without a maintained fork would overturn the provisional product-owned-core preference.

### Scope and stopping condition

The pass inspected the pinned repository's README, manifests, full source tree by subsystem, tests,
benchmark artifacts, commit/tag/release metadata, registry metadata, and the one issue visible at the
end of the pass. It ran the complete deterministic repository verification suite without credentials.
It did not make a paid Jev call, install into a real agent host, intercept live network traffic, or
reproduce the private benchmark corpus. Inspection stopped after source coverage of all ten candidate
card dimensions plus one-hop review of the shipped TypeSafe provider implicated by the privacy claim.

Abide was not present in pass 2, so this report updates only the Abide/existing-solution scope. It does
not supersede the other candidate cards. The repository owner has incorporated this candidate and a
forward link into the canonical pass-2 advisory.

## 3. Identity and maturity

| Attribute | Evidence | Assessment |
|---|---|---|
| Class | Host adapters + rule/configuration compiler + Jev review runtime + reporting/operations CLI | Direct competitor, not merely an adapter library |
| Source/release | `ec3352e`; npm CLI `0.0.5`, schema `0.0.3` | Very early public release |
| License | MIT in repository and package manifests | `META/DOCUMENTED`; no transitive-license approval performed |
| Runtime | Node `>=22`; TypeScript; AI SDK `ai` and `@ai-sdk/typesafe-ai` | Source uses the AI SDK integration, not the product's Effect `Decision` / `DecisionModel` integration |
| Provider coupling | Direct TypeSafe key or Vercel AI Gateway key; model IDs are fixed constants | Jev-specific product with a gateway route, not a provider-neutral review core |
| History | Repository created 2026-09-18; 17 commits through the pinned revision; one contributor in git history; no GitHub Releases; npm published five CLI versions across 2026-09-18/19 | `META/DOCUMENTED`; rapid activity, but no maintenance horizon or compatibility policy can yet be inferred |
| Adoption snapshot | GitHub API showed 164 stars and 6 forks late on 2026-09-19 | `META/DOCUMENTED`; interest, not reliability or runtime proof |

## 4. Evidence ledger

Every material conclusion below cites these claims. `RUN` claims describe this pass's execution;
Abide's own benchmark remains `SRC/DOCUMENTED` or `SRC/SOURCE-INSPECTED`, not our runtime evidence.

| ID | Exact proposition | Source class / verification | Scope, limitations, and contradiction |
|---|---|---|---|
| A01 | Abide advertises post-edit and end-of-turn Jev review, repair feedback, Claude Code/Codex/OpenCode support, and audit/check/report/replay/calibrate/bench commands. | DOC/DOCUMENTED, S01 | Product claims, not live-host proof. |
| A02 | The rubric schema supports boolean, choice, and score questions; edit/turn cadence; path globs; thresholds; source path/line; status/calibration; and lint/deferred/unenforceable classifications. | SRC/SOURCE-INSPECTED, S03 | Rules remain data in project/global rubric files, not independently packaged executable extensions. |
| A03 | Active model rules are grouped by identical in-scope file sets and evaluated concurrently; one call carries all rules in a group; the loudest verdict per rule survives merge. | SRC/SOURCE-INSPECTED, S04 | Multi-file scope groups can produce more than one call; no cross-event cache or duplicate-call coalescing exists. |
| A04 | Abide turns Jev answers into `act`, `flag`, or `clear`, returns repair text for `act`, keeps uncertain `flag` feedback out of the agent context, and records it in the event log. | SRC/SOURCE-INSPECTED, S03/S05 | Finding location is file-level; no line/evidence field exists. |
| A05 | `PostToolUse` runs only after Edit/Write/MultiEdit/apply_patch and returns host `decision: "block"` after the write; OpenCode appends that repair text to the completed tool result. | SRC/SOURCE-INSPECTED, S05/S06 | This is corrective post-action feedback, not W2 pre-action denial. The source's internal `blocked` name must not be promoted into prevention. |
| A06 | Turn start snapshots the complete git working tree with a private scratch index; Stop compares trees and reruns edit rules for uncovered or previously blocked files, including shell-written files. | SRC/SOURCE-INSPECTED and RUN/RUNTIME-TESTED, S05/S07/S10 | The local test suite exercises shell writes/deletes and incomplete snapshots; real-host delivery was not run. |
| A07 | The process has inner model timeouts, outer hook budgets, catches handler/parser/logging errors, exits zero, and fails open; missing key/network/check failure is distinguishable in `.abide/events.jsonl`. | SRC/SOURCE-INSPECTED, S04–S06 | No per-rule fail policy, retry in hooks, fail-closed mode, or actual process-kill host witness. A crash can still mean silent no-review. |
| A08 | Repair loops are bounded to two edit repair requests per rule/file/turn and two Stop checks per turn; OpenCode sends at most one turn follow-up. | SRC/SOURCE-INSPECTED, S05–S07 | Useful loop bound. Duplicate lifecycle delivery can still cause repeated remote calls before these presentation caps. |
| A09 | Claude/Codex installation preserves unrelated hook entries, replaces prior Abide entries, is idempotent, and uninstall removes only marked entries. OpenCode writes one marked shim and refuses to uninstall an unmarked file. | SRC/SOURCE-INSPECTED and RUN/RUNTIME-TESTED, S06/S10 | Host configuration layering and simultaneous global+project installation were not exercised in real hosts; cross-tool decision precedence remains host-owned/unknown. |
| A10 | Project rubric rules override global rules on ID collision; project thresholds override global thresholds wholesale. Instruction-source hashes trigger recompilation prompts. | SRC/SOURCE-INSPECTED, S08 | This is a simple precedence rule, not managed-policy authority. A repository or agent can edit `.abide/rubric.json`, change thresholds/status, or shadow a global rule. |
| A11 | `.abide/**` and conventionally named secret files are excluded before review; owner-only `~/.abide/sessions` records can contain a file's original source and are pruned after seven days at a later session start. The git turn snapshot uses a scratch index, `git add -A`, and `git write-tree`, which writes eligible working-tree blobs/trees—including previously untracked source—into the repository object database. Project events retain files, verdicts, latency and usage. | SRC/SOURCE-INSPECTED, S03/S07 | Deleting the scratch index/session directory does not remove Git objects; their lifetime follows Git reachability/garbage collection and is not controlled by Abide. Excluding `.abide/**` also means policy edits are not reviewed. No configurable retention/audit-integrity policy was found. |
| A12 | When available, the current user prompt (up to 600 characters) is read from the transcript or host event and sent in model state as `task` together with path(s) and diff. | SRC/SOURCE-INSPECTED, S04/S05/S07 | Contradicts the broad README statement that Jev sees the rule and diff, “never the conversation.” It is not the full transcript, but it is conversation content. |
| A13 | The direct TypeSafe model receives `providerOptions.gateway.zeroDataRetention`; the shipped `@ai-sdk/typesafe-ai@3.0.3` provider serializes only model, state and questions and treats only `providerOptions.typesafe` as its namespace. | SRC/SOURCE-INSPECTED, S04/S14/S15 | Therefore the gateway option does not request zero retention on the direct path. Issue #1 reports a wire capture consistent with this, but this pass did not independently capture the request. |
| A14 | Abide supports only Claude Code, Codex and OpenCode in its host enum. Claude/Codex use command hooks; OpenCode uses a plugin/subprocess bridge with append-to-result and one follow-up semantics. | SRC/SOURCE-INSPECTED, S03/S06 | Kimi Code and Pi are absent. “Same checks/messages” does not mean identical enforcement semantics. |
| A15 | Calibration samples recent git hunks, marks middling rules weak and high-fire-rate rules noisy, and disables them from active checks; audit, report and replay provide operational feedback. | SRC/SOURCE-INSPECTED, S09 | Calibration samples historical changes without ground-truth labels; it measures decisiveness/fire rate, not correctness. |
| A16 | The published replay reports 1,256 edits and 147 turns from 93 sessions: 39 edit and 15 turn flags at `>=0.8`; independent review confirmed 10 and 11 respectively (26% edit precision, 73% turn precision). | SRC/DOCUMENTED, S11 | Private hunks and reviewer outputs are not published, shell changes were excluded, repair behavior was not measured, and the claimed recall is not a full labeled-corpus recall estimate. Not reproducible from retained public data. |
| A17 | The full pinned repository verification passed locally: formatting, build, typecheck, 22 CLI test files/102 tests, and one schema test file/6 tests. | RUN/RUNTIME-TESTED, R01 | Proves the tested deterministic implementation behavior on this environment, not Jev quality or real-host conformance. |
| A18 | The npm manifests use broad dependency ranges (`@ai-sdk/typesafe-ai: "3"`, `ai: ^7.0.105`, Zod ranges); the lock resolved TypeSafe provider 3.0.3 and AI SDK 7.0.105 in this run. | SRC/SOURCE-INSPECTED, S02/R01 | Consumers get a lockfile inside a cloned repo, but normal npm installation resolution and future upgrades are not an exact matched cohort guarantee. |
| A19 | No stable public rule/plugin ABI, compatibility window, release notes, signed catalog, or migration guarantee was found. GitHub had tags `v0.0.1` and `v0.0.4`, no Releases, while npm exposed CLI `0.0.5`. | META/DOCUMENTED + SRC/SOURCE-INSPECTED, S02/S12/S13 | Absence at this revision, not proof it will remain absent. |
| A20 | Abide checks each parsed Jev answer it recognizes but silently omits a missing/unrecognized rule answer; it does not require the returned answer-key set to equal the requested rule IDs. | SRC/SOURCE-INSPECTED, S04 | A partial successful response can look like no finding for omitted rules rather than `unavailable`; resolve with a malformed-live-response or fake-provider acceptance test. |
| A21 | Each of the nine rendered questions in `src/questions.ts` fits Abide's boolean schema limits: instructions are 224–1,093 characters against a 2,000-character limit, and each true/false criterion is 271–835 characters against a 1,000-character limit. | SRC/SOURCE-INSPECTED, S03/S16 | This proves representation capacity only. Abide's fixed state is `{ task?, file?/files?, diff }`, not `{ artifact: { domain, source } }`, so a literal copy does not preserve the measured experiment. |
| A22 | Product issue #3 plans local declarative packs and the bundled nine Noul rules, including applicability, thresholds, messages, exact answer validation, per-file batching, snapshot checks, and isolated-versus-batched semantic evaluation; issue #2 plans directory-scoped egress consent. | ISSUE/DOCUMENTED, S17/S18 | Both issues are open. They correct any impression that these areas are absent from the product direction, but they are not runtime evidence or shipped differentiation. |
| A23 | Abide's current-prompt use is intentional: its compile skill includes a task-relative scope-creep rule, and hooks, replay and calibration consistently populate `task`. | SRC/SOURCE-INSPECTED, S04/S05/S08 | The smallest truthful fix to “never the conversation” is a documentation correction. Removing `task` by default would be a behavior/privacy redesign requiring explicit context dependencies or opt-in. |

### Runtime record R01

Environment: Linux `7.0.14-orbstack-00380-ga7e0a2dc9535` aarch64, Node `v24.20.0`, pnpm
`10.5.2`, Abide commit `ec3352e`. No TypeSafe or gateway credential was used.

```text
Command: pnpm install --frozen-lockfile
Expected: install the pinned workspace without changing the lockfile
Observed: 111 packages installed; exit 0

Command: pnpm verify
Expected: formatting, build, typecheck and deterministic tests pass
Observed: formatting passed; both packages built and typechecked;
          schema 1 file / 6 tests passed;
          CLI 22 files / 102 tests passed; exit 0
```

The console output is summarized here because this task permits only this new repository file. No
claim requiring credentials or a real host is marked `RUNTIME-TESTED`.

## 5. Comparable candidate card

1. **Identity and role.** Abide is a direct competitor spanning host installation, instruction
   compilation, Jev evaluation, feedback, local events, and operator commands (A01/A02). Its MIT
   source and npm packages are public, but it is a one-day-old `0.0.x` project at this revision
   (A19).
2. **Lifecycle.** It observes session start, prompt/turn start, post-edit tool completion, and stop.
   Git snapshots recover shell writes at Stop. It warns/requests repair but does not prevent the
   completed edit (A05/A06).
3. **Canonical contract.** Rubrics are typed and trace to instruction source lines. Jev answers become
   probability/band/optional choice, then repair or operator-only notice. Aggregation keeps each
   rule's loudest verdict; project rules shadow global rules by ID (A02–A04/A10). Missing answers are
   not rejected as an invalid complete assessment (A20).
4. **Failure behavior.** Hooks are bounded and fail-open; failures are distinct events rather than
   synthesized clean readings. There is no `ask`, no per-rule fallback choice, and no pre-action
   fail-closed mode (A07/A08).
5. **Extension model.** Users own readable rubric JSON compiled by the agent from instruction files.
   Boolean/choice/score and scopes are stronger than a hard-coded rule list, but there is no
   independently released rule package, trust declaration, version constraint, or executable analyzer
   API (A02/A10/A19).
6. **Composition.** Hook installation is thoughtfully additive/idempotent and uninstall is scoped.
   Internal rule batching is defined. Cross-product allow/deny precedence, duplicate delivery across
   config scopes, and global/project dual install are not established (A03/A09).
7. **State.** Git trees and blob chains determine whether edit checks cover the final turn; counters
   bound repeated repair. Events provide usage/history. There is no stable event fingerprint used to
   coalesce duplicate remote work, and findings do not name a reviewed content hash (A06/A08/A11).
8. **Security and privacy.** Credential files and session data receive owner-only modes, symlinks/FIFOs
   are treated cautiously, and secret filenames are excluded. However, current-prompt egress is
   under-disclosed, direct-path zero-retention wording is unsupported, source may remain in session
   records or unreachable Git objects, and project-local policy can weaken a global rule while its own
   edits are excluded (A10–A13).
9. **Portability.** Three adapters exist in source: Claude Code, Codex and OpenCode. Their feedback
   mechanics differ. No Kimi Code or Pi adapter exists, and this pass found no retained real-host
   conformance run (A14).
10. **Operations.** Abide's audit/check/report/calibrate/replay/bench surface is substantially ahead of
    the product. Its public benchmark is unusually candid about precision, but the private corpus and
    absence of host/repair measurement limit independent replay (A15–A17).

## 6. W1–W6 assessment

| Workflow | Abide evidence | State | Verdict |
|---|---|---|---|
| W1 advisory after edit | PostToolUse evaluates edit diffs; Stop evaluates complete turn and uncovered shell writes; `act` reaches the agent as repair text (A04–A06). | SOURCE-INSPECTED; shell coverage locally RUNTIME-TESTED | **Strong partial pass.** The complete intended path is present, but no real-host run was performed here. |
| W2 optional blocking | `decision: block` is emitted only after a successful tool call; OpenCode appends it to the result (A05). | SOURCE-INSPECTED | **Fail for pre-action blocking.** It is repair-loop enforcement, not write prevention. |
| W3 multiple tools | Installer preserves other hooks and repeats idempotently; internal rule merge is defined (A03/A09). External decision precedence and duplicate lifecycle delivery remain unknown. | RUNTIME-TESTED for config fixture; UNKNOWN in live composed host | **Partial pass.** Better than most candidates, not complete. |
| W4 headless `ask` | Abide has no ask state; hooks are synchronous, bounded, fail-open, and OpenCode follow-up is capped (A07/A08). | SOURCE-INSPECTED | **Pass only by narrowing semantics.** It terminates, but cannot offer user-mediated ask or a configurable unattended fallback. |
| W5 Jev unavailable | Missing key, timeout and request errors are logged distinctly; hook returns success/silence (A07). | SOURCE-INSPECTED | **Pass for one fixed advisory policy.** No configurable fail behavior; malformed partial answers have an A20 gap. |
| W6 feedback and trust | Repair counts, Stop recheck and coverage chains bound loops; source hashes detect instruction changes (A06/A08/A10). Project rubric can shadow/weaken global policy and is excluded from review (A10/A11). | SOURCE-INSPECTED | **Mixed.** Strong loop mechanics, weak policy authority. |

The pass-2 falsifier is therefore **not met**: Abide does not satisfy W2, managed trust, or the second
host with real conformance evidence, and it lacks two portability targets. It nevertheless changes the
competitive conclusion: it is now the strongest single-package baseline for a narrowed advisory,
self-repair product.

## 7. Head-to-head: where each side leads

“Product current” below means behavior already recorded as completed in
`PRODUCT-IMPLEMENTATION-PLAN.md`, not proposed phases F–I.

| Dimension | Leader now | Why |
|---|---|---|
| Installation/onboarding | **Abide** | Published `npx` flow, login, host detection, global/project install and uninstall (A01/A09). |
| User rule acquisition | **Abide** | Compiles existing AGENTS.md/CLAUDE.md into a traceable rubric and classifies unenforceable/lint/deferred rules (A02/A08). |
| Operator workflow | **Abide** | Audit/check/report/calibrate/replay/bench already exist (A01/A15). |
| Supported implementation surfaces | **Abide** | Three source adapters versus the product's currently proven Codex-only slice (A14). This is source breadth, not equivalent conformance quality. |
| Closed-loop repair | **Abide** | Immediate repair prompts and bounded Stop follow-up are implemented (A04/A08). |
| Codex runtime evidence | **Product** | The product records a pinned real Codex probe and live Jev milestone; Abide's public evidence here is tests and transcript replay, not a real-host conformance run. |
| Snapshot identity/staleness | **Product** | Current product advice names a content hash and suppresses stale advice; Abide tracks coverage internally but its public verdict/finding does not carry snapshot identity. |
| Complete assessment validation | **Product** | The product requires exact rule keys and valid probabilities; Abide silently omits missing/unrecognized answers (A20). |
| Failure algebra | **Product** | `reviewed` / `skipped` / `unavailable` is explicit and tested; Abide distinguishes event-log failures but its external feedback is mostly silence on failure. |
| Dependency reproducibility | **Product** | Exact matched Effect RC cohort versus Abide's major/caret runtime dependency ranges (A18). |
| Privacy truthfulness at this revision | **Product** | Abide's prompt-egress and direct zero-retention contradictions are material (A12/A13). The product must still preserve this lead through wire tests and exact disclosure. |
| Pre-action blocking | **Neither currently** | Abide is post-action; product v1 is explicitly advisory. This remains open differentiation only if later host capability and user demand justify it. |
| Independent packaged rules | **Neither currently** | Abide has editable compiled data; the product's extension packaging is a later phase. This is a candidate moat, not a present advantage. |

### The nine existing rules: runnable is not equivalent

Abide's rubric can hold the question payloads, but its compiler does not import TypeScript rule
definitions and its runtime cannot supply the state against which these questions were measured. A
manual port would have to (1) create nine `model`/`boolean` rubric entries, (2) rewrite references to
`artifact` and `artifact.domain` to Abide's `diff` and file-path state, (3) choose `edit` or `turn`, and
(4) set global thresholds. Steps 2–4 change the instrument. The compile skill's preference for short,
diff-oriented questions may also rewrite rather than preserve the calibrated wording (A02/A21).

| Existing rule | Representable now in an Abide rubric? | Are measured semantics preserved? | Material loss/change |
|---|---|---|---|
| `r1_inferred_case` | **Yes**, as boolean | **No; plausible approximation** | Measured on verbatim whole source plus file domain and valid from raw values. A diff may omit other variants/fields; `artifact` is absent from Abide state. |
| `r2_meaningless_combinations` | **Yes**, as boolean | **No; plausible approximation** | Requires the combinations the whole shape admits. A hunk can hide the condition or sibling field; no content-level rung gating. |
| `r3_split_correlations` | **Yes**, as boolean | **No; weaker evidence control** | The product suppresses it below a declaration (`Level >= 2`). Abide can scope by path and phase only, so raw/example edits are still judged. |
| `r4_duplicate_encoding` | **Yes**, as boolean | **No; plausible approximation** | Works from a raw value, but both encodings must be visible. A diff can show only the new duplicate or only one side; no full-snapshot input. |
| `r5_absence_confusion` | **Yes**, as boolean | **No; weaker evidence control** | Needs declared optionality/refinement and is gated to `Level >= 2`; Abide cannot express that applicability predicate and may see only a partial declaration. |
| `r6_bare_domain_value` | **Yes**, as boolean; it is the largest but remains within schema limits | **No; context and evidence differ** | Relies on file domain, whole declaration and storage/wire exemptions, and is gated to `Level >= 2`. Abide supplies a path and diff plus task, not the measured state, and cannot encode the rung. |
| `r7_name_wider_than_type` | **Yes**, as boolean | **No; delegation is less reliable** | The product evaluates each declaration independently and delegates a named claim to that type's own file/call. A change-only diff may contain the consumer but not the alias declaration; no content-level gate. |
| `r8_name_claims_resource` | **Yes**, as boolean | **No; signature visibility is incidental** | Requires a callable name, parameters and return type and is gated to declarations. It can work when one hunk contains the full signature, but Abide cannot require that evidence. |
| `r9_body_reaches_undeclared` | **Yes**, as boolean | **No; body/declaration visibility is incidental** | Requires both body behavior and its declaration and is gated to declarations. It is likely useful on a sufficiently complete hunk, but that is not the measured whole-source instrument. |

The cross-cutting differences are decisive:

- **State and egress:** the product sends the file path and verbatim whole source only. Abide sends a
  diff and file path(s), and ordinarily adds up to 600 characters of the current user prompt. Literal
  question wording referring to `artifact` therefore has no matching state object in Abide (A12/A21).
- **Applicability:** the product computes raw/typed/schema evidence levels and asks only rules whose
  measured floor is present. Abide has path globs, active status and `edit | turn`; it has no
  content-derived applicability predicate.
- **Thresholds:** all nine currently use `p > 0.7`, so Abide's rubric-wide `act: 0.7` is close, but
  Abide acts on `p >= 0.7`. Its `flag` band can preserve a private uncertain band only approximately;
  flags are logged rather than delivered to the agent. Per-rule thresholds are unavailable today.
- **Answers and findings:** the product requires exactly the requested keys and finite in-range
  probabilities, turns malformed/partial answers into `unavailable`, rechecks the content hash before
  delivery, attaches that hash to every advice item, uses authored advice messages, and returns at most
  five findings in deterministic probability/rank order. Abide silently omits missing answers, has no
  reviewed hash/stale marker, synthesizes repair text from rule source text, and has no equivalent
  global ranked five-item advice budget (A04/A20).
- **Batching:** the product's measured contract is one eligible whole file with all applicable
  questions in one logical operation. Abide batches rules sharing the same in-scope file set; edit
  checks are normally one diff/file, while turn checks may put multiple files into one state and take
  the loudest result across calls. Existing isolated/full-batch measurements do not validate that
  arrangement.

**Use-case verdict:** if the goal is “get these nine ideas to produce useful Jev-backed repair prompts
inside Claude Code, Codex or OpenCode,” Abide probably covers it after a manual port and calibration.
If the goal is “run the nine measured instruments in `src/questions.ts` with their established input,
applicability, validation, threshold, ordering and snapshot contracts,” Abide does not cover it today.
A fair replacement trial is to hand-port the rules, build positive/negative fixtures for each, compare
isolated and nine-rule batches, and measure precision plus repair success; configuration acceptance
alone is not evidence of semantic equivalence.

### Correct upstream fix for “never the conversation”

The README should be corrected. The smallest accurate replacement is:

> Jev sees the compiled rule question, file path(s), diff, and—when available—up to 600 characters of
> the current user prompt. It does not receive the full conversation history.

Removing `task` by default is not the smallest fix: task-relative rules are an advertised capability,
the compile skill's own `scope-creep` example needs the request, and hooks, replay and calibration all
populate it. A stronger privacy change would introduce explicit per-rule context dependency or an
opt-in setting, default task egress off where rules do not require it, and disclose the setting. That
is a worthwhile upstream design, but it changes behavior and needs tests rather than being a README
correction (A12/A23).

The documentation correction was submitted upstream as
[coldteadotai/abide#2](https://github.com/coldteadotai/abide/pull/2). It also scopes the
zero-data-retention statement to the Vercel AI Gateway route; runtime behavior is unchanged.

## 8. What must be matched, and where the product can outcompete

### Table stakes set by Abide

Shipping without these would make the product difficult to prefer for the common “enforce my repo
instructions” job:

1. one-command install/uninstall that preserves existing host configuration;
2. automatic discovery and traceable compilation of existing instruction files;
3. edit-versus-turn rule cadence and path scopes;
4. model-visible repair guidance with a bounded repair loop;
5. `check`/`audit`/`report` and JSON automation output;
6. latency/cost observability and a calibration or evaluation workflow;
7. a clear missing-key/network fail-open story;
8. a polished explanation of why a finding fired, linked to the user's source rule.

Abide's public benchmark also sets a useful honesty bar: it reports low edit precision instead of only
marketing the raw catch count. The product should improve the method, not retreat from measurement.

### Defensible differentiation

1. **Trustworthy data-flow and privacy.** Make outbound fields and local source retention mechanically
   enumerable, default to no
   prompt/conversation egress, make any task context opt-in and visible, verify retention semantics on
   every route, avoid leaving review snapshots as unmanaged Git objects, and publish sanitized
   wire-contract fixtures. This attacks evidenced Abide defects rather than a cosmetic difference
   (A11–A13).
2. **Policy authority that repositories cannot silently weaken.** Separate managed/user/project layers,
   declare precedence, detect attempts to shadow a stronger rule, and review or protect policy changes.
   Abide's project-wins merge and `.abide/**` exclusion leave a concrete gap (A10/A11).
3. **Snapshot-bound, actionable findings.** Preserve rule ID/probability/source while adding reviewed
   hash, stale status, precise range/evidence when the analyzer can supply it, severity, and stable
   deduplication identity. Abide has strong internal coverage tracking but a thin external finding
   (A04/A06/A20).
4. **True optional pre-action enforcement where honestly supported.** Keep advisory review distinct
   from permission. On hosts/events with a proven preflight boundary, allow a rule to deny before the
   write; elsewhere declare post-action repair only. Abide's “block” vocabulary overstates its actual
   boundary for W2 (A05).
5. **Independent rule distribution and trust.** Versioned rule packages with declared inputs,
   capabilities, provenance, compatibility and conflict precedence can serve teams that need centrally
   governed policies. Do not build this merely as a plugin gallery; the authority and upgrade model is
   the advantage Abide lacks (A02/A10/A19).
6. **Evidence-grade portability.** Add hosts only with pinned fixtures and real-runtime evidence for
   native edits, shell writes, multi-file changes, failure and headless behavior. Supporting Kimi Code
   or Pi with honest degradation would create breadth Abide lacks; proving Claude/OpenCode rather than
   merely shipping adapters would create depth (A14/A16/A17).
7. **Complete, provider-neutral review contracts.** Exact answer-set validation, explicit unavailable
   outcomes, separate backend metadata, and the Effect `DecisionModel` port reduce silent false-clean
   outcomes and backend lock-in. This is valuable only if surfaced as reliability and deployability,
   not marketed as framework choice (A13/A18/A20).
8. **Reproducible evaluation.** Publish synthetic or consented labeled fixtures, stratified precision
   and recall with confidence intervals, repair-success/loop cost, and host end-to-end results. Abide's
   benchmark is directionally strong but cannot be independently reproduced and its “recall” check is
   not a full labeled-corpus recall measurement (A16).

### Non-moats

- Using Effect instead of AI SDK is not by itself a customer advantage.
- Supporting the same three hosts only on paper is not differentiation.
- A richer schema without better feedback or trust behavior is complexity, not a moat.
- “Blocking” after a write is not stronger enforcement; use precise lifecycle language.
- More built-in rules would conflict with the user-owned-rule value proposition unless distribution,
  trust and override authority are designed first.

## 9. Decision classifications

| Component and intended use | Classification | Rationale |
|---|---|---|
| Abide as the product's runtime/core dependency | **REJECT** | It occupies the same product boundary, uses a different backend stack, omits required exact/stale/failure semantics, and would make differentiation a maintained fork (A12/A13/A18–A20). |
| Abide as the complete existing solution replacing product work | **REJECT for W1–W6; credible replacement for a narrowed advisory product** | Fails W2 and managed authority; portability/evidence is incomplete. If users only need post-edit repair of instruction-derived rules on its three hosts, it may already be sufficient. |
| Instruction-to-rubric compilation and rule classification | **BORROW** | Strong onboarding and traceability pattern; independently implement against the product's own rule contract (A02/A08/A15). |
| Edit/turn cadence, git snapshot coverage, and bounded repair loop | **BORROW** | Directly solves shell writes and self-repair loops; preserve snapshot identity and avoid Abide's thin finding boundary (A06/A08). |
| Additive/idempotent installer pattern | **BORROW** | Concrete composition behavior with passing deterministic tests (A09/A17). |
| Audit/report/calibrate/replay/bench operational surface | **BORROW** | Establishes user-visible product completeness; improve calibration/evaluation validity (A15/A16). |
| Coexistence or import path for users with `.abide/rubric.json` | **OPTIONAL INTEGRATION** | A read-only importer or doctor could ease migration without coupling runtime behavior; only pursue if real users request it. |
| Abide's privacy wording, project-wins authority and post-action `block` terminology | **REJECT** | Source-visible contradictions or misleading boundary claims (A05/A10–A13). |

No `DEPEND ON` recommendation is made.

## 10. Dependency/replacement gate

| Gate | Status | Evidence and resolving experiment |
|---|---|---|
| License compatibility | PASS at identifier level only | MIT repository/package; perform transitive review before copying code rather than patterns. |
| API/versioning guarantee | FAIL for dependency recommendation | `0.0.x`, no compatibility policy/releases, tag/package mismatch (A19). Wait for a versioned public contract and migration policy. |
| Required real-host workflows | FAIL for W1–W6 replacement | No pre-action block, no Kimi/Pi, no real-host evidence in this pass (A05/A14). Run pinned host conformance before narrowing that conclusion. |
| Trust/egress/credentials | FAIL at current claims | Prompt egress, direct ZDR contradiction, unmanaged Git-object/session retention and project weakening (A10–A13). Capture sanitized direct/gateway requests, inspect post-session storage, and test managed overrides. |
| Timeout/crash/degradation | UNRESOLVED | Source has strong bounded fail-open behavior, but real host crash/kill outcomes were not run (A07). |
| Maintenance/release health | UNRESOLVED | Rapid one-day activity cannot establish durability (A19). Reassess after releases and host upgrades. |
| Integration/ongoing cost | FAIL for a core dependency | Same-boundary coupling plus incompatible domain/provider choices implies fork pressure. Prototype only an importer if requested. |
| Exit cost/fallback | FAIL for a core dependency | Replacing Abide after adopting its rubric/host semantics would be a migration; product-owned contracts already exist. |

## 11. Strongest disconfirmation case

The strongest case against continuing as a separate product is simple: most users may want exactly
what Abide offers—compile existing instructions, inspect each edit/turn cheaply, and make the same
agent repair violations—rather than independent packages, managed authority, rich findings, Kimi/Pi,
or true pre-action denial. Abide's product is understandable and usable now. Its remaining technical
gaps are fixable, and its rapid first-day iteration suggests it may close them faster than a broader
architecture reaches release.

Evidence that should change the recommendation to “adopt or contribute rather than compete”:

- Abide publishes real Codex plus second-host conformance for edits, shell writes, timeouts and repair;
- it corrects prompt/retention disclosure and demonstrates the direct wire contract;
- it adds exact answer validation and snapshot-bound findings;
- it introduces managed rule authority or versioned independent rule packages;
- a user study shows no meaningful demand for the product's richer trust/blocking/portability
  distinctions;
- integration and maintenance measurement shows contributing the missing contracts upstream costs
  materially less than completing phases F–I.

Conversely, the recommendation to compete strengthens only when target users explicitly value managed
policy, auditable egress, host-conformance guarantees, or real pre-action enforcement enough to switch
or pay. Architecture elegance alone does not disprove the existing-solution baseline.

## 12. Specification/prototype handoff

| ID | Advisory implication | Evidence / counterevidence | Decision or acceptance check | Disposition |
|---|---|---|---|---|
| AB-H1 | Treat Abide's onboarding/operations surface as the minimum competitive benchmark. | A01/A02/A09/A15; counter: early project and no stable API A19 | Prioritize install, compile, doctor/report and uninstall before adding broad architecture. Time first useful review. | Both |
| AB-H2 | State lifecycle truthfully as pre-action prevention, post-action repair, or advisory notice. | A04/A05 | For every host/event, record file state before/after and host continuation; never label a completed write “blocked.” | Specification + conformance |
| AB-H3 | Default to no conversation egress and enumerate every outbound field. | A12/A13 | Fake-transport and live sanitized capture for direct/gateway paths; assert prompt absence by default and retention control presence where claimed. | Both |
| AB-H4 | Establish non-project policy authority before rule packages. | A10/A11 | Compose managed/user/project rules with shadow attempts and policy-file edits; expected precedence and diagnostic must be explicit. | Both |
| AB-H5 | Combine snapshot identity with Abide-like turn coverage and loop caps. | A06/A08; product current hash contract | Native edit, shell write, concurrent edit, duplicate event, repair edit and stale response fixtures; no stale/duplicate advice. | Prototype |
| AB-H6 | Validate exact requested answer keys. | A20 | Fake backend returns missing, extra, duplicated/unrecognized and malformed answers; each becomes `unavailable`, never clean. | Prototype (already product direction; retain as release gate) |
| AB-H7 | Evaluate rule quality with reproducible labels and repair outcomes. | A15/A16 | Publish a source-safe corpus or generator, blinded labels, precision/recall uncertainty, and same-turn repair/loop-cost measures. | Both |
| AB-H8 | Decide whether W2 and independent rule packages are genuine market requirements before using them as differentiation. | A02/A05 and strongest disconfirmation case | Interview/pilot target teams; require concrete authority/prevention workflows before expanding v1. | Specification |
| AB-H9 | Compare time-to-value and total overhead, not backend latency alone. | A01/A16/A17 | Benchmark install-to-first-catch, process p50/p95/p99, calls/edit/turn, spend, missed checks and repair turns on the same fixtures. | Prototype |

## 13. Genesis use case: “make invalid states unrepresentable”

**Short answer:** Abide can automatically run one broad Jev question after ordinary eligible edits
and ask the agent to repair a likely violation. It cannot currently guarantee one evaluation per
interface/type/schema declaration, and diff-only evidence is insufficient for invariants that depend
on unchanged or cross-file declarations. This is best-effort semantic review, not structural
declaration enforcement.

The current default branch was rechecked for this question and remained pinned at `ec3352e` on
2026-09-19.

### 13.1 One broad edit-diff rubric rule: yes

A user can put a concrete instruction such as “Model domain types so invalid states are not
representable” in `AGENTS.md` or `CLAUDE.md`. At session start, Abide detects instruction-file hash
changes and asks the agent to compile them into `.abide/rubric.json` (A02/A10). The compilation skill
directs the agent to make a rule a `model` check when a judge can answer from the change alone, assign
`when: "edit"` when the hunk is sufficient, and add TypeScript/schema path globs where appropriate
([compile procedure, steps 3–5](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/skills/abide-compile/SKILL.md)). A hand-written rubric can express the same rule through the typed
`scope`, `when`, and boolean-question fields
([rubric schema](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/rubric.ts)).

A practical broad question would be similar to:

```json
{
  "id": "invalid-states-unrepresentable",
  "text": "Model domain types so invalid states are not representable.",
  "scope": ["**/*.ts", "**/*.tsx"],
  "when": "edit",
  "check": {
    "type": "model",
    "question": {
      "type": "boolean",
      "instructions": "Does this change add or modify a type, interface, or schema in a way that permits a domain state the surrounding declarations say should be impossible?"
    }
  }
}
```

Every active edit-phase model rule whose file scope matches is selected and included in the Jev call;
an `act` result produces a repair request and a `flag` result is logged for the operator
([rule selection and calls](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/checkRunner.ts),
[post-edit handling](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/postToolUse.ts)). Defaults are `0.8` to request repair and `0.5` to flag. This is automatic after setup, but no source or runtime evidence specifically measures this broad rule's accuracy. Abide's own aggregate replay found only 26% independently confirmed precision for edit-level flags across its tested rules (A16), so effectiveness should be established with labeled positive and negative type-design fixtures rather than assumed.

### 13.2 Guaranteed per-declaration trigger/coverage: no

Abide triggers on host lifecycle events and files, not on parsed declarations:

- `PostToolUse` accepts Edit, Write, MultiEdit and Codex `apply_patch`; one tool event/file check may
  contain zero, one, or many declarations. There is no TypeScript/Zod/Effect Schema AST detector and
  no “one decision per declaration” identity in the rubric, request, verdict, or event schemas
  ([hook input union](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/hooks.ts), A02/A03).
- Shell-created changes are recovered only at Stop through the whole-turn Git diff, not immediately
  after each declaration change (A06). Codex patch deletions are not checked in the immediate
  `apply_patch` branch and depend on Stop coverage
  ([diff extraction](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/diff.ts)).
- Excluded/secret/generated/binary paths, unreadable or oversized files, diff timeouts, failed
  snapshots, rule status/scope, missing credentials, and remote failure can all produce a documented
  skip or fail-open miss (A06/A07/A11).
- Abide intentionally records lint-shaped rules but never executes them. A deterministic declaration
  selector would therefore require another linter/analyzer or new Abide functionality
  ([`runsInPhase`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/checkRunner.ts)).

Even when a broad question fires on a hunk containing three declarations, Jev returns one probability
for that rule, not three independently attributable verdicts. Abide can offer strong best-effort file
edit coverage, including a useful Stop backstop, but it cannot claim exhaustive declaration coverage
or identify which declaration was evaluated.

### 13.3 Diff-only adequacy for cross-type invariants: limited

An ordinary Edit/MultiEdit check sends unified-diff hunks with limited surrounding lines, not the
resulting whole file or repository. State is truncated at 24,000 characters; Stop bounds each file's
turn diff to 8,000 characters
([bounds and state construction](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/diff.ts),
[Stop bounding](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts)). A new-file Write can expose the full added file up to the bound, and a turn rule can see diffs for several changed files, but neither surface supplies unchanged related declarations, usages, constructors, validation code, or repository-wide invariants.

Consequently:

- a local change from optional fields to a clear discriminated union may be judgeable from one hunk;
- whether two pre-existing types admit an impossible combination, a runtime schema matches a domain
  type elsewhere, or all constructors satisfy a new invariant generally is not;
- putting such a rule in `when: "turn"` can help only when every relevant declaration changed in the
  same turn and remains inside the bounds;
- the official compiler procedure explicitly classifies a rule that needs the rest of the repository
  as `deferred`, rather than pretending the diff judge can enforce it
  ([compile procedure, step 3](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/skills/abide-compile/SKILL.md)).

For the full genesis use case, a structural trigger should extract each added/changed declaration and
provide the declaration plus its referenced local type/schema closure (or a bounded symbol graph) to
the reviewer. Deterministic compiler/schema checks should cover expressible invariants first; Jev
should handle the semantic residue. Abide does not currently provide that pipeline.

### 13.4 Practical setup and honest capability statement

The shortest supported setup is:

1. Write the instruction concretely in an already discovered instruction file, including examples of
   an invalid representable state and the preferred union/constructor/schema shape.
2. Run `npx @coldtea/abide login`, then `npx @coldtea/abide init` (or choose one host/project scope).
3. Start the host so Abide prompts the agent to compile the changed instructions, or run
   `abide compile`; inspect `.abide/rubric.json` and ensure the rule is an active edit-phase model rule
   with narrow file scopes.
4. Run `abide rubric validate` and `abide calibrate`; calibration may mark a middling/noisy question
   inactive, so confirm its resulting status. Test representative violating and compliant diffs with
   `abide check`, and use `abide report` to detect a rule that never decides
   ([README setup/commands](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/README.md), A15).
5. Keep the phrasing concrete. Splitting language-specific rules (TypeScript discriminated unions,
   runtime schemas, state-machine transitions) is more likely to be decisive and attributable than
   one universal design maxim, although it still does not create per-declaration triggering.

The accurate claim is: **“Abide can automatically review eligible edit/turn diffs against a
user-authored invalid-state rule and request repair.”** It cannot accurately claim: **“every changed
interface, type, or schema is independently checked, with all related type context, and violations are
prevented.”** The latter requires structural triggering, context assembly, coverage evidence, and
pre-action enforcement that are absent at this revision.

## 14. Limitations

- No paid Jev request or real Claude Code, Codex, or OpenCode session was run against Abide.
- The repository appeared only one day before this review; metadata is exceptionally volatile.
- The public replay corpus omits private hunks, so precision labels and the claimed near-threshold miss
  check cannot be independently audited.
- Source inspection was pinned to `ec3352e`; npm package contents were not separately diffed byte for
  byte against that commit, although versions and integrity metadata were queried.
- GitHub issue #1 is a third-party issue, not a maintainer statement. Its wire observation is not
  promoted to this pass's runtime evidence; the underlying provider behavior was independently
  source-inspected.
- Abide's adapters may work in live hosts even though this pass does not mark them runtime-tested.
  `UNKNOWN` is not `unsupported`.
- The head-to-head uses the repository implementation plan's declared completed product milestones;
  this pass did not rerun the product's own evidence suite. Open product issues #2 and #3 are credited
  only as roadmap evidence, never as implemented behavior.
- This focused review does not establish ecosystem completeness and does not re-score unrelated pass-2
  candidates.

## 15. Primary-source index

All sources accessed 2026-09-19 unless a registry/API timestamp states otherwise.

| Key | Primary source |
|---|---|
| S01 | [Abide README at `ec3352e`](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/README.md) |
| S02 | [Root manifest](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/package.json), [CLI manifest](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/package.json), [schema manifest](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/package.json), and [lockfile](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/pnpm-lock.yaml) |
| S03 | Schema [rubric](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/rubric.ts), [verdict/events](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/verdict.ts), [hook payloads](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/hooks.ts), and [hosts](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/src/host.ts) |
| S04 | CLI [check runner](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/checkRunner.ts), [Jev adapter](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/jev.ts), and [band mapping](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/band.ts) |
| S05 | Hooks [postToolUse](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/postToolUse.ts), [stop](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/stop.ts), [turnStart](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/turnStart.ts), and [sessionStart](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/hooks/sessionStart.ts) |
| S06 | CLI [hook runner](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/hookRunner.ts), [settings installer](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/settings.ts), [host installer](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/hosts.ts), and [OpenCode bridge](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/opencode/abide.mjs) |
| S07 | CLI [session state](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/session.ts), [git snapshots](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/git.ts), [diff extraction](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/diff.ts), [coverage](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/coverage.ts), [paths/exclusions](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/paths.ts), and [transcript prompt extraction](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/transcript.ts) |
| S08 | [Compilation skill](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/skills/abide-compile/SKILL.md), [source discovery/staleness](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/sources.ts), [rubric merge](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/rubricFile.ts), and [rule loading](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/loadRules.ts) |
| S09 | [Calibration](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/calibration.ts), [audit](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/audit.ts), [replay](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/lib/replay.ts), and [report](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/src/commands/report.ts) |
| S10 | Tests for [hooks](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/hook.test.ts), [settings](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/settings.test.ts), [hosts](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/hosts.test.ts), [session concurrency](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/session.test.ts), [git exclusions](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/cli/test/git.test.ts), and [rubric schema](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/packages/schema/test/rubric.test.ts) |
| S11 | [Replay methodology/results](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/benchmarks/replay/README.md) and [aggregate JSON](https://github.com/coldteadotai/abide/blob/ec3352e873163b74aca1ac9cf3bd0ea69a97723a/benchmarks/replay/results-2026-09-18.json) |
| S12 | npm registry metadata: [`@coldtea/abide`](https://registry.npmjs.org/@coldtea%2Fabide) and [`@coldtea/abide-schema`](https://registry.npmjs.org/@coldtea%2Fabide-schema); queried versions, publish times, tarball URLs and integrity hashes |
| S13 | GitHub API metadata for [repository](https://api.github.com/repos/coldteadotai/abide), [tags](https://api.github.com/repos/coldteadotai/abide/tags), [releases](https://api.github.com/repos/coldteadotai/abide/releases), and [issues](https://api.github.com/repos/coldteadotai/abide/issues?state=all) |
| S14 | [Abide issue #1](https://github.com/coldteadotai/abide/issues/1), third-party report with direct-path wire observation; used as ISSUE evidence, not maintainer policy or this pass's runtime result |
| S15 | Published [`@ai-sdk/typesafe-ai@3.0.3` tarball](https://registry.npmjs.org/@ai-sdk/typesafe-ai/-/typesafe-ai-3.0.3.tgz), integrity `sha512-pgoqSBqnabTfZwXF7zlEFCbksLLuI3iauZf4FrFioFIRY1YMFnoufLEG1kGQDVQCk8GvxG4gMti8kXYOE2lT1w==`; inspected `src/typesafe-ai-evaluation-model.ts` and `src/typesafe-ai-provider.ts` |
| S16 | Product source [`src/questions.ts`](https://github.com/dearlordylord/jevs/blob/main/src/questions.ts), [`src/policy/rules.ts`](https://github.com/dearlordylord/jevs/blob/main/src/policy/rules.ts), [`src/runtime/assessment.ts`](https://github.com/dearlordylord/jevs/blob/main/src/runtime/assessment.ts), [`src/runtime/review.ts`](https://github.com/dearlordylord/jevs/blob/main/src/runtime/review.ts), and [`JEV-TYPE-CLASSIFIER.md`](https://github.com/dearlordylord/jevs/blob/main/JEV-TYPE-CLASSIFIER.md); inspected locally at the reviewed workspace revision |
| S17 | Product [issue #3, “Phase F: configurable review rules, consent, diagnostics, and rule conformance tests”](https://github.com/dearlordylord/jevs/issues/3); open first-party implementation specification queried 2026-09-19 |
| S18 | Product [issue #2, “Follow-up: directory-scoped source-egress consent”](https://github.com/dearlordylord/jevs/issues/2); open first-party follow-up specification queried 2026-09-19 |
