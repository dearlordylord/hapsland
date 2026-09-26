# Issue #105: reusable composed delivery contract and adoption decision

Status: **candidate round implementation and renewed Linux outcome checks passed;
#105 remains open for native scheduling, timing, Codex child routing, and adoption gates**.
The candidate branch implements round ownership in `b36b879`; it has not been
adopted on the production default branch. After the Codex edit-hook correction `bc50725`, three consecutive matched Linux
before/after runs and a separate native background run are recorded below.
The earlier-candidate descriptions in this document explain the replaced behavior;
the normative sections define the accepted contract. A passing selected fixture
is not a reliability estimate or proof of the whole contract.

## Required product outcome

The revised [issue #105](https://github.com/dearlordylord/hapsland/issues/105)
requires matched, headless Linux before/after observations. In the **before**
case, an attributable edit produces an actionable review finding, but the
current delivery policy gives the agent no suggestion before it finishes; the
defect remains. In the **after** case, a bounded host response carries the
current suggestion to that advicee, a later model action follows it, the file
is repaired, and a subsequent review is clear. Review completion, host
submission, model action, and final file state are separate observations.
Run this gate first with Codex, then with Claude Code on Linux. Both after
cases must use background delivery composed with bounded Stop collection
through the same reusable resident module. Existing Claude block-only evidence
does not pass this gate. macOS manual testing
with real installed Codex and Claude Code belongs to a follow-up issue created
when #105 closes.

## Host-neutral implementation boundary

One resident delivery module owns review work, advice, bounded wait state,
advicee partitions, collection leases, submitted/uncertain handoff state,
freshness checks, batching, failure outcomes, expiry, and Stop continuation
allowances. Codex and Claude Code adapters map native hook inputs and outputs
to that module. They may have host-specific registration and lifecycle rules,
but cannot create separate review queues or duplicate the delivery state
machine. Shared contract tests must exercise both adapters against one module.

The current [Claude hook reference](https://code.claude.com/docs/en/hooks)
documents async command hooks and Stop feedback. It says async output is
delivered on a later conversation turn and pending async hooks are cancelled
at headless `-p` teardown. Those are documentation claims; #105 must measure
the exact installed Claude Code 2.1.218 behavior and its composition with
Stop before adopting this path.

## Authority and identity

The production resident is the sole owner of admitted review work, completed results,
pending advice, collection leases, operational notices, and expiry. Each host edit
adapter admits one attributed direct observation through `PostToolUse`. The legacy
edit path may also collect previously ready advice. The candidate edit path returns
after admission so that background and Stop own its collection. A native `async: true` background `PostToolUse` command and a
synchronous `Stop` command are **delivery triggers only**. Neither may maintain a
second review queue, reconstruct a review from the filesystem, or call Jev to obtain
delivery output. All three collectors call the same resident collection operation.

The partition key is the tuple `(canonical physical working root, agent runtime,
exact supported host version, session_id, supplied agent_id or null)`. It is created
from the attributed edit and must be supplied unchanged by each collector. `turn_id`
and `tool_use_id` identify events and continuation attempts; they do not replace the
advicee partition. Do not infer a missing agent from the latest caller, root
co-location, or a checkpoint. A direct edit with a supplied child `agent_id` remains
child-owned. A shared-root checkpoint change with unknown origin has no advicee and
cannot yield addressed advice. Isolated worktrees have distinct canonical roots.

The agent runtime is adapter metadata in that key; it does not represent a parent
agent that owns child advice. A parent and its child use different keys when the
host supplies the child's `agent_id`. Independent tabs use different sessions.
The resident does not model a parent-child tree. The earlier child delivery gap
was at the hook boundary: `SubagentStop` was not registered or accepted, so a
child-owned finding could not be collected at that child's Stop.

Native Codex and Claude hooks call the child identifier `agent_id` because each
child is an agent from the host's point of view. Hapsland maps that field to
`subagentId` at the adapter boundary: from the product's broader view it
distinguishes a child from the main agent within one host session. `null` means
the host supplied no child identity for that event. The complete advicee key
is **not** a `subagentId`; it also includes root, host/version, and session.
The shared review and delivery lifecycle treats every resolved advicee as one
agent. The host adapter identifies that agent and interprets host events that
grant or restore its permission to request work at Stop.

The earlier candidate registered `SubagentStop` for both hosts and sends it through
the same composed Stop collector. A child with no `UserPromptSubmit` gets its
initial Stop allowance on its first background or Stop request. Later requests
do not restore an existing allowance. The record is held in memory and expires
after ten minutes; a restart also loses it. A later request can then create a
new initial record, even without evidence of a new child task. The candidate
did not define when a resumed child should receive another allowance.

Every collection checks root identity, advicee identity, enablement, credential
generation, source selection, current work revision, current snapshot, and advice age
at the final handoff barrier. A stale or unattributed result is suppressed. A transient
revalidation failure leaves its advice available until a later valid attempt or normal
expiry; it is never reported as clean. The current response limit of five findings and
2 KiB encoded host output applies to each trigger, in resident dispatch order. Advice
that does not fit remains resident-owned and eligible for later collection. A finding
that individually cannot fit must produce an explicit bounded limitation, not an
endless retry loop. Backend, credential, or capacity failure stays `unavailable` and
can yield a bounded operational notice; silence never means a clean review.

## Shared handoff protocol

The resident grants one tokenized lease per selected advice item. An overlapping
background, Stop, or subsequent-edit collector sees that item as unavailable while
the lease is held. Collection reserves first, revalidates before encoding, and
returns a bounded batch. The collector releases the lease on a known failure before
output. On successful stdout write callback it records **host submission** against
that token. An acknowledgement confirms only that the collector reported a completed
write; it does not prove Codex accepted the output, showed it to the model, or that
the model acted. Acknowledgement loss and uncertain writes retain an uncertain state.
Expired leases are recoverable, with revalidation before a new handoff. Resident
restart loses the in-memory work and cannot claim delivery success.

The candidate's composed `finalize` releases the delivery lease but retains the
advice. Its source-free submission record suppresses repeat delivery in the
current delivery generation. Background advice submitted before Stop begins or
while its wait is in progress can therefore be **submitted/visibility unknown**.
The priority Stop reoffer requirement is to offer that current advice once in
the same active Hapsland round when consumption is unproven, with a fresh
eligibility check and no new Jev evaluation. The earlier candidate did not implement
that fallback: it suppresses background submissions at Stop. Retention across
delivery generations can also reoffer submitted advice in a later round, which
was never the approved policy. Round closure must discard all live advice and
submission records owned by that round, whether submitted or not.
There is no exactly-once or guaranteed model-visibility claim. The legacy edit
collector remains outside candidate registration; any future candidate edit
collector must use this same protocol.

The observable stages are separate: `review completed` (resident/backend),
`resident collected` (lease issued), `host submitted` (write completed), and
`model visible` (independent host trace or a distinctive subsequent model action).
Collection and acknowledgement alone establish neither of the last two stages.

## Background command

The proposed registration adds a native async command for the same attributed
`PostToolUse` event that admits the edit. The candidate synchronous edit hook admits
the observation and returns promptly; the legacy edit hook retains ordinary
collection behavior. The background command waits for its
exact advicee's resident work, including the admission race, and emits at most one
bounded `additionalContext` response through the native async hook output channel.
It exits quietly when no eligible advice becomes ready. Only one background waiter
may be active per advicee; later triggers coalesce against that waiter. A waiter
holds no advice lease while waiting. It has a 20-second wall-clock cap from command
launch to exit and a corresponding host command timeout; the resident's existing
item and byte capacity limits remain authoritative. A canceled hook releases any
unsubmitted lease. The earlier candidate does not cancel resident-owned review
work at session end; the round-close cleanup direction above changes how work
from a completed round must be handled. Resident memory lifetime and the
ten-minute advice relevance expiry currently bound later collectability.

Async completion is only an output opportunity at a Codex safe point. It does not
interrupt an in-flight model request or tool call, and it does not start a new turn.
Output during the final model response or after turn/session end may have no model
advicee. Host submission and model visibility must be measured independently.

## Stop command and continuation

The candidate Stop policy starts its budget at native command launch. It first checks
the exact advicee and turn-chain continuation state, then collects ready advice.
If eligible work is still in flight, it polls that advicee's resident state at no
more than 50 ms intervals until a finding becomes available or the internal 4.2-second
deadline expires. The internal deadline includes startup, parsing, resident startup
if needed, IPC, collection, encoding, writing, and process exit; the native command
timeout is five seconds from launch. Any remaining budget is reserved for output and
exit. No stage may silently reset the clock. In the earlier candidate, expiry let Stop proceed and
left review work running in the resident. The accepted Hapsland round boundary
instead requires cancellation or discard when Hapsland allows Stop.

The earlier candidate tracks a Stop allowance separately for each advicee.
When an agent tries to finish, it can send advice and ask the agent to continue
once. Work done in response to that advice does not restore the candidate's
allowance. Another tool call, finding, or advice request does not restore it
either. The candidate returns quietly on native `stop_hook_active`; the accepted
four-request policy requires replacing that guard with a Hapsland round count.

For the main agent, a distinct `UserPromptSubmit` event restores the allowance.
Repeating the same prompt marker does not. A Codex Stop event can create an
initial allowance from its native turn ID if no record exists, but it cannot
restore an existing allowance. A subagent may receive no user prompt event. Its first
background or `SubagentStop` request creates an initial allowance only if no
record exists. Later requests leave that record as it is. The candidate does not
yet establish when a resumed subagent starts new work. Its in-memory record can
also expire or disappear on restart, so this rule alone does not give a durable
per-task cap.

When an agent has used its allowance, Stop cannot ask it to continue again
under that record. In the earlier candidate, new findings remained with the resident
for a later eligible opportunity. Under the accepted round-close rule, they must be discarded
when Hapsland allows Stop. Edits can still be reviewed, and background
advice can still be sent without a Stop allowance while the round remains active.
If Hapsland cannot establish an allowance, it does not block Stop.

The five-second ceiling and one-continuation cap are **selected candidate limits**
from #97's bounded fixtures, not established production defaults. They require both
exact-profile launch-to-exit measurements and race validation before adoption.

The owner accepted an initial hardcoded maximum of **four Hapsland Stop
continuation requests per Hapsland round** on 2026-09-26 after an Astra review.
This counts Hapsland's reserved requests, not Stop events or guaranteed runtime
resumptions. Reserve before writing the Stop response; an uncertain write uses
that reservation. Background output and repair edits do not use or reset the
counter. Native `stop_hook_active` does not by itself prohibit another request.
After four reservations, the next Stop allows completion without a wait for
advice Hapsland cannot present, closes the Hapsland round, and discards its
remaining work as incomplete. Other hooks and runtime limits may end work
sooner. The earlier candidate instead has a boolean, returns quietly on
`stop_hook_active`, and can lose or recreate its in-memory state after expiry
or restart. The round implementation in `b36b879` replaces this earlier one-request behavior.

A Stop request does not empty the resident by construction. It waits for at
most 4.2 seconds while review work can continue independently; Jev can finish
after Stop returns. One response has a limit of five findings and 2 KiB, so
other findings can remain pending. Composed delivery also retains advice after
a successful response and suppresses repeat delivery only for the current
delivery record. A later request can make still-current advice eligible again.
If the agent repairs a finding, that edit can create new review work. Review
completion, response submission, and agent action must remain separate
observations. The round-close cleanup direction below revises the candidate's
earlier late-collectability behavior; candidate `b36b879` implements round cleanup,
with the conformance limits listed below.

## Round-close cleanup direction

The owner accepted on 2026-09-26 that a **Hapsland round closes when Hapsland
finishes its Stop handling and allows completion**. This is Hapsland's own
boundary; it does not claim that every other runtime hook also allowed the
agent to finish. When Hapsland requests a Stop continuation, its round stays
active. A later fresh edit after another hook continues the agent can open a
new Hapsland round, even if the runtime reports the same `turn_id`. A repeated
Stop, duplicate edit, background poll, or late callback cannot reopen the old
round. At closure, Hapsland must discard or cancel all state from that round
that could start another review or deliver advice. A synchronous Stop hook may
wait for review work before returning; that wait does not itself continue the
agent.

The cleanup contract must cover every stage: pre-edit admission permits; admitted edit observations;
queued capture and review-unit jobs; running Jev evaluations and their late
results; captured artifacts and current-work references; pending advice and
operational notices; delivery leases; background waiters; submitted or
uncertain handoff records; and Stop continuation state. Closing a round must
fence late admissions and late completions before it cancels or releases
resources. No old callback may create new work or advice for that round.
Shared state needed by another round must remain owned by that other round.
Any dropped or cancelled review is **incomplete**, never clean. The source-free closure summary specified below records discarded counts and reasons.

Other Stop hooks can continue the agent after Hapsland allows completion. The
closure rule above intentionally needs only Hapsland's own Stop response, not
an unobservable all-hooks decision. Keep a source-free closed-round marker to
fence late callbacks; already written host output cannot be recalled. The
earlier resident had no Hapsland round identifier or round-scoped cancellation
path; `b36b879` introduces those mechanisms, subject to the remaining validation gates. A future implementation
must distinguish fresh attributed edits from delayed or duplicate events and
must preserve each round’s four-request limit across uncertain writes and expiry
while the resident process remains running. Each new Hapsland round gets its own four;
a resident restart resets the count by accepted product policy. The normative rules below resolve these specification gaps. They are requirements,
not claims that the candidate already enforces them.
The closure, fencing, and late-result rules are candidates for later formal
verification.

The required round-close properties are:

1. **No new work:** after round `r` closes, no edit or late preparation result
   from `r` can enqueue a capture job, review unit, or Jev request.
2. **No new advice:** no Jev result, retry, lease recovery, or background waiter
   from `r` can make advice deliverable after closure.
3. **Resource release:** queued jobs, running evaluations, network requests,
   leases, and waiters owned only by `r` are cancelled or released. A callback
   that finishes after cancellation is ignored for review and delivery.
4. **Isolation:** closing `r` does not cancel or discard another agent's round
   or a later round of the same agent.
5. **Truthful outcome:** dropped or interrupted review work is recorded as
   incomplete or discarded; it is never reported as a clear review.

## Normative round and recovery rules (2026-09-26)

This section resolves the remaining specification details. It takes precedence over
paragraphs above that describe the earlier candidate. The implementation evidence
must state which of these rules it enforces before Linux conformance resumes.

### Round identity and admission

The resident assigns an opaque round ID within the complete advicee partition.
Every admitted observation, queue entry, preparation result, review unit, Jev
request, advice item, lease, waiter, and output reservation carries that ID.
Native `turn_id` is runtime metadata; it neither creates a new Hapsland round nor
restores its continuation count. Prompts, background polls, Stop calls, and
subagent lifecycle notifications cannot reset an active round. A fresh attributed
edit stays in the current active round, including an edit made to repair advice.
A new instruction alone need not have a special policy for #105.

The installed composed path registers a synchronous `PreToolUse` hook for eligible
native edit tools. Before the runtime executes the tool, this hook obtains a
source-free permit bound to the complete advicee identity, native tool-use ID,
resident lifetime, and Hapsland round. It can prepare an empty new round after a
previous round closed. It does not capture source, enqueue review work, or call Jev.
The runtime waits for this synchronous hook to finish before executing the tool.
A successful `PostToolUse` observation must consume that same permit before any
capture or review admission, including the first round. A missing, expired, already
consumed, wrong-agent, or old-round permit yields incomplete admission and no review.
Tool failure does not turn the permit into a review; expiration or round closure
releases it. Permits are another explicitly round-owned resource.

The native edit identity is the advicee partition plus native tool-use ID and edit
event kind. Store source-free digests; source equality is not event identity.
Repeated PreToolUse notifications cannot renew or replace a consumed identity, and
repeated PostToolUse notifications cannot cause another capture or Jev call. All
asynchronous preparation and review messages carry the admitted round and resident
lifetime rather than looking up whichever round happens to be current.

A round closure invalidates all its permits and records a monotonic closure boundary.
A new pre-edit hook can prepare the next round only when its conservative invocation
start is strictly after that boundary and its original deadline has not expired.
An old hook's later IPC arrival or a retry cannot create a fresh start time. The
resident checks the start, deadline, identity, and closed-round fence atomically before
issuing a permit. Missing or unverifiable timing fails incomplete. The timing source
must cover native command startup: a delayed child-process launch must not make an
old invocation appear new. Installed wrappers must directly execute the hook process
or preserve an earlier trustworthy process-start bound. Never reset the deadline
on IPC retries, process stages, or resident startup. Timeout or cancellation revokes
unconsumed permits; a delayed/orphaned hook cannot renew them or reopen an old round.
A native tool that runs after its permit was invalidated cannot admit a post-edit
review. This conservatively drops uncertain edits instead of assigning them to a
new round without evidence.

The process-start clock does **not** reveal when the runtime queued its native hook
event. The ordering argument also depends on the supported runtime's synchronous
pre-edit barrier: the tool has not executed while that hook is still pending.
A delayed launch is safe only while that barrier remains effective. If a timeout
releases the tool, the timed-out command must not later obtain a usable permit.
Direct `exec` wrappers avoid leaving a separate delayed launcher, but do not by
themselves prove arbitrary runtime scheduling. A profile that cannot establish this
barrier and cancellation behavior must report incomplete admission rather than claim
that process-start time alone proves native event order.

Bounded native probes on 2026-09-26 used Codex CLI 0.155.1 and Claude Code 2.1.218
with session persistence disabled. In each main-agent run, a direct-exec PreToolUse
hook waited 6.5 seconds against a two-second native timeout. Matching PostToolUse
arrived 2,019 ms after PreToolUse start in Codex and 2,046 ms in Claude: both runtimes
allowed the edit after timeout. Neither timed-out hook recorded its delayed completion,
including a seven-second observation period after runtime exit. The same Claude child
probe observed matching child PostToolUse 2,040 ms after child PreToolUse began, with
no delayed completion from either timed-out PreToolUse hook. Thus timeout cannot
be treated as successful permit admission; a missing permit must reject PostToolUse.
These observations support cancellation for the tested paths. They do not prove
arbitrary delayed command launch, every descendant process, or all concurrent tool
schedules. Earlier 1.5-second synchronous PostToolUse-delay probes observed Stop only
after hook completion on both main agents and Claude's child.

Both pinned Linux runtimes expose matching native PreToolUse/PostToolUse tool IDs
in the observed main-agent probes; Claude also did so for the child probe. Preserve
supplied child identity on both hooks and use that child's advicee partition. A
parent token never authorizes a child's edit. Main and child agents use the same
permit lifecycle. Codex child execution remains a separate runtime validation case;
main-agent evidence must not be presented as child evidence.

Transcript files are not the installed ordering dependency. The pinned headless
Codex ephemeral mode supplies no transcript path; Claude without session persistence
supplies a path whose file is absent. Persistent Codex nested-tool IDs and Claude
child transcript paths also prevent the simple transcript-ID lookup from proving
ordering generally. The pre-edit permit design must pass native registration,
timeout/orphan, duplicate, and post-closure reopening checks before its implementation
is claimed conformant. A new runtime session forms its own advicee partition.

### Stop reservation, output, and reoffer

At most one Stop collector owns an advicee's active Stop attempt. Overlapping
collectors return without an independent continuation output; they cannot consume
or renew its deadline. Select and revalidate eligible advice under resident ownership,
then atomically reserve a continuation number from one through four in resident
state before authorizing output. The output permit binds the advice IDs, round, collector,
and attempt. Reusing a permit never authorizes a second write. A repeated Stop
notification cannot replay an old block response. A later continuation may present distinct eligible advice from earlier work, including
late results or batch overflow, without requiring another edit. The same advice cannot
spend another slot through repeated Stop presentation.

A completed stdout write means submitted, not seen or followed. Once a permit may
have reached a writer, acknowledgement loss, process death, and partial or uncertain
writes consume the reserved slot. A failure proven to occur before output authorization
may release a provisional reservation; no timeout or missing acknowledgement proves
that no output occurred. A lost Stop writer leaves the round active with its count
preserved; it does not authorize another collector to replay that attempt. A later
Stop can allow and close it. The resident reservation precedes external side effects.

Background advice submitted before Stop begins **or during its wait** is eligible
for one Stop reoffer in the same round if consumption is unproven. Uncertain background
output is treated the same way. This uses the same advice ID and current eligibility
checks, without a Jev request. A live background lease cannot be stolen: Stop may
wait within its existing deadline for that write to resolve, or safely revoke an
output permit that has not been released to its writer. At the final Stop selection
barrier, include only advice whose handoff state is resolved or explicitly uncertain;
a still-authorized concurrent writer retains ownership. Atomically reserve each
advice item's one Stop reoffer with the Stop output permit. Uncertain Stop output
consumes that reoffer too. Stop-submitted advice is not repeatedly reoffered at later
Stops. New repair-generated findings are new advice and can use remaining slots.
No advice crosses a closed round boundary.

When no actionable advice can be presented before the deadline, or all four slots
are used, Hapsland chooses allow and closes its round. Backend failure or unavailable
review is never encoded as a clean result. Operational notices do not by themselves
justify a repair continuation. At exhaustion, do not wait for advice that Hapsland
cannot present. A bounded batch may leave advice behind while a continuation keeps
the round active; every remaining item is discarded when the round closes.

### Closure ordering and resource ownership

Closure is a resident transition, performed before the hook emits its allow response:

1. Mark the round closed and invalidate its pre-edit permits; atomically stop admission, collection, output
   permits, and new queue transitions. New callbacks check this fence first.
2. Resolve background waiters quietly; revoke leases and unreleased output permits.
   Already authorized or written output cannot be recalled and must be recorded as
   submitted or uncertain, never model-visible by inference.
3. Remove queued observations and review units; interrupt owned preparation and Jev
   evaluation tasks and abort their owned network operations. Each task checks the
   same round fence before publishing or scheduling further work. Cancellation is
   best effort at the remote backend; late results are discarded locally.
4. Release captured source, artifacts, work references, pending advice, notices,
   and submitted/uncertain delivery records. Reference-count shared resources or
   retain independent ownership so another round is unaffected.
5. Retain only the source-free closure marker, identity digests needed to reject
   old events, and aggregate counts/reasons. Emit the allow response within the
   original hook deadline; cleanup may finish asynchronously after the fence is
   effective, but cannot produce review or delivery work.

Record the reason (`no-actionable-advice`, `deadline`, `continuation-limit`,
`disabled`, `recovery`, or `cancelled`), reserved continuation count, and numbers of
queued, running, pending, submitted, and uncertain items discarded. Categories
must identify lifecycle stages so the same item is not falsely reported as multiple
completed reviews. Zero discarded items does not imply a clean review. Never retain
source, advice text, raw runtime messages, or Jev payloads in this ledger.

An output permit already released to a separate process cannot be atomically recalled
by resident closure. The collector must recheck the fence immediately before writing;
if closure races after that check, classify its output as uncertain. No exactly-once
output or physical recall claim is made. The strong invariant is no *new authorization*
after closure, plus rejection of late review results. Conformance must exercise this
race and report the remaining external-write uncertainty explicitly.

### Restart and expiry scope

Each Hapsland round permits at most four continuation requests while its resident
process remains running; each new round gets its own four. The closed-round event
fence also applies within that resident lifetime. Keep source-free round identity, phase, reserved count, output reservation,
and event digests in resident memory. Advice relevance expiry can remove advice but
must not reset an active round's count or reopen a closed round. If capacity requires
removing detailed event history, retain a source-free session denial marker and refuse
ambiguous admissions for that partition until a new runtime session supplies a new
partition. Eviction must not become permission within that resident lifetime.

The owner explicitly rejected carrying a round’s Stop count across resident restarts,
including as future work. Reset on restart is accepted behavior.
A restart mid-round forgets that round’s count and may permit four more requests
for the same unfinished agent work; repeated restarts can therefore exceed four continuations over the runtime's
continued work. Unbounded repeated restarts may yield unbounded aggregate requests;
this is explicitly accepted for #105, which does not promise a durable cap. All old review data and leases
are discarded on restart, and IPC lifetime checks reject messages addressed to the
old resident. No recovered work or output is claimed successful. Raw runtime events
that first arrive after restart have no retained prior-round history; their attribution
limitation must be explicit. This is the accepted restart behavior, not a reason to
reset the count on ordinary expiry, polling, or native turn changes.

### Implementation and evidence scope

The production default branch, the #105 candidate, and the Foldkit backbone prototype
are separate artifacts. The prototype models these transitions and data ownership; it
does not prove that production interrupts Jev or that native hooks deliver output.
The candidate round implementation is `b36b879`. Renewed Linux evidence below checks
selected Stop and background repair outcomes on that implementation. Earlier Linux
evidence remains valid for its earlier implementation and does not validate the new
four-request or cleanup rules. No new owner product
decision is needed to implement these conservative failure rules. Adapter ordering
support and runtime output races must remain explicit implementation/support limits.

## Required conformance and present evidence

The conformance harness must use the production resident and controlled offline
Effect `DecisionModel`, with real installed Codex hooks. It must record source-free
event order and timings for edit launch-to-exit, resident completion, background
completion-to-host submission, independently observed model visibility, and Stop
launch-to-exit. Every output is classified by the actual opportunity observed, not
by synthetic delay alone. Raw host text, source, credentials, and source-bearing
backend responses are not retained.

| Gate | Required observation | Current candidate evidence (2026-09-26) |
| --- | --- | --- |
| Codex Linux outcome | Linux arm64, Codex 0.155.1, Node 24.20.0, matched before/after through the production resident | **Passed in three consecutive renewed controlled attempts:** [1](../evidence/delivery-105/linux-repeatability-final-1.json), [2](../evidence/delivery-105/linux-repeatability-final-2.json), [3](../evidence/delivery-105/linux-repeatability-final-3.json). Each before completed review without finding handoff or repair; each after delivered Stop advice, observed a repair edit, independently checked the repaired file, and completed a clear follow-up. Each resident was ready before runtime launch. Background was registered but deliberately delayed; these are Stop outcome checks, not simultaneous collection proof. |
| Claude Linux composition and outcome | Linux arm64, Claude Code 2.1.218, Node 24.20.0, background + Stop through the shared resident module; matched before/after with independently observed repair and clear follow-up | **The matched outcome passed in the same three renewed attempts**, with the same before/after observations and controlled ready-resident setup. Broader composition remains open. The [cold miss](../evidence/delivery-105/linux-repeatability-round-cold-miss.json) had no Claude baseline backend completion, so it is not a valid before case. In the [fast-baseline miss](../evidence/delivery-105/linux-repeatability-round-fast-baseline-miss.json), the baseline itself delivered and repaired, also invalidating the intended before case. Both records are retained; selected passing runs do not erase these setup/timing limits. |
| Round implementation and regression | Shared round admission, four-request policy, cleanup/fencing, same-round reoffer; deterministic tests and build | **Implemented in candidate `b36b879`, with Codex edit-hook correction `bc50725`; after merging current master in `98298a4`, final full suite passed 535 tests / 2 skipped and build passed. Direct-event conformance passed 231/231; clean package, setup-package, and pinned installed-host conformance passed.** Native matched runs exercise one Stop continuation and repair, not four-request exhaustion or every cleanup race. The source-free resident-contract harness passed **14/14** on candidate `44d3992`, recorded in `a67be55`. |
| Single installed behavior and owner review | No selectable legacy mode; owner considers repeatability, limitations, and rollout before closure | **Candidate installer implementation verified; final owner decision pending.** Both [Codex](../src/onboarding/codex-installation.ts) and [Claude](../src/onboarding/claude-installation.ts) unconditionally generate composed admission/background/Stop hooks; no installed legacy/composed selector or former environment gate remains. The [CLI](../src/cli.ts) returns after composed edit admission for both runtimes; legacy CLI entry points remain for before-case probes. This branch installs composed delivery as the sole mode. The owner directed one mode in the session; the issue now requires a separate evidence-backed owner review before adoption. |
| macOS manual follow-up | Real installed Codex and Claude Code on the owner's macOS machine | **Deferred by issue scope**. Closure of #105 must create and link the follow-up issue; no macOS result is claimed here. |
| Background timing | No later edit before delivery; completion during model request/tool call, final response, and after end; actual submission and model visibility | **Selected native intervals observed:** [timing and contention scope](../evidence/delivery-105/native-background-timing-linux.md). Codex review completed and background submitted inside a native Bash interval, followed by repair without Stop block; its delayed follow-up review did not clear before cleanup. Claude submitted background during a streamed final message interval, then Stop reoffered and repair followed; whether the earlier output was seen is unknown. Claude actionable tool-window completion remains unproven after [three recovery attempts](../evidence/delivery-105/claude-reset-rerun-linux.md): all repaired, but attempts 1/3 made no Bash call and attempt 2 found actionable advice before Bash. Attempt 2 later completed a clear review inside foreground Bash, but timed out; that does not pass the target. Codex exposes completed assistant items, so in-progress final/model-request timing is unestablished. Both after-end cases observed no late output for two seconds after exit; this is a bounded observation only. The separate [final background record](../evidence/delivery-105/linux-background-final.json) establishes repair and clear follow-up on both runtimes in selected available opportunities. |
| Stop outcomes | Ready, completes during wait, deadline then round cleanup, unavailable/backend failure, stale, multi-unit | **Deterministic resident/Stop cases passed for both adapter identities:** [results](../evidence/delivery-105/linux-round-contract.json), [scope](../evidence/delivery-105/round-contract-linux.md). Deadline cancelled running review, discarded queued units, and left zero retained review bytes/advice/cache/current-work records. Unavailable produced an operational notice and unavailable closure; stale advice was removed; two findings fit a batch without repeated Stop delivery. These use real resident/Stop CLI with fixture events; native cancellation and all late-callback schedules remain outside the result. |
| Composition races | Background/Stop overlap, submitted but unconsumed background output, edit/other collector overlap, failed collection or lost ack, repair-generated findings | **Deterministic resident cases and native collector overlap passed the observed scopes.** The 14/14 resident record covers acknowledged/uncertain reoffer, no duplicate evaluation, four fixture continuations, fifth-finding discard, and fresh round. [Native traces](../evidence/delivery-105/native-background-timing-linux.md) show Codex Stop acquire the only finding lease while background collected concurrently; Claude background submitted first, then Stop obtained a different reoffer lease after acknowledgement/finalization. Repair followed both. These are exclusive lease ownership and sequential reoffer observations, not proof the earlier output was unseen or proof of every cancellation/parallel schedule. |
| Isolation | Two concurrent advicees with distinct findings on both paths; isolated worktrees, shared-root unknown origin, supplied child identity | **Native Stop routing passed** for concurrent Codex and Claude worktree sessions and two supplied Claude child IDs, with parent receiving neither child finding: [scope](../evidence/delivery-105/native-isolation-linux.md). **Codex concurrent background routing also passed:** both sessions received only their own background finding and later only their own Stop reoffer, [record](../evidence/delivery-105/linux-native-isolation-codex-background-worktrees-claude-background-worktrees.json). The [Claude recovery pair](../evidence/delivery-105/linux-native-isolation-claude-background-worktrees.json) also passed: two native worktrees sharing one resident each received only their own background finding and Stop reoffer, zero foreign deliveries, no hook failures, both exits 0. Earlier exit-1 attempts remain retained with unknown cause. Codex child route was unavailable in the native attempt; child isolation remains unobserved. Shared-root unknown-origin and arbitrary parallel scheduling limits remain explicit. |
| Timing | Runtime command launch through response and exit on both profiles; edit, background, and added Stop latency kept distinct | **Selected final-candidate measurements passed:** [ptrace record](../evidence/delivery-105/linux-final-command-timing.json). Codex edit commands: 303.289 / 315.180 ms; Stop: 343.550 / 2,260.624 ms. Claude edit: 320.371 / 339.752 ms; Stop: 2,783.928 / 3,808.083 ms. All four measured Stop commands exited below five seconds. Deliberately delayed background commands were cancelled at teardown, so their lifetimes are not background delivery latency. The later [timing probe](../evidence/delivery-105/native-background-timing-linux.md) adds nine PreToolUse launch-to-exit observations of 294.16–356.35 ms, all below five seconds, including wrapper/IPC-observer overhead. These selected timings are not universal latency bounds. |

The [round-contract harness](../evidence/delivery-105/round-contract-linux.md) executes
seven cases for each Codex/Claude adapter identity: **14/14 passed**. It uses the real
resident, local IPC, real Stop CLI subprocess, and controlled offline Effect backend.
Runtime events, repair edits, background acknowledgements, and acknowledgement loss
are fixtures. No native agent process or live Jev runs in it, so it supplies deterministic
contract evidence separately from the native matched/background repair records.
Cold startup, resident restart, native agent cancellation, parallel tool scheduling,
and concurrent native advicee isolation remain outside this harness. Separate native
isolation evidence covers concurrent worktrees and Claude children as described above.
The final full suite rerun after merge `98298a4` passed 535 tests with two skipped;
build, direct-event 231/231, clean package, setup-package, and pinned installed-host
conformance also passed.

The [#97 record](issue-97-delivery.md) is useful prior evidence, but its isolated
prototypes and Stop-only production-resident run cannot satisfy the combined gates.
Existing resident tests establish current deterministic collection behavior, not
model visibility. The new Linux probe used a locally cached exact 0.155.1 binary
with Node 24.20.0. The existing macOS GitHub Actions workflow covers package
conformance and does not run this combined matrix.

**Owner support decision — conditional acceptance:** The owner accepts the narrower
Linux support boundary documented by these observations, **conditioned on the bottom
of the Foldkit demo containing a timing diagram** that makes the boundary understandable.
This replaces the prior open choice to keep chasing every unobserved runtime interval.
It does not relabel missed or unobserved probes as passing.

The accepted limits include unproven actionable Claude review completion inside a
foreground tool call, unobserved Codex in-progress final/model-request intervals and
native child behavior, bounded after-end observation, and the stated visibility and
native scheduling limits. Claude's three tool-window recovery attempts remain retained:
all repaired, but none passed the target interval; attempt 2 timed out after observing
a later clear review inside Bash. Native worktree background routing passed for both
runtimes and supplied Claude child routing passed. These findings remain distinct
from hidden model consumption and universal scheduling guarantees.

The required bottom demo diagram must:

- Show the observable agent/runtime stages and distinguish unknown internals, including
  model-request timing and whether submitted advice was actually seen.
- Present successful and missed scenarios without converting an unobserved opportunity,
  fixture repair, or completed write into proven agent visibility.
- Label required product cases separately from exploratory probes and preserve the
  observed scope and failure/timeout results.
- State exactly which states, events, data ownership, and transitions the sidecar reducer
  checks statically, and which runtime, IPC, scheduling, timing, cancellation, or
  visibility behavior lies outside that model.

The owner delegated representation choices after Astra pre-research. The diagram
implementation condition is fulfilled by the Foldkit package in the single #105
candidate branch, subject to the owner's visual review and adoption. Read-only audit confirmed
bottom placement, separate required/exploratory and observed/unproven labels, retained
timestamp accuracy, visible unknown-runtime caveats, and truthful partial reducer
coverage. The default after panels include prompt, pre-edit, repair pre-edit, edit,
Stop, and runtime-exit observations. Grey spans explicitly mark missing evidence,
not measured runtime stages. Typed event identity checks and reducer replay establish
the abstract companion paths, not native timing or visibility. The sidecar build
passed. The remaining work is the owner's visual review of this implemented diagram
and its coverage/limits, followed by the final adoption/review outcome. #105 stays
open during that work. No further native
probe is automatically required merely because one of the accepted support limits is
still unobservable. Any newly found product failure still requires an explicit disposition.

The accepted bound is four Stop continuation requests **per Hapsland round** while
the resident runs; each new round gets its own four. Resident restart resets the
count. Carrying it across restart is rejected, including future work; #107 is closed
as not planned and is not an outstanding acceptance item.

**Review artifact and worktree index:** [draft PR #108](https://github.com/dearlordylord/hapsland/pull/108)
contains the candidate implementation, evidence, and independent Foldkit package in
`/workspace/typescript/jev-worktrees/issue-105-composed`. This is the only active #105
worktree. The older sidecar branches and [PR #110](https://github.com/dearlordylord/hapsland/pull/110)
are retained in Git history as superseded review paths, without additional worktrees.
The prototype is not running in production and its reducer/diagram does not
substitute for native conformance.

**Present decision:** candidate implementation and the recorded evidence support the
owner's conditionally accepted Linux boundary. The Foldkit timing-diagram implementation is complete; finish the owner’s visual
review and final adoption work before closure. Closing #105 must still create
and link the manual macOS follow-up. A background response submitted near session end
remains visibility unknown even when the resident records a successful write. No live
Jev validation is needed for this controlled delivery gate.
