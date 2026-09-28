# Bend2 full-flow implementation report

**Purpose:** Record the pre-#116 generated-policy migration checkpoint and its bounded validation.
**Status:** Historical checkpoint predating the canonical #116 migration; statements below describe that checkpoint, not the latest integrated authority boundary.
**Authority:** Implementation or validation evidence.
**Expected use:** Supply historical boundary and evidence context for #117/#118 and the #137 final authority review.
**Lifecycle:** Temporary. Retain until the #137 final source-linked authority report replaces the useful content. At that gate, consolidate current boundary conclusions and relevant validation limitations into that report, transfer any accepted contract decision to its specification owner, update inbound links, and delete this snapshot. Commit and test chronology remains in Git history.

**Status (2026-09-27): complete for the chosen pure-policy boundary.** Generated
Bend2 code is the source of truth for Hapsland's material review-flow decisions.
TypeScript still owns agent-runtime I/O, source capture, clocks, identity
measurements, Jev Effect requests, persistence, and application of Bend
commands. This is a policy migration, not a translation of the entire resident
program or its mutable state into one Bend reducer. The branch is
[`feat/bend-full-flow`](https://github.com/dearlordylord/hapsland/tree/feat/bend-full-flow),
based on `master` and pushed through `b5e64af`. It contains 38 commits after
the branch point.

## The requested commit checkpoints

| Requested point | Commit and result |
| --- | --- |
| Finish Bend2 parity with the sidecar, **then commit and push** | [`83c330c`](https://github.com/dearlordylord/hapsland/commit/83c330c4dcc7b259bc761066c40b37338a7512bc) added `Flow.bend`, executable laws and proofs, generated JavaScript, and the differential sidecar runner. This was the first separate checkpoint. The final runner matches 113 sidecar traces with 5,048 accepted generated steps. |
| Design and implement the Hapsland extension, **then another commit** | [`ca85cf4`](https://github.com/dearlordylord/hapsland/commit/ca85cf487426243529badd2936cc658cb58bb36a) added the extension plan and the initial `Admission`, `Work`, `Handoff`, and `Lifecycle` Bend modules, their laws and proofs, and an executable lifecycle trace. This was the second separate checkpoint. The extension continued to gain coverage during production migration; this commit did not claim the entire resident was migrated. |
| Make Bend the production decision authority and test against the existing app | [`1641d1f`](https://github.com/dearlordylord/hapsland/commit/1641d1f617e436c61a8443f8d6567af970c868dc) began the generated-policy production path; [`d7c8406`](https://github.com/dearlordylord/hapsland/commit/d7c8406) integrated composed delivery; the remaining reviewed milestones closed admission, work, Stop, delivery, ticket, notice, credential, cleanup, and retention decisions. [`b5e64af`](https://github.com/dearlordylord/hapsland/commit/b5e64af816c60517719c853eaeef8709142bfc75) is the final credential-retirement milestone. |

Each migration milestone was reviewed by the requested Sol medium reviewer.
Findings were fixed and reviewed again before its commit. The final whole-flow
audit found no remaining concrete P1/P2 material Hapsland flow decision owned
by TypeScript.

## What the implementation delivers

- The sidecar-compatible `Flow.bend` remains an executable parity oracle for
  the events it models. The richer Bend modules cover pre-edit permits,
  observation fan-out, unfinished work and exact cancellation IDs, revision
  supersession, capacity, collection timing, finding selection, ticket
  outcomes, per-finding leases, notice and cache policy, submission, and
  virtual-round closure.
- Generated `Lifecycle` and `Round` decisions own the Stop wait, cutoff,
  continuation reservation, selected pending-unit checks, final output
  disposition, acknowledgement, provisional-write release, and abandoned-Stop
  closure. The resident applies their commands at native effect boundaries.
- Collection and the final IPC handoff recheck source-free currentness,
  credential, expiry, lease, and fitting facts through generated Bend gates.
  Main handoff adapters reject unknown tagged dispositions. Some generated
  Boolean results are consumed directly, so there is no universal runtime
  validation of every generated return value.
- Generated JavaScript is built from Bend source; separately maintained
  TypeScript declarations describe the wrapper API. App build and test
  commands verify source SHA-256 markers on runtime artifacts so stale
  generated JavaScript cannot silently replace the Bend policy.
- The existing Effect 4 `Decision` / `DecisionModel` path with
  `@effect/ai-typesafe` remains the only product Jev integration path. The
  compatible Effect packages are pinned to `4.0.0-rc.116`.

The [ownership plan](../packages/agent-flow-bend/EXTENSION-PLAN.md) records the
intended policy boundary, and the [validation record](bend-migration-validation.md)
lists the focused migration checks.

## Decisions and limitations to know

| Decision | Consequence |
| --- | --- |
| Compile Bend to checked JavaScript and call generated policy functions. | Production needs no Bend compiler or sidecar process. The generated artifacts are build outputs; Bend source is authoritative. |
| Keep TypeScript as the runtime adapter and state orchestrator. | `ResidentServer`, `ComposedDelivery`, and other classes remain. The aggregate Bend lifecycle has executable model events, but production uses its generated gates alongside retained native state. A single persisted Bend reducer instance was **not** substituted for the whole resident. [Issue #114](https://github.com/dearlordylord/hapsland/issues/114) separately investigates a functional resident architecture. |
| Use the sidecar as an oracle only for overlapping behavior. | The accepted [Advicing target contract](advicing-target-contract.md) and lifecycle safety rules take precedence where the sidecar omits permits, fan-out, final handoff, or closure behavior. Passing parity does not establish those extra behaviors by itself. |
| Keep source and secrets out of Bend state and retained evidence. | TypeScript supplies exact identity, elapsed-time, encoded-byte, credential-authority, and dispatcher facts; Bend decides what those facts permit. The live report stores only outcome categories and timing. |
| Rely on source-hash checks and Bend tests for generated Boolean wrappers. | Main tagged gates reject unexpected variants, but some Boolean wrappers are not separately type-checked at runtime. The report does not claim a universal fail-closed adapter contract. |
| Use explicit, bounded live Jev checks after the user identified the ignored primary-worktree `.env`. | The earlier offline pass intentionally did not read or source `.env`. This follow-up read only `TYPESAFE_API_KEY` for the declared live checks. The key was not copied into the feature worktree, printed, or committed. |
| Preserve the existing class-based runtime and defer a broad architecture rewrite. | This avoided combining policy migration with a large state-ownership refactor. It also means the result should not be described as the entire Hapsland program running in Bend. |

## Verification and what it establishes

| Check | Observed result |
| --- | --- |
| Bend 2.0.16 package `npm test` | All proof terms checked; generated lifecycle trace passed; sidecar states, decisions, and ordered changes matched 113 traces and 5,048 accepted generated steps. These are executable checks, not an exhaustive proof of every runtime effect. |
| Root typecheck, build, and final offline `npm test` | Passed on Node 24.20.0, Linux arm64: 65 files and 578 tests passed; one file and two tests skipped. |
| Clean local package conformance | Passed from an isolated install: CLI, parser, resident, hook, installation/update, and one controlled offline review. This does not exercise a real agent's response to advice. |
| Differential checks against `master` | 2,000 synthetic capacity operations and 1,000 finding-selection sets showed no differences in the compared behavior. |
| Bounded production live Jev milestone, 2026-09-27 12:50 UTC | One synthetic direct-event Add fixture sent its bounded source to Jev and completed a live evaluation. Source-free evidence classified the outcome as `completed-clear-no-advice`; verdict `passed`; elapsed 11,708 ms (5 s to under 15 s). The declared intended provider-call ceiling was one, with zero automatic retries. The runner has no provider-boundary counter, so the **actual provider-call count is unknown**. No raw backend material was retained. |
| Direct Effect `DecisionModel` live contract | Both tests passed: a representative Noul probability and the full configured Noul key set in one `decide` operation. This validates the configured Jev integration for those fixtures, not agent repair. |

Two intermediate full-suite attempts had isolated process-boundary fixture
failures: two Codex installation cases in one run and one security-wire case in
another. The affected cases passed on focused reruns; the security-wire process
witness also passed 12 direct replays. The final complete suite passed. The
intermittent failures were not root-caused in this migration.

**Still untested:** an authenticated real Codex or Claude agent receiving and
acting on Hapsland advice, a subsequent repair and clear review, macOS package
behavior, and exact Jev provider-attempt accounting. Those outcomes must not
be inferred from a successful Jev evaluation, hook output, or offline package
conformance. The feature branch has been pushed; it has not been merged or
published as a release.
