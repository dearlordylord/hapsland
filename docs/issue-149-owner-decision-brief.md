# #149: important decisions and assumptions for owner review

**Purpose:** Show the product owner the consequential choices made while implementing #145, #142, #148, #147, #138, and #143 together.
**Status:** Working review brief; the branch is a draft PR and #147 design acceptance is paused at the owner's request.
**Authority:** Implementation and validation evidence. Owner decisions and accepted product contracts remain in the linked issues and [type/function specification](type-function-review-proposal.md); this brief does not create a new product contract.
**Expected use:** Review the choices and limits below before accepting the connected diagram or integrating [PR #149](https://github.com/dearlordylord/hapsland/pull/149).
**Lifecycle:** Temporary until PR #149 is merged or closed. At that trigger, consolidate any corrected product decisions into their issue or accepted specification owner, move remaining work into issues, update inbound links, and **delete** this brief. Review it whenever the owner changes a decision or the branch changes materially.

## In plain language

Hapsland now gathers the part of a TypeScript file that was edited and the nearby code it needs from other local files. It sends one bounded review request to Jev. Claude can receive the resulting advice through its edit response, a later background message, or Stop. The shared review process controls how many jobs run at once and closes itself after it has been idle for five seconds.

The connected dashboard shows those same steps from the recorded reducer run. It does not make its own decision about what Hapsland should do. The branch is still a draft. Its diagram has not been accepted by the owner, and this work has not been merged into `master`.

## Current state

The work began from `master` at `baafffe` in separate issue worktrees and was assembled in `integration/issues-145-148`. The implementation is committed on a draft PR; it is not merged into `master`. The latest full application suite, before the total-request ceiling was removed, passed 723 tests with 2 skipped and one Claude hook timeout; that test passed in an isolated rerun. After removing the ceiling, focused direct-event and resident tests, typecheck, the product build, and direct-event conformance validation passed. The full suite has not been rerun after this change. The browser check could not start Chromium in this container because `libatk-1.0.so.0` is absent. Independent issue reviews found no remaining concrete gap in #145, #142, #148, #143, #147, or #138 before the per-rule correction. The #142 macOS lower source-limit case passed a native macOS smoke check after the helper was rebuilt; the broader package check still fails because `docs/npm-quickstart.md` is absent. The owner has asked to pause diagram acceptance while this status is explained.

## Decisions the owner made during this work

| Decision | Consequence | Source |
| --- | --- | --- |
| Enable bounded cross-file type and function review now. Do not require an advice-quality comparison first. | The new evidence path is the normal direct-edit path. The comparison is a later task, [#150](https://github.com/dearlordylord/hapsland/issues/150); enabling it makes no claim that Jev advice is better. | [#138 owner decision](https://github.com/dearlordylord/hapsland/issues/138), [accepted specification](type-function-review-proposal.md) |
| Retire the old same-file-only Jev input; do not preserve legacy user behavior. | A complete review unit can contain one file or several. The former input route is retired. | [#138 owner decision](https://github.com/dearlordylord/hapsland/issues/138) |
| Keep the current review contracts at version 1 during pre-release work. | Schema-1 rule packs require explicit targets; current type and function input contracts both use `/v1`. Superseded production routes are removed. | Owner instruction during this #149 review on 2026-09-29; [compatibility contract](review-contract-compatibility.md) |
| Remove the 128 KiB total-request ceiling. | The 20 KiB rendered evidence budget still applies; rule text and provider overhead no longer deny dispatch based on aggregate bytes. Provider-body measurement remains available for evidence. | Owner instruction during this #149 review on 2026-09-29; [type/function specification](type-function-review-proposal.md) |
| Distinguish observed facts from Bend commands in the diagram, using closed typed arrow kinds. | Accepted facts and state movement are orange, supplied Jev facts are gold, and commands are purple dashed. The view styles every declared arrow kind and rejects evidence for an undeclared route; a command alone never claims a native effect. | Owner instruction during this #149 review on 2026-09-29; [flow projection](../packages/agent-flow-projection/README.md) |
| Restore the connected flow diagram and make it a projection of the running canonical reducer. | The older `diagram.ts` supplies a visual reference only. State, active routes, commands, and limits come from checked canonical replay; `Flow.step` does not drive the production view. The first disconnected #147 design was not accepted. | [#147 owner respec](https://github.com/dearlordylord/hapsland/issues/147) |
| Defer npm publication. | [#87](https://github.com/dearlordylord/hapsland/issues/87) was closed at the owner's direction. PR #149 changes code in a draft branch; it starts no publication. | [#87 closure](https://github.com/dearlordylord/hapsland/issues/87) |

## Existing issue contracts applied in the implementation

| Area | Choice and visible effect | Important limit |
| --- | --- | --- |
| Claude feedback, [#145](https://github.com/dearlordylord/hapsland/issues/145) | One resident-owned finding can reach Claude through the immediate edit response, background output, or Stop. Advice is the default. Blocking feedback requires a user's opt-in and a final policy check. The complete encoded Claude response has a 10 KiB limit and no separate five-finding cap. | A successful host write proves submission, not that Claude saw, used, or repaired the advice. Slow review can miss the immediate hook and remain eligible later. |
| Graph limits, [#142](https://github.com/dearlordylord/hapsland/issues/142) | One validated limits snapshot follows each review unit. Bend decides traversal and budget outcomes. Native code checks the physical source read before it happens. The default source ceiling is 256 KiB per file and the evidence-tree ceiling is 20 KiB. | The evidence-tree cap and full Jev request cap are different checks. A missing, excluded, unsupported, or capped reference is marked omitted; a rule runs only when its declared evidence needs are still met. |
| Jev requests, [#148](https://github.com/dearlordylord/hapsland/issues/148) | Bend issues explicit request permission. Eight preparation places and eight Jev request places are separate from the resident's item/byte capacity ledger. A ninth ready Jev request becomes unavailable immediately. | There is no Jev wait queue in this design. A Bend command does not prove that native code sent a request. |
| Resident lifetime, [#143](https://github.com/dearlordylord/hapsland/issues/143) | An empty shared resident retires after a five-second grace period; a later hook can start a new lifetime. | Active connections, work, advice, leases, notices, and valid resume work keep it alive. It is shared by callers using one resident connection directory, not tied to a single worktree. |

## Implementation assumptions and limits to inspect

| Assumption or choice made without a new owner decision | Practical effect and status |
| --- | --- |
| The opening dashboard replay should show a broad successful path. | The default now follows two observations through a waiting dispatch entry, source preparation, two concurrent Jev requests, ready advice, advice leases, acknowledged host output, finalization, and round retirement. All 54 supplied events are accepted by the checked reducer; 31 steps light at least one connection and 17 distinct routes light across the replay. The last step has no active round, work, capacity charge, ready advice, lease, submission batch, or output slot; a source-free delivery counter remains for prior use. The opening step explains how production edit admission leads to `openRound`, while making clear that this source-free trace supplies that event directly. Steps without a mapped connection still show their event and state below the graph. |
| A configured source cap below 256 KiB must work on macOS as well as Linux. | The final #142 review found that the old macOS helper could only enforce the default cap. The rebuilt arm64 helper passed native checks at 80 bytes and at the default 256 KiB, and refused an oversized file and a symlink. [The macOS evidence](https://github.com/dearlordylord/hapsland/pull/149#issuecomment-5892687827) supports that narrow platform claim; the full package check has a separate missing-document failure. |

## What the evidence does not establish

- The offline tests and source-free diagram replay do not measure whether cross-file context improves Jev's advice. That question is in [#150](https://github.com/dearlordylord/hapsland/issues/150).
- The diagram browser checks do not prove installed host behavior. The named before/after diagram panels are linked in [#147](https://github.com/dearlordylord/hapsland/issues/147); owner design acceptance is still paused.
- PR #149 is a draft. The six implementation issues stay open until the integrated work is accepted and merged. No npm publication is underway.
