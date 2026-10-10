# Hapsland testing matrix

**Purpose:** Give contributors one entry point for choosing a test, understanding what it proves, and finding its runner and retained evidence.
**Audience:** Contributors, including coding agents; Build and release maintainers.
**Status:** Maintained testing guidance.
**Authority:** Maintained guidance and implementation or validation evidence; product behavior remains defined by its named contracts.
**Expected use:** Select the smallest relevant gate before a change, locate the current manual native integration runner, and distinguish source-checkout observations from package or platform support.
**Lifecycle:** Update this matrix whenever a test scenario, runner, language or runtime profile, or evidence owner changes. Review it when a milestone retires or replaces a runner; delete obsolete instructions and retain evidence only while a current decision, claim, or open review needs its provenance.

Target-root round changes use [real-Git resident routing fixtures](../src/resident/root-routing.test.ts)
with offline reviewers, plus native path translation, edit-settings, physical
capture, composed delivery and IPC checks. Verify concurrent first admission,
other-root skip without source reads or authority, return to the pinned root,
recipient-wide closure fences, and delivery across cwd changes. Linked worktrees
and independent repositories are distinct physical sources. These checks prove
local behavior; they do not extend declared native-host/platform support.

## Recovering retained build custody

**Audience:** Contributors building from source; build and release maintainers.
The [build workflow contract](build-workflow-contract.md) owns the required
behavior. This section owns the current recovery procedure and check selection.

A failed or interrupted producer retains `.test-runs/product-build` when its
writer shutdown cannot be established. Ordinary acquisition refuses abandoned
ownership rather than assuming that an exited supervisor stopped its children.
Removing only `lock` leaves the lease and group registrations behind; acquisition
now refuses those leftovers before writing a replacement lease.

From the affected checkout, run:

```sh
node scripts/reconcile-build-custody.mjs
```

Every build and inherited admission holds a shared kernel lock on the persistent
private `.test-runs/build-custody-gate` directory. Reconciliation takes that lock
exclusively, then validates the lock owner, lease, admission owner and every
registered group. It requires every recorded PID, group leader and process group
to be absent, including registrations carrying older lease tokens.

The command writes its stopped-writer audit under `.test-runs/build-custody-audits/`
and atomically renames the entire product-build directory into that audit's
`custody/` subdirectory. Original records are preserved together. A failed rename
leaves custody intact for retry; interruption after rename leaves it archived.
Process exit releases the kernel lock, including after SIGKILL, so recovery has
no removable ownership marker that can strand the next attempt. Running recovery
again after a completed archive reports no retained custody. The next build
receives a fresh lease without stale registrations.

The gate reuses `native/src/inspection-lock.c`, compiled into a private tooling
cache independently of product outputs. Its first use in a source checkout requires `cc` and Node-API
headers; subsequent uses select the source/runtime-specific cached binding. Keep
the gate directory in place while any build or recovery process is running.
This tooling is not shipped in the installed package and adds no compiler or
headers prerequisite for end users of ready-made executables.

Live or reused identities, permission errors, missing required ownership,
malformed or incomplete registrations, symlinks and changing records refuse
reconciliation. Stop the identified writers and retry; preserve ambiguous records
for investigation. Do not delete the lock alone or remove records merely because
the original installation exited. A shared process group that is still live also
blocks recovery. The command does not repair the source failure that triggered
the installation failure.

Automatic ownership evidence: `node --test scripts/build-lock.test.mjs
scripts/build-ownership.test.mjs scripts/build-process.test.mjs`.

The extended recovery regression is **manual only**, because repeated real child
and fault-injection cases take longer than the short automatic ownership checks:

```sh
node --test --test-timeout=30000 scripts/manual-build-custody-recovery.mjs
```

It covers failed children, abrupt supervisor exit, stopped-writer reconciliation,
lock-only removal, old tokens, live admission exclusion, killed recovery holders,
failed archive/retry, kills before and after archive, and refusal of live or
ambiguous writers. Detached child execution and cleanup use the bounded build
process supervisor. These checks do not qualify a full installation or native
platform release.

## Verification profiles

Use `npm run verify -- --profile=PROFILE [explicit test files]`. Every run records
its resolved plan and finite deadline under `.test-runs`; build and archive reuse
never reuses test outcomes or coverage. Source application commands and resident fixtures select pinned Bun;
Node runs the test harness and synthetic process fixtures. Coverage runs attach a Bun
preload and merge original-source Istanbul counters with Vitest/V8 counters.
Compiled fixture commands use `standaloneEnvironment` to remove only the owned
source preload token; unrelated Bun options remain. Its real compiled/source
regression runs in cheap quality preflight. Host-loaded Pi and source clients
retain their coverage settings.
Incomplete statement ends need unique authored AST ranges; positive aliases also
need precise same-context hits. Unknown ends cannot inflate exact-zero counters.
Coverage-provider regressions preserve ambiguous and uncovered evidence across contexts.
The selected source files and CRAP thresholds remain unchanged. Killed fixtures
retain conservative periodic snapshots; focused coverage is not a full gate.

