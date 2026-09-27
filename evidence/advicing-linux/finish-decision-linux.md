# Shared resident finish-decision validation

Issue #105 remains **incomplete for adoption and closure**. The shared-resident
implementation now waits for all admitted unfinished work or the safe hook
deadline, then batches advice and cancels unfinished pre-decision work. The owner accepted the timing diagrams in the implementation conversation on
2026-09-27. An explicit final Linux adoption decision remains required. This report is evidence, not a change to the
[Advicing target contract](../../docs/advicing-target-contract.md).

## Implementation and regressions

`59b1575` adds the resident finish decision and a cancellation cohort inside each
virtual round. A block rotates the work cohort, retaining completed advice and
the round's continuation count. Queued and running preparation/review work is
discarded or interrupted; its captured cohort fences late callbacks. An allow
closes the whole round. Both installed runtime hooks use the same protocol.
The fifth finish attempt can allow immediately after four reservations.

Review corrections in `e72e3bc` reserve the selected advice identities together
with the continuation and output permit, reject expired or replayed finish
permits, and preserve a pending IPC response if the last review completes
before handoff. `5adf62a` expires abandoned operational-notice leases before the
finish-wait decision. These fixes have focused regressions. The standards
review's duplicated cleanup was consolidated into one job-discard operation.

The hook reserves 4.2 seconds inside its five-second native timeout. Its
safe decision deadline is 750 ms before that internal deadline, leaving time
for final revalidation, output authorization, and writing. A ready decision is
observed by polling with sleeps capped at 50 ms, plus IPC and scheduling overhead;
no clock or native scheduling guarantee
is inferred from the sidecar. Background waits remain independently bounded.

## Evidence and scope

| Requirement | Evidence / disposition |
| --- | --- |
| All-work finish wait and batch | Focused resident regression: completed advice stays pending while another admitted edit is unfinished; both findings enter the final batch. Real CLI/IPC contract harness adds the two-item case for both adapter identities. |
| Deadline block cancellation | Focused regression and contract harness: ready advice can block while running and queued pre-decision work is discarded; no late finding appears; fresh repair work keeps the same virtual round and count. |
| Allow cleanup, unavailable, stale, batching | Controlled resident contracts exercise the real Stop CLI and IPC; closure releases retained source, advice, caches, current work, and leases. Unavailable stays distinct from clear. |
| Background ownership, reoffer, lost collector | Tests and contracts cover waiting for live leases, one reoffer, lost background acknowledgement, abandoned finish reservation, expired output permit, and single-use authorization. |
| Four continuations / fresh round | Contract harness drives four repair continuations, fifth-attempt allow, and a fresh round with a renewed budget. Resident restart resets the count by the accepted contract. |
| Native before → after repair | [Initial matched record](linux-finish-decision-matched-initial.json): Codex ran before Claude on Linux arm64 / Node 24.20.0, Codex 0.155.1 and Claude 2.1.218. Both baselines completed review without finding submission or repair. Both candidate runs submitted Stop advice, made a repair edit, passed the repaired-file check, and completed a clear follow-up. |
| Native timing | The matched record includes ptrace child-creation-to-exit command windows. Selected measurements, with tracing overhead, do not establish a latency distribution. |
| Routing and accepted unknowns | Existing [native isolation](native-isolation-linux.md), [background timing](native-background-timing-linux.md), and [Claude rerun](claude-reset-rerun-linux.md) retain their precise scopes. Native Codex child routing and the actionable Claude foreground-tool window remain unproven under the owner's conditionally accepted boundary. No new observation is inferred from unit tests. |
| Single installed behavior | Both installers still register composed PreToolUse, edit/background, Stop/SubagentStop, and prompt hooks. There is no installed legacy/composed selector. Legacy collection remains available only for baseline probes. |
| Diagram condition | The independent Foldkit package builds and its top jump link opens the rendered bottom timing section without browser errors. Required/exploratory, observed/unproven, unknown receipt time, timeout, and partial reducer labels remain explicit. Native timing panels retain their original evidence provenance. Owner timing acceptance was recorded in the implementation conversation on 2026-09-27. |
| macOS follow-up | `.github/workflows/issue-105-macos-followup.yml` is present on the branch, scoped to #105 closure, finds its marker before creating a follow-up, cross-links it, and reopens #105 on failure. It must be available on the default branch and its creation/link verified at authorized closure. No macOS result is claimed. |

The controlled harness uses the production resident, local IPC, and real hook
subprocesses with an offline Effect DecisionModel. Its events and repairs are
fixtures. The native cases launch the exact agent binaries; their repair edits
and resulting files are separately observed. Neither a completed output write
nor a reducer path proves receipt timing or universal model visibility. The
matched native cases deliberately delay the background hook and establish the
Stop path; prior background observations are a separate evidence class.

## Retained native attempts

