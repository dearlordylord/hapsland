# Advicing target contract

**Purpose:** Define accepted Hapsland behavior at the agent-runtime boundary.
**Status:** Accepted target; implementation and installed support are separately evidenced.
**Authority:** Accepted product contract.
**Expected use:** Resolve intended behavior and assess implementation against the accepted advice, work, and delivery contract.
**Lifecycle:** Maintained through explicit accepted behavior amendments. Review whenever an owner changes advicee identity, admission, review, delivery, or finish semantics; update linked implementation/support evidence without treating it as a contract amendment.

**Status: accepted target behavior, not an implementation or support claim.** This
document says what Hapsland must do at the agent-runtime boundary. The candidate
production path implements parts of it; the [implementation and evidence
status](https://github.com/dearlordylord/hapsland/blob/6d6f1617c1942faa56e39781684bf0e6c78f62f5/evidence/advicing-linux/README.md) identifies observed behavior and
remaining gaps. Exact installed-release support is declared separately in
[installed release compatibility](installed-release-compatibility.md). Terms have
their canonical meanings in the [product vocabulary](../CONTEXT.md).

## Outcome and observation boundary

An attributed agent edit can yield an actionable Jev finding, advice submitted
to that same agent, a later agent repair, and a clear follow-up evaluation. These
are separate observations. Completion of Jev work, collection by Hapsland,
submission to an agent runtime, model visibility, and a repair edit must never be
inferred from one another. A completed output write establishes submission only.
An unavailable, interrupted, or discarded evaluation is never reported as clear.

The installed composed path uses the same resident delivery module for Codex CLI
and Claude Code. Native hooks translate runtime events and response formats; they
do not own another review queue, reconstruct reviews from the filesystem, or call
Jev to produce delivery output. The resident owns admitted work, pending advice,
leases, source-free operational failure records, expiry, finish decisions, and virtual-round resources. There is
one installed delivery behavior, without a legacy/composed mode selector.

### Agent-facing sequence

In an ordinary supported agent-runtime cycle, the user gives an agent work to
do. Before an eligible edit tool runs, Hapsland's pre-edit hook asks the resident
to register that edit attempt. After the tool edits a file, the synchronous
post-edit hook reports the result. The first accepted edit opens the advicee's
virtual round. Review then runs in the resident; the agent can receive advice
after an edit, through a background hook, or when it tries to finish.

When the agent tries to finish, its Stop hook gives Hapsland a bounded chance
to complete admitted reviews. A continue-with-advice response asks the agent
to work on that advice and keeps the same virtual round open. The agent can edit
and try to finish again. An allow-finish response closes the virtual round. A
round without a Stop also closes after its configured period of full
quiescence. This needs no agent runtime response.
Another runtime Stop invocation cannot reopen it. A later user message or
runtime turn change does not open a virtual round by itself; a later accepted
edit does. The runtime can still report an event after Hapsland closes its
virtual round, because the runtime's own turn boundary is separate.

### Agent response is controlled by its instructions

Hapsland submits advice and can request a bounded continuation; it does not
compel the agent to implement a finding. The agent decides how to respond under
its governing instructions. A user can instruct it to follow reviews or to
ignore them. Hapsland does not override that choice. An agent's decision not to
repair is not, by itself, a delivery failure; nor does submission prove that the
agent saw the advice and chose to ignore it.

Native delivery-and-repair tests must explicitly instruct the fixture agent to
act on every actionable Hapsland finding it receives. Apply the same policy to
both before and after runs, and record the instruction mechanism with the
evidence. Repairs then demonstrate the end-to-end path under a cooperative
agent policy, not enforcement in arbitrary user sessions. Keep submission,
observed repair, and follow-up review completion as separate assertions. A
missing repair requires diagnosis, not an assumption of either refusal or
failed delivery.

## Advicee identity and admission

Review and advice belong to an exact advicee partition: canonical physical
working root, agent runtime and supported version, session ID, and supplied
subagent ID or null. Native `agent_id` maps to Hapsland's `subagentId` at the
adapter boundary. Today an omitted ID maps to null, the main-agent scope. That
mapping does not prove an event came from the main agent. If a runtime can omit
the ID for a child event, Hapsland needs another reliable attribution fact or
must withhold child-specific advice. Main and identified child agents use the
same review and delivery rules; the resident does not need a parent-child tree.
Separate sessions and isolated
working roots remain separate. A shared-root change of unknown origin has no
advicee and cannot produce addressed advice. Native turn IDs are event metadata,
not advicee or virtual-round identity.

The first accepted attributed edit opens a virtual round and receives an opaque
round ID within that advicee partition. At most one virtual round is open for
an advicee at a time, and at most 64 virtual rounds are open in one resident
at once. Closing a round frees its slot. Repeated notification of the same edit
does not open another round. Every admitted observation, preparation job, review
unit, Jev request, advice item, lease, waiter, and output reservation belongs
to that round. A fresh attributed edit in an active round remains in it,
including a repair edit. A prompt, poll, finish attempt, subagent notification,
native turn change, or pre-edit permit alone cannot open a new round or reset
its continuation count. After closure, only a provably fresh edit can open a
new virtual round. A round can later have no unfinished work or pending advice;
its originating edit remains the reason it was opened.

Automatic resident retirement must not discard an open virtual round or an
outstanding pre-edit permit. Resident process inactivity is not evidence that
the advicee's virtual round has ended. An open round closes without Stop only
after continuous full quiescence: no unfinished review work, pending advice,
pending edit permit, active delivery, or Stop hold. The default is five minutes;
the user can configure the duration, which is captured when the round opens.
An accepted edit or renewed activity interrupts the quiet interval. Advice
already pending keeps the round open until it is delivered or reaches its
normal relevance expiry. The quiescence check runs independently of resident
IPC connections. A later fresh edit may begin another virtual round within the
same runtime turn. At the boundary, a late edit is admitted only after the old
round has closed and only if its own start is provably fresh.

Before an eligible native edit tool runs, a synchronous pre-edit hook obtains a
source-free permit bound to the advicee, native tool-use identity, resident
lifetime, original deadline, and the current closure fence. The permit proves
which edit attempt may later be accepted; it neither opens nor reserves a
virtual round. It does not capture source or call Jev. The matching post-edit
observation consumes that permit before review admission and opens or joins the
virtual round only when accepted as an attributed edit. Missing, expired, used,
wrong-agent, or stale permits mean incomplete admission, not review. Tool
failure, timeout, and round closure release unused permits. A repeated pre-edit
notification while its permit is pending returns the existing admission result
without creating another permit. A repeated post-edit notification has no
permit to consume and starts no second evaluation. The Bend reducer retains the
last 1,000 completed edit identities across all advicees; the adapter holds only
the corresponding native-to-opaque identity mapping. A pre-edit
notification matching one of those identities cannot start new work and is
recorded as a source-free diagnostic. The oldest identity is evicted when a
new one exceeds that bound. After eviction, identity alone does not establish
that a new pre-edit notification repeats a completed edit; a fresh invocation
may be admitted. The 1,000-identity window is an idempotency bound, not a
limit on accepted edits.

An invocation start used to distinguish a new edit from a delayed old hook must
cover native command startup, be strictly after the closed-round boundary, and
retain its original deadline across IPC retries and resident startup. The
resident checks that start, deadline, identity, and closed-round fence
atomically before issuing a permit. The
supported runtime must keep the edit tool behind its synchronous pre-edit hook.
If that ordering or cancellation cannot be established, admission is incomplete;
process-start time alone is insufficient proof of native event order. Each
asynchronous result carries its originating round and resident lifetime. It
never looks up whichever round is current when the callback arrives.

## Work and finish decision

An admitted edit is unfinished while it waits for source reading, while source
is read and analyzed, while any derived review work item waits for Jev, and
while Jev evaluates that item. One observation may yield several review units.
A Jev finding completes its item and enters pending advice in the same logical
step. A clear result completes the item and can be observed as clear activity;
there is no separate stored Jev-result queue. All unfinished items in the
virtual round count, not just the first or latest edit.

A **finish attempt** is a native `Stop` or `SubagentStop` hook invocation. During
its **finish-decision wait**, Hapsland holds that hook response open while any
work in the round is unfinished, subject to its safe hook deadline. When all
work settles, it decides immediately. A deadline-reached event forces a
decision earlier. For example, with two unfinished items, the first Jev result
leaves the hook open; the second lets the policy decide. The policy considers
pending actionable advice at the decision point and selects a bounded batch.
Jev error behavior is not specified by this refinement beyond truthful
unavailable/incomplete status.

The wait exists to give unfinished reviews a chance to become advice before
the agent finishes. Hapsland cannot hold a runtime hook open without limit, so
it waits only within the safe hook deadline and decides with the results then
available. A result that misses that boundary is a cost of the bounded wait,
not a reason to skip the wait. When the continuation budget is exhausted,
Hapsland may allow finish immediately because it cannot present another
continue-with-advice response.

At the safe Stop deadline, Hapsland may send findings already completed for
an edit even if other review work from that edit is unfinished. The finish
decision cancels the unfinished work of that virtual round, so its late results
are not sent as another part of the edit's advice. This deadline exception
does not make a partial edit eligible during ordinary collection.

If actionable advice can be presented and a continuation remains, Hapsland
returns a **continue-with-advice response** (`block`). This asks the runtime to
let the agent work on the advice in the same virtual round. Otherwise it returns
an **allow-finish response** (`allow`) and closes the virtual round. The wait
does not itself continue the agent, and `allow` does not prove that every other
hook let the actual agent round end. Operational failures do not produce agent
output or justify a repair continuation.

**At either decision,** Hapsland selects the available advice batch, discards
queued unfinished pre-decision work, requests cancellation of pre-decision
source reading and Jev requests, and fences their late callbacks. Completed
pending advice that does not fit the batch can remain eligible for a later
finish attempt while a `block` keeps the same virtual round active. Fresh
repair edits after a `block` create new work in that round. A late result from
cancelled work cannot create advice for that repair or a later round. The pure reducer can
emit the decision, response command, and cancellation IDs; the runtime side
performs output and cancellation. No output command proves agent reception.

Cancellation is the current simplification at this decision boundary. It is
not the purpose of Stop: Hapsland first waits as far as the safe deadline and
the continuation budget permit. Cancellation can lose useful unfinished
reviews, but gives the decided response a definite set of eligible advice and
prevents late pre-decision work from appearing as advice after that response.

The installed Claude `PostToolUse` hook also collects current advice within its
safe synchronous deadline. If no eligible advice is ready, it returns quietly
and leaves later opportunities to background or Stop. Advisory output is the
default. A synchronous `block-current-findings` response requires a user-owned
opt-in that remains valid at the final handoff; project policy may narrow it to
advisory. For ordinary collection, findings from an accepted edit become ready
after its source preparation and all derived review work have settled. A
completed finding from that edit remains pending while sibling work is still
unfinished; a short elapsed-time window does not make it ready on its own.
This boundary follows the originating edit, not a dispatch cohort. Work from
other edits and advicees can use free preparation slots concurrently. The
collector may batch eligible findings from several completed admissions in
the same advicee and virtual round. For example, edit B's synchronous response
may include a still-current finding from edit A in that round, even when the
finding was not ready during edit A's hook. An admission identifies each
derived review unit and carries authorization and lifetime facts; it does not limit the batch
to one edit or store a second ticket-wide outcome. Operational failure records use the
same advicee scope across those opportunities, but are retained for diagnostics
instead of being included in agent output. The installed edit path
automatically starts a bounded background advice wait.
CLI and resident exchange one version 1 local IPC envelope across admission,
collection, lifecycle, and delivery operations. An older peer's response cannot
establish readiness, successful review, or submission.
One waiter per advicee coalesces matching triggers, holds no advice lease while
waiting, and exits quietly if no eligible advice becomes ready. A background
wait with no reserved advice cannot prolong a settled finish decision. A
reserved background advice submission can finish during the open finish call; only
an uncertain write can then be considered for a same-round reoffer. Background
output does not interrupt an in-flight model request or tool call and does not
guarantee a later model-visible opportunity.

## Handoff, reoffer, and continuation count

Before Hapsland gives advice, it checks the working root and advicee, the
current Jev credential generation, file settings, each file needed by the review unit,
whether the work is still current, and the advice age. A temporary failure
of this check leaves current advice
eligible until a later valid attempt or expiry; stale or unattributed advice is
suppressed. The resident grants one tokenized lease per selected advice item.
At the final IPC handoff, the resident takes a bounded, descriptor-anchored
capture of each selected source file and supplies its freshness as a fact to
the Bend candidate decision. A changed or unreadable source retires its
selected finding.
Overlapping collectors cannot own that item together. The collector releases a
lease on a known pre-output failure; a completed advice submission records only
submission to the runtime. Lost acknowledgements and uncertain submissions
remain uncertain; lease recovery requires revalidation. Current self-imposed
response budget is 10 KiB of final encoded host output, including Claude-specific
wrapping. There is no separate finding-count cap. An individually oversized finding yields a bounded
limitation rather than an endless retry.

The response-size check determines which findings enter a Stop output before
the output is reserved. Once selected, its advice records share one output
token. Bend authorizes every selected record with the Stop slot in one
transition, and records an acknowledged or uncertain result for every record
with the slot in one transition. If any member cannot make either transition,
the entire transition is refused without a partial state change. A size limit
may leave findings out of the selected output; it does not allow a subset of
that selected output to be recorded as delivered.

At most one finish collector owns an advicee's active finish attempt. A
continue-with-advice response reserves one of four continuation numbers in
resident state **before** output authorization. The output permit binds the
round, attempt, collector, and advice IDs; reuse cannot authorize another
submission. Once output may have reached the runtime, interrupted or uncertain
native writes, process death, and lost acknowledgement consume that reservation. A proven
failure before authorization may release a provisional reservation. A later
finish attempt cannot replay that attempt or spend a new slot on the same
advice. When four are reserved, the next finish attempt may allow immediately,
without waiting for work whose advice cannot be presented.

Successful stdout submission counts as delivery. Stop does not repeat a
background finding after that submission, even though the runtime does not
acknowledge model visibility. An uncertain background write may be offered
**once** at a finish attempt in the same active virtual round.
This uses its existing advice identity and a fresh eligibility check, never a
second Jev evaluation. A live background advice submission keeps its lease;
the finish collector may wait within its existing deadline or revoke an output
permit that has not reached the runtime output boundary. Only resolved or
explicitly uncertain handoffs enter final selection. An uncertain advice
submission at Stop consumes the reoffer.
The resident reserves each item's one reoffer atomically with the finish output
permit.
Advice already handed to a runtime hook while its virtual round was open may
reach the advicee shortly after that round closes, even if a new virtual round
has begun. This is acceptable timely delivery to the same advicee. Closing a
round cannot recall text already in a running hook. The current flow selects no
additional advice from that closed round. Whether a later virtual round may
deliberately select earlier advice is a separate, undecided behavior.

## Conditional progress

From every reachable, consistent checked state, admitted review work must
resolve when its external operations return matching facts or their deadlines
fire. Resolution records an outcome, releases transient request resources, and
retains only the resources legitimately owned by eligible advice. Clear results,
failures, cancellation and retirement are resolutions; they need not produce advice.

A finding that remains eligible must progress to an authorized agent-runtime
handoff when capacity and a permitted delivery opportunity become available.
Enabled work must eventually be scheduled, and matching authorization and
completion facts must eventually be processed. A successful host acknowledgement
must advance the handoff to recorded submission. This guarantees no agent receipt,
model visibility or use beyond the acknowledged runtime boundary. Existing
suppression and the one uncertain-background reoffer at Stop still apply; this
requirement does not authorize unlimited output retries.

After a finite failure period, restoring these healthy conditions must let fresh
eligible work progress without a reset. Earlier resolved failures must not leave
request permits or failure state that permanently blocks fresh admission. A
closed dispatcher, revoked eligibility, permanent capacity exhaustion, missing
external responses, or an unavailable delivery opportunity does not satisfy the
progress assumptions. No fixed wall-clock or 2,000 ms simulator deadline is imposed.

These are product requirements. The [Bend progress checks](../packages/agent-flow-bend/README.md#conditional-progress-proofs)
state the boundaries currently proved and the host obligations outside those
proofs; executable evidence does not establish complete native orchestration.

## Closure, restart, and evidence

Hapsland closes its virtual round when it issues an allow-finish response, even
if another runtime hook keeps the actual agent round going. This closure follows
the bounded finish-decision wait described above; the wait gives reviews their
available chance to become advice before cleanup discards unfinished work.
Before emitting `allow`, the resident fences new admission, collection, output authorization,
and queue transitions for that round and invalidates its pre-edit permits.
Then it resolves waiters, revokes leases and unreleased permits, removes queued
work, interrupts owned preparation and Jev tasks, and releases captured source,
pending advice, notices, and submitted/uncertain delivery records. Cancellation
at Jev is best effort; local late callbacks are rejected. Shared resources
owned by another round remain intact. Text already handed to a running runtime
hook cannot be recalled. If the round closes before that hook reports its write
result, the delivery result is uncertain. The current cleanup rule prevents new
work and advice selection from the closed round; it does not require the advicee
to receive already handed-off text before the instant of closure. Emit `allow`
within the original hook deadline; cleanup can finish asynchronously after the
fence takes effect, without producing new review or delivery work.

After full quiescence for the configured duration, Hapsland closes the round
without waiting for a Stop response. This uses the same admission fence and
cleanup, and records `quiescent` as the source-free closure reason. A Stop
already in progress follows its own bounded hold instead. The timeout begins
when the round is observed fully quiet, so a periodic check can close it later
than the configured duration. A late Stop for a closed round cannot reopen it.

Retain only a source-free closure marker and identity digests needed to reject old
events. Derive diagnostic counts and reasons from work and delivery facts rather
than retaining a ticket-wide terminal result. Count discarded queued, running,
pending, submitted, and uncertain work by lifecycle stage, without treating one
item as several completed reviews. An interrupted or dropped result is
incomplete, not clear. The marker contains no source, advice text, raw runtime
messages, or Jev payloads.

The four-request count is per virtual round **within one resident lifetime**.
Advice expiry, detail eviction, prompts, and polling cannot renew it or reopen
a closed round. If retained identity evidence becomes insufficient, reject
ambiguous admissions for that partition rather than granting fresh permission.
A resident restart deliberately resets the count; no durable four-request cap
is promised across repeated restarts. Old work and leases are lost, and old
lifetime IPC is rejected. Fresh events first seen after restart have an
explicit attribution limitation rather than assumed old-round history.

The [canonical Bend transition](../packages/agent-flow-bend/README.md) models
the resident's Stop wait, cutoff, cancellation IDs, and output decisions. The
[visualization](../packages/agent-flow-viz/README.md) replays that checked
transition from source-free examples; it does not establish native hook behavior.
The resident implements the all-work/deadline finish decision. Its earlier
implementation has a
[contract and Linux validation record](https://github.com/dearlordylord/hapsland/blob/6d6f1617c1942faa56e39781684bf0e6c78f62f5/evidence/advicing-linux/finish-decision-linux.md);
the current resident calls the checked canonical adapter at decision barriers.
Native scheduling, actual runtime visibility, and physical cancellation require
separate evidence; see the [Linux evidence index](https://github.com/dearlordylord/hapsland/blob/6d6f1617c1942faa56e39781684bf0e6c78f62f5/evidence/advicing-linux/README.md).
Owner visual review and Linux adoption were accepted on 2026-09-27 within the
recorded evidence boundary. macOS validation remains a separate follow-up.
