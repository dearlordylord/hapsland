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
| Focused implementation checks | `npm run test:focused -- <test files>`; `npm run check:fast` | Explicit test files and typing/configuration checks; no full suite or proof chain | Changed owners only; does not qualify full source coverage |
| Routine deterministic gate | `npm test` | Bend artifact and authority checks, boundary scripts, Vitest tests for the reducer, adapters, resident, and CLI | Logic and controlled fixtures; no native agent or Jev call |
| Process harness contention | `npm run test:contention`; `npm run test:harness:inventory` | Full deterministic gate under bounded Linux CPU pressure; transitive process/scenario inventory; hung-child cleanup probes | Declared scheduling profile and finite harness failure; no product deadline, latency, or arbitrary-starvation claim |
| TypeScript quality gate | `npm run quality:check` | Full deterministic gate with fresh Istanbul coverage, then pinned crap4ts analysis of `src` | Per-function complexity and coverage policy; strict missing evidence; no correctness or assertion-quality guarantee |
| Compile/package source | `npm run typecheck`; `npm run build` | TypeScript typing, Bend artifacts, native helpers, standalone Bun commands and agent extension assets | Buildability of this checkout; unsupported hosts retain format-verified declared native artifacts without target-host validation |
| Hook review-engine import invariant | `npx vitest run --maxWorkers=1 src/runtime/review-engine-boundary.test.ts scripts/cli-import-boundary.test.mts` | Five engine/parser/provider module boundaries under every hook flag; permitted manual imports; static eager import closure | Runtime import violations emit a fixed diagnostic and throw, including dynamic imports; static dependencies can initialize before their module assertion |
| Runtime clock compatibility | `HAPSLAND_BUILD_BUN=/absolute/path/to/bun node scripts/check-runtime-clock.mjs --source-only`; pass a comparison declaration for the Linux installed witness | Separate Node/Bun OS-clock readings, pre-import delay, and installed admission/stale rejection | Shared monotonic coordinates and unchanged admission window; exact platform execution required |
| Installed hook startup comparison | `node scripts/measure-hook-startup.mjs DECLARATION.json` | Three installed variants, 15 round-robin registrations per variant with a ready resident, and three separate cold-resident calls per variant | Observed registration outcomes and wall times without coverage; uncontrolled OS file cache, no population latency guarantee |
| Review provider adapters | `npx vitest run --maxWorkers=1 src/review-providers` | Jev/Cloudflare selection, Clef/Clef-flash HTTP fixtures, native input limits, model identity and revalidation | Offline controlled transport behavior; no live provider quality or token-limit enforcement |
| Concurrent native helper build/security replay | `node scripts/security-prototype/concurrent-build-replay.mjs EVIDENCE.json` | Three selected pairs each for authorized send and dispatch denial, with an already-mapped native parser, actual helper publication and post-build parsing | Linux arm64 / current Node; 120-second bound, sanitized process exits and wire outcomes; current resident witness, not historical Quint generation or a full distribution build |
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

Local completion uses the smallest checks that establish the changed behavior:

- TypeScript changes: `npm run check:fast`, focused tests for the changed owners,
  and tests of affected consumers. Select by behavior and dependencies, rather
  than only the edited filename; renames can affect discovery and dispatch.
- Logic and configuration matrices: use direct component/unit tests. Run a
  representative integration case when discovery, wiring or an installed
  consumer changes. Unit tests cannot replace socket, process, TTY, packaging,
  crash or ownership evidence when that physical boundary changes.
- Documentation and tooling changes: affected tool tests and documentation or
  consumer checks. Build/package checks apply when their inputs or output layout
  change.
- Full fresh-coverage CRAP gate: releases, declared milestones, large cross-cutting
  features whose impact cannot be bounded by focused checks, and explicit
  requests. State the additional evidence before running it. A filename or
  literal replacement, or a bounded configuration fix, does not automatically
  require a full gate. CI continues to run the full gate; local focused checks
  do not claim full-project coverage.

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
Claude selection/batching fixtures confirm resident readiness in their complete
fixture environment before invoking hooks, with a 20-second preparation bound.
Their assertions concern findings handoff, rather than cold startup latency;
the hooks still use their original product deadlines.
Timeout errors name the child and execution phase; per-test runner watchdog errors name
the test, file, class, and test or cleanup phase. Deliberately hung-child tests
verify a finite failure and that the immediate child has been reaped.
Asynchronous `spawn` fixtures retain their explicit lifecycle and cleanup controls.
These scheduling allowances are harness limits, not product latency requirements;
product runtime deadlines, retries, and supported profiles are unchanged.