Pi composition fixtures keep replay separate from freshness: after closing a
round, perform a physical edit with matching native patch and assert the new
finding. A new tool-call ID alone is not a fresh edit under the
[advice contract](advicing-target-contract.md#advicee-identity-and-admission).

| Profile | Purpose | Selection |
| --- | --- | --- |
| `fast` | Typecheck, generated configuration, changed-file lint and selected component tests | Optional explicit files |
| `boundary` | IPC, process, CLI, hooks and installation consumers | Required explicit files; package preparation follows the selected import closure |
| `native` | Compiler checks or a real agent scenario | `--native-target=typescript\|rust\|bend` and compiler test files; or explicit `--host`, `--provider`, `--model`, `--scenario` |
| `stress` | Saturation tests with a deadline, seeded simulation or contention checks | Required explicit files; assertions and seeds stay unchanged |
| `quality` | Existing full deterministic gate and fresh coverage/CRAP analysis | Complete inventory; filters are refused |

Focused Node-only selections omit workspace preparation for the source-only
convention: `.mjs` modules with explicit static relative `.mjs` imports and
`node:test`/`node:assert` imports, without ambient loading globals. Every other
dependency or unsupported form retains preparation, with its reason and path in
stage evidence. Vitest and mixed selections prepare workspaces once before their
tests. Both `test:focused` and verification profiles use this convention; test
assertions and coverage requirements remain unchanged.

Quality runs harness preflight, lint, the existing host parser preparation,
coverage-provider regressions, a bounded Bun subprocess check and a four-file
V8 coverage smoke before full coverage generation. The smoke requires emitted statement hits for each selected owner. Tests and invalid or missing
coverage remain blocking. CRAP threshold breaches are advisory and appear in a
machine-readable run artifact and the CI summary. The threshold remains a review
baseline; it does not require splitting production functions to pass a number.

`--timeout-ms=N` sets the finite run deadline. Compiler version preflight alone
is not compiler validation; select the compiler tests for the changed owner.
Agent profiles select the declared model; Pi requires its existing
`openai/gpt-6-luna` profile. Pi checks its pinned runtime and confirms that model
with one tool-free request with a timeout before preparing a package. A receipt is
reused only within the same owned run and unchanged profile; model response and
credentials are not retained. Real agent runs remain explicit.

Turbo owns ordinary build scheduling, task caches and output restoration. Archive
preparation always invokes the ordinary build, fresh native-profile validation and
packing; it never restores a whole build or skips those stages from a source-keyed
archive cache. Completed archives are retained by their SHA-256 under
`.git/hapsland-artifacts/archives` so installed candidates and one test run can use
immutable bytes. Preparation rejects source or runtime-output drift
and corrupt retained archive bytes.
Dependency installation uses the frozen lockfile. Turbo owns dependency inputs
for its task cache; build, archive and source-runtime preparation do not hash the
installed `node_modules` tree separately.
Prepared source roles share one immutable `.test-runs/source-runtime/<identity>` bundle set
through the same artifact store; production task outputs are owned by Turbo.
The materialized runtime is kept outside `dist` so production builds cannot remove entrypoints used by a running CLI or resident.

Run `npm run hooks:install` once per repository. The shared Git dispatcher invokes
the current worktree's maintained `.husky/pre-commit`, including lint-staged and
source typechecking, for existing and newly created worktrees.
Run `npm run docs:generate` after changing schemas, documented runtime constants,
workspace manifests, boundary schemas, hook definitions, interaction models or
the dashboard flow model. One generator inventory prepares private packages
through the existing Turbo build, then updates configuration schemas/references,
the hook table, architecture views, decision-boundary inventories, interaction
diagrams and comparison pages from frozen evidence. It makes no provider requests
or new measurements.
`docs:generated:check` verifies those artifacts without rewriting them. These are
manual documentation operations, kept in the dedicated generator script; fast/full
gates, pre-commit, product builds and CI do not invoke them automatically.
Run `npm run docs:check` explicitly for the documentation tools and links.
The focused owner commands assume their compiled prerequisites already exist.
On a fresh checkout, `npm run typecheck` prepares packages and checks types.
`check:fast` and pre-commit use `typecheck:source` and do not prepare packages or
replay documentation. After package changes, prepare current exports with the
ordinary build, typecheck or focused test runner before source checks.
[Fact renderers](../scripts/documentation-facts.ts)
import limits and names from their implementation owners. Edit those owners and
renderers, rather than generated sections.

`npm run build:watch -- --timeout-ms=3600000` runs the ordinary production build
serially when observed source or output identities change. Its default lifetime
is one hour; SIGINT or SIGTERM ends the watcher. Only one watcher owns the shared
`.test-runs/watch-build.json` status. `ready` records the source and output hashes
observed after a successful build; source drift forces another build, and a
failure waits for changed inputs before retrying. This status is development
evidence, not a release acceptance or platform compatibility claim. Watch changes
require coordinator tests and an actual production watch run, including failure
and repair cases when those behaviors change.

Historical worktrees without that file use the maintained command captured by
the installer in the common Git directory, executed in the current worktree.

## Bend formatting

Use the standalone `bend-format` **0.1.19** (the bend-idea formatter), Python 3,
and the repository's `.editorconfig`. Install the pinned release from
[the formatter release](https://github.com/dearlordylord/bend-idea/releases/tag/v0.1.19)
and put its executable on PATH, or set `BEND_FORMAT_BIN`. A separate JAR can use
`BEND_FORMAT_JAR` and `BEND_FORMAT_JAVA` (Java 21+).

- `npm run format:fix`: fix changed tracked and nonignored new Bend files.
- `npm run format:check`: check the same selection.
- `npm run format:check -- --base origin/master`: check the branch delta.
- `npm run format:check -- --all`: check all tracked Bend files, including legacy style.
- `npm run format:fix -- path/to/file.bend`: format explicit repository-relative paths.

The commit hook checks exact staged Bend bytes without rewriting files or the
index. Empty selections need no formatter. Exit 1 means formatting differs;
exit 2 means an unavailable tool, unsupported source, or error, never success.
Untouched sources need no bulk cleanup. Format before freezing source hashes or
mutation anchors; after formatting executable Bend, rerun its affected proofs,
mutation checks and artifact checks. Style checks do not establish semantics.
Wrapper and staged-byte regression tests: `python3 scripts/test_bend_format.py`.

## Optional development modules

Ordinary `npm test`, coverage/quality checks, and production/release builds exclude the game and the separate Monkey Business test suite. The production build does not validate or rebuild the standalone simulator. Run `npm run test:game` for generated game-lab identity, lab types and the focused lab suite; run `npm run test:simulation` for simulator freshness and all explicitly enumerated Monkey Business tests. Both entrypoints use the finite supervisor; native game/lab checks remain separate commands in the matrix below. Explicit `test:focused` selections can still include these owners. Production conformance tests using the model as an oracle remain in the ordinary gate, as do the production Bend artifact and authority checks. This separation changes test selection, not CRAP thresholds or missing-evidence policy. Review it when a development module becomes a production dependency.

## Which gate to run

Package-impact tooling uses `node --test scripts/package-impact.test.mjs scripts/package-graph.test.mjs`
plus `node scripts/package-impact.mjs --base BASE --head HEAD --merge-base` against
the actual review branch. These checks cover endpoint manifests, downstream
reachability, renames, deleted packages/edges, worktree paths and CLI output.
Impact output is advisory; it does not select or replace required product checks.

The byte-bound preparation inputs `packages/monkey-business/src/preparation.ts` and
`file-trees.ts` are excluded from automatic formatting because their exact bytes
participate in the shared Engine preparation identity. Keep their formatting stable
when changing other owners; intentional preparation changes require regenerated
Engine evidence. They remain subject to lint and TypeScript checks.

The measured input owner `scripts/abide-large-declaration-fixtures.mjs` also stays
outside automatic formatting. Its exact bytes are bound to the retained research
declaration; lint still applies. Changing it requires replacement measurement
evidence before regenerating the scenario pages.

| Gate | Entry point | Coverage | Boundary established |
| --- | --- | --- | --- |
| Resident playback and timeline | `npm --prefix packages/agent-flow-viz run test:resident-liveness-browser`; `npm --prefix packages/agent-flow-viz run test:timeline-browser`; `packages/monkey-business/src/cache-quiet-liveness.test.ts` | Default one/six-advicee Play and pause/resume; finding/clear cache and quiet-window replay; monotonic timeline drag, exact paused endpoint, keyboard seek, previous/next/latest and playback resynchronization | Observed cache progress and browser interaction; not universal scheduler liveness or live Jev transport |
| Resident edit settings | `npm run test:focused -- src/runtime/review-settings.test.ts src/resident/edit-settings.test.ts` | Five-second non-sliding cache TTL, shared concurrent loads, failure recovery, immutable snapshots, pre-edit ownership, delayed delivery and mixed Claude modes | Configuration and compiled rules remain fixed for each edit; no disk-I/O or latency improvement claim |
| Resident settings inspection | `npm run test:focused -- packages/monkey-business/src/applied-settings.test.ts` | Snapshot identity across execution, defensive copies and deep freezing, control invalidation, rejected controls and replay restoration | Applied configuration and controls are stable inspection inputs; no performance-improvement claim |
| Immutable simulation boundary reuse | `npm run test:focused -- src/canonical/immutable.test.ts src/canonical/simulation-codec.test.ts src/canonical/boundary-schema.test.ts src/canonical/boundary.test.ts src/canonical/simulation-adapter.test.ts src/canonical/constructors-reuse.test.ts` | Transactional constructor reuse with strict public decoding; schema-equivalent scalar fast paths; cyclic/shared/wide freezing; frozen graph reuse; mutable and accessor isolation; list and scalar bounds; emitted Engine equivalence | Boundary correctness and snapshot isolation; no throughput claim |
| Inspection page development | `npm run dev:inspection`; `npm --prefix packages/agent-flow-viz run test:inspection-dev-browser` | Source page edits reload the real inspector at the same private URL; syntax-error recovery, CSP execution and protected journal routes | Local source development only; no package rebuild, hook update, resident startup or release claim |
| Inspection dashboard browser | `npm --prefix packages/agent-flow-viz run test:inspection-browser` | Real resident/offline provider → private journal → production HTTP/SSE → Chromium; per-unit request selection and JSON preview and resident messages independent of hook execution, three-edit batch links, keyboard selection, stable live reading, typed payload loss, observed recording disable/re-enable, safe text, 375 px layout | Observed preparation/results/fates and resident messages; preparation does not establish native output or agent receipt. Pi and verified source discovery have separate checks below; full-feature milestone validation remains pending; no agent visibility or repair claim |
| Go active local package models | `npm run check:fast`; `npm run test:focused -- src/direct-event/go-analyzer.unit.test.ts src/direct-event/go-build-context.unit.test.ts src/direct-event/go-pipeline.unit.test.ts src/direct-event/language-boundary.test.ts src/direct-event/analyzer.test.ts src/direct-event/graph-resolver.test.ts src/direct-event/pipeline.test.ts src/direct-event/review-wire-contract.test.ts src/rules/decision.test.ts src/inspection/contract.test.ts src/configuration/configuration.test.ts`; `npm run conformance:package`; `node --test scripts/native-go-inspection.test.mjs scripts/native-go-hook-observation.test.mjs scripts/native-claude-package.test.mjs scripts/native-process.test.mjs`; `node scripts/run-native-crossfile-current.mjs --host=codex --provider=openai --model=default --language=go --scenario=go-package-model-review --archive=PATH` | Exact named roots, explicit build context, bounded active siblings, typed constant/iota groups, membership freshness, actual shipped-rule admission and controlled provider results; installed Linux edit/advice/repair witness | #271 under #267; partial production-package profile only. Other packages, cgo and unknown constraints are omissions. Constants are supporting evidence and never exhaust scalar values. The Codex witness uses an isolated user home, prepared installed runtime/resident, pinned Codex and Go toolchains, and explicit fixture trust settings. No browser, cold-start or interactive-trust claim. Packaged Darwin assets do not establish Darwin execution; zero Jev calls for the controlled witness. |
| Named TypeScript callable review | `npm run check:fast`; `npm run test:focused -- src/direct-event/callable-review.test.ts src/direct-event/function-analyzer.test.ts src/direct-event/analyzer.test.ts src/direct-event/function-graph.test.ts src/direct-event/function-binding.property.test.ts src/direct-event/function-resource-review.test.ts src/inspection/contract.test.ts`; `node scripts/run-native-crossfile-current.mjs --host=codex --provider=openai --model=default --language=typescript --scenario=callable-review --archive=PATH` | Const-arrow/Effect roots, verified body selection, signature/type/helper evidence, overload isolation, unsupported callables, existing declaration caps and bounded preflight; actual installed Codex update → resident → public inspector/browser, clear controlled outcomes, reload/replay | #254 seam; native run requires Node 24.20.0, Playwright Chromium host libraries, a current locally prepared archive and authenticated Codex. Zero Jev requests; synthetic application sources only, four ordinary apply_patch tasks with existing API forms, a prepared installed resident in an isolated user home, explicit test trust/sandbox bypasses. Not cold-start validation, interactive trust, live review quality, macOS or arbitrary-file coverage. |
| Native inspection ingress | `npm run test:focused -- src/direct-event/claude-adapter.test.ts src/direct-event/pi-adapter.test.ts src/hooks/direct.test.ts src/resident/protocol.test.ts src/resident/root-routing.test.ts src/inspection/http.test.ts`; `bun scripts/run-native-crossfile-current.mjs --host=codex --provider=openai --model=default --language=typescript --scenario=inspection-exclusions --archive=PATH` | Valid excluded candidates, original ordering and move destinations, root-local consent and receipts, source-free terminal IPC, credential lookup failure, mixed selected/excluded patch; installed Codex hooks → resident → journal → public HTTP/SSE → browser/reload/replay | Accepted [#256](https://github.com/dearlordylord/hapsland/issues/256) seam. Native scenario requires a current production archive and retains its hash plus sanitized outcomes. Controlled model invocations do not establish live Jev calls; no complete audit, other-platform or ordinary interactive trust claim |
| Inspection evaluation reuse | `npm --prefix packages/agent-flow-viz run test:inspection-reuse-browser` | Actual provider request held while another edit joins, clear result reused from cache, separate controlled DecisionModel call, public API/browser links and filtered retained totals, repeated recovery and physical policy-record loss | Joins/cache add no model or transport calls; controlled model activity remains distinct from live HTTP. Unknown activity after policy loss is explicit. Totals count retained immutable identities and do not claim complete capture |
| Inspection classifier outcomes | `npm --prefix packages/agent-flow-viz run test:inspection-outcomes-browser` | Real resident and offline production provider transport through private journal and public API/browser; clear/findings, invalid answers, backend failure, timeout, interruption, oversized capture, exact retained bytes and secondary JSON preview, and credential/error-body exclusion | Observed outcomes remain distinct from submission. The backend-error fixture exercises the resident error boundary without suppressing the original failure; no live Jev or model-visibility claim |
| Pi inspector handoffs | `npm --prefix packages/agent-flow-viz run test:pi-inspection-browser`; [native fixture matrix](../src/pi/inspection-native.test.ts) | Existing native extension fixtures → freshly packed production command/resident → private journal → public HTTP/SSE → Chromium; actual edit and finish offers, general resident messages independent of native output and lost acknowledgement, original edit links, verified multi-source health, retained history after resident exit, identity filters, keyboard focus/button activation and 375 px layout. Native matrix additionally covers session switch, recording disabled, and altered native output with the original native value preserved. | Native handler proposed output and resident replies remain distinct from completed writes or model visibility. One-rule edit fixture permits at most two later eligible comment mutations without starting unrelated classifier work, each with the existing short callback deadline; the extracted package boundary does not establish npm installation or other-platform support; no general latency or repair claim |
| Repository documentation | `npm run docs:install` once; `npm run docs:check` | Local Markdown links, raw HTML images and links, heading anchors, and generated architecture Mermaid matching the dashboard flow model and module table/graph matching workspace manifests and curated descriptions | Files and headings exist; generated views are current and stale checks preserve prose. No external URL requests, native execution or documentation-truth claim |
| Code lint and formatting | `npm run lint:code`; `npm run lint:changed`; `npm run format` | Oxlint correctness and shared code rules; dprint/OXC formatting of authored code | Full or changed-file checks; Git pre-commit fixes staged formatting and rejects lint failures. Generated, vendor, fixture and evidence assets remain outside this selection. |
| Lint workflow regression | `node --test scripts/quality-file-discovery.test.mjs scripts/quality-lint.test.mjs` | Git selection, failure propagation, shared worktree hooks, lint-staged formatting, preservation of unstaged edits and commit rejection | Offline temporary-repository workflow; no build or agent invocation |
| Installed hook inventory | `npm run hooks:generate`; `npm run docs:check` | Architecture hook table generated from the shared Codex, Claude Code and Pi hook catalog | Documentation matches registration definitions; no native lifecycle execution claim |
| Native game recording | `node --test prototypes/canonical-defense/recording-launch.test.mjs prototypes/canonical-defense/cached-build.test.mjs`; `node prototypes/canonical-defense/check-recording.mjs` | Realtime file visibility, exact complete-World restore and full playback, playback isolation, reset replacement, stale identity rejection and interrupted-tail recovery | Focused native/emitted host and physical file checks within 380 seconds; no power-loss durability, old-build compatibility or shared-engine milestone claim |
| Optional game balance laboratory | `node scripts/build-game-lab.mjs --check`; `npm run test:focused -- scripts/game-balance-lab.test.mts`; `node_modules/.bin/tsc -p prototypes/canonical-defense/lab/tsconfig.json --noEmit` | Shared game translation, actual-game placement/upgrades/health, strength/radius limits, fixed investments, refusal, ordinary business replay, paired/interaction comparisons and held-out separation | Declared offline fixtures and finite search; see [current limits](../prototypes/canonical-defense/lab/README.md#actual-game-ability-boundary); Host changes also require the game-consumer runner |
| Actual-Lab native behavioral predicates | `node scripts/verify-game-lab-native-tests.mjs`; `node --test scripts/verify-game-lab-native-tests.test.mjs scripts/game-consumer-deadline.test.mjs` | 20 independently expected construction, budget, captured timing/lease and access-restoration predicates in native/emitted JavaScript; verifier rejection and deadline/identity sensitivity | Source5/C30/clang30/JS30/exec5 per root, finite30-minute runner; exact existing foreign numeric-IO declarations excluded from source checks, no universal proof or platform claim |
| Laboratory native/emitted full traces | `python3 packages/monkey-business-bend/conformance/generate-callback-native-prefix.py --optional-profile prototypes/canonical-defense/lab-native-prefix-profile.json --check`; `node scripts/run-game-consumer.mjs --lab` | Seven declared scenarios × 40 ticks; complete before/intervention/after Worlds, frames and physical deliveries; exact scenario/tick and hard event-budget accounting | Source/tool-pinned native/emitted agreement; C emission within the authenticated 380s supervisor deadline (direct fixture command: 30s), clang preparation 120s as in the full game consumer, JS emission 30s, each scenario execution 5s; public replay and window behavior require their separate checks |
| Source unit checks | `npm run test:unit` (also first in `npm run check:fast`) | `src/**/*.unit.test.ts` against declared workspace source exports; no workspace build, Git fixtures or provider calls | Fast source behavior; native parser bindings must already be available. Compiled-product wiring remains covered by focused and quality checks. |
| Focused implementation checks | `npm run test:focused -- <test files>`; `npm run check:fast` | Explicit test files, source unit tests and typing/configuration checks; no full suite or proof chain | Changed owners and affected consumers; does not qualify full source coverage |
| Development archive preparation and packing | `node --test scripts/artifact-store.test.mjs scripts/dev-pack.test.mjs scripts/test-harness/prepare-archive.test.mjs` | Every ordinary build/validation/pack invocation, inherited build leases, input and output drift, archive integrity, npm file selection and executable bins | Local dev archives use gzip level 1; npm release packing is unchanged. Turbo owns build reuse. Identical completed archive bytes share immutable retention; fresh preparation stages still execute. Corruption and in-flight input or output changes are rejected. |
| Platform distribution and Homebrew | `node --test scripts/platform-distribution.test.mjs`; `npm run release:prepare:distribution -- --candidate=PATH`; `brew install dearlordylord/tap/hapsland`; `brew test dearlordylord/tap/hapsland` | Exact selected-platform bytes/modes and shared resources from an audited candidate; publication download verification; real installed command aliases, parser bindings and resident ownership on each target | No rebuild or executable-layout change; Homebrew must use public immutable assets. Offline installed checks do not establish native-agent or live-provider compatibility. |
| Release candidate preparation and publication admission | `node --test scripts/release-process.test.mjs scripts/release-archive.test.mjs scripts/artifact-store.test.mjs scripts/audit-release-tarball.test.mjs`; `mise exec node@24.20.0 -- npm run release:prepare` on a clean acceptance checkout | Stale/missing/corrupt candidate rejection before npm or build, pin-only source identity, retained audit/archive integrity, exact-byte publication through an offline registry fixture, fresh receipt audit under the build lease | CLI fixtures make zero registry uploads. Real preparation builds both targets, audits and retains a candidate; it never publishes or establishes installed/platform support. Actual npm publication remains separately authorized. |
| Mandatory administration UI diagrams | `node --test scripts/check-ui-flows.test.mjs scripts/cli-journey-commands.test.mts`; `npm run test:focused -- src/onboarding/ui-flow-diagrams.test.ts src/onboarding/client-selection.test.ts src/onboarding/pilot.test.ts src/onboarding/interactive.test.ts`; `npm run interaction:diagrams:check` | Closed typed prompt owners and input kinds; CLI journey-to-handler and root-flow bindings, parser-derived command syntax and rename propagation, input-flow reachability and shared diagram ownership; missing-owner/document/generator rejection through actual compiler entries; stale Markdown rejected by actual replay entry; composed selection/setup/login/verification and registered interpreter replays | Source-only preflight runs before compilation. Replay freshness is a manual documentation operation; product builds do not run it. The generated index lists CLI user journeys and their diagrams, with separate automation-boundary links; finite replay scenarios do not establish exhaustive transitions, physical terminal readability or platform support. |
| Credential policy and approved saving | `npm run test:focused -- src/credentials/input.test.ts src/credentials/file-saving.test.ts src/credentials/login-interaction.test.ts src/credentials/direct-input.test.ts src/onboarding/setup.test.ts`; `npm run conformance:setup-package -- --archive=PATH --profile=HOST --development-checkout=ISOLATED_CANDIDATE` | Lookup precedence, empty-environment authority, owner-bound file approval, stale targets, private atomic saving, direct native automation; installed setup and optional real development rebuild/update/new-key with artifact exclusion | Source fixtures are deterministic and offline. Installed/development execution must run separately on macOS arm64 and Linux arm64. The optional development candidate must be a separate repository checkout of the acceptance candidate with pinned dependencies and build tools ready, containing no copied ignored credentials. The runner temporarily changes its login help and creates a fixture project credential, then restores/removes both. Each dev-install invocation is bounded to 300 seconds; these are heavy checks. No provider requests or native-agent support claim. |
| Routine deterministic gate | `npm test` | Bend artifact and authority checks, boundary scripts, Vitest tests for the reducer, adapters, resident, and CLI | Logic and controlled fixtures; no native agent or Jev call |
| Process harness contention | `npm run test:contention`; `npm run test:harness:inventory` | Full deterministic gate under the declared Linux CPU-pressure profile; transitive process/scenario inventory; hung-child cleanup probes | Declared scheduling profile and finite harness failure; no product deadline, latency, or arbitrary-starvation claim |
| TypeScript quality gate | `npm run quality:check -- --ack-checks-policy` | Full deterministic gate with fresh Istanbul coverage, then pinned crap4ts analysis of `src`, extracted production TypeScript owners, and `scripts/test-support`, as selected by `crap4ts.json` | Advisory per-function CRAP scores; blocking tests and missing evidence; no correctness or assertion-quality guarantee |
| Compile/package source | `npm run typecheck`; `npm run build` | TypeScript typing, Bend artifacts, native helpers, standalone Bun commands and agent extension assets | Buildability of this checkout; the foreign profile imports a current source-bound native bundle and dependency parser prebuilds; local format/receipt checks do not establish foreign-host execution |
| Build workflow adapters | `node --input-type=module -e 'import {precheckStages} from "./scripts/test-harness/check-stages.mjs"; import {spawnSync} from "node:child_process"; const stage=precheckStages.find(([name])=>name==="build-workflow"); const result=spawnSync(process.execPath,stage.slice(1),{stdio:"inherit",timeout:150000}); if(result.error) throw result.error; process.exit(result.status??1)'` | Manifest graph, compiler and assembly receipts, native cache inputs and restoration, process ownership, source loader policy, and watch coordination | Adapter tests; actual production builds, installed behavior and platform qualification require their own checks. |
| Hook source and runtime import boundaries | `node --test scripts/check-workspace-imports.test.mjs scripts/source-loader-policy.test.mjs scripts/hook-import-boundary.test.mjs`; `npx vitest run --maxWorkers=1 src/runtime/review-engine-boundary.test.ts` | Declared hook/Pi entries, transitive local and workspace edges including type-only edges, forbidden owners, supported loader shapes and lexical bindings; runtime engine/parser/provider assertions | Source checks reject unsupported loaders. External dependency contributions and emitted/compiler closure require their separate build evidence; this gate alone does not establish emitted isolation. |
| Runtime clock compatibility | `HAPSLAND_BUILD_BUN=/absolute/path/to/bun node scripts/check-runtime-clock.mjs --source-only`; pass a comparison declaration for the Linux installed witness | Separate Node/Bun OS-clock readings, pre-import delay, and installed admission/stale rejection | Shared monotonic coordinates and unchanged admission window; exact platform execution required |
| Installed hook startup comparison | `node scripts/measure-hook-startup.mjs DECLARATION.json` | One to three installed variants, 15–100 interleaved registrations per variant with its own verified ready resident, and 3–30 separate fresh-resident calls per variant; declare artifact hashes, sample counts and comparison criteria before execution | Parent monotonic elapsed times, registration outcomes and resident executable/lifetime identities without coverage; uncontrolled OS file cache, fresh resident does not imply cold file cache, no handler-readiness or population latency guarantee |
| Review content isolation | `npm run test:content-isolation`; focused `src/review-providers/request-content.test.ts`, `src/direct-event/content-isolation.test.ts`, `src/direct-event/content-provenance.test.ts`, `src/jev-decision.test.ts`, `src/review-providers/cloudflare.test.ts` | Five kernel-checked laws over production Bend, 320 literal instances, five Bend mutants, five production mutants, fresh compiled-artifact equality, exact HTTP bodies/headers and a Jev loopback transport | Top-level field selection and framing only; source provenance, native JSON/ABI/compiler/transport correctness and traffic side channels remain outside the proof. Every Bend call is limited to 5 seconds; every wire-mutant test run to 20 seconds. |
| Review provider adapters | `npx vitest run --maxWorkers=1 src/review-providers` | Jev/Cloudflare selection, Clef/Clef-flash HTTP fixtures, native input limits, model identity and revalidation | Offline controlled transport behavior; no live provider quality or token-limit enforcement |
| Concurrent native helper build/security replay | `node scripts/security-prototype/concurrent-build-replay.mjs EVIDENCE.json` | One pair per scenario: authorized send and edit-snapshot preservation after a saved exclusion, with an already-mapped native parser, actual helper publication and post-build parsing | Linux arm64 / current Node; 120-second bound, sanitized process exits and wire outcomes; current resident witness, not historical Quint generation or a full distribution build |
| Direct-event conformance | `npm run conformance:direct-event` | Manifest, selected direct-event tests, retained evidence validation | Version-one event contract and sanitization; no new agent session |
| Installed host | `npm run conformance:host -- --write-evidence` | Clean package with real Codex CLI and controlled reviewer | Pinned installed Codex profile, distinct from the source-checkout runner |
| Package setup | `npm run conformance:package`; `npm run conformance:setup-package` | Clean install and first-review setup | Packaging and installation paths; run only when those paths change |
| Source-checkout native integration | `node scripts/run-native-crossfile-current.mjs --host=HOST --language=LANGUAGE --scenario=SCENARIO` | Real Codex CLI or Claude Code on disposable TypeScript, Rust, or Bend projects | Selected hook → review → delivery observations; see the scenario table below |
| Installed Pi native profile | `node scripts/run-native-crossfile-current.mjs --host=pi --language=typescript --scenario=adoption` | Production tarball install, ordinary isolated setup/doctor, the supported Pi release, authenticated existing gpt-6-luna, controlled reviewer | Separate attribution, cross-file submission, native advice, provider-request visibility, repair, and correlated clear follow-up; zero Jev calls |
| Pi native limits and reviewer failure | Same shared runner with `--host=pi --language=typescript --scenario=unsupported-write`, `--scenario=unicode-edit`, or `--scenario=reviewer-unavailable` | Installed isolated Pi native mutation and selected truthful failure paths | Selected observations only; no broad fault-matrix or platform claim |
| Native Pi assertion regression | `node --test scripts/native-pi-observation.test.mjs` | Planted visibility, attribution, semantic expansion, and correlated follow-up failures | Runner verdict cannot conflate submitted advice with visible advice or repair |
| Full native fault matrix | `node scripts/run-native-negative-matrix.mjs` | All 24 controlled negative cells, at most three real host sessions at once | Per-cell declarations, results, and batch summary; no Jev requests |
| Paid source-checkout adoption | Same runner with `--scenario=adoption --live --execute-paid` | Real agent plus real Jev; six HTTP attempts maximum per invocation | Selected live path within the request budget, with each run's outcome retained separately |
| Source-checkout Abide coexistence | Same runner with `--host=HOST --language=typescript --coexistence=CASE --abide-prefix=PREFIX --hook-order=ORDER` | Real Codex/Claude, released Abide 0.0.7 handlers, controlled reviewers; `both` additionally accepts `--live --execute-paid` | Selected delivery, independent reviewer failure and file-exclusion cases; no general installed-package or native-trust declaration |
| Abide installer coexistence | `node scripts/run-abide-installation-witness.mjs --abide-prefix=PREFIX` | Real source Hapsland and released Abide installers in isolated profiles; both orders, repeat init and each uninstall | Registration preservation only; no native agent session or Jev call |

Build-workflow acceptance runs focused harness tests before baseline under its lock and deadline. Tests derive the context API from the runner and scenarios; missing providers fail before mutation. Require terminal `completed: true` and completed repair or recorded verified `repairSkipped`; report interruption separately. Measure an unchanged warm build in the same environment before choosing a campaign deadline.

The [checks policy](../CHECKS.md) owns
gate selection, prerequisite checks and retry decisions. This matrix supplies
commands and evidence boundaries. Select consumers by dependencies and behavior;
renames can affect discovery and dispatch. Socket, process, TTY, packaging,
crash and ownership changes need their corresponding physical checks.

Coverage/preload changes use existing provider tests plus a real source consumer,
such as `src/resident/subprocess.test.ts`, with coverage enabled. Match the failing
mode's environment and instrumentation; preserve product deadlines. Supply a
reviewed current archive via `HAPSLAND_TEST_PACKAGE_ARCHIVE` for installed fixtures.
The focused runner prepares current workspace outputs. One invocation is:

```sh
HAPSLAND_TEST_PACKAGE_ARCHIVE=/absolute/reviewed.tgz npm run test:focused -- src/resident/subprocess.test.ts --coverage
```

Startup/readiness and pending-work behavior must remain observable under the
instrumentation. Successful toy counters do not establish lifecycle behavior.
On timeout, compare matching instrumented/uninstrumented runs and measure startup
and checkpoint costs before choosing a repair. This focused run does not qualify
full source coverage.

`HOST` is `codex`, `claude`, or `pi`; Pi currently accepts the controlled TypeScript profile above. Other source-checkout host/language combinations use the existing fixture table. `LANGUAGE` is `typescript`, `rust`, `bend`, or the partial `go` profile. The native runner checks exact host versions, creates a disposable Git repository, records a declaration before execution, and retains source-free JSON under `evidence/native-languages/`. A failed run remains `incomplete`; it is never converted to a passing result by a later run. The [language evidence index](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-languages/index.json) identifies the selected adoption runs and earlier incomplete attempts.

Pi native runs install a production artifact and exercise its owned extension through ordinary setup and doctor, rather than checkout-only handlers. They use an isolated agent home and preserve the ordinary `openai/gpt-6-luna` configuration. The Pi runner accepts `--archive=PATH` for an already-built production tarball; it records that reuse and rejects a package whose manifest or runtime inventory differs from the current build. This compares built assets, not source freshness. Print/JSON mode with no persisted session is distinct from interactive trust validation. Controlled review makes zero Jev requests, while authenticated agent-model requests remain external. [Pi installation guidance](pi-installation.md) states the exact support and refusal boundary. The [selected Pi adoption record](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-languages/pi-typescript-adoption-controlled-offline-1791013892029.json) demonstrated all 15 separate assertions; the [language index](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-languages/index.json) preserves its earlier incomplete attempt. The [negative index](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-negative/index.json) records three selected demonstrated Pi cells. Native negative observations do not replace deterministic installed extension cancellation, epoch, finish, freshness, and lease fault coverage.

The selected adoption observations include six controlled offline passes and six live Jev passes. One earlier controlled Claude Bend session received a finding but did not repair; its separately declared follow-up session passed. The live and offline records stay distinct in the language index.

The [Abide coexistence index](https://github.com/dearlordylord/hapsland-research/blob/master/evidence/native-coexistence/index.json) records
14 native attempts on Linux arm64 with Codex and Claude:
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

Long-history recovery has one owner: `jev-targeted-controls.test.ts` exercises
2050 terminal requests, then credential unavailability, restoration and rotation
through the production emitted-JavaScript engine and public Run API. Small native
recovery and credential fixtures own C/JavaScript/public/replay agreement; they do
not repeat the 2050-request stress campaign. The original minimal native trace
fixture uses the shared runner, with separate default 30-second C emission and
clang allowances.
## Local inspection storage boundary

The [foreground command tests](../src/inspection/command.test.ts) run both the
source CLI and the standalone CLI extracted from a freshly built production
archive. They check no implicit opt-in or resident startup, SIGINT exit without
forced termination, pre-launch history, continued resident recording while the
dashboard is stopped, and retained history after dashboard restart. The packaged
case uses an environment without Node or Bun on PATH. This establishes the local
host's packaged dashboard lifecycle, not additional platform support.

The [journal tests](../src/inspection/storage.test.ts) exercise actual asynchronous
filesystem publication, shared allocated-byte accounting, exact capture-aged
expiry, read-only snapshots, immutable payload reuse, independent writer contention,
and killed producers. Snapshots filter expired records without creating, deleting,
or recovering files; physical retention and crash cleanup run on publication.
A physical near-full
128 MiB journal uses the actual default settings and measured filesystem
allocation, then exercises two project/source writers and contending maintenance.
It checks publication allocation, non-waiting contention, oldest-first record
eviction, surviving exact loss-marker identities, and the shared cap after cleanup. Consent is checked
at the recorder's synchronous commit of an already-readable immutable object:
disable before commit drops it; disable during later cleanup retains the earlier
capture. Incomplete temporary links are conservatively discarded after a crash,
so this is optional history rather than a durable audit guarantee.

The [native lock tests](../src/inspection/native-lock.test.ts) establish private
directory descriptor validation and loading from a compiled Bun package layout.
Shared locks permit simultaneous readers; exclusive locks protect publication
and maintenance. The non-waiting kernel lock releases on descriptor close or process exit and
allocates no journal recovery files. The native build/release checks require the
binding in both existing arm64 profiles. These focused checks do not establish
production archive installation or full-feature acceptance; affected installed
checks and the final milestone gate remain separate requirements.

The [source discovery tests](../src/inspection/registry.test.ts) connect two real
residents through retained private registrations and the public inspection API.
They reject changed private permissions, owner symlinks and FIFOs, distinguish
resident exit from lifetime replacement, and check size-limited metadata and source
counts. Inspection probes use a separate private `inspection.sock` endpoint accepting only hello and lifetime-bound recording-status reads. Its four connection slots and 300 ms total connection deadline are independent of the 32 hook-control slots. The socket saturation test verifies control requests while inspection is full, read-only probes while control is full, and rejection of cleanup on the inspection endpoint, and closure despite trickled incomplete input. Probes do not start residents or extend review lifetime.
The Pi browser gate exercises distinct residents and roots with native selectors;
its keyboard checks cover focus traversal and button activation, not native popup
menu keystrokes. These checks do not establish replay or all runtime/child filters.

Exact-payload reads use the capability-protected `payload/<source-id>/<sequence>`
route. The [HTTP tests](../src/inspection/http.test.ts) retrieve real provider and
resident message text, then distinguish known expiry (`expired`), known capacity
eviction (`capacity-evicted`), and missing unclassified records (`not-retained`) from an
inaccessible journal (`history-unavailable`) and facts without exact bytes
(`no-exact-payload`). Browser copy actions retrieve that immutable identity again
and check it against the captured payload. The browser fixture fans one edit into
two actual provider requests, selects both by keyboard, and compares each copy
and unit label against its dispatched body. Original-evaluation links select the
matching request rather than the first invocation in the original receipt. The
fixture also removes the original model-input records while preserving actual
transport records, then verifies the original links and exact bodies still work. A
missing selection never switches to another body. A missing result leaves the clipboard
unchanged and labels the remaining preview as previously captured history. These
checks do not establish replay cursors or complete recording coverage.

The [public replay test](../src/inspection/replay.test.ts) records two real resident
sources, takes a snapshot, records further edits, and resumes after each source's
sequence position through HTTP and SSE `Last-Event-ID`. Resumed SSE frames carry
only records after each saved source position, plus a list with an entry limit of the current
view's retained identities. An unchanged cursor sends no record payloads. The
browser merges by source/sequence and removes identities no longer retained. Fresh or reset frames replace the retained view. Repeated
source/sequence records are idempotent. Cursors are signed per inspector launch, carry at most 128
source positions, and fit the server's header bound. A missing retained anchor or
invalid cursor produces explicit protocol gaps and a fresh retained snapshot. Browser checks keep the selected edit open during live updates and remove expired rows
after actual journal expiry. Coverage is
always limited to retained observations; this does not prove that silent capture
failures are known. Exact loss markers distinguish known expiry and capacity eviction;
missing markers keep the reason unknown. The [slow-consumer test](../src/inspection/consumer.test.ts) pauses a real TCP
reader against a saturated feed with event-size limits. A real resident review and private
journal publication continue, the stalled response closes, and a new connection
retrieves that review with the saved cursor. Five seconds of continuous socket
backpressure trigger closure, checked every 100 ms; draining resets the deadline.
The HTTP adapter waits for drain before pulling another size-limited event, so a slow
feed retains one response frame rather than an unbounded event queue. This is an
observed local transport case, not a general network latency guarantee.

The [current recording test](../src/inspection/recording-current.test.ts) drops a
real resident's disabled-state history write and verifies that the public API
still reports the resident's disabled capture state separately from its last
retained enabled observation. The lifetime-bound `inspection-status` operation
reads only in-memory recorder state: it neither starts a resident nor changes
recording, review, cleanup or submission state. Known roots and metadata have entry and size limits, with omitted counts. The Pi browser checks enabled observations from
three live sources and unknown current root states after their disconnection.
Configuration changes apply at the next edit admission; this observation does
not reread project files or guarantee successful persistence. Paused displays
retain their explicitly timed observation. The real-resident browser gate toggles
only inspection consent through two disabled periods, preserving its original
review policy. It verifies five retained state periods and three consent epochs,
links each period to its next retained transition, and excludes disabled edits
from source-bearing history. An open historical period does not claim current
state or continuous coverage. Its configured 4 MiB fixture quota preserves the
full marker retention window for the selected older handoff's expiry check; the
physical default-cap journal check is described above; marker retention limits and
marker loss have separate journal checks.

Loss markers are source-free, private, immutable version-one journal objects
naming an exact removed source/sequence identity and the observed reason. They
are published after successful unlink, under the journal lock, and count toward
the same allocated cap with their temporary files. At most 128 markers are kept,
further limited by the configured quota; diagnostic retention ages from removal.
Older markers can be lost, so absence is not evidence of complete coverage.
The journal samples records and markers together for HTTP, replay and payload
reads. [Journal tests](../src/inspection/storage.test.ts) cover capacity markers
across fresh readers, refusal to republish marked identities, physical publication
peaks, marker expiry, and producer death before/after marker linking. Private
record and marker FIFOs fail promptly without being deleted. The real-resident
browser gate reduces the allocated cap during live updates, observes eviction through the journal API,
then expires retained data and checks that unavailable rows disappear.

## Local inspection model

`node scripts/check-inspection-model.mjs` typechecks the executable
[inspection model](models/sessionInspection.qnt), runs its deterministic protocol
scenarios, and samples the consent/evidence/loss/replay invariants with seeds
226, 233 and 225, 1,000 traces per seed and at most 120 steps per trace. Every
major action must be reached in at least one of the sampled runs. Use
`--write-evidence` to replace the [sampling record](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/inspection/model-sampling.json)
when the model changes.

This is design evidence for [#226](https://github.com/dearlordylord/hapsland/issues/226),
subordinate to the [accepted feature requirements](https://github.com/dearlordylord/hapsland/issues/225).
Abstract immutable byte tokens and item quotas do not establish actual request
serialization, allocated storage, private access, process lifetime or native
handoff. Production inspection acceptance remains at the real-resident public
HTTP/feed and rendered inspector boundary defined in #225. All eight slices
must land before its declared final full gate.

## Native compilation phase

Ordinary `npm test` and `npm run quality:check -- --ack-checks-policy` invoke Vitest directly after the
maintained configuration, artifact, authority, boundary and progress checks,
including the shared Engine `build.mjs --check` and common runner
`build-run.mjs --check`. They do not compile the entire
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
The [Run conformance runner](../scripts/run-native-run-conformance.mjs) runs
one aggregate of all seven original Run cases through the focused harness.
One compilation per backend retains each original trace, independent public
assertions and replay checks. Its setup bound is 275 seconds, with 285 seconds
for the supervised check.
The original authorized-output and four twelve-cycle Jev recovery fixtures use
explicit 90-second C emission, 120-second clang, and 5-second native execution
allowances, plus 30-second emitted-JS compilation and the unchanged 5-second
JS execution bound. Each test has a 250-second aggregate bound; supervise each
selected qualification with a 300-second stage. These overrides do not change
runner defaults or product deadlines. Recovery compares the complete native
and compiler-emitted vectors before its independent public and replay checks.

The original advicee preparation-after-departure, disconnect, and remove comparisons use C90/clang120/native5
with a 250-second aggregate watchdog; an authenticated preflight session keeps
its own fixed compilation policy. The single 2050-request credential-rotation stress test uses a 300-second aggregate watchdog. Freshness source-change comparisons retain
native/emitted-JS agreement under a 300-second watchdog (C90/clang120/native5,
JS15+5). Their independent public milestones and replay also run as separate
TypeScript tests. The concurrent-notice comparison uses the shared native runner
and its C30/clang30/native5 allowances under the same 100-second watchdog;
it uses the shared compiler subprocess implementation.
These are fixture compilation budgets, not product latency deadlines.

The public TypeScript API and native consumers execute through
[`NativeRun.bend`](../packages/monkey-business-bend/NativeRun.bend).
[`NativeRunHost`](../packages/monkey-business/src/native-run-host.ts) converts
validated inputs and immutable presentation data; the public wrapper retains
replay orchestration and synchronous subscription delivery. Runner changes require
focused controls, captured callback/deadline, metadata progress, listener-control
and exact replay checks, plus affected dashboard playback and the native game
consumer (`node scripts/run-game-consumer.mjs`). Check the emitted runner with
`node packages/monkey-business-bend/build-run.mjs --check`; regenerate it without
`--check` after changing its sources, declaration, or host boundary. Native/emitted
comparisons remain separate evidence from public API checks.

Shared-resident contention/cancellation and generated PRE comparisons use
C90/clang120/native5 with 250-second aggregate watchdogs. Departure emitted-JS
comparisons use JS60+5 under 90-second watchdogs. The shared runner defaults and
its native five-second execution bound remain unchanged. Each comparison still
checks the same complete original trace and public/replay milestones.

Covered finite campaigns use explicit execution watchdogs: 30 seconds for healthy
advicee departures, and 60 seconds for four-output Stop and cache/quiet liveness.
Their seeds, repetitions, simulated clocks, event bounds, and assertions are
unchanged. The release diagnostic observed those selected campaigns passing
without coverage under their previous bounds, while coverage exceeded them.
These watchdogs bound test computation; they make no product latency claim.

## Dependency and compiler selection

Shared external versions are declared once in the root manifest's standard Bun
`catalog`; workspace manifests consume them through `catalog:` and private
workspace dependencies through `workspace:*`. The manifest graph validates these
values and derives production references. Seven auxiliary owners remain outside
the 23-owner production schedule; all dependency fields must form an acyclic graph, including tooling and
verification owners. Cycles fail graph validation before build or test preparation.

Compiler callers use [the explicit TypeScript selector](../scripts/pinned-typescript.mjs),
not the shared `.bin/tsc` link. Its catalog-driven version, selected native
executable and compiler/platform support identity are distinct from the research
scorer's older compiler API. Run `node --test scripts/pinned-typescript.test.mjs`
for the collision and rejection cases. Those tests establish selection behavior,
not package compilation or release acceptance. Current receipt checks validate
the selected identity through [the compiler context](../scripts/compiler-context.mjs).

## Pull request checks

[Offline CI](../.github/workflows/check.yml) runs on pull requests and pushes to
`master`. It installs the frozen Bun lockfile and the checksum-pinned Bend 2.0.36
and Lean 4.34.0 proof toolchain through its dedicated installer,
then runs typecheck,
`npm run quality:check -- --ack-checks-policy`, and build. Documentation generation
and drift checks are explicit manual operations. It does not invoke live Jev or native agent
milestones; those remain separate declared checks above.

The [proof toolchain installer](../scripts/install-bend-toolchain.mjs) downloads
first-party Linux x64/arm64 archives with pinned SHA256 digests and checks the
progress proof with Bend’s bundled kernel before the harness starts.
Bend 2.0.36 is pinned to the upstream release source revision
`ae1101c`; its kernel requires Lean 4.34.0.
Run the installer once and add its printed bin directories to `PATH` for local
`npm test`. The explicit `--github-actions` mode in `docs:install` installs this
proof prerequisite only when `GITHUB_ACTIONS=true`; ordinary local documentation
installs do not download Bend or Lean. Updating either pin requires proof
validation and digest review. After changing the Bend pin or bundled declaration
selection, run `npm run bend:base:generate` and review its exact source and
identity diff. Ordinary workspace builds check catalog freshness before
compilation; `npm run bend:base:check` performs that check directly. Run
`node --test scripts/generate-bend-base-evidence.test.mjs` for generator changes.

The [crap4ts configuration](../crap4ts.json) selects TypeScript under `src`,
the 22 production TypeScript owners’ `src` directories and the moved
`scripts/test-support` helpers (the tool excludes conventional tests and
declarations). The Bend producer is checked through its separate generator,
ABI, loader and proof gates. The configuration uses a CRAP
review baseline of **8** with missing evidence treated as a blocking error.
[`@crap4ts/crap4ts`](https://www.npmjs.com/package/@crap4ts/crap4ts) is pinned
to **1.0.5** (`DEPEND ON`); the V8 coverage provider is pinned to the same
release as Vitest and emits Istanbul JSON, not raw V8 coverage.
The [harness policy](../scripts/test-harness/policy.mjs) applies a five-second per-test watchdog in ordinary unit files and a
60-second per-test watchdog in process-capable or explicitly named time-limited
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
product runtime deadlines, retries, and runtime profiles are unchanged.

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
kills and reaps the owned pressure workers. This is a scheduling-pressure check with a deadline, not a throughput benchmark or proof for arbitrary host starvation.
No sleep is used to establish correctness or concurrency ordering.

Subprocess coverage is enabled so CLI and resident tests contribute evidence
from their spawned Node processes. Installed Bun binaries do not emit V8 source
coverage; source fixtures and component tests retain that evidence under the
strict coverage-evidence policy. The [coverage adapter](../scripts/coverage-provider.mjs)
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
`npm run test:focused -- <test files>` requires explicit files; omitted selection
cannot silently start the full suite. Follow the
[checks policy](../CHECKS.md) for escalation
to the full gate and diagnosis after failure.

### Task and batch acceptance

For delegated work on one task or a jointly accepted batch, the existing parent
or integrator owns final qualification: select and assign the required common
checks, then assess their results against the combined acceptance criteria.
Workers assess their slices against their accepted criteria and run applicable
focused owner and affected-consumer checks. The parent or integrator may assign
a worker to execute the final gate on the integrated candidate; ownership of
final acceptance remains with the parent or integrator.

Apply the full-gate criteria to the combined accepted scope. When selected,
plan one full-suite acceptance at the end of that work on a stable, review-ready
candidate containing all required slices. A worker handoff or commit does not by
itself require another full run. An independently deliverable task may qualify
in its own worktree before merge. Keep the candidate frozen during qualification
and follow the failure-diagnosis rules in [CHECKS.md](../CHECKS.md) for any
necessary repeat. Explicit requests and existing CI and hook requirements still apply. Keep all required
proof, model/property, lifecycle and affected-boundary checks.

Record implementation, independent review and executed validation separately,
with the tested source/worktree, exact checks and results, and remaining gap.
A shared failure blocks the slices that depend on the failed behavior; name
those dependencies rather than treating every issue as incomplete. The optional
game has its own native consumer gate; it does not add a prerequisite to
unrelated business slices. Final integration still requires its applicable
common gates.

Attach a task scope to harness runs, for example
`npm run test:focused -- --scope=issue-195 <test files>`. Scope records attribute
evidence; they do not declare acceptance or replace required checks. Read the
latest scoped record with `npm run test:status -- --scope=issue-195` when reporting
progress. Do not present an old sign-off
count as current implementation progress, or a historical pass as current-source
validation. A different Git commit is informational: identical source trees may
still carry the same evidence. Determine applicability from the actual inputs
and changed owners, without rerunning a broad gate merely to update a commit ID.

### Optional game motion laws

For changes to movement semantics, run `timeout 130 node prototypes/canonical-defense/verify-motion-laws.mjs` and `node --test prototypes/canonical-defense/motion-law-tools.test.mjs`. The gate checks five structural laws with Bend and its mathematical kernel, nine unsigned U32 arithmetic laws through explicit source-to-Lean lowering, and one isolated mutant per law. Each subprocess retains a five-second deadline. Selected owner declarations are retained exactly except that the observation lemmas generalize the appended-path field to every well-typed suffix. The U32 primitive correspondence and lowering remain trusted; this is not a Bend proof of the compiler bridge. No simulator calendar, full frame mapping, interpolation or platform qualification follows. See the [game guide](../prototypes/canonical-defense/README.md) for the exact scope. This gate remains optional for unrelated production releases.

### Laboratory regression contract

Changes to the optional balance laboratory retain independently expected positive cases and countercases for each enabled ability; catalogue disable, removal and representative replacement; action refusals and finite budget exhaustion; paired interactions; reproducible replay; and held-out contexts excluded from candidate selection. Demonstrate sensitivity to an intentionally incorrect action mapping or metric accounting. Observation retention and presentation must not determine business progress; reuse existing split-advance checks for unchanged simulation owners and test changed mappings at matching control boundaries. Select focused laboratory, native/emitted and affected consumer checks by the changed owner. Recheck game-absent independence when dependency edges change. Participant studies and live backend execution are separate from the offline foundation gate.

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

The optional game consumer uses `node scripts/run-game-consumer.mjs`: a finite
380-second overall budget, clang capped at 120 seconds, JS emission at 30
seconds, and full native/JS execution at 180 seconds each within that budget.
Diagnostic performance probes remain at most 10 seconds. Explicit
`HAPSLAND_GAME_NATIVE_RESUME_RECEIPT` or `HAPSLAND_GAME_OUTPUT_RESUME_RECEIPT`
reuse validates the exact source/tool/artifact identity and retains actual
preparation origin; defaults do not silently reuse artifacts. See the
[completed investigation](../prototypes/canonical-defense/README.md#completed-performance-investigation).

Native Bend and emitted JavaScript must agree on their complete encoded output.
At the public API boundary, compare independently expected contract facts rather
than requiring identical private bookkeeping. A native wrapper has no implied
public field: ground its relevant identity in actual public inputs or owner state,
and remove unsupported internal-shape assertions instead of inventing context.

### Stop-family observation owner

The agreed Stop fixture projection is the finite-domain `BusinessState` containing
`Canonical.State` and the relevant `StopScenario.Finish` records. Its
implementation captures ordered input event and categorized output facts from actual transitions,
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
C60/clang90/native5/JS15+5 with a 190-second aggregate watchdog.

`packages/monkey-business/src/writer-native.test.ts` compares all thirteen
original cases through the single `writer-original-scenarios.bend` fixture and
`writer_scenarios` vector.
one compilation per backend retains every original case and independent
public/replay expectation. Its full comparison uses C90/clang120/native15/JS30+5
with a 275-second aggregate watchdog. These allowances establish no pass by
themselves and do not change product deadlines.

The optional game consumer command is
`node scripts/run-game-consumer.mjs`.
The maintained supervisor enforces one 380-second deadline and process-group
cleanup. C compilation consumes the remaining check budget; clang120/JS30 and
native/JavaScript execution15 bounds are also capped by that remaining time.
There is no separate early C-phase cutoff. The inner verifier requires the
supervised deadline for this mode.
Keep all four campaigns, 145 batches and 3,222 ticks. The five geometry/drawing
roots and candidate game proofs are separate from this shared consumer scope.

A Writer compiler failure can be resumed explicitly by setting
`HAPSLAND_WRITER_NATIVE_RESUME_RECEIPT` to its retained `receipt.json`. The runner
requires the same fixture and current source/tool identity, successful recorded
phases, and unchanged C/binary hashes. Invalid receipts fail before spawning;
ordinary checks remain fresh. Report resumed phases separately from fresh ones.

Do not repeat an unchanged failed check. The next run must test a concrete repair,
a competing cause, or an explicitly declared budget amendment. Reuse a
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

The runner supplies a finite deadline: five minutes for focused checks and
25 minutes for full checks, including nested coverage commands. Override it
explicitly with `--timeout-ms=<milliseconds>` when the declared check needs a
different budget; nested commands cannot extend the parent deadline. Stage logs
retain preparation, build, proof, test and analysis outcomes separately.
This runner borrows the finite-work and retained-evidence approach from
[Dalph development guidance](https://github.com/dearlordylord/dalph/blob/master/docs/development/workflow.md#keeping-implementation-work-finite).
When selected, the full Hapsland gate still requires strict fresh coverage.

Full runs prepare one fresh production archive before installed tests. The
[archive preparation](../scripts/test-harness/prepare-archive.mjs) records source
and archive digests and rejects verification-input changes during preparation;
the input scope is maintained in [source identity](../scripts/test-harness/source-identity.mjs): source, scripts, workspace
packages, native/build assets, schemas, vendored dependencies, evidence and test fixtures;
root build/test manifests and configuration; and paths shipped by `package.json`
`files`. New, dirty and deleted files inside that scope remain inputs. Freeze
these inputs during preparation and full runs; write new diagnostic evidence
outside the checkout until the run is terminal. Unrelated
research/specification documents (including `quint-specs/quint.lock`) do not
invalidate a run. Full and profile runs observe the same per-path input identities
before each child stage, during long stages, and freshly at finish. Observations within a run do not overlap; unchanged regular-file metadata permits
hash reuse. Each input tree uses up to eight workers. Incremental and final scans
have a 30-second deadline capped by the run deadline; baseline uses the run deadline.
Background polls pause at least one second and adapt toward 10% duty. Symlink
targets and submodule contents remain inputs.
A changed path aborts the active process group and blocks subsequent stages;
completed results and changed-path failure evidence remain in the run record.
The exclusive lock remains held while process groups are still present.
Update the scope when a new build/test input root is adopted. The same
archive supplies all installed fixtures. This is reuse within one run, not a
cross-candidate build cache. Focused installed diagnostics may explicitly supply
`HAPSLAND_TEST_PACKAGE_ARCHIVE`; name its provenance and do not treat an older
archive as evidence for changed production code.

After moving implementation owners or changing fixture contracts, first run the
affected boundary fixtures against their current package exports and physical
source paths. Process fixtures supply their own user configuration and credential
home where personal state is outside the scenario; registration and dispatch use
the same configuration selector. Keep tests of intentional precedence explicit.
Installed focused checks supply the reviewed archive above rather than rebuilding
inside an instrumented child. A passing build does not establish these assertions.
Resident installed canaries launch the extracted native command through the existing
startup test port in both Node and independent Bun clients. Stale-probe timing
starts after the child import handshake; readiness and IPC deadlines stay unchanged.
Positive Pi finding assertions observe the actual classified batch through the
configured resident before collection. A source recovery regression delays the
reviewer beyond the finish window, then requires fresh advice after readiness;
product callback deadlines stay unchanged. Queue idleness alone does not prove
classification or delivery readiness.

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
transport and packaging assurance. Singleton convergence uses six requests
across three client processes. Deterministic resident tests own stale handoff and
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
Claude CLI delivery runs against the installed hook and an explicitly selected
standalone candidate. It does not duplicate these timed subprocess cases through
a coverage-instrumented source entry: #243 requires the installed Bun boundary;
authored routing and source/emitted isolation remain covered by hook program
fixtures, source policy checks and ordinary build acceptance.

`npm run quality:check -- --ack-checks-policy` regenerates coverage through
`npm run test:coverage`, which includes the existing boundary checks and tests.
The tool removes the previous JSON artifact before running that command and
stops if tests fail, so stale coverage cannot produce a passing CI result.
For machine-readable gate feedback after the run, use
`npm run --silent test:status -- --json > crap-report.json`. The retained record
contains every stage exit and log path plus all Vitest failures; CRAP analysis
diagnostics and affected rows are retained in `.test-runs/<run-id>/quality-report.json`
and the GitHub Actions summary. CI retains diagnostics for **3 days**; do not
commit them under `evidence/`. The wrapper records a valid, fully measured tool
exit **2** as a threshold warning and succeeds;
exit **1** means invalid inputs, missing coverage, analysis failure, or a failed
coverage command. Coverage reports and `crap-report.json` stay ignored.
Coverage is also written on test failures for diagnosis, but the gate stops
on the failed command and does not analyze it as a successful run.
Review high-scoring functions for missing behavior tests or unnecessary coupling.
A score alone does not mandate a refactor. Strict missing-evidence handling stays
enabled; advisory scores do not turn invalid coverage into a successful analysis. The source selection in `crap4ts.json`
includes `src`, the extracted production TypeScript owner source directories,
and moved helpers in `scripts/test-support`. Other auxiliary packages and
JavaScript/Bend sources remain outside that selection. Review this policy when
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

## Codex hook trust in automated tests

For automation that has already vetted every enabled hook source:

```sh
codex exec --ephemeral --json --dangerously-bypass-hook-trust \
  -C /absolute/disposable-repo - < /absolute/test-prompt.txt
```

The flag bypasses hook trust for one invocation without enabling disabled hooks
or changing persisted trust. Such runs do not validate ordinary native trust.
Tool approvals and sandboxing are separate from hook trust; their bypass flag
is `--dangerously-bypass-approvals-and-sandbox`.
Source: installed `codex exec --help`, Codex CLI.

## Native scenario matrix

| Scenario | Reviewer | Agent action and observable assertion | Run command suffix |
| --- | --- | --- | --- |
| Installed inspection exclusions | Controlled offline | One real Codex session creates supported TypeScript and unsupported `.mjs`; installed hooks retain distinct selection outcomes; excluded source is absent from public HTTP/SSE and rendered details, including reload/replay | `--host=codex --language=typescript --scenario=inspection-exclusions --archive=PATH` |
| Unicode Update adoption | Controlled offline or real Jev | Real Codex/Claude edits ASCII in an existing TypeScript file with unchanged Japanese comments; review and repair are observed, both comments survive every edit | `--language=typescript --scenario=adoption --unicode-update` |
| Advice adoption | Controlled offline or real Jev | Agent makes an edit; review receives cross-file evidence; actionable advice is delivered; agent repairs; compiler and independent invalid-construction checks pass; follow-up result appears | `--scenario=adoption` or `--scenario=adoption --live --execute-paid` |
| Reviewer unavailable | Controlled offline error | Real agent makes one edit; review is attempted and becomes unavailable; no actionable advice is delivered and the agent leaves the draft alone | `--scenario=reviewer-unavailable` |
| Edit hook crashes | Native hook exits with failure | Real agent makes one edit; the fault is observed; no review request or invented advice follows | `--scenario=hook-crash` |
| Edit hook exceeds its deadline | Native hook sleeps beyond its configured timeout | Real agent makes one edit; the hook start is observed, it does not finish naturally, and no review request or invented advice follows | `--scenario=hook-timeout` |
| Older finding after a newer edit | Controlled delayed reviewer | Real agent makes two edits without acting on advice; the old finding and newer clear both complete, but the old finding is not delivered after the newer edit | `--scenario=stale-result` |

The [#211 Unicode Update observation](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-languages/codex-typescript-adoption-unicode-update-controlled-offline-1791039023270.json)
used Codex CLI and a controlled offline reviewer. Both edits preserved
the Japanese comments; the first Update reached review, advice was applied,
and follow-up review was observed. All 15 runner checks passed with zero Jev
requests. This is source-checkout evidence with declared trust/sandbox bypasses,
not installed-package or ordinary interactive trust validation.

Run `node scripts/run-native-negative-matrix.mjs` to exercise all 24 negative cells in one finite batch. Negative scenarios use the controlled offline reviewer and make **zero Jev requests**. The runner records hook event order, source-free request shape, outcome identity hashes, compiler status, and the exact checks used for its verdict. A native run is an observed case, not a frequency estimate or proof of every interleaving. The [negative scenario index](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-negative/index.json) records the six cells per scenario and any incomplete attempts.

The 2026-10-01 run has 24 selected demonstrated cells and zero Jev requests. Its first batch passed 23 of 24 cells. In the remaining Claude TypeScript case the first result finished before the second edit, so that attempt could not test a stale result. A separately declared 13-second controlled delay produced the intended order and passed. Both records remain linked in the index. The stale case allows the older review result to remain accounted for internally; it asserts that the old finding does not reach the agent after the newer edit and clear result.

## Why older scripts remain

| Historical or separate runner | Relationship to this matrix |
| --- | --- |
| [`run-native-codex-136.mjs`](../scripts/run-native-codex-136.mjs), [`run-native-claude-136.mjs`](../scripts/run-native-claude-136.mjs) | Preserve the declared #136 experiments and their original fixtures. New source-checkout agent and language checks use `run-native-crossfile-current.mjs`. |
| [`run-rust-native-codex.mjs`](../scripts/run-rust-native-codex.mjs) | Preserve the initial Rust adoption record. The common runner owns TypeScript/Rust/Bend cross-file scenarios. |
| [`run-direct-event-live-milestone.mjs`](../scripts/run-direct-event-live-milestone.mjs), [`run-first-review-live-milestone.mjs`](../scripts/run-first-review-live-milestone.mjs) | Retain separately declared direct-event and first-review milestones. They validate different package or initial-review boundaries and do not replace the current three-language source-checkout matrix. |
| [`run-clean-package-conformance.mjs`](../scripts/run-clean-package-conformance.mjs), [`run-setup-package-conformance.mjs`](../scripts/run-setup-package-conformance.mjs) | Current package gates. They are not duplicates of source-checkout native sessions. |

Avoid adding a new per-language native runner for the same source-checkout adoption or failure scenario. Extend the common fixture table and this matrix instead. Historical records remain immutable evidence; their scripts can be retired only after inbound links and reproduction requirements are resolved.

The original four twelve-cycle Jev recovery fixture explicitly gives its emitted
JavaScript process a 4 MiB V8 stack for recursive generated functions. The
runner validates a maximum of 4 MiB; other callers keep Node defaults. This
does not extend the five-second execution limit or reduce the original inputs.
