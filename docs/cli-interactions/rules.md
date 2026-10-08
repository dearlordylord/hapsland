# Rules interaction

**Purpose:** Show rule selection, review, approval and outcomes.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; the accepted issue and rule owners retain product authority.
**Expected use:** Inspect navigation and approval boundaries; run `npm run interaction:diagrams:check` to check freshness without writing.
**Lifecycle:** Regenerate with `npm run interaction:diagrams:write` whenever the production reducer, interpreter or generated flow changes. Review when the accepted rules interaction changes.

Choose the rule scope, review the proposed changes, then confirm before applying them. Declining leaves rules unchanged. Back returns to the preview or scope choice; Exit ends the conversation. If the proposal changes, Hapsland shows a fresh preview and asks for approval again.

```mermaid
flowchart TD
  Scope["Choose rule scope"]
  Previewing["Prepare the proposed changes"]
  Preview["Review proposed rule changes"]
  Approval["Approve applying these changes?"]
  Applying["Apply approved rule changes"]
  Done["Show the result"]
  Cancelled["Exit without applying changes"]
  Scope -->|"Scope selected"| Previewing
  Previewing -->|"Preview ready"| Preview
  Preview -->|"Continue"| Approval
  Approval -->|"Yes"| Applying
  Applying -->|"Rule changes applied"| Done
  Approval -->|"Decline"| Done
  Approval -->|"Back"| Preview
  Preview -->|"Back"| Scope
  Scope -->|"Exit or end of input"| Cancelled
  Preview -->|"Exit or end of input"| Cancelled
  Applying -->|"Proposal changed; review again"| Previewing
```
