# Issue #105: reusable composed delivery contract and adoption decision

Status: **candidate contract; Linux outcome gate open on 2026-09-25**. This
document is the proposed specification for the combined Codex and Claude Code
paths. It does not enable a background hook or a Stop hook. The current installed Codex path
continues to admit direct edits and collect advice on later mapped edit hooks.
The earlier probe did not pass the revised issue's before/after outcome gate.

## Required product outcome

The revised [issue #105](https://github.com/dearlordylord/hapsland/issues/105)
requires matched, headless Linux before/after observations. In the **before**
case, an attributable edit produces an actionable review finding, but the
current delivery policy gives the agent no suggestion before it finishes; the
defect remains. In the **after** case, a bounded host response carries the
current suggestion to that recipient, a later model action follows it, the file
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
recipient partitions, collection leases, submitted/uncertain handoff state,
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
adapter admits one attributed direct observation through `PostToolUse` and may collect
previously ready advice. A native `async: true` background `PostToolUse` command and a
synchronous `Stop` command are **delivery triggers only**. Neither may maintain a
second review queue, reconstruct a review from the filesystem, or call Jev to obtain
delivery output. All three collectors call the same resident collection operation.

The partition key is the tuple `(canonical physical working root, agent host,
exact supported host version, session_id, supplied agent_id or null)`. It is created
from the attributed edit and must be supplied unchanged by each collector. `turn_id`
and `tool_use_id` identify events and continuation attempts; they do not replace the
recipient partition. Do not infer a missing agent from the latest caller, root
co-location, or a checkpoint. A direct edit with a supplied child `agent_id` remains
child-owned. A shared-root checkpoint change with unknown origin has no recipient and
cannot yield addressed advice. Isolated worktrees have distinct canonical roots.

Every collection checks root identity, recipient identity, enablement, credential
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
retain a bounded, source-free submitted record (advice identity, recipient, turn
chain, output surface, timestamp and token) through the relevant turn boundary. A
background submission immediately before Stop is therefore **submitted/visibility
unknown**. Stop must not race to submit the same advice again during that turn chain;
it can collect other unhanded findings. Once an independent host continuation
explicitly demonstrates consumption, the item may be retired. If visibility is never
observed, a later eligible collection may retry after the lease and turn boundary,
subject to freshness and expiry; that retry can duplicate a prior host submission.
No exactly-once or guaranteed model-visibility claim is made. The existing edit
collector must use this same protocol when the combined path is adopted.

The observable stages are separate: `review completed` (resident/backend),
`resident collected` (lease issued), `host submitted` (write completed), and
`model visible` (independent host trace or a distinctive subsequent model action).
Collection and acknowledgement alone establish neither of the last two stages.

## Background command

The proposed registration adds a native async command for the same attributed
`PostToolUse` event that admits the edit. The synchronous edit hook keeps its existing
admission and ordinary collection behavior. The background command waits for its
exact recipient's resident work, including the admission race, and emits at most one
bounded `additionalContext` response through the native async hook output channel.
It exits quietly when no eligible advice becomes ready. Only one background waiter
may be active per recipient; later triggers coalesce against that waiter. A waiter
holds no advice lease while waiting. It has a 20-second wall-clock cap from command
launch to exit and a corresponding host command timeout; the resident's existing
item and byte capacity limits remain authoritative. A canceled hook releases any
unsubmitted lease. Session end cancels the waiter, but does not cancel resident-owned
review work. Resident memory lifetime and the ten-minute advice relevance expiry
still bound later collectability.

Async completion is only an output opportunity at a Codex safe point. It does not
interrupt an in-flight model request or tool call, and it does not start a new turn.
Output during the final model response or after turn/session end may have no model
recipient. Host submission and model visibility must be measured independently.

## Stop command and continuation

The candidate Stop policy starts its budget at native command launch. It first checks
the exact recipient and turn-chain continuation state, then collects ready advice.
If eligible work is still in flight, it polls that recipient's resident state at no
more than 50 ms intervals until a finding becomes available or the internal 4.2-second
deadline expires. The internal deadline includes startup, parsing, resident startup
if needed, IPC, collection, encoding, writing, and process exit; the native command
timeout is five seconds from launch. Any remaining budget is reserved for output and
exit. No stage may silently reset the clock. On expiry the hook allows Stop and leaves
review work running in the resident. A later eligible hook may collect the eventual
result if it is still current and unexpired.

At most **one** `decision: "block"` continuation is permitted per session and
user-initiated turn chain, shared across all Stop invocations in that chain. A native
`stop_hook_active` reentry consumes that allowance and cannot block again. The
allowance resets only on the next distinct user prompt in the same session, not on a
model repair, a tool call, a new `turn_id` caused by continuation, or another finding.
The installed candidate therefore also needs a bounded `UserPromptSubmit` marker
for each session to advance a source-free turn-chain generation. Stop reads and
atomically consumes that generation in the resident before returning a block; a
repeated or missing marker cannot reset the allowance. The marker performs no
review or advice collection.
When the allowance is exhausted, Stop may submit no second block; new repair
findings remain resident-owned for a later eligible opportunity. Background and edit
collection can still submit advice at their normal safe points, subject to the same
lease and visibility protocol. Failure to establish the user-turn chain fails quiet
for Stop and is recorded as unknown, rather than risking an unbounded loop.

The five-second ceiling and one-continuation cap are **selected candidate limits**
from #97's bounded fixtures, not established production defaults. They require both
exact-profile launch-to-exit measurements and race validation before adoption.

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
| Linux exact host | Linux arm64, Codex 0.155.1, Node 24.20.0, combined hooks through production resident | **Partial**. [Seven controlled host fixtures](../evidence/delivery-105/README.md) exercised both hooks, overlap, late retention, multi-unit delivery, and backend unavailability. Isolation, stale, and lost-acknowledgement gates remain open. |
| Claude Linux composition and outcome | Linux arm64, Claude Code 2.1.218, Node 24.20.0, background + Stop through the shared resident module; matched before/after with independently observed repair and clear follow-up | **Missing**. Existing #94 block evidence is useful prior evidence, but does not exercise the required composed path. |
| macOS manual follow-up | Real installed Codex and Claude Code on the owner's macOS machine | **Deferred by issue scope**. Closure of #105 must create and link the follow-up issue; no macOS result is claimed here. |
| Background timing | No later edit; completion during model request/tool call, final response, and after end; actual submission and model visibility | **Partial** on Linux. Early output preceded independently observed repair; output after the final model message produced no observed repair. Tool-call and after-end visibility remain unmeasured. |
| Stop outcomes | Ready, completes during wait, deadline then later collectable, unavailable/backend failure, stale, multi-unit | **Partial** on Linux. Stop won a lease, collected during its wait, and left a later result collectable. Background delivered a multi-unit batch and a failure notice. Stale and Stop failure-notice delivery remain open. |
| Composition races | Background/Stop overlap, submitted but unconsumed background output, edit/other collector overlap, failed collection or lost ack, repair-generated findings | **Partial** on Linux. Stop won in two fixtures while a background waiter existed; background won in other fixtures. The probes do not prove simultaneous resident collection. One background output was submitted during Stop after the final model message without observed model visibility; pre-Stop unconsumed output remains untested. Repair-generated findings were observed. Edit overlap, failed collection, and lost ack remain open. |
| Isolation | Two concurrent recipients with distinct findings on both paths; isolated worktrees, shared-root unknown origin, supplied child identity | **Missing** as a combined host run. Existing resident subprocess tests cover partition isolation. |
| Timing | Host command launch through response and exit on both profiles; edit, background, and added Stop latency kept distinct | **Partial**: the Linux #105 tracer recorded all three command classes through exit. macOS is unmeasured. |

The [#97 record](issue-97-delivery.md) is useful prior evidence, but its isolated
prototypes and Stop-only production-resident run cannot satisfy the combined gates.
Existing resident tests establish current deterministic collection behavior, not
model visibility. The new Linux probe used a locally cached exact 0.155.1 binary
with Node 24.20.0. The existing macOS GitHub Actions workflow covers package
conformance and does not run this combined matrix.

**Present decision:** do not register the proposed background or Stop hooks on
either host yet. Retain current delivery policies while the Linux
outcome and composition gates remain open. A rejection of adoption alone no
longer completes #105: its revised success criterion requires the observed
before/after repair outcome for both Linux hosts. Adoption requires the
resident submitted/uncertain lifecycle, passing Linux evidence, sanitized
retained evidence, and a new support declaration. No live Jev validation is
needed for this controlled delivery gate.
