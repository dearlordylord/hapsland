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
| Comparison scenario documentation | `node scripts/generate-abide-scenario-pages.mjs --check` | Six generated reader pages, 36 linked input variants and helpers, measured fixture digest and frozen per-scenario results | Inline code and displayed scenario outcomes match their owners; offline, no new measurement |
| Routine deterministic gate | `npm test` | Bend artifact and authority checks, boundary scripts, Vitest tests for the reducer, adapters, resident, and CLI | Logic and controlled fixtures; no native agent or Jev call |
| Process harness contention | `npm run test:contention`; `npm run test:harness:inventory` | Full deterministic gate under bounded Linux CPU pressure; transitive process/scenario inventory; hung-child cleanup probes | Declared scheduling profile and finite harness failure; no product deadline, latency, or arbitrary-starvation claim |
| TypeScript quality gate | `npm run quality:check` | Full deterministic gate with fresh Istanbul coverage, then pinned crap4ts analysis of `src` | Per-function complexity and coverage policy; strict missing evidence; no correctness or assertion-quality guarantee |
| Compile/package source | `npm run typecheck`; `npm run build` | TypeScript typing, Bend artifacts, generated native helper and distributable files | Buildability of this checkout; unsupported hosts retain format-verified declared native artifacts without target-host validation |
| Review provider adapters | `npx vitest run --maxWorkers=1 src/review-providers` | Jev/Cloudflare selection, Clef/Clef-flash HTTP fixtures, native input limits, model identity and revalidation | Offline controlled transport behavior; no live provider quality or token-limit enforcement |
| Direct-event conformance | `npm run conformance:direct-event` | Manifest, selected direct-event tests, retained evidence validation | Version-one event contract and sanitization; no new agent session |
| Installed host | `npm run conformance:host -- --write-evidence` | Clean package with real Codex CLI and controlled reviewer | Pinned installed Codex profile, distinct from the source-checkout runner |
| Package setup | `npm run conformance:package`; `npm run conformance:setup-package` | Clean install and first-review setup | Packaging and installation paths; run only when those paths change |
| Source-checkout native integration | `node scripts/run-native-crossfile-current.mjs --host=HOST --language=LANGUAGE --scenario=SCENARIO` | Real Codex CLI or Claude Code on disposable TypeScript, Rust, or Bend projects | Selected hook → review → delivery observations; see the scenario table below |
| Installed Pi native profile | `node scripts/run-native-crossfile-current.mjs --host=pi --language=typescript --scenario=adoption` | Production tarball install, ordinary isolated setup/doctor, exact Pi 1.0.0, authenticated existing gpt-6-luna, controlled reviewer | Separate attribution, cross-file submission, native advice, provider-request visibility, repair, and correlated clear follow-up; zero Jev calls |
| Pi native limits and reviewer failure | Same shared runner with `--host=pi --language=typescript --scenario=unsupported-write`, `--scenario=unicode-edit`, or `--scenario=reviewer-unavailable` | Installed isolated Pi native mutation and selected truthful failure paths | Selected observations only; no broad fault-matrix or platform claim |
| Native Pi assertion regression | `node --test scripts/native-pi-observation.test.mjs` | Planted visibility, attribution, semantic expansion, and correlated follow-up failures | Runner verdict cannot conflate submitted advice with visible advice or repair |
| Full native fault matrix | `node scripts/run-native-negative-matrix.mjs` | All 24 controlled negative cells, at most three real host sessions at once | Per-cell declarations, results, and batch summary; no Jev requests |
| Paid source-checkout adoption | Same runner with `--scenario=adoption --live --execute-paid` | Real agent plus real Jev; six HTTP attempts maximum per invocation | Bounded selected live path, with each run's outcome retained separately |
| Source-checkout Abide coexistence | Same runner with `--host=HOST --language=typescript --coexistence=CASE --abide-prefix=PREFIX --hook-order=ORDER` | Real Codex/Claude, released Abide 0.0.7 handlers, controlled reviewers; `both` additionally accepts `--live --execute-paid` | Selected delivery, independent reviewer failure and file-exclusion cases; no general installed-package or native-trust declaration |
| Abide installer coexistence | `node scripts/run-abide-installation-witness.mjs --abide-prefix=PREFIX` | Real source Hapsland and released Abide installers in isolated profiles; both orders, repeat init and each uninstall | Registration preservation only; no native agent session or Jev call |