Keep process tests for boundaries that require actual executable, socket, or host
behavior. Test domain variants once at their owning layer rather than repeating
the full matrix through every installed adapter. Pi keeps the complete source
matrix and a smaller installed set covering transport, lifecycle, authority,
finish, freshness, and recovery. Claude CLI tests retain stdout, hook selection,
handoff, Stop, and failure boundaries; collection tests own outcome combinations
and encoded-size limits. The two-agent simulation keeps its original late-join
regression with resource cleanup and replay assertions instead of a repeated
timing stress matrix. Review these choices when runtime boundaries change or a
new regression requires another process-level case.

Pi and Claude hook fixtures share archive preparation and execute the
physical packaged Bun commands with a PATH excluding Node and Bun. Fixture observers may
use the explicit host Node executable to read IPC; they do not start a source
resident. By default each package suite builds and packs current sources, then
extracts the archive and creates its declared command links. These runtime
fixtures do not repeat package-manager installation: clean-package and setup
conformance install the archive with Bun by default; lifecycle conformance owns
update validation. Set `HAPSLAND_BUILD_BUN` to the pinned Bun executable when it
is outside PATH. `HAPSLAND_PACKAGE_INSTALLER=npm` selects actual npm installation
instead. Evidence names the manager used; a Bun pass does not establish an npm
installation pass. Each install destination has its own private manifest so a
package manager cannot adopt an unrelated ancestor project.
`HAPSLAND_TEST_PACKAGE_ARCHIVE` may supply one immutable archive built from those
same production sources for a verification run. Record its checksum; this
option does not remove test cases or replace source coverage evidence.

`npm run test:contention` runs canonical `npm test` on Linux with `taskset`:
the runner, suite, and two busy workers share the first four allowed CPUs
(or fewer when unavailable). Worker readiness is acknowledged through IPC.
A 30-minute fixture bound kills the suite process group; completion or interruption
kills and reaps the owned pressure workers. This is a bounded scheduling-pressure
check, not a throughput benchmark or proof for arbitrary host starvation.
No sleep is used to establish correctness or concurrency ordering.

Subprocess coverage is enabled so CLI and resident tests contribute evidence
from their spawned Node processes. Installed Bun binaries do not emit V8 source
coverage; source fixtures and component tests retain that evidence under the
unchanged strict quality policy. The [coverage adapter](../scripts/coverage-provider.mjs)
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
During implementation, run `npm run test:focused -- <test files>` for the
changed owners and `npm run check:fast`. Explicit files are required: an omitted
selection cannot silently start the full suite. Select the full quality gate using the behavior and milestone criteria above;
when selected, run it on a coherent review-ready candidate.
After a failed full run, inspect `npm run test:status`, diagnose every independent
reported defect with its owner check, and observe those checks passing before
another full run. After two attempts without new discriminating evidence, name
competing causes and change the experiment. Additional broad runs or reviewers
alone do not advance diagnosis.

For a batch of issues, assess each slice against its own accepted criteria and
the applicable owner checks. Record implementation, independent review and
executed validation separately, with the tested source and remaining gap. A
shared failure blocks the slices that depend on the failed behavior; name those
dependencies rather than treating every issue as incomplete. The optional game
has its own native consumer gate; it does not add a prerequisite to unrelated
business slices. Final integration still requires its applicable common gates.

Attach a task scope to harness runs, for example
`npm run test:focused -- --scope=issue-195 <test files>`. Scope records attribute
evidence; they do not declare acceptance or replace required checks. Read the
latest scoped record with `npm run test:status -- --scope=issue-195` when reporting
progress. Do not present an old sign-off
count as current implementation progress, or a historical pass as current-source
validation. A different Git commit is informational: identical source trees may
still carry the same evidence. Determine applicability from the actual inputs
and changed owners, without rerunning a broad gate merely to update a commit ID.

