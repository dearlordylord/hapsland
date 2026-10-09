# Preregistered paired evaluation protocol

**Audience:** Evaluation contributors and reviewers; Product and specification owners.

**Provenance clarification (2026-10-07):** References below to `TYPE-DESIGN-RULES.md` name the [frozen five-rule rubric](https://github.com/dearlordylord/hapsland/blob/2d5ec8f3e2359dd4aa3bf37a0588d9e69e3b2496/TYPE-DESIGN-RULES.md). Its removal from current guidance does not amend this historical declaration or scoring.

**Historical frozen protocol.** The later run stopped incomplete; its observations
and decision are in the [paired pilot evidence index](README.md).

**Registration time:** 2026-09-24, before any Stage 2 host session. The owner accepted the [Stage 1 prompt and tree](fixture-acceptance.md). This file fixes the protocol; any departure will be dated and reported as a deviation before looking at arm outcomes.

## Question and scope

Measure whether Hapsland advice changes the quality of an agent's final TraceTape implementation, and how often advice reaches the agent in time to affect that implementation. This is a small matched pilot, not a population estimate or a causal claim from one favorable pair.

The [accepted prompt](prompt.md) remains byte-for-byte fixed (SHA-256 `0ec22a3c04928da18bdd48e52644eff153371acfefa92a03ea1f36af58d46074`). Each run starts in a fresh empty Git repository and receives the accepted prompt plus the same procedural sentence: “After implementing the task and running your tests, review your own changes for correctness and type/API design, make any repairs you judge necessary, and report what you verified.” The procedural sentence requests the same self-review in both arms and gives no Hapsland-specific hint. The [Stage 1 tree](selected-tree) is the fixture used to establish task suitability and owner acceptance; it is not copied into the paired runs. The two arms must build from the same task without a preexisting implementation.

## Matched runs and limits

The unit of comparison is one pair of independent fresh Codex runs, one per arm. Arm A has normal self-review plus Hapsland installed and enabled for its isolated repository. Arm B has the same self-review with no Hapsland hook. Two complete pairs are planned: pair 1 in A–B order and pair 2 in B–A order. No seed control is available in Codex CLI, so pair matching holds prompt, host version, model, reasoning, tools, platform, and limits constant but cannot match stochastic generation. No conversation or code state is shared between runs.

Target host is Codex CLI `0.155.1` on Linux arm64, with `gpt-6-luna` and `model_reasoning_effort=max`, a fresh isolated Codex home for each run, noninteractive `codex exec`, and the same explicit host sandbox/trust flags in both arms. `npm exec --package=@openai/codex@0.155.1 -- codex --version` resolves the pinned version here. The globally installed `0.156.1` is outside the declared direct-event profile and will not be treated as supported production evidence. If pinned execution or native hook setup cannot run, report the cell as blocked or unsupported rather than substituting `0.156.1` silently.

Each host session has a 20-minute wall-clock timeout. Planned maximum is four completed sessions, with at most one infrastructure-only retry per pair when the failed session made no source edit; a session that edited source remains a result even if it times out or fails. Hard maximum is six host starts and 120 host minutes including retries. Arm A has an 80 Jev-request and 2 MiB aggregate submitted-source ceiling per run, thus at most 160 requests across the pilot. The [provider-boundary guard](https://github.com/dearlordylord/hapsland/blob/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot/provider-guard.mjs) fails closed when either limit is reached or the request cannot be metered. Each individual Jev request retains the production 15-second deadline and zero automatic retries. Stop before another session if observed aggregate Jev spend reaches US$25 or agent spend reaches US$40, where provider billing is observable. Also stop before another session if reported Codex tokens reach 250,000 for any one run or 750,000 cumulatively. Billing amounts unavailable from the host or provider are recorded as unavailable, not zero. The request and time ceilings remain mandatory regardless of price reporting.

If either arm cannot be run under matched conditions, stop pairing and report the actual incomplete design. Do not replace an unfavorable artifact, finding, or timeout. Do not extend the sample after seeing results. Ordinary tests and contract checks remain offline; live Jev is limited to Arm A under this declaration. The Stage 1 pilot and #97 delivery probes are excluded from the paired sample.

## Outcome rubric, frozen before runs

Independent artifact review applies the same rubric to all four final trees, blind to arm labels where practical. The reviewer sees source, README, and tests but no host transcript or Hapsland findings until initial scoring is recorded. Each criterion is scored by observable behavior or a concrete type value, never by style alone:

| Criterion | Points | Evidence |
| --- | ---: | --- |
| Parse semantics and recovery | 25 | Hidden offline cases derived from the accepted grammar: field validation, record order, duplicate/unknown references, diagnostics, incomplete state, source lines, and continuation after a bad line. |
| Formatting and summary | 15 | Valid parse/format/parse facts, rejection or documented handling of invalid documents, status counts, and elapsed time. |
| Exported type model | 35 | Five rules in `TYPE-DESIGN-RULES.md`, scored seven points each. A deduction requires a concrete admitted value with no valid domain meaning or two disagreeing encodings; only supported same-file units count in the Hapsland-relevant subset. |
| Tests and runnable package | 15 | Typecheck, offline test command, meaningful edge/lifecycle/round-trip coverage, no runtime dependency, and example execution. |
| API and documentation coherence | 10 | Public exports and README accurately match behavior and recovery policy. |

Record raw score (0–100), each concrete defect, severity (blocking, material, minor), and whether the defect existed in a Hapsland-supported unit. A validated finding is a correct defect tied to an exact artifact location and domain counterexample. A false finding names a defect for which no such counterexample exists. A missed finding is a validated supported defect present when eligible but absent from Hapsland's recorded advice by the end of the run. Any repaired defect is scored on the final tree and tracked separately as a repair cycle. Run tests and typecheck on final trees; test pass alone does not clear type design defects.

Point assignment within the categories is fixed: parsing gets five points each for field grammar, lifecycle/identity, diagnostic classification, recovery/accepted-record consistency, and line numbers; formatting/summary gets eight for round-trip facts, four for invalid-document policy, and three for summary counts/time; each type rule gets seven, deducted only for a concrete counterexample; tests/package gets five for runnable typecheck and tests, seven for meaningful edge/lifecycle/round-trip assertions, and three for example execution; API/docs gets five for accurate exports and five for accurate recovery/formatting documentation. Partial credit within one cell is allowed only when a separable subset works and the reviewer records the exact behavior that earned it.

The hidden behavior checks include: one valid run with two interleaved cases and logs; malformed field counts and timestamp/duration/status/detail values; duplicate IDs and unknown references; BEGIN/LOG/END in wrong order; an unknown record between valid records; missing RUN/DONE/BEGIN/END; blank/comment lines with CRLF; and a parse/format/parse comparison of run, case, log, end, and summary facts. These cases come directly from the accepted grammar and are not sent to the tested agents.

Pair differences are `A score − B score`, with both values reported, the two observed differences, range, and mean. Also report defect counts and elapsed times per run, not only averages. Two pairs are too few for a confidence interval or broad effect estimate.

## Exposure and delivery ledger

For every eligible changed `.ts/.tsx/.mts/.cts` file, record whether the production analyzer accepted a named interface/type unit. Mark imported, unresolved, merged, schema-only, excessive, oversized, unsupported operation/attribution, and other rejected cells explicitly. Count only supported units as eligible exposure. Do not infer a Jev call from admission. For Arm A, distinguish: native hook entry, Hapsland adaptation, provider submission, provider completion/clear/finding/unavailable, host response written, demonstrated model visibility, attempted repair, and final state. A host write is attempted delivery, not proof the agent saw it.

Classify each eligible finding as visible before the originating turn ended, first visible in a later turn, or never demonstrated before session end/expiry/resident loss. Proof of visibility needs an independent model continuation that explicitly references distinctive advice or a specific repair trace after the advice appeared; ambiguous coincidence remains `unproven`. For each category publish numerator and denominator, including unknown/unproven separately. Note any final edit with no later mapped hook: #97 found that subsequent-hook collection can miss that opportunity. Do not interpret source-bearing host text or raw Jev responses as safe evidence to retain.

The run record will retain a sanitized event timeline, counts, elapsed time, host reported token usage and cost when available, Jev request count/usage/cost when available, findings by rule and disposition, attempted repairs, final tests and rubric, and unsupported cells. Source-bearing final trees may be retained as reviewable artifacts. Never retain raw host JSONL, prompts embedded in host transcripts, source-bearing live responses, or credentials in committed evidence. The fixed prompt and final source trees are the only intentional source-bearing evaluation artifacts.
