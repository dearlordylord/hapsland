# TypeScript decisions outside Bend

**Purpose:** Account for reviewed product decisions that Hapsland deliberately makes in TypeScript before or around the canonical Bend reducer.
**Status:** Active maintained boundary ledger.
**Authority:** Maintained architecture guidance and a record of owner review. Accepted product contracts remain in their named specification owners; this ledger does not grant new runtime support.
**Expected use:** Add an entry when a TypeScript decision is explicitly reviewed as remaining outside Bend. Use the source links to check the current implementation and the Bend boundary; do not treat an unlisted decision as approved by omission.
**Lifecycle:** Keep each entry current with its TypeScript owner, reducer input, and reason for its placement. Review an entry when its native adapter, canonical event contract, or accepted product boundary changes. Consolidate superseded entries into the current entry or delete them after transferring any still-current decision to its contract owner.

This ledger records **decisions**, not every measurement or external effect. Each entry must name the concrete choice, its TypeScript owner, what Bend receives, why the choice stays outside Bend, and the scope of its review. A new runtime adapter or a move into Bend requires review of the affected entry.

## TS-001 — Recognize a runtime event as a direct edit

| Field | Reviewed boundary |
| --- | --- |
| Decision | For the current direct-edit path, recognize a Codex CLI `PostToolUse` event for `apply_patch`, or a Claude Code `PostToolUse` event for `Edit` or `Write`, as a potential edit observation. The adapter also requires usable runtime identity and its supported success/attribution payload. An event that fails those checks does not become a direct edit observation. |
| TypeScript owner | The native-event adapters in [`src/direct-event/adapter.ts`](../src/direct-event/adapter.ts), entered from [`src/cli.ts`](../src/cli.ts). `isCodexNativeApplyPatch` and `adaptCodexDirectEvent` handle Codex; `adaptClaudeDirectEvent` handles Claude. |
| Bend boundary | Bend does not receive the native hook name, tool name, or raw tool response. After TypeScript has formed an attributed observation, the resident may supply permit and observation-admission events to `Canonical.step`. Recognition alone does not open a round or guarantee that source is eligible for review. |
| Why outside Bend | Runtime-specific event formats, identity fields, tool-result interpretation, and edit attribution belong at the agent-runtime boundary. The reducer operates on bounded, source-free events and cannot inspect those native payloads. The choice of which tool events count remains product behavior and therefore belongs in this ledger. |
| Review and limits | On 2026-09-29 the owner explicitly confirmed that “which runtime event counts as an edit” is correctly outside Bend. The exact current host predicates above describe the implementation; this confirmation does not accept additional runtime event types or claim host/platform validation. Review this entry when a supported hook, tool, success rule, or attribution contract changes. |

The [Codex and Claude adapter checks](../src/direct-event/adapter.ts), [native event identity tests](../src/direct-event/adapter.test.ts), and [Claude edit adapter tests](../src/direct-event/claude-adapter.test.ts) are implementation evidence. File eligibility, admission, and round grouping are separate decisions; they are not silently approved by this entry.