Keep transport equality and public behavior comparisons distinct. Compare the
complete encoded native and emitted-JavaScript outputs. At the public boundary,
assert facts required by the accepted contract, including relevant intermediate
behavior. Extra private diagnostic fields are not additional acceptance criteria
unless their owner contract requires them. A mismatch report must identify its
semantic layer, owning contract and first differing case or queued item before
it triggers another expensive run.

Before an expensive native comparison, validate the changed Bend source and
generated transport, then exercise changed comparison code against retained
vectors when their source, tool and artifact identities still match. A comparator
change alone does not require another compilation. Use the maintained runners;
temporary diagnostics must preserve their assertions, deadlines and provenance
checks. Freeze the checked sources until the process is terminal.

Native Bend and emitted JavaScript must agree on their complete encoded output.
At the public API boundary, compare independently expected contract facts rather
than requiring identical private bookkeeping. A native wrapper has no implied
public field: ground its relevant identity in actual public inputs or owner state,
and remove unsupported internal-shape assertions instead of inventing context.

### Stop-family observation owner

The agreed Stop fixture projection is the bounded `BusinessState` containing
`Canonical.State` and the relevant `StopScenario.Finish` records. Its
implementation captures ordered event and command facts from actual transitions,
rather than a second policy simulator. Recursive private Stop-driver `Runtime`,
full `Types.State`, and `Driver.Context` snapshots are not required just to
compare execution lanes.

Keep the original eleven Stop roots and twelve output Stop roots unchanged,
including original waiting inputs and boundary controls. Retain ordered
intermediate facts, relevant identities/scopes/effects, exact output membership
and continuation behavior, independent expectations, and ordinary replay. The
native and emitted-JavaScript vectors must remain completely equal across every
field of the replacement encoding. This fixture projection does not change the
production Engine ABI or the status of candidate Stop laws. It also does not
establish a native compilation improvement; report one only after fresh
validation of the changed source and full retained comparison scopes.

The maintained waiting, original-eleven and output-twelve native comparisons
allow C emission 45 seconds, clang 90 seconds, native execution 5 seconds and
independent JavaScript emission 15/execution 5 seconds, with a 175-second
aggregate watchdog. These are explicit
fixture allowances; default C/clang bounds remain 30 seconds and product
cutoffs/event budgets remain unchanged. Consult the scoped run receipt and
retained vectors for actual execution evidence; the allowance is not a pass.

### Expiry and Writer observation owners

`packages/monkey-business/src/expiry-native.test.ts` preserves all twelve
original expiry cases. Its `expiry_scenarios` transport exports `PublicTrace`
with the actual `expiry-observed-wire.BusinessState`/`Snapshot` facts, rather
than recursive private runtime trees. `compareExpiryBusinessTrace` owns public
accounting, notice clocks, controls, pending actions, physical facts and replay.
Complete native/emitted output equality remains required. This family uses
C45/clang90/native5/JS15+5 with a 175-second aggregate watchdog.

`packages/monkey-business/src/writer-native.test.ts` compares all thirteen
original cases through the single `writer-original-scenarios.bend` fixture and
`writer_scenarios` vector. The thirteen per-case wrappers have been removed;
one compilation per backend retains every original case and independent
public/replay expectation. Its full comparison uses C45/clang90/native5/JS30+5
with a 190-second aggregate watchdog. These allowances establish no pass by
themselves and do not change product deadlines.

The optional game consumer command is
`node --experimental-strip-types prototypes/canonical-defense/verify-consumer.mjs`.
Declare a 270-second outer deadline: its explicit C60/clang90/JS30 bounds,
native/JavaScript execution5 bounds and tool-location checks allow 200 seconds;
70 seconds remain for source hashes, all public/replay comparisons and cleanup.
Keep all four campaigns, 145 batches and 3,222 ticks. The five geometry/drawing
roots and candidate game proofs are separate from this shared consumer scope.

Do not repeat an unchanged failed check. The next run must test a concrete repair,
a competing cause, or an explicitly declared bounded budget amendment. Reuse a
successful result only for the exact inputs and scope it validated. Optional
proposal proofs are separate from business qualification; do not make them a
completion gate unless an accepted contract requires them. Accepted production
laws and required behavior checks remain part of their owning checks.

