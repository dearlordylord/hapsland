# Update interaction

**Purpose:** Show grouped update review, approval and outcomes.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted installation contracts and lifecycle owners retain authority.
**Expected use:** Inspect grouped approval, Back, observed mutation and activation outcomes; run `npm run interaction:diagrams:check` for non-writing freshness.
**Lifecycle:** Regenerate with `npm run interaction:diagrams:write` when the reducer, interpreter or generated flow changes; review when accepted update behavior changes.

Review proposed updates for all selected agents before approving the group. Back returns to the review; Exit ends navigation. Agents that are already current activate without an update. Partial updates, busy operations and uncertain results remain visible. Activation failure does not undo a completed update. JSON preview and update commands remain direct automation paths.

```mermaid
flowchart TD
  Discovering["Find installed agents"]
  Targeting["Select the update target"]
  Previewing["Check each agent for updates"]
  Review["Review proposed updates"]
  Approval["Approve the grouped updates?"]
  Applying["Update the next agent"]
  Activating["Activate the agent command"]
  Done["Show update results"]
  Cancelled["End update navigation"]
  Discovering -->|"Discovery finished"| Targeting
  Targeting -->|"Target selected"| Previewing
  Previewing -->|"Claude update proposed"| Previewing
  Previewing -->|"Codex update proposed"| Review
  Review -->|"Continue"| Approval
  Approval -->|"Yes"| Applying
  Applying -->|"Claude updated"| Activating
  Activating -->|"Claude activation completed"| Applying
  Applying -->|"Codex updated"| Activating
  Activating -->|"Codex activation completed"| Done
  Approval -->|"Decline"| Done
  Approval -->|"Back"| Review
  Review -->|"Exit or end of input"| Cancelled
  Approval -->|"Exit or end of input"| Cancelled
  Previewing -->|"Claude is already current"| Activating
  Activating -->|"Claude activation completed"| Previewing
  Previewing -->|"Codex is already current"| Activating
  Applying -->|"Claude partly updated"| Activating
  Applying -->|"Codex partly updated"| Activating
  Activating -->|"Claude activation failed"| Applying
  Activating -->|"Codex activation failed"| Done
  Applying -->|"Claude: another operation is running"| Applying
  Applying -->|"Codex: another operation is running"| Done
  Applying -->|"Claude: update result is uncertain"| Applying
  Applying -->|"Codex: update result is uncertain"| Done
```
