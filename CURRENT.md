# Current

This is a temporary migration handoff. Delete `CURRENT.md` in #137 after the
final source-linked authority report replaces it; do not publish it as a
permanent product document.

## Objective and current step

Implement [#117–#137](https://github.com/dearlordylord/hapsland/issues/116):
one authoritative Bend transition for Hapsland decisions, shared by production
and the final visualization. The [#117 authority audit](docs/bend-logic-authority-map.md)
and [#118 requirements crosswalk](docs/bend-requirements-crosswalk.md) are written.
#141's [Bend import graph and separate dashboard diagram](docs/import-graph-bend-state-machine.md)
were checked by the owner. The dashboard now shows a segmented tree-budget bar
and a denied A → X permission edge in the branching tree. Bend skips X without
reading it, continues pending branches, and ends that trace with `TreeLimit`
after E and G do not fit. The owner resumed the migration in a new session.
#119's first canonical state, events, commands, checked adapter, and independent
traces merged through PR #144 and #119 is closed. The next migration slice is
#120. Resident switching under #120–#134 is still pending. Configurable graph limits and
general budget/termination proofs are tracked separately in
[#142](https://github.com/dearlordylord/hapsland/issues/142).

The integrated epic is in `/workspace/typescript/jev-worktrees/bend-full-flow`
(`feat/bend-full-flow`, merge `ea6584b`). Start #120 in a new task worktree
from the latest epic tip. The old `/tmp/hapsland-bend-handoff.md` predates #119
and is no longer a valid resume point. The `/workspace/typescript/jev` checkout
is older and is not the edit target.

## Current code and accepted target

| Boundary | Running code | Accepted target |
| --- | --- | --- |
| Source capture | Event-named paths are captured independently, up to 32 KiB each; an import makes the current type analyzer unsupported. | Follow supported references into eligible supporting files. Check every path before reading source. Capture up to **256 KiB per file**. |
| Review evidence | Same-file named types only. | One selected root plus a complete bounded graph that may contain several files; **20 KiB canonical encoded evidence tree per review unit**. A missing, excluded, unsupported, or capped required edge makes that unit incomplete and produces no Jev request. Independent complete units continue. |
| File settings | The resident also requires a separate repository grant before it sends source to Jev. | Remove that grant. When the installed runtime runs Hapsland and Jev credentials are available, review all otherwise eligible files by default. Includes/excludes can narrow the set; protected and ignored files stay excluded. |
| Resident capacity | 64 work items/8 MiB shared by agents in one resident; each agent scope may use up to 16 items/2 MiB. Temporary preparation space is released, then review units request space in order. | Preserve ordered partial admission. Raise/rework byte limits with the 256 KiB file limit so valid files can be prepared and checked again. Model every installed reservation purpose in Bend. |
| Visualization | #115's simplified Bend `Flow.step` drives the interim page. | Production and the final full-flow page use the same canonical checked transition. #135 adds a build-generated inventory of what reserves review capacity and a live capacity panel; #120/#122 supply complete Bend data first. A separate import-graph state-machine diagram follows reconciliation under [#141](https://github.com/dearlordylord/hapsland/issues/141). |

In this checkout, 8 of 180 TypeScript files under `src` and `packages`
exceed 32 KiB; none exceed 256 KiB. A file near 32 KiB is about 500–800
lines here. These counts calibrate the cap; they are not a parser-performance
or Jev-request-size claim.

## Closed decisions and specified rules

- Hapsland is the product; Jev is the external review backend. The agent
  runtime supplies attributed edit events; a stable snapshot does not by
  itself establish authorship.
- A directly edited declaration is a selected root. A referenced declaration
  in another file is supporting evidence, not a separately attributed edit.
  For A.ts → B.ts → excluded C.ts, A and B may be captured after their own
  checks; C is rejected before its source is read. A's dependent unit is
  incomplete and makes no Jev request. Independent complete units may proceed.
- The 20 KiB tree cap is separate from captured source bytes and the complete
  Jev request. Query/provider-aware request sizing is postponed to
  [#140](https://github.com/dearlordylord/hapsland/issues/140), with a finite
  conservative full-request gate required for initial adoption.
- File settings are the only Hapsland file permission settings. There is no
  separate repository approval in the target design. The old grant check
  still exists in running code and must be removed in #132. Installation,
  the agent runtime's trust check, and Jev credentials remain distinct
  operational steps.
- Before Hapsland sends a review unit to Jev, it checks that the root and
  each supporting file are still allowed and match the captured source.
  Before Hapsland gives advice, it checks again. If A, B, the rules, or
  the file settings changed in a way that changes the review unit, it
  drops the old Jev result. It can reuse a result only when the root,
  complete evidence, rules, and Jev input are the same. This target rule
  is written in [#93](docs/issue-93-type-function-review-spec.md);
  cross-file code is pending.
- Resident capacity is a logical memory ledger, not the Jev queue or a
  text-size/review-speed score. Replacement releases preparation workspace
  and then attempts independent unit reservations in order. Capacity
  unavailable is not a clear Jev result. The final dashboard shows ledger
  usage, limits, reservations, releases, and refusals.
- Immediate capacity refusal remains the current behavior. Bounded retention
  and retry/backpressure is explicitly postponed to
  [#139](https://github.com/dearlordylord/hapsland/issues/139).
- Continue communication here; no email or outbound messaging.

## Active threads

1. **Reconciliation recorded:** #117's source-linked owner/reachability audit and
   #118's accepted-versus-current requirements matrix use the amended
   [#93 review spec](docs/issue-93-type-function-review-spec.md),
   [#96 compatibility decision](docs/issue-96-contract-compatibility.md),
   and [#138 integration task](https://github.com/dearlordylord/hapsland/issues/138).
   Record the change from a separate repository grant to file settings only.
2. **Formal import graph ready for review:** [#141](https://github.com/dearlordylord/hapsland/issues/141)
   now has [`ImportGraph.bend`](packages/agent-flow-bend/ImportGraph.bend), a
   [state-machine document](docs/import-graph-bend-state-machine.md), and a
   separate dashboard diagram. Native code will supply syntax/path/capture
   facts; Bend owns traversal, read commands, budgets, cycles, and
   complete/incomplete decisions. The visualization was built by an Astra
   medium agent. Proposed import forms and limits are recorded for review,
   not claimed as installed behavior.
3. **Capacity:** #120/#122 bump or rework the ledger with 256 KiB capture.
   Keep accounting bounded and test concurrent advicees. This is supporting
   work for the review change.
4. **Migration:** #119 defined the first canonical transition; #120–#134 move the
   production decision slices; #135–#137 complete visualization, host
   validation, and evidence-backed verification. The installed 32 KiB
   supported-profile remains the truthful runtime claim until code and
   conformance evidence change.

The exact Jev input format and finite initial full-request limit remain
engineering decisions. Changed review inputs must not reuse an old result
by mistake; public “v1/v2” naming is optional.

## #119 first boundary (merged 2026-09-28)

The first canonical Bend state/event/command boundary is implemented in
`packages/agent-flow-bend/Canonical.bend`, with a checked adapter and independent
fixture. Six source-free traces cover competing advicees, zero/many units,
pending Stop, unknown output, deadline cleanup, and lifetime retirement. The
many-unit trace now checks accepted → refused → accepted; a refusal does not
stop later units. Shared and advicee capacity totals in the checked projection
come from compiled Bend functions. The proposed full-flow display and the
still-needed per-unit Bend output are in
[`docs/capacity-dashboard-plan.md`](docs/capacity-dashboard-plan.md).
`npm run test:canonical`, adapter typecheck, and the repository `npm test`
passed before merge. The repository run passed 65 test files and 578 tests,
with one file and two tests skipped. `npm run test:import-graph` and the
visualization build also passed. Package-wide `npm test` under
`packages/agent-flow-bend` was not a merge gate; its older Flow build still
has a separate compiler-footer compatibility problem.
This does not switch resident paths or make the installed cross-file
profile available. The design and current boundary are in
[`docs/bend-canonical-transition-interface.md`](docs/bend-canonical-transition-interface.md).

## Next autonomous migration run

Use the GitHub issue bodies as the task contracts. Work in a dedicated task
worktree based on the latest `feat/bend-full-flow` tip. For each slice, keep
the production resident and the checked Bend transition in sync, verify the
changed path offline, review the diff, merge into the epic branch, and close
the issue only when its criteria have evidence. Update this handoff after each
merged slice. Do not treat the separate #141 import-graph diagram as the final
production replay.

One valid single-agent order is #120, #121, #122, #123, #124, #125, #126,
#127, #128, #129, #130, #131, #132, #133, #134, #135. Dependencies allow
#132–#134 to proceed after their own blockers while the #123–#131 chain is in
progress; #135 needs both #131 and #134. #135 delivers the build-generated
capacity inventory and live ledger panel from compiled Bend output. #136
validates native Codex and Claude flows after #131/#134; #137 is the final
authority review after #135/#136. #143 is a separate resident-process lifetime
task, not part of the Bend state-cleanup task #131. #139/#140/#142 remain
separate follow-ups.

The imported graph and audit work from #117/#118/#141 is present in the epic
branch, but those issues remain open. Audit their own criteria before closing
them; their open status does not turn #119 back into active work.
