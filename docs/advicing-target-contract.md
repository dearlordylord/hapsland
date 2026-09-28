# Advicing target contract

**Purpose:** Define accepted Hapsland behavior at the agent-runtime boundary.
**Status:** Accepted target; implementation and installed support are separately evidenced.
**Authority:** Accepted product contract.
**Expected use:** Resolve intended behavior and assess implementation against the accepted advice, work, and delivery contract.
**Lifecycle:** Maintained through explicit accepted behavior amendments. Review whenever an owner changes advicee identity, admission, review, delivery, or finish semantics, and at #137 final authority reconciliation; update linked implementation/support evidence without treating it as a contract amendment.

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
leases, notices, expiry, finish decisions, and virtual-round resources. There is
one installed delivery behavior, without a legacy/composed mode selector.

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

The resident assigns an opaque virtual-round ID within that partition. Every
admitted observation, preparation job, review unit, Jev request, advice item,
lease, waiter, and output reservation belongs to that round. A fresh attributed
edit in an active round remains in it, including a repair edit. A prompt, poll,
finish attempt, subagent notification, or native turn change cannot open a new
round or reset its continuation count. After closure, only a provably fresh edit
can open a new virtual round.

Before an eligible native edit tool runs, a synchronous pre-edit hook obtains a
source-free permit bound to the advicee, native tool-use identity, resident
lifetime, virtual round, and original deadline. It does not capture source or
call Jev. The matching post-edit observation consumes that permit before review
admission. Missing, expired, used, wrong-agent, or old-round permits mean
incomplete admission, not review. Tool failure, timeout, and round closure
release unused permits. Repeated pre- or post-edit notifications cannot renew a
permit or start a second evaluation of the same edit.

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
step. A clear result completes the item and records clear status in that step;
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

If actionable advice can be presented and a continuation remains, Hapsland
returns a **continue-with-advice response** (`block`). This asks the runtime to
let the agent work on the advice in the same virtual round. Otherwise it returns
an **allow-finish response** (`allow`) and closes the virtual round. The wait
does not itself continue the agent, and `allow` does not prove that every other
hook let the actual agent round end. Operational notices alone cannot justify a
repair continuation.

**At either decision,** Hapsland selects the available advice batch, discards
queued unfinished pre-decision work, requests cancellation of pre-decision
source reading and Jev requests, and fences their late callbacks. Completed
pending advice that does not fit the batch can remain eligible for a later
finish attempt while a `block` keeps the same virtual round active. Fresh
repair edits after a `block` create new work in that round. A late result from
cancelled work cannot create advice for that repair or a later round. The pure reducer can
emit the decision, response command, and cancellation IDs; the runtime side
performs output and cancellation. No output command proves agent reception.

The installed edit path automatically starts a bounded background advice wait.
One waiter per advicee coalesces matching triggers, holds no advice lease while
waiting, and exits quietly if no eligible advice becomes ready. A background
wait with no reserved advice cannot prolong a settled finish decision. A
reserved background advice submission can finish during the open finish call; its submitted
or uncertain advice can then be considered for a same-round reoffer. Background
output does not interrupt an in-flight model request or tool call and does not
guarantee a later model-visible opportunity.

## Handoff, reoffer, and continuation count

Before Hapsland gives advice, it checks the working root and advicee, the
current Jev credential generation, file settings, each file needed by the review unit,
whether the work is still current, and the advice age. A temporary failure
of this check leaves current advice
eligible until a later valid attempt or expiry; stale or unattributed advice is
suppressed. The resident grants one tokenized lease per selected advice item.
Overlapping collectors cannot own that item together. The collector releases a
lease on a known pre-output failure; a completed advice submission records only
submission to the runtime. Lost acknowledgements and uncertain submissions
remain uncertain; lease recovery requires revalidation. Current response limits are five findings
and 2 KiB of encoded output. An individually oversized finding yields a bounded
limitation rather than an endless retry.

At most one finish collector owns an advicee's active finish attempt. A
continue-with-advice response reserves one of four continuation numbers in
resident state **before** output authorization. The output permit binds the
round, attempt, collector, and advice IDs; reuse cannot authorize another
submission. Once output may have reached the runtime, partial or uncertain
submissions, process death, and lost acknowledgement consume that reservation. A proven
failure before authorization may release a provisional reservation. A later
finish attempt cannot replay that attempt or spend a new slot on the same
advice. When four are reserved, the next finish attempt may allow immediately,
without waiting for work whose advice cannot be presented.

Background-submitted or uncertain advice may be offered **once** at a finish
attempt in the same active virtual round when model consumption is unproven.
This uses its existing advice identity and a fresh eligibility check, never a
second Jev evaluation. A live background advice submission keeps its lease;
the finish collector may wait within its existing deadline or revoke an output
permit that has not reached the runtime output boundary. Only resolved or
explicitly uncertain handoffs enter final selection. An uncertain advice
submission at Stop consumes the reoffer.
The resident reserves each item's one reoffer atomically with the finish output
permit.
No submitted advice crosses a closed-round boundary.

## Closure, restart, and evidence

Hapsland closes its virtual round when it issues an allow-finish response, even
if another runtime hook keeps the actual agent round going. Before emitting
`allow`, the resident fences new admission, collection, output authorization,
and queue transitions for that round and invalidates its pre-edit permits.
Then it resolves waiters, revokes leases and unreleased permits, removes queued
work, interrupts owned preparation and Jev tasks, and releases captured source,
pending advice, notices, and submitted/uncertain delivery records. Cancellation
at Jev is best effort; local late callbacks are rejected. Shared resources
owned by another round remain intact. Already authorized external output
cannot be physically recalled; a closure race after the writer's final fence
check is classified as uncertain. The guarantee is no new authorization after
closure, not exactly-once external output. Emit `allow` within the original
hook deadline; cleanup can finish asynchronously after the fence takes effect,
without producing new review or delivery work.

Retain only a source-free closure marker, identity digests needed to reject old
events, and aggregate counts and reasons. Count discarded queued, running,
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
