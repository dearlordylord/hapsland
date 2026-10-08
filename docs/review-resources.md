# Review resources and limits

**Purpose:** Explain how Hapsland bounds preparation, classifier requests, retained review state, and advice delivery.
**Audience:** End users assessing resource limits; contributors, including coding agents.
**Status:** Active maintained implementation guidance.
**Authority:** Maintained guidance describing the current implementation; accepted review, configuration, and advice contracts own product behavior. Numerical bounds and offline checks are not throughput, latency, process-memory, or platform-support guarantees.
**Expected use:** Understand which resource refused work, choose configuration controls, and locate the implementation and checks before changing a limit.
**Lifecycle:** Keep this guide current with dispatch, capacity, graph, provider, IPC, and delivery changes. Review when any limit, saturation behavior, configuration ownership, or resource-release boundary changes; replace superseded descriptions in place.

Hapsland manages resources around the review backend, including the number of
concurrent classifier requests. These limits belong to different stages. A free
request permit does not mean that the resident can retain another review unit,
and a request that fits the provider's input limits still needs Hapsland's
authorization to run.

## Preparation and classifier requests

Each shared resident has two separate pools in the checked
[dispatch policy](../packages/agent-flow-bend/Dispatch.bend):

| Resource | Current bound | What occupies it |
| --- | --- | --- |
| Preparation jobs | 8 | Running native preparation jobs that capture and analyze source |
| Classifier request permits | 8 | Issued backend requests, from reservation through physical effect settlement |

Preparation does not consume a classifier request permit. Ready review work
passes final source, rule, credential, and destination checks before Bend can
issue a request command. The TypeScript executor performs the external effect
and reports whether it started, failed before sending, completed, timed out, or
was interrupted. Command issuance alone is not evidence that source was sent.