The [runner](../scripts/test-harness/run-checks.mjs) writes its command manifest
before execution, complete stage logs, elapsed times and observed exits under
ignored `.test-runs/`. `npm run test:status -- <run-id>` reads the retained status
and failure inventory; without an ID it selects the latest run. Add `--json`
for the complete machine-readable record. Vitest records
case and collection errors immediately in `failures.jsonl`; console tails are
not the failure inventory. Ordinary independent precheck failures are collected
rather than hiding subsequent checks behind a shell `&&` chain. A timeout or
interruption stops work and never counts as success. Freeze the candidate during
qualification; concurrent full gates in the same worktree are rejected.

Source-identification failures must produce terminal run records. Independent
prechecks still report their failures, but a failed prerequisite must prevent
dependent package preparation and the full test suite from starting. Skipped
dependent stages are recorded with their reason and do not count as passing.

Before a command expected to exceed one minute, declare its expected duration and
wall-clock stop time. The runner supplies a finite deadline: five minutes for focused checks and
25 minutes for full checks, including nested coverage commands. Override it
explicitly with `--timeout-ms=<milliseconds>` when the declared check needs a
different bounded budget; nested commands cannot extend the parent deadline. Use its retained stage evidence to distinguish preparation,
build, proof, test and analysis failures instead of blindly rerunning tests.
These rules borrow the finite-work and retained-evidence approach from
[Dalph development guidance](https://github.com/dearlordylord/dalph/blob/master/docs/development/workflow.md#keeping-implementation-work-finite).
When selected, the full Hapsland gate still requires strict fresh coverage.

Full runs prepare one fresh production archive before installed tests. The
[archive preparation](../scripts/test-harness/prepare-archive.mjs) records source
and archive digests and rejects verification-input changes during preparation;
the input scope is maintained in that module: source, scripts, workspace
packages, native/build assets, schemas, vendored dependencies and test fixtures;
root build/test manifests and configuration; and paths shipped by `package.json`
`files`. New, dirty and deleted files inside that scope remain inputs. Unrelated
research/specification documents (including `quint-specs/quint.lock`) do not
invalidate a run. Update the scope when a new build/test input root is adopted. The same
archive supplies all installed fixtures. This is reuse within one run, not a
cross-candidate build cache. Focused installed diagnostics may explicitly supply
`HAPSLAND_TEST_PACKAGE_ARCHIVE`; name its provenance and do not treat an older
archive as evidence for changed production code.

Keep essential behavioral coverage; delete repeated installed scenarios when
source owners cover the semantics. A process test should establish one named
physical boundary; ordinary value-policy matrices belong in component/source
checks. Keep distinct crash, socket, installation and ownership checks when those
are the only evidence for that boundary. Replace correctness sleeps with observed
ordering; retain real elapsed waits when timeout or idle expiration is the subject.
Slow process checks are canaries: use the smallest independent actors that can
exercise the physical boundary, explicit readiness and barriers, and an isolated
fixture. Value, parsing and lifecycle policy matrices call their production
services directly; representative CLI, TTY and installed executable cases retain
transport and packaging assurance. Singleton convergence now uses six requests
across three client processes; the historical 100-request/eight-process record
is prior stress evidence, not an assertion made by the current routine suite.
Pi no longer repeats stale-result scheduling through cold CLI calls with a
650 ms reviewer delay. Deterministic resident tests own stale handoff and
supersession during final revalidation; installed Pi cases retain attribution,
transport, cancellation and lifetime checks.
Installed resident idle expiry, live connection retention and accepted-work
retention remain real elapsed-time canaries. Their product grace periods are
not shortened for tests.
Claude socket delivery fixtures prepare genuine review results before their
response deadline; a separate no-work collector exercises delivery and final
handoff without measuring parser or reviewer cold-start latency. Pipeline and
installed hook owners retain end-to-end admission checks. Intentional in-flight
timeout and disconnect checks retain their gates.
The installed Claude Stop smoke uses one ready finding; collection size boundaries
and concurrent delivery ownership remain in their focused owner suites.

`npm run quality:check` regenerates coverage through
`npm run test:coverage`, which includes the existing boundary checks and tests.
The tool removes the previous JSON artifact before running that command and
stops if tests fail, so stale coverage cannot produce a passing CI result.
For machine-readable gate feedback after the run, use
`npm run --silent test:status -- --json > crap-report.json`. The retained record
contains every stage exit and log path plus all Vitest failures; CRAP analysis
diagnostics are in the quality-stage log. Exit **2** means a score exceeded its threshold;
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