The [initial matched run](linux-finish-decision-matched-initial.json) at
`e72e3bc` passed both hosts before the later notice-lease correction. A
[second six-case run](linux-finish-decision-native-misses.json) at `38ce4b7`
retains both successes and misses: Codex before/after and background repair
cleared; Claude's baseline completed without handoff, its Stop case repaired
but the clear follow-up was cancelled before completion, and its background
case submitted output plus Stop reoffer without a repair. All processes exited
successfully; that does not make the missed outcomes passing.

The [bounded Claude retry](linux-finish-decision-claude-rerun.json) repaired in
both cases. Its finish-only clear follow-up again missed the deadline; the
background case submitted through the background hook, reoffered at Stop,
then repaired and cleared. The latter cannot identify whether the background
write or Stop reoffer prompted the repair. These are selected attempts, not a
population success rate, and the two finish-only misses remain nonpassing.

A [declared follow-up-opportunity pair](linux-finish-decision-claude-repair-read.json)
then passed for Claude. Both phases use the same prompt, which requests one
native README read after a requested repair. The baseline made only its initial
Write, completed review without handoff, and kept the defect. The candidate
made Write → Edit → Read, received Stop advice, passed the repaired-file check,
and completed a clear follow-up. It adds no mapped edit after repair and changes
no production deadline. This passing case establishes that selected opportunity;
it does not turn the two finish-only misses into successes. Backend delays in
these fixtures retain the existing host/phase configuration (Claude baseline
6 seconds, candidate 5 seconds; background scenarios 1.2 seconds). They are
controlled delivery examples, not a latency-controlled performance comparison.

For the final production source (`5adf62a`), Codex's matching before/after and
background cases passed in the six-case record; Claude's matching before/after
passed with the declared native read, and background submission followed by
Stop reoffer passed in the bounded retry. All use fresh residents, an offline
Effect backend, Linux arm64 / Node 24.20.0, Codex 0.155.1 or Claude 2.1.218.
The source was unchanged by the later timing/probe-only commits.

## Verification

- Full offline suite on `5adf62a`: **542 passed, 2 skipped** (64 test files passed,
  one skipped). Configuration generation check passed.
- Root production build passed. The direct-event manifest verifier passed:
  12 groups, 39 obligations, 95 unique mapped checks, four retained evidence
  records. The full suite includes its mapped test files.
- `conformance:installed-release` stopped before replay: its pinned historical
  assembled commit `f2f47e94cd2d90cf73062f07c5e61416218e2f13` is not an ancestor
  of this branch. Fetching the exact commit confirmed that it is also not an
  ancestor of the starting revision `d81beca`. The historical manifest was
  preserved; this run does not establish installed-release conformance.
- `conformance:setup-package` passed all seven packaged setup journeys with
  zero provider calls. The separate clean-package credential-fixture run stopped
  after pack/install because its runner expects `docs/npm-quickstart.md` in the
  archive. That publishing guide is absent from the starting revision as well;
  #87 owns the later publishing work. No clean-package pass is claimed.
- [Refreshed resident contracts](linux-finish-decision-contract.json) on
  `5adf62a`: **18/18 passed**, nine cases per adapter identity, including both
  new all-work/deadline-block cases. These are fixture-driven, not native repairs.
- Foldkit build passed: TypeScript, nine guided projections, eight timing
  companions, and Vite. Chromium rendering and top jump navigation passed
  without page errors.
- The macOS workflow's script was exercised with an in-memory GitHub API:
  an injected link failure reopened #105, and two retries produced one follow-up
  and one backlink. This does not prove actual GitHub workflow execution; the
  real closure creation/link check remains required.

## Standards

Independent standards review: zero remaining documented violations or smell
findings after extracting the duplicate discard logic.

## Spec

Independent implementation review: zero remaining findings after correcting
reservation identity, expired output authorization, and expired notice leases.
This review does not establish native acceptance or owner adoption.

## Remaining decision

The owner accepted the timing diagrams. Final Linux adoption remains a separate
decision after review of the evidence limitations. Implementation approval is not inferred
from the earlier conditional boundary decision. Keep #105 open and PR #108 draft
until that decision and the closure prerequisites are satisfied. Installed
release declarations and publishing work remain separate from this candidate.

## Agent-response policy decision

On 2026-09-27, the owner clarified that acting on review advice is the agent's
decision under its instructions. Users may instruct an agent to ignore reviews;
Hapsland does not enforce compliance. Native repair probes should explicitly
instruct the agent to act on received findings. This decision is recorded in
the [target contract](../../docs/advicing-target-contract.md#agent-response-is-controlled-by-its-instructions)
and the user-facing README.

Earlier records used a task-level conditional repair request. They retain their
original outcomes and do not establish why an agent did not repair. The updated
matched harness additionally supplies the same explicit compliance policy in
both phases: fixture `AGENTS.md` for Codex and an appended system prompt for
Claude. Each new case records the policy and mechanism. This is a test condition,
not a new installed product policy. Agent compliance is distinct from the
remaining delivery-visibility and follow-up-review timing questions.
