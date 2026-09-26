# Issue #105: reusable composed delivery contract and adoption decision

Status: **candidate implementation; three consecutive matched Linux attempts passed on 2026-09-25;
remaining conformance gates open**. This document is the contract for the combined
Codex and Claude Code paths. The implementation now registers background, Stop,
and prompt hooks through each installer and shares one resident delivery module.
The matched host probe uses the production CLI and resident with isolated native
hook settings; the full installation and race matrix still needs validation.
The installed Codex and Claude definitions in this branch have one composed
delivery behavior. The branch must not be adopted on the default release line
until the evidence gates and the owner's final rollout decision are complete.

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

The candidate now registers `SubagentStop` for both hosts and sends it through
the same composed Stop collector. A child with no `UserPromptSubmit` gets its
initial Stop allowance on its first background or Stop request. Later requests
do not restore an existing allowance. The record is held in memory and expires
after ten minutes; a restart also loses it. A later request can then create a
new initial record, even without evidence of a new child task. The candidate
does not yet define when a resumed child should receive another allowance.

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

For this combined path, the present `acknowledge` + `finalize` behavior is insufficient:
`finalize` removes advice immediately after the write. The resident must instead
retain a bounded, source-free submitted record (advice identity, advicee, turn
chain, output surface, timestamp and token) through the relevant turn boundary. A
background submission immediately before Stop is therefore **submitted/visibility
unknown**. Stop must not race to submit the same advice again during that turn chain;
it can collect other unhanded findings. Once an independent host continuation
explicitly demonstrates consumption, the item may be retired. If visibility is never
observed, a later eligible collection may retry after the lease and turn boundary,
subject to freshness and expiry; that retry can duplicate a prior host submission.
No exactly-once or guaranteed model-visibility claim is made. The legacy edit
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
unsubmitted lease. Session end cancels the waiter, but does not cancel resident-owned
review work. Resident memory lifetime and the ten-minute advice relevance expiry
still bound later collectability.

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
exit. No stage may silently reset the clock. On expiry the hook allows Stop and leaves
review work running in the resident. A later eligible hook may collect the eventual
result if it is still current and unexpired.

Hapsland tracks a Stop allowance separately for each advicee. When an agent tries
to finish, Hapsland may send advice and ask it to continue once. Work done in
response to that advice does not restore the allowance. Another tool call,
finding, or advice request does not restore it either. A native
`stop_hook_active` reentry returns quietly; it does not use the allowance.

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
under that record. New findings remain with the resident for a later eligible
opportunity. Edits can still be reviewed, and background advice can still be
sent without a Stop allowance. If Hapsland cannot establish an allowance, it
does not block Stop.

The five-second ceiling and one-continuation cap are **selected candidate limits**
from #97's bounded fixtures, not established production defaults. They require both
exact-profile launch-to-exit measurements and race validation before adoption.

The owner is reviewing the Stop continuation policy. One continuation per
agent round was proposed on 2026-09-26, but the owner has **not** accepted
that as the final count. An agent round starts with a request and ends when the
agent runtime accepts completion or cancellation; Stop feedback stays in that
round. The current candidate tracks a per-agent in-memory allowance, but it
does not identify rounds reliably, especially when a subagent resumes. The
record can expire or disappear on resident restart. Do not treat this
candidate behavior as an approved product limit.

A Stop request does not empty the resident by construction. It waits for at
most 4.2 seconds while review work can continue independently; Jev can finish
after Stop returns. One response has a limit of five findings and 2 KiB, so
other findings can remain pending. Composed delivery also retains advice after
a successful response and suppresses repeat delivery only for the current
delivery record. A later request can make still-current advice eligible again.
If the agent repairs a finding, that edit can create new review work. Review
completion, response submission, and agent action must remain separate
observations. The owner is considering whether a final Stop should instead
cancel unfinished work and discard undelivered advice with an explicit
incomplete-review outcome. That would revise the current late-collectability
requirement; it is not implemented or approved.

## Required conformance and present evidence

The conformance harness must use the production resident and controlled offline
Effect `DecisionModel`, with real installed Codex hooks. It must record source-free
event order and timings for edit launch-to-exit, resident completion, background
completion-to-host submission, independently observed model visibility, and Stop
launch-to-exit. Every output is classified by the actual opportunity observed, not
by synthetic delay alone. Raw host text, source, credentials, and source-bearing
backend responses are not retained.

