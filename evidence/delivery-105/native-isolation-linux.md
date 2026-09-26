# Native Linux advice isolation probe

Run `node evidence/delivery-105/run-native-isolation-linux.mjs` from this worktree.
Optional case arguments are `codex-worktrees`, `claude-worktrees`,
`claude-children`, and `codex-children`. Each native process has a 100-second
ceiling. Binaries are pinned to Codex CLI 0.155.1 and Claude Code 2.1.218; paths
can be supplied with `HAPSLAND_105_CODEX` and `HAPSLAND_105_CLAUDE`.

The probe runs the production composed PreToolUse/PostToolUse/Stop adapters and
one shared resident. Review answers come from the controlled Effect model,
with a 2.5-second delay; it does not call live Jev. Two fixture declarations
produce distinct advice markers. Temporary source, native output, and copied
Codex credentials are removed after each case. Retained evidence contains
marker booleans, timing, hashed native session/child IDs, and process results.

| Case | Observed boundary |
| --- | --- |
| Codex concurrent worktrees | Two native sessions in distinct physical Git worktrees; each Stop output carries only its own finding. |
| Claude concurrent worktrees | Two native sessions in distinct physical Git worktrees; each Stop output carries only its own finding. |
| Claude children | Two native supplied child IDs within one session; each SubagentStop receives only its own finding; parent Stop receives neither. |
| Codex children | Native invocation reports no available subagent route and makes no edits. Child isolation is **not established**. |

The JSON report gates observed isolation on successful native exits and hooks,
both destination markers delivered, no foreign marker in Hapsland hook output,
and either overlapping native process lifetimes or two supplied child IDs.
Overlap of process lifetimes is not proof of simultaneous backend evaluation.
The probe checks Stop delivery; it does not test background delivery.

`linux-native-isolation.json` records the four-case run.
`linux-native-isolation-claude-worktrees.json` records an additional Claude pair.
The latter investigated a loose stdout substring signal: `ACK_B` appeared in
system output fields in both processes, while the first process's assistant and
final result text acknowledged only `ACK_A`. These stream-wide ACK flags are
not used to establish isolation, advice visibility, or repair. Evidence here
establishes routing at Hapsland's actual native hook output boundary; matched
repair evidence is recorded separately.
