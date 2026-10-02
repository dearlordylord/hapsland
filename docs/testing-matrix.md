# Hapsland testing matrix

**Purpose:** Give contributors one entry point for choosing a test, understanding what it proves, and finding its runner and retained evidence.
**Status:** Maintained testing guidance.
**Authority:** Maintained guidance and implementation or validation evidence; product behavior remains defined by its named contracts.
**Expected use:** Select the smallest relevant gate before a change, locate the current manual native integration runner, and distinguish source-checkout observations from package or platform support.
**Lifecycle:** Update this matrix whenever a test scenario, runner, supported language or runtime profile, or evidence owner changes. Review it when a milestone retires or replaces a runner; delete obsolete instructions and retain evidence only while a current decision, claim, or open review needs its provenance.

## Which gate to run

| Gate | Entry point | Coverage | Boundary established |
| --- | --- | --- | --- |
| Repository documentation | `npm run docs:install` once; `npm run docs:check` | Local Markdown links, raw HTML images and links, and heading anchors in tracked and new non-ignored Markdown | Files and headings exist; no external URL requests or documentation-truth claim |
| Routine deterministic gate | `npm test` | Bend artifact and authority checks, boundary scripts, Vitest tests for the reducer, adapters, resident, and CLI | Logic and controlled fixtures; no native agent or Jev call |
| Compile/package source | `npm run typecheck`; `npm run build` | TypeScript typing, Bend artifacts, generated native helper and distributable files | Buildability of this checkout; unsupported hosts retain format-verified declared native artifacts without target-host validation |
| Direct-event conformance | `npm run conformance:direct-event` | Manifest, selected direct-event tests, retained evidence validation | Version-one event contract and sanitization; no new agent session |
| Installed host | `npm run conformance:host -- --write-evidence` | Clean package with real Codex CLI and controlled reviewer | Pinned installed Codex profile, distinct from the source-checkout runner |
| Package setup | `npm run conformance:package`; `npm run conformance:setup-package` | Clean install and first-review setup | Packaging and installation paths; run only when those paths change |
| Source-checkout native integration | `node scripts/run-native-crossfile-current.mjs --host=HOST --language=LANGUAGE --scenario=SCENARIO` | Real Codex CLI or Claude Code on disposable TypeScript, Rust, or Bend projects | Selected hook → review → delivery observations; see the scenario table below |
| Full native fault matrix | `node scripts/run-native-negative-matrix.mjs` | All 24 controlled negative cells, at most three real host sessions at once | Per-cell declarations, results, and batch summary; no Jev requests |
| Paid source-checkout adoption | Same runner with `--scenario=adoption --live --execute-paid` | Real agent plus real Jev; six HTTP attempts maximum per invocation | Bounded selected live path, with each run's outcome retained separately |

`HOST` is `codex` or `claude`; `LANGUAGE` is `typescript`, `rust`, or `bend`. The native runner checks exact host versions, creates a disposable Git repository, records a declaration before execution, and retains source-free JSON under `evidence/native-languages/`. A failed run remains `incomplete`; it is never converted to a passing result by a later run. The [language evidence index](../evidence/native-languages/index.json) identifies the selected adoption runs and earlier incomplete attempts.

The selected adoption observations include six controlled offline passes and six live Jev passes. One earlier controlled Claude Bend session received a finding but did not repair; its separately declared follow-up session passed. The live and offline records stay distinct in the language index.

## Pull request checks

[Offline CI](../.github/workflows/check.yml) runs on pull requests and pushes to
`master`. It installs the frozen Bun lockfile and the checksum-pinned Bend 2.0.34
and Lean 4.34.0 proof toolchain through its existing `npm run docs:install`
tooling step, then runs documentation links,
typecheck, `npm test`, and build. It does not invoke live Jev or native agent
milestones; those remain separate declared checks above.

The [proof toolchain installer](../scripts/install-bend-toolchain.mjs) downloads
first-party Linux x64/arm64 archives with pinned SHA256 digests and checks the
progress proof with Bend’s bundled kernel before the bounded harness starts.
Bend 2.0.34 is pinned to upstream source commit
`7d8a3eb036042c6549461054d25a10f26d361c5c`; its kernel requires Lean 4.34.0.
Run the installer once and add its printed bin directories to `PATH` for local
`npm test`. The explicit `--github-actions` mode in `docs:install` installs this
proof prerequisite only when `GITHUB_ACTIONS=true`; ordinary local documentation
installs do not download Bend or Lean. Updating either pin requires proof
validation and digest review.

The link checker is [Lychee](https://lychee.cli.rs/guides/cli/) 0.24.2
(`DEPEND ON`), selected because it checks Markdown and raw HTML links and images
with [heading validation](https://lychee.cli.rs/recipes/anchors/) offline.
[The installer](../scripts/install-doc-link-checker.mjs) pins first-party release
archive SHA256 digests for Linux/macOS x64/arm64. It downloads only during
`docs:install`; `docs:check` requires that exact installed version and blocks
network requests. To update the tool, review the official release, update the
version and all platform digests together, and rerun `npm run docs:check`. It runs
[a temporary-repository fixture](../scripts/check-doc-links.test.mjs) before the
repository check, exercising deleted targets, new documents, raw HTML, and anchors.

[The runner](../scripts/check-doc-links.mjs) gets its inputs from Git, includes
retained evidence and fixture copies, and omits deleted files as inputs. Links
to deleted files still fail. Untracked, non-ignored new Markdown is included
locally. There are no blanket history/evidence exclusions. Optional sibling
repository navigation uses canonical HTTPS links so a clean checkout does not
depend on another checkout; remote liveness is outside this offline gate.
Dynamic JavaScript anchors and documentation accuracy need their own checks.
The installer and fixture were exercised locally on Linux arm64. Linux x64 is
the configured CI platform; the macOS archive digests are pinned, but macOS
installation and execution have not been validated in this change.

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