| Gate | Required observation | 2026-09-25 state |
| --- | --- | --- |
| Codex Linux outcome | Linux arm64, Codex 0.155.1, Node 24.20.0, matched before/after through the production resident | **Passed in three consecutive controlled attempts** after the runtime flag was removed: [1](../evidence/delivery-105/linux-repeatability-1.json), [2](../evidence/delivery-105/linux-repeatability-2.json), [3](../evidence/delivery-105/linux-repeatability-3.json). Each before review completed without handoff or repair; each after Stop finding led to a second edit, repaired file, and clear follow-up. A separate [race run](../evidence/delivery-105/linux-matched-race-miss.json) submitted background output just before Stop without observed repair; composition reliability remains open. |
| Claude Linux composition and outcome | Linux arm64, Claude Code 2.1.218, Node 24.20.0, background + Stop through the shared resident module; matched before/after with independently observed repair and clear follow-up | **Passed in the same three consecutive controlled attempts**. Earlier [missed-clear](../evidence/delivery-105/linux-host-command-timing-missed-clear.json) and [hook-admission](../evidence/delivery-105/linux-matched-postreview-instability.json) failures remain retained; the broader lifecycle gate is open. The headless host canceled outstanding async background hooks at session end. |
| Single installed behavior and owner review | No selectable legacy mode; owner considers repeatability, limitations, and rollout before closure | **Implementation passed; final owner decision pending.** This branch installs composed delivery as the sole mode. The owner directed one mode in the session; the issue now requires a separate evidence-backed owner review before adoption. |
| macOS manual follow-up | Real installed Codex and Claude Code on the owner's macOS machine | **Deferred by issue scope**. Closure of #105 must create and link the follow-up issue; no macOS result is claimed here. |
| Background timing | No later edit before delivery; completion during model request/tool call, final response, and after end; actual submission and model visibility | **Partial** on Linux. [Selected early-completion runs](../evidence/delivery-105/linux-background-opportunities.json) submitted async findings on both hosts; Claude made a repair edit and completed a clear follow-up, while Codex finished without a repair. Separate [contended](../evidence/delivery-105/linux-background-opportunities-contended.json) and [late Claude](../evidence/delivery-105/linux-claude-background-late-miss.json) runs also submitted findings without observed repair. This shows host submission does not guarantee model visibility. Exact in-flight tool-call and after-end visibility boundaries need further classification. |
| Stop outcomes | Ready, completes during wait, deadline then later collectable, unavailable/backend failure, stale, multi-unit | **Partial** on Linux. Stop won a lease, collected during its wait, and left a later result collectable. Background delivered a multi-unit batch and a failure notice. Stale and Stop failure-notice delivery remain open. |
| Composition races | Background/Stop overlap, submitted but unconsumed background output, edit/other collector overlap, failed collection or lost ack, repair-generated findings | **Partial** on Linux. Stop won in two fixtures while a background waiter existed; background won in other fixtures. The probes do not prove simultaneous resident collection. One background output was submitted during Stop after the final model message without observed model visibility; pre-Stop unconsumed output remains untested. Repair-generated findings were observed. Edit overlap, failed collection, and lost ack remain open. |
| Isolation | Two concurrent advicees with distinct findings on both paths; isolated worktrees, shared-root unknown origin, supplied child identity | **Missing** as a combined host run. Existing resident subprocess tests cover partition isolation. |
| Timing | Host command launch through response and exit on both profiles; edit, background, and added Stop latency kept distinct | **Partial**: the [new ptrace record](../evidence/delivery-105/linux-host-command-timing.json) measured native edit, background, prompt, and Stop child creation through exit on both Linux profiles. Its selected Stop calls finished below five seconds; tracing adds overhead. Background completion-to-model visibility remains an event-order observation rather than a precise latency bound. |

The [#97 record](issue-97-delivery.md) is useful prior evidence, but its isolated
prototypes and Stop-only production-resident run cannot satisfy the combined gates.
Existing resident tests establish current deterministic collection behavior, not
model visibility. The new Linux probe used a locally cached exact 0.155.1 binary
with Node 24.20.0. The existing macOS GitHub Actions workflow covers package
conformance and does not run this combined matrix.

**Present decision:** the candidate hooks are registered in the installer code.
Keep #105 open until the remaining race, failure, isolation, installer, and
timing gates pass. A background response submitted near session end remains
visibility unknown even when the resident records a successful write. No live
Jev validation is needed for this controlled delivery gate.