When all eight request permits are occupied, another ready review is
settled as unavailable immediately. Hapsland does not retain it in a backend
wait queue or automatically retry it when a permit becomes free. Preparation
scheduling and resident capacity admission have their own behavior. Future
waiting policies remain separate decisions in
[#160](https://github.com/dearlordylord/hapsland/issues/160) and
[#139](https://github.com/dearlordylord/hapsland/issues/139).

A cancellation attempt does not free a started request's permit while its
native Effect is still settling. Late and duplicate callbacks retain their
original work identity and cannot authorize a new result for superseded work.
This prevents reuse of a charged request slot before the old effect ends.

The [provider layer](../packages/review-execution/src/review-providers/live.ts) selects Jev, Cloudflare or OpenAI
through Effect's `DecisionModel` integration. All three use the shared resident
request lifecycle; selecting Cloudflare does not create another eight-slot
pool. Internal `jevRequest` event names refer to that shared lifecycle.

These are **per-resident** bounds, shared by its advicees. Sessions and worktrees
using the same resident connection directory share them. Separate resident
processes do not share a machine-wide or account-wide quota. The pool limits
are current product policy, not user JSONC settings.

## Retained state and admission

The [resident capacity ledger](../packages/resident-runtime/src/resident/capacity.ts) counts logical
reservations separately from dispatch slots:

| Scope | Item bound | Logical byte bound |
| --- | --- | --- |
| Whole resident | 512 | 256 MiB |
| One advicee recipient, with its active pinned source root | 16 | 32 MiB |

The executor measures the charge for an observation, preparation workspace,
review unit, result, or advice recheck. Bend owns admission, resizing,
replacement, and release. A unit that cannot reserve capacity is unavailable;
capacity refusal is not a clear assessment. These reservations include
conservative workspace estimates and are **not an operating-system RSS cap**.
Native parser allocations, process overhead, and provider transport have
separate physical boundaries.

Preparation admission distinguishes a capacity refusal from a stale round,
work in the wrong stage, and an invalid measurement. Resizing a reservation
also distinguishes a capacity refusal from an invalid reservation. These
results describe the existing checked ledger decision; they do not authorize
another admission attempt. A preparation capacity refusal records the measured
requested bytes and, when the ledger identifies it, the refusing item or byte
constraint. An invalid measurement is an internal failure, not saturation.

Pre-edit permits are a different admission resource. User-owned
`editPermitLimits` defaults to 32 pending permits per advicee and 4096 across
the resident. These settings do not increase classifier concurrency, review
capacity, or the number of open virtual rounds. Project configuration cannot
change shared resident permit limits. See
[configuration](configuration.md#runtime-behavior) and the
[decision boundary ledger](typescript-decision-boundary-ledger.md) for the
independent identity, round, and cleanup bounds.

## Source collection and provider input

<!-- graph-ceilings:start -->

The configured graph profile bounds the evidence for one review unit. Projects may lower these ceilings:

| Field | Ceiling |
| --- | --- |
| `sourceBytes` | 2,097,152 bytes |
| `treeBytes` | 20,480 bytes |
| `files` | 8 |
| `readBytes` | 12,582,912 bytes |
| `outgoingEdges` | 16 |
| `depth` | 4 |
| `work` | 128 |

<!-- graph-ceilings:end -->

Every root and supporting file passes file
selection before source capture. A marked omission can make some rules
inapplicable without making an independent eligible rule or unit unavailable.

Stable capture applies the effective `sourceBytes` limit to the whole file.
An oversized file is refused rather than read as a truncated prefix. Root and
supporting captures also share an observation budget of 64 files and 16 MiB;
this budget is separate from the graph profile for one review unit. A capture
refusal retains a closed diagnostic code and bounded facts, such as the
observed file size or the aggregate resource that refused the next read.
Supporting capture diagnostics preserve the available partial graph and its
existing rule-applicability decisions.

Use the [graph settings](configuration.md) to narrow collection within the
maximum values. Project limits may lower user limits, not raise them.
Increasing a provider's context window does not increase Hapsland's collection
limits or allow excluded source to be read.

The [provider declarations](../packages/runtime-environment/src/runtime/backend.ts) and
[provider guide](review-providers.md) own model-specific declarations and local
transport checks. The adapters enforce their catalogued question and HTTP body bounds, measuring the actual encoded request including
questions, criteria, and escaping. There is no separate provider-independent
ceiling on the total backend request body; the evidence-tree ceiling still
applies.

Declared token budgets are recorded, but Hapsland ships no tokenizer and does
not claim exact token-budget enforcement. An unknown provider limit is unknown,
not unlimited. Local input validation does not establish account rate limits,
cost budgets, live provider quality, or protection from provider-side
truncation. A rejected request is not silently truncated, split, retried, or
sent to another provider.

## Deadlines, delivery, and release

Review evaluation has a finite 15-second deadline and no automatic backend
retry. Hook response windows and Stop cutoffs belong to the
[advice contract](advicing-target-contract.md); they do not promise that a
request completes or that an agent sees or follows its advice.

Pending advice has a ten-minute relevance lifetime, with expiry at equality.
Collection follows the [source freshness](review-contract-compatibility.md#freshness-and-result-reuse),
[edit-owned settings](review-contract-compatibility.md#edit-owned-settings), and
[handoff authority](advicing-target-contract.md#handoff-reoffer-and-continuation-count)
contracts. The final encoded Claude response has a 10 KiB bound and no
separate finding-count cap. Output-fit refusal does not convert a finding into
a clear review. Delivery ownership and permitted later collection follow the
checked lease, expiry, and response-authority rules.

Local IPC independently permits 32 connections and frames of at most 256 KiB
in the [protocol](../packages/resident-transport/src/resident/protocol.ts). These are transport limits,
not classifier permits or evidence-tree sizes.

Cancellation, supersession, expiry, and round closure release logical ownership
through the reducer and execute native cleanup through Effect. The resident
can retire only when its checked cleanup conditions allow it; one agent's
Stop does not end another agent's work. A resident process restart loses
memory-only work and advice rather than recovering a durable review queue.

## Evidence and changing a bound

Use the [testing matrix](testing-matrix.md) to select affected checks.
[Request scenarios](../src/resident/jev-request.test.ts) exercise saturation,
interruption, and permit reuse with controlled effects.
[Capacity scenarios](../src/resident/capacity.test.ts) check reservation and
release. [Graph scenarios](../src/direct-event/graph-resolver.test.ts),
[provider checks](../src/review-providers/cloudflare.test.ts), and
[collection checks](../src/resident/collection.test.ts) cover their distinct
boundaries. These tests are deterministic and offline; native and live
observations establish only their separately declared environments.

Before changing a bound, identify its owning resource, configuration scope,
exact-limit behavior, and physical release point. Reconcile its contract,
implementation, and consumer checks together. Increasing one bound does not
remove a downstream limit or establish a new performance or support claim.