`HOST` is `codex`, `claude`, or `pi`; Pi currently accepts the controlled TypeScript profile above. Other source-checkout host/language combinations use the existing fixture table. `LANGUAGE` is `typescript`, `rust`, or `bend`. The native runner checks exact host versions, creates a disposable Git repository, records a declaration before execution, and retains source-free JSON under `evidence/native-languages/`. A failed run remains `incomplete`; it is never converted to a passing result by a later run. The [language evidence index](../evidence/native-languages/index.json) identifies the selected adoption runs and earlier incomplete attempts.

Pi native runs install a locally packed production artifact and exercise its owned extension through ordinary setup and doctor, rather than checkout-only handlers. They use an isolated agent home and preserve the ordinary `openai-codex/gpt-6-luna` configuration. Print/JSON mode with no persisted session is distinct from interactive trust validation. Controlled review makes zero Jev requests, while authenticated agent-model requests remain external. [Pi installation guidance](pi-installation.md) states the exact support and refusal boundary. The [selected Pi adoption record](../evidence/native-languages/pi-typescript-adoption-controlled-offline-1791013892029.json) demonstrated all 15 separate assertions; the [language index](../evidence/native-languages/index.json) preserves its earlier incomplete attempt. The [negative index](../evidence/native-negative/index.json) records three selected demonstrated Pi cells. Native negative observations do not replace deterministic installed extension cancellation, epoch, finish, freshness, and lease fault coverage.

The selected adoption observations include six controlled offline passes and six live Jev passes. One earlier controlled Claude Bend session received a finding but did not repair; its separately declared follow-up session passed. The live and offline records stay distinct in the language index.

The [Abide coexistence index](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/native-coexistence/index.json) records
14 native attempts on Linux arm64 with Codex 0.155.1 and Claude 2.1.218:
13 demonstrated and one incomplete Claude follow-up preparation. The failed
attempt remains separate from the later run whose prompt limited the repair
to the declaration and which passed. Eleven demonstrated sessions use controlled reviewers; two use
live Jev, making ten external requests in total. Four additional offline
installer cells passed. `PREFIX` contains an isolated npm install of
`@coldtea/abide@0.0.7` with lifecycle scripts disabled. `CASE` is `hapsland`,
`both`, `abide-unavailable`, `hapsland-unavailable`, or `privacy`; `ORDER` is
`hapsland-first` or `abide-first`. Claude additionally accepts
`--claude-feedback=advisory` for the separately observed default feedback case.
These source-checkout native runs use declared trust/sandbox bypasses and a
hand-authored rubric. They do not test current packed Hapsland or ordinary
interactive native trust. Installation order and runtime hook execution order
are distinct checks; not every scenario was run in both orders.

