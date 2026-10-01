# Hapsland testing matrix

**Purpose:** Give contributors one entry point for choosing a test, understanding what it proves, and finding its runner and retained evidence.
**Status:** Maintained testing guidance.
**Authority:** Maintained guidance and implementation or validation evidence; product behavior remains defined by its named contracts.
**Expected use:** Select the smallest relevant gate before a change, locate the current manual native integration runner, and distinguish source-checkout observations from package or platform support.
**Lifecycle:** Update this matrix whenever a test scenario, runner, supported language or runtime profile, or evidence owner changes. Review it when a milestone retires or replaces a runner; keep historical evidence linked but remove obsolete active instructions.

## Which gate to run

| Gate | Entry point | Coverage | Boundary established |
| --- | --- | --- | --- |
| Routine deterministic gate | `npm test` | Bend artifact and authority checks, boundary scripts, Vitest tests for the reducer, adapters, resident, and CLI | Logic and controlled fixtures; no native agent or Jev call |
| Compile/package source | `npm run typecheck`; `npm run build` | TypeScript typing, Bend artifacts, generated native helper and distributable files | Buildability of this checkout |
| Direct-event conformance | `npm run conformance:direct-event` | Manifest, selected direct-event tests, retained evidence validation | Version-one event contract and sanitization; no new agent session |
| Installed host | `npm run conformance:host -- --write-evidence` | Clean package with real Codex CLI and controlled reviewer | Pinned installed Codex profile, distinct from the source-checkout runner |
| Package setup | `npm run conformance:package`; `npm run conformance:setup-package` | Clean install and first-review setup | Packaging and installation paths; run only when those paths change |
| Source-checkout native integration | `node scripts/run-native-crossfile-current.mjs --host=HOST --language=LANGUAGE --scenario=SCENARIO` | Real Codex CLI or Claude Code on disposable TypeScript, Rust, or Bend projects | Selected hook → review → delivery observations; see the scenario table below |
| Full native fault matrix | `node scripts/run-native-negative-matrix.mjs` | All 24 controlled negative cells, at most three real host sessions at once | Per-cell declarations, results, and batch summary; no Jev requests |
| Paid source-checkout adoption | Same runner with `--scenario=adoption --live --execute-paid` | Real agent plus real Jev; six HTTP attempts maximum per invocation | Bounded selected live path, with each run's outcome retained separately |

`HOST` is `codex` or `claude`; `LANGUAGE` is `typescript`, `rust`, or `bend`. The native runner checks exact host versions, creates a disposable Git repository, records a declaration before execution, and retains source-free JSON under `evidence/native-languages/`. A failed run remains `incomplete`; it is never converted to a passing result by a later run. The [language evidence index](../evidence/native-languages/index.json) identifies the selected adoption runs and earlier incomplete attempts.

The selected adoption observations include six controlled offline passes and six live Jev passes. One earlier controlled Claude Bend session received a finding but did not repair; its separately declared follow-up session passed. The live and offline records stay distinct in the language index.

## Native scenario matrix

| Scenario | Reviewer | Agent action and observable assertion | Run command suffix |
| --- | --- | --- | --- |
| Advice adoption | Controlled offline or real Jev | Agent makes an edit; review receives cross-file evidence; actionable advice is delivered; agent repairs; compiler and independent invalid-construction checks pass; follow-up result appears | `--scenario=adoption` or `--scenario=adoption --live --execute-paid` |
| Reviewer unavailable | Controlled offline error | Real agent makes one edit; review is attempted and becomes unavailable; no actionable advice is delivered and the agent leaves the draft alone | `--scenario=reviewer-unavailable` |
| Edit hook crashes | Native hook exits with failure | Real agent makes one edit; the fault is observed; no review request or invented advice follows | `--scenario=hook-crash` |
| Edit hook exceeds its deadline | Native hook sleeps beyond its configured timeout | Real agent makes one edit; the hook start is observed, it does not finish naturally, and no review request or invented advice follows | `--scenario=hook-timeout` |
| Older finding after a newer edit | Controlled delayed reviewer | Real agent makes two edits without acting on advice; the old finding and newer clear both complete, but the old finding is not delivered after the newer edit | `--scenario=stale-result` |

Run `node scripts/run-native-negative-matrix.mjs` to exercise all 24 negative cells in one bounded batch. Negative scenarios use the controlled offline reviewer and make **zero Jev requests**. The runner records hook event order, source-free request shape, outcome identity hashes, compiler status, and the exact checks used for its verdict. A native run is an observed case, not a frequency estimate or proof of every interleaving. The [negative scenario index](../evidence/native-negative/index.json) records the six cells per scenario and any incomplete attempts.

The 2026-10-01 run has 24 selected demonstrated cells and zero Jev requests. Its first batch passed 23 of 24 cells. In the remaining Claude TypeScript case the first result finished before the second edit, so that attempt could not test a stale result. A separately declared 13-second controlled delay produced the intended order and passed. Both records remain linked in the index. The stale case allows the older review result to remain accounted for internally; it asserts that the old finding does not reach the agent after the newer edit and clear result.

## Why older scripts remain

| Historical or separate runner | Relationship to this matrix |
| --- | --- |
| [`run-native-codex-136.mjs`](../scripts/run-native-codex-136.mjs), [`run-native-claude-136.mjs`](../scripts/run-native-claude-136.mjs) | Preserve the declared #136 experiments and their original fixtures. New source-checkout agent and language checks use `run-native-crossfile-current.mjs`. |
| [`run-rust-native-codex.mjs`](../scripts/run-rust-native-codex.mjs) | Preserve the initial Rust adoption record. The common runner now owns current TypeScript/Rust/Bend cross-file scenarios. |
| [`run-direct-event-live-milestone.mjs`](../scripts/run-direct-event-live-milestone.mjs), [`run-first-review-live-milestone.mjs`](../scripts/run-first-review-live-milestone.mjs) | Retain separately declared direct-event and first-review milestones. They validate different package or initial-review boundaries and do not replace the current three-language source-checkout matrix. |
| [`run-clean-package-conformance.mjs`](../scripts/run-clean-package-conformance.mjs), [`run-setup-package-conformance.mjs`](../scripts/run-setup-package-conformance.mjs) | Current package gates. They are not duplicates of source-checkout native sessions. |

Avoid adding a new per-language native runner for the same source-checkout adoption or failure scenario. Extend the common fixture table and this matrix instead. Historical records remain immutable evidence; their scripts can be retired only after inbound links and reproduction requirements are resolved.
