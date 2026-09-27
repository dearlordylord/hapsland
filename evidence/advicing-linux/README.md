# Linux Advicing evidence index

This directory retains source-free, controlled evidence for the composed
background and finish-hook candidate. It is an **evidence record, not the
product contract or an installed-release support declaration**. Read the
[Advicing target contract](../../docs/advicing-target-contract.md) for required
behavior and [product vocabulary](../../CONTEXT.md) for terms. The exact pinned
release declaration is in [installed release compatibility](../../docs/installed-release-compatibility.md).

## Current candidate and remaining gap

The candidate uses one production resident for Codex CLI and Claude Code. In
three consecutive matched Linux headless runs for each runtime, the before case
completed review without advice or repair; the after case received a finish
hook `block` response, made a repair edit, and completed a clear follow-up:
[attempt 1](linux-repeatability-final-1.json),
[attempt 2](linux-repeatability-final-2.json), and
[attempt 3](linux-repeatability-final-3.json). The background command was
registered but deliberately delayed in those matched outcome checks. The
[selected background record](linux-background-final.json) separately observed
repair and clear follow-up at available background opportunities. These are
selected controlled runs, not a reliability estimate or proof of universal
runtime timing.

**The accepted finish policy remains an implementation gap.** The
[target contract](../../docs/advicing-target-contract.md#work-and-finish-decision)
holds a finish call while *any* admitted work remains unfinished, until all
work settles or its deadline arrives. It then batches advice and discards or
cancels unfinished pre-decision work at either response. The candidate can
return when it first collects eligible advice. Passing repair examples do not
establish the accepted all-work decision policy or every callback fence.

The [resident contract record](round-contract-linux.md) reports 14/14
deterministic cases across both adapter identities. It uses the production
resident, local IPC, real finish CLI subprocess, and a controlled offline
Effect backend; runtime events and model repair are fixtures. It covers
selected leases, reoffer, continuation count, deadline cleanup, stale and
unavailable outcomes. It does not run a native agent process or live Jev.
The [native background timing record](native-background-timing-linux.md)
separates observed output submission from unobserved model visibility. The
[native isolation record](native-isolation-linux.md) covers concurrent
worktrees and supplied Claude child identities; native Codex child routing
was not observed. Shared-root changes of unknown origin remain ineligible.

Native admission probes on 2026-09-26 used Codex CLI 0.155.1 and Claude Code
2.1.218 with session persistence disabled. A synchronous pre-edit hook waited
6.5 seconds against a two-second native timeout. The matching post-edit hook
arrived 2,019 ms after pre-edit start in Codex, 2,046 ms in Claude main, and
2,040 ms in a Claude child: each runtime let the edit proceed on timeout.
Neither timed-out hook recorded delayed completion during a seven-second
after-exit observation. Both main-agent profiles exposed matching pre/post
tool IDs, as did the observed Claude child path. These selected runs support
rejecting post-edit admission without a valid permit. They do not prove
arbitrary delayed command launch, every child schedule, or transcript order
as a native hook ordering guarantee.

The owner conditionally accepted a narrower Linux support boundary: advice
at observed runtime opportunities, without a promise for in-flight model/tool
calls or output after session end. Three Claude attempts did not put an
actionable finding inside the target foreground tool window; see
[the rerun record](claude-reset-rerun-linux.md). The Codex Bash interval
case is retained in [native timing](native-background-timing-linux.md) for a
later recheck. Selected [launch-to-exit measurements](linux-final-command-timing.json)
are observations, not universal latency bounds. The Foldkit
[timing diagrams](../../packages/agent-flow-viz/README.md#native-timing-evidence-at-the-bottom-of-the-page)
visualize required and exploratory cases with unknown visibility marked.

The candidate is not adopted as a new pinned installed release. Owner visual
review and final adoption remain open. Manual macOS testing with real installed
Codex and Claude belongs to a follow-up created when the current issue closes.

For this exact candidate profile, the composed command reserves 4.2 seconds
inside a five-second native finish-hook timeout. Its background wait has a
20-second internal limit inside a 25-second native command timeout. These are
implementation settings and selected-profile measurements, not universal
product timing guarantees.

Candidate round ownership was introduced in `b36b879` and the Codex edit-hook
correction in `bc50725`. After merging master in `98298a4`, the recorded full
suite passed 535 tests with two skipped; direct-event conformance passed
231/231. Those runs precede this documentation extraction and do not validate
the unimplemented all-work finish policy.

## Historical records

Earlier [matched before/after](linux-matched-before-after.json) and
[repeatability runs](linux-repeatability-1.json) used prior candidate behavior.
The [seven-case Codex probe](linux-arm64-codex-0.155.1.json) and
[initial background opportunity run](linux-background-opportunities.json)
demonstrated both successful repair and missed handoffs. The
[race miss](linux-matched-race-miss.json),
[missed clear follow-up](linux-host-command-timing-missed-clear.json),
[post-review instability](linux-matched-postreview-instability.json),
[cold baseline miss](linux-repeatability-round-cold-miss.json), and
[fast-baseline miss](linux-repeatability-round-fast-baseline-miss.json)
remain retained. They are not silently counted as passing matched outcomes.
The more detailed records in this directory preserve their own setup,
observations, and limits. Git history retains prior candidate narratives.

Run a named probe from this directory using its corresponding `run-*.mjs`
script and exact installed runtime profile. Scripts use a controlled offline
Effect backend unless their record says otherwise. Records retain event kinds,
counts, timings, and outcome flags; they do not retain credentials, source,
raw host output, or source-bearing Jev responses.
