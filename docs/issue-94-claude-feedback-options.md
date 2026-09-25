# Issue #94: Claude finding feedback and next decision

**Status, 2026-09-24:** Hapsland's Claude hook integration already exists. The selected advisory change is implemented: current Claude rule findings now explicitly ask for repair through the existing `PostToolUse` `additionalContext` handoff. The exact Claude 2.1.218 offline delivery check passed. Claude support remains unproven because no authenticated run has tested whether the real model performs a repair after receiving this revised advice.

## What is already implemented and observed

Commit `fc6804f` adds the short Claude finding heading, “Advisory: Edit succeeded. Please repair each finding.” It preserves the existing finding text and advisory envelope. It requests repair only for current rule findings; operational notices and quiet results do not ask for repair. This is still advisory behavior: the hook does not block or undo the edit.

Commit `03fb06b` records the offline delivery check. Four deterministic arms passed **4/4** with the exact cached Claude Code `2.1.218` binary, compiled Hapsland CLI, and a scripted loopback provider:

| Arm | Observed in the second provider request |
| --- | --- |
| Production finding through `additionalContext` | Production `r6_bare_domain_value` finding and the explicit repair instruction were present. |
| Marker printed only to stdout | Marker was absent. |
| Fixture-authored `decision: "block"` envelope | The wrapper-authored, source-free reason was present; it did not prove that production Hapsland emits this envelope. |
| Quiet clear | No finding or repair instruction was present. |

The full offline suite reported **483 passed, 2 skipped**. These are delivery observations: the finding and instruction reached a later provider request. The scripted provider did not model a real Claude reaction, and no repair was observed in this test. In the earlier authenticated Stage A finding session, Claude submitted one classified rule finding and made no later matched repair. That session preceded this wording change, so it does not measure the revised advice.

## Feedback contract boundary

The fixture tested a host-directed block envelope, but did not establish production blocking or real Claude repair. The acting-finding distinction is a candidate Hapsland feedback rule.

## Options

| Option | Meaning | Current status |
| --- | --- | --- |
| **A. Keep explicit repair advice in `additionalContext`** | Preserve the advisory hook and ask Claude to repair a current finding. Test the changed wording with a small authenticated host acceptance pass. | **Implemented and offline delivery-checked.** Real-model reaction is unmeasured. Recommended next step. |
| **B. Change acting findings to a PostToolUse block** | Emit a host-directed `decision: "block"` and `reason`. This changes Hapsland's advisory behavior and needs a separate product decision. | Not selected. Offline wrapper delivery does not establish that blocking improves repair behavior. |
| **C. Defer further Claude acceptance** | Keep the implemented code and defer authenticated evidence. | Available if no new host run is wanted. Claude support remains unproven. |

The design question is no longer whether to implement Claude or whether to run another offline delivery experiment. The Claude integration and Option A wording are already implemented, and the offline check passed. **The one approval decision now is whether to run the two-session authenticated follow-up in [the next-pass proposal](issue-94-next-pass-proposal.md).** Its repair-hook guard passed focused offline checks; the broader integration run had one timing-boundary failure, recorded there without calling the run green. Approval authorizes only the control and finding sessions specified there. It does not authorize retries, Jev calls, OpenCode work, Stage B, or a Claude support claim.