File exclusions remain tool-specific: in the observed `privacy` cases Hapsland
made no review request, while Abide independently reviewed the same synthetic
file. Abide task persistence and Git source objects were observed; exact source
markers were absent from the scanned Hapsland resident/activity files. These
checks do not establish a universal no-disk or no-read guarantee. The
[three separate research reports](https://github.com/dearlordylord/hapsland-research#hapsland-и-abide)
explain the approach, technical boundaries and exact coexistence evidence.

The [feedback delivery investigation](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/feedback-delivery-debug/investigation.json)
retains five separate rendering diagnostics and per-run harness snapshots.
The archived runner sources record their opt-in `--delivery-debug` mode. The two corrected-path validations declare
`--debug-edit-delay-ms=1500 --debug-stop-delay-ms=6000`: these are injected faults,
not ordinary runtime observations. One controlled and one live Jev session delivered
through a Codex Bash background hook, confirmed receipt and passed finite-domain
repair probes despite a lost first background opportunity and a native Stop timeout.
These source-checkout diagnostics do not amend the original comparison cell or
establish a general delivery guarantee. The investigation made four physical Jev
requests across its two live runs.

## Native compilation phase

Ordinary `npm test` and `npm run quality:check` invoke Vitest directly after the
maintained configuration, artifact, authority, boundary and progress checks,
including the shared Engine `build.mjs --check`. They do not compile the entire
native fixture registry before an unrelated test can start. Native tests still
compile their actual fixture freshly when they run without a preflight session;
a source, emitted-JavaScript or coverage pass does not establish native agreement.

At a declared native acceptance phase, run `npm run test:native:preflight`.
The [native phase runner](../scripts/run-native-preflight-tests.mjs) freshly
compiles the registered fixtures serially, passes the authenticated manifest to
Vitest and removes its owned artifacts after the suite. Arguments after `--`
are forwarded to Vitest, for example a native test file. The preflight manifest
validates current sources, compiler identities, flags, deadlines and artifacts;
it does not permit stale binaries or replace a test's comparison assertions.
The [Run conformance runner](../scripts/run-native-run-conformance.mjs) retains
its separate fresh compilation phase for its seven original Run fixtures.

## Pull request checks

[Offline CI](../.github/workflows/check.yml) runs on pull requests and pushes to
`master`. It installs the frozen Bun lockfile and the checksum-pinned Bend 2.0.34
and Lean 4.34.0 proof toolchain through its existing `npm run docs:install`
tooling step, then runs documentation links,
typecheck, `npm run quality:check`, and build. It does not invoke live Jev or native agent
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

The [crap4ts configuration](../crap4ts.json) selects all TypeScript under `src`
(the tool excludes conventional tests and declarations) and enforces a CRAP
threshold of **8** with missing evidence treated as an error.
[`@crap4ts/crap4ts`](https://www.npmjs.com/package/@crap4ts/crap4ts) is pinned
to **1.0.5** (`DEPEND ON`); the V8 coverage provider is pinned to the same
release as Vitest and emits Istanbul JSON, not raw V8 coverage.
The [harness policy](../scripts/test-harness/policy.mjs) applies a five-second per-test watchdog in ordinary unit files and a
60-second per-test watchdog in process-capable or explicitly named bounded
scenario files, in ordinary and coverage runs alike.
`npm run test:harness:inventory` derives the classification from transitive
runtime imports and reports the dependency that caused each process classification.
Type-only imports and fixture source strings do not classify a file as process-capable.
The classification is conservative: a process-capable file need not spawn a child
in every test. New large pure scenarios must be named with their reason in the policy.

The [child helper](../scripts/test-harness/process.mjs) supplies a finite
30-second default for synchronous children and promise-based `execFile` fixtures;
ordinary short child watchdogs use this shared allowance. Longer explicit
bounds remain finite; deliberate hang probes retain their strict one-second
child deadlines. Its timeout signal must be SIGKILL; weaker signals are rejected before spawning.
Four Claude selection/batching fixtures confirm resident readiness in their complete
fixture environment before invoking hooks, with a 20-second preparation bound.
Their assertions concern findings handoff, rather than cold startup latency;
the hooks still use their original product deadlines.
Timeout errors name the child and execution phase; per-test runner watchdog errors name
the test, file, class, and test or cleanup phase. Deliberately hung-child tests
verify a finite failure and that the immediate child has been reaped.
Asynchronous `spawn` fixtures retain their explicit lifecycle and cleanup controls.
These scheduling allowances are harness limits, not product latency requirements;
product runtime deadlines, retries, and supported profiles are unchanged.

`npm run test:contention` runs canonical `npm test` on Linux with `taskset`:
the runner, suite, and two busy workers share the first four allowed CPUs
(or fewer when unavailable). Worker readiness is acknowledged through IPC.
A 30-minute fixture bound kills the suite process group; completion or interruption
kills and reaps the owned pressure workers. This is a bounded scheduling-pressure
check, not a throughput benchmark or proof for arbitrary host starvation.
No sleep is used to establish correctness or concurrency ordering.

Subprocess coverage is enabled so CLI and resident tests contribute evidence
from their spawned Node processes. The [coverage adapter](../scripts/coverage-provider.mjs)
uses the pinned V8 provider while keeping Vite and native Node offsets separate
until source remapping, then combines counters for the same original function
body. It also normalizes uniquely identified multiline callback signatures
and zero-count entries for uncovered files, preserving their counters and
leaving ambiguous mappings for strict rejection. This avoids Vitest 5.0.1
mixing incompatible offset spaces or emitting
duplicate function entries. Its [regression test](../scripts/coverage-provider.test.mts)
checks separation of execution contexts and combination of source-map aliases
without a nested test runner. The full quality gate validates the emitted
Istanbul counters through strict crap4ts analysis.
Review this adapter against upstream behavior whenever Vitest is updated.
`npm run quality:check` regenerates coverage through
`npm run test:coverage`, which includes the existing boundary checks and tests.
The tool removes the previous JSON artifact before running that command and
stops if tests fail, so stale coverage cannot produce a passing CI result.
For machine-readable feedback, run
`npm run --silent quality:check -- --format json > crap-report.json`;
generated test output goes to stderr. Exit **2** means a score exceeded its threshold;
exit **1** means invalid inputs, missing coverage, analysis failure, or a failed
coverage command. Coverage reports and `crap-report.json` stay ignored.
Coverage is also written on test failures for diagnosis, but the gate stops
on the failed command and does not analyze it as a successful run.
A failing existing function
needs meaningful tests or simpler branching; do not raise thresholds or switch
to report-only mode to hide a failure. Separate packages and JavaScript/Bend
sources are outside this gate's current `src` scope. Review this policy when
the production source roots, test runner, or pinned analysis tool change.

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
| Unicode Update adoption | Controlled offline or real Jev | Real Codex/Claude edits ASCII in an existing TypeScript file with unchanged Japanese comments; review and repair are observed, both comments survive every edit | `--language=typescript --scenario=adoption --unicode-update` |
| Advice adoption | Controlled offline or real Jev | Agent makes an edit; review receives cross-file evidence; actionable advice is delivered; agent repairs; compiler and independent invalid-construction checks pass; follow-up result appears | `--scenario=adoption` or `--scenario=adoption --live --execute-paid` |
| Reviewer unavailable | Controlled offline error | Real agent makes one edit; review is attempted and becomes unavailable; no actionable advice is delivered and the agent leaves the draft alone | `--scenario=reviewer-unavailable` |
| Edit hook crashes | Native hook exits with failure | Real agent makes one edit; the fault is observed; no review request or invented advice follows | `--scenario=hook-crash` |
| Edit hook exceeds its deadline | Native hook sleeps beyond its configured timeout | Real agent makes one edit; the hook start is observed, it does not finish naturally, and no review request or invented advice follows | `--scenario=hook-timeout` |
| Older finding after a newer edit | Controlled delayed reviewer | Real agent makes two edits without acting on advice; the old finding and newer clear both complete, but the old finding is not delivered after the newer edit | `--scenario=stale-result` |

The [#211 Unicode Update observation](../evidence/native-languages/codex-typescript-adoption-unicode-update-controlled-offline-1791039023270.json)
used Codex CLI 0.155.1 and a controlled offline reviewer. Both edits preserved
the Japanese comments; the first Update reached review, advice was applied,
and follow-up review was observed. All 15 runner checks passed with zero Jev
requests. This is source-checkout evidence with declared trust/sandbox bypasses,
not installed-package or ordinary interactive trust validation.

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
