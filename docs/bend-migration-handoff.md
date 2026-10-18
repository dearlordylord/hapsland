# Bend migration continuation

**Purpose:** Resume the whole-unit migration after the owner-requested pause.
**Audience:** Contributors, including coding agents resuming implementation.
**Status:** Paused at the verified AdmissionScope milestone on 2026-10-18.
**Authority:** Implementation and validation evidence. The owner instructions and named product contracts remain authoritative. This note does not accept Admission.
**Expected use:** Read with `bend-migration.md`, `agents/navigation.md`, `source-organization.md`, `testing-matrix.md`, and `../CHECKS.md` before resuming.
**Lifecycle:** Delete this handoff when whole Admission is accepted. Consolidate current decisions and acceptance evidence into `bend-migration.md`, and update the linked GitHub task before deletion. Git retains the chronology.

Current task: [#281](https://github.com/dearlordylord/hapsland/issues/281). The owner requested this pause.

## Checkout and milestone

Worktree: `/workspace/typescript/hapsland-bend-abi-2037`.
Branch: `migration/bend-abi-2037` on `dearlordylord/hapsland`.
Runtime candidate: `6c80960df4ef0c996fd7a3dc2ed8f0139b1008d6`.
Latest evidence checkpoint before this handoff: `6546dc928c5603724b76c7a9b6f89cdb5fb7dedb`.
The primary `/workspace/typescript/jev` has independent changes. Do not copy over or reset them.
All retained migration sources are ordinary tracked files. No source recovery from evidence, prototypes, snapshots, or `.txt` copies.

Three whole units are accepted: Preparation, Collection through final handoff, and Evaluation through retained advice. Their boundaries and evidence are in `bend-migration.md`.
Admission is **not accepted**. Its native atomic publication is connected to production, but its routing and retry orchestration remains TypeScript. The new AdmissionScope is compiled and tested but is not yet connected to that workflow.

## Implemented Admission foundation

`packages/resident-runtime/src/resident/state/resident/admission.ts` atomically publishes permit consumption, Canonical observation, native round pin, and exact dispatch job. Queue refusal discards speculative successful admission and retires the registered permit on the original records. The caller releases its reservation. Existing rounds remain unchanged.

Capacity publication copies only capacity-owned fields, then assigns Canonical last. Never copy `resolverCustody` from a speculative draft: the Canonical setter reconciles it under its own owner.

`state/dispatch-records.ts` is the single dispatch record interpreter. `Dispatcher.startCommitted()` wakes retained work. The caller-defect fixture establishes recoverability through an explicit wake, not autonomous progress after a failed response.

`packages/agent-flow-bend/preparation-lifecycle/CanonicalResolverOwner.bend` now contains a pre-round `AdmissionScope` issued with its own invocation. It uses existing install, provider, generation, lease, cancellation, and terminal handling. Generic root and nested launch cannot manufacture it.

Permissions are `AdmissionUnreserved`, `AdmissionHeld{receipt, partition, lifetime, charge}`, and `AdmissionTransferred{receipt, partition, lifetime, round, observation, charge}`. Held forbids terminal. Transfer requires actual AwaitingSourceRead work and a matching queued or running dispatcher entry. Transferred receipts are replay tombstones, not resource ownership.

Receipt identity is essential. `clear()` resets numeric charge IDs. Treating historical IDs as custody identities blocked new reservations and stranded old cleanup. Both defects were reproduced before correction. Release and cleanup acknowledge the exact receipt; numeric charge absence is insufficient. Cancelled cleanup requires the matching generation and no retained provider lease. Actual provider completion clears the lease. Native pointer identity and physical drain are boundary obligations, not derived by Bend.

The authored ABI is `packages/agent-flow-bend/abi/canonical-resolver-owner.generated.d.ts`. Existing Delivery and Evaluation proofs gained AdmissionScope cases without changing their laws. No new Admission laws have been proved or approved.

## Remaining obstacles and next implementation

1. Connect closed native receipt custody to AdmissionScope. Allocate the receipt inside the binding, never from workflow input. Keep the exact reservation object by invocation. Reserve and hold must commit together. Publication and transfer must commit together after the dispatch record contains the exact job and reservation. Reject substituted or replayed receipts. Release only if the retained reservation object is still the original; if clear replaced it, acknowledge the original as gone and preserve the replacement. Delete the original binding only after publication succeeds. Cancelled cleanup waits for actual provider drain. Transferred cleanup drains committed starts without releasing the transferred reservation.
2. Implement the complete Admission machine and connect it through the existing common driver and session registry. Bend owns source-root order, first eligible selection, pinned-root routing, retries and exclusion, settings precedence, refusal and activity order, inspection membership, and the final result. Preserve the serialized uninterruptible entry. Do not manufacture observation or Preparing work to obtain authority. Remove replaced TypeScript algorithms and orchestration in the same integration wave.
3. Draft and falsify three whole obligations, obtain owner approval before proving them, then prove and qualify the whole consumer. The obligations cover complete initial/resume correspondence, exact Canonical lifecycle and resource transfer at actual publication. Native IO, pointer identity, and original Cause remain explicit host obligations. No ladder of helper laws is needed.

Astra agreed this route. Last structural review was `/root/astra_evaluation_path`; reuse it only for significant architecture questions. Its receipt correction and physical-drain finding are incorporated above. Do not call Astra for trivial transport or file changes.

## Source owners and consumers

The remaining production workflow is `packages/resident-runtime/src/resident/review-work/admission.ts`. Preserve exported round snapshot, pinned activity, and token pruning helpers under their appropriate owners when deleting orchestration.

Native target projection is `packages/native-observation/src/direct-event/target-observation.ts`. Admission root selection must move to Bend. Source-bearing patch projection and native path conversion require an explicit engine boundary. The hook and inspection observer also consume these selectors; do not silently delete their paths.

Existing composition is in `resident/composition/resources.ts`, `workflows.ts`, `review-work/composition/preparation-binding.ts`, the shared `owned-machine.mjs`, and the common Canonical child driver. The protected mutation owner is `state/resolver-custody/resident-owner-transaction.mjs`; `providerTransaction` installs the active provider authority on native commits.

Real acceptance consumers include root-routing, capacity, dispatch, edit-settings, inspection, security, server, local collection, IPC delivery, and preparation protocol. Preserve immutable registered settings, exact origin, no rejected-edit pin, first eligible root, stale-root retry, no other-root source capture, and post-publication ownership.

## Executed evidence at this milestone

- Workspace build: 46/46. Compiler receipts: 23. Production authority and Canonical ABI checks passed.
- `check:fast` passed against base `dce0179e`, selecting two authored code files. Earlier atomic publication checkpoint selected seven. Do not qualify a zero-file hook.
- `preparation-sources`: 282/282, including both Admission test files. Bend closure: 510 files, 121 roots. Existing universal proof roots passed; expected proof mutants remained rejected.
- `preparation-protocol`: 31/31. Admission owner tests: six. Native admission publication tests: four.
- Atomic publication product consumers: 139 tests in five files passed. Earlier broader checkpoint: 336 tests in 19 files. These earlier results are not a claim that the unfinished whole Admission is accepted.
- Frozen candidate `6c80960d`, 2026-10-18 00:27 UTC: analyzer ratio 0.6790426828, build ratio 0.9155758391. Strict parity passed in both lanes. Each used 17 alternating pairs. All 34 builds succeeded with 23/46 cached tasks and matched warm preparation. HEAD, sources, artifacts, environment, and workspace resolutions stayed fixed. Shared CPU load varied; these ratios do not establish a causal speedup or whole Admission performance.
- Analyzer TS/Bend median seconds: 0.071518414 / 0.045686981. Ranges: [0.060302858, 0.112305435] / [0.038877213, 0.076880335]. Build medians: 4.795333797 / 4.320928433. Ranges: [3.207778049, 12.651700196] / [3.112479588, 10.520485368].

Local diagnostic logs are optional, not required source: `/tmp/hapsland-admission-scope-final-checks.log`, `/tmp/hapsland-admission-scope-protocol-tap.log`, `/tmp/hapsland-6c80-cadence-sequence.log`. Ignored measurement directories are `.test-runs/bend-migration/performance/2026-10-18T00-27-21.009675+00-00` and `2026-10-18T00-27-45.634191+00-00`. If the disk is lost, rerun from the tracked sources; do not reconstruct source from these logs.

## Resume commands and limits

Use the pinned producer environment, if still present, at `/tmp/hapsland-2037-sequence-environment.json`. Never print or source credential files. If that temporary file is gone, regenerate the declared producer environment through `scripts/bend-producer.mjs` and the checked package toolchain configuration. Do not guess compiler settings. The baseline build environment was `/tmp/hapsland-2530-baseline-build-environment.json`.

Run the normal workspace builder before fixtures loading private dist outputs. Wait for its actual exit before running dependent tests. Build limit: 210 seconds. `check:fast`: 240 seconds. Protocol: 240 seconds. Source gate: 620 seconds. Each Bend check or emission: ten seconds, except the owner-approved attachment transaction proof at twenty seconds. Do not use `bend check`; the pinned checker accepts the file and `--verdict`.

Commands from this worktree:

```sh
node scripts/build-workspaces.mjs
HAPSLAND_LINT_BASE=dce0179e npm run check:fast
node scripts/run-bend-capability-check.mjs --suite=preparation-sources
node scripts/run-bend-capability-check.mjs --suite=preparation-protocol
node scripts/check-compiler-receipts.mjs
node scripts/check-production-authority.mjs
node scripts/check-canonical-authority.mjs
```

Supply the declared producer environment through the existing runner or subprocess environment. Keep heavy checks and measurements serialized. Before checks exceeding one minute, declare the goal-linked risk, selected evidence, duration, and deadline as required by CHECKS.md. GitHub CI is not an additional gate.

Measure analyzer and build again thirty minutes after active work resumes. Use `scripts/performance/production-cadence.py`, baseline `/workspace/typescript/hapsland-bend-baseline-master-8948343b`, and frozen inputs. Whole-unit performance uses its own public consumer and fixed TS baseline; the owner permits at most 3x slowdown while strict parity is reported separately.

After two diagnostic attempts without distinguishing evidence, change the hypothesis or return to implementation. Commit and push retained source and documentation at checkpoints, then verify the branch SHA on origin. `docs/bend-migration.md` has a 16,384-byte limit; consolidate rather than append history.

No migration process remained running when this pause was prepared. Resume from the receipt binding obstacle, not another status or planning pass.
