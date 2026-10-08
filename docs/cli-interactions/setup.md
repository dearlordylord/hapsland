# Setup interaction

**Purpose:** Show production setup approval, observed mutation and readiness transitions.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted installation and credential contracts retain authority.
**Expected use:** Understand setup choices and outcomes and run `npm run interaction:diagrams:check` for non-writing freshness.
**Lifecycle:** Regenerate with `npm run interaction:diagrams:write` when the reducer, interpreter or diagram generation changes; review when setup authorization or credential behavior changes.

Review the proposed setup, then approve hooks and rules separately. Back returns to the previous choice; a changed proposal requires another review and approval. Completed or partial installation remains visible if later activation or input fails. Optional paid credential verification has its own consent; readiness checks follow separately. Exiting does not undo completed changes.

```mermaid
flowchart TD
  Previewing["Review proposed setup"]
  HookApproval["Approve hook installation?"]
  RulesApproval["Approve rule changes?"]
  Applying["Install approved changes"]
  Activating["Activate the public command"]
  Verifying["Offer an optional paid key check"]
  Diagnosing["Check readiness"]
  Done["Show setup result"]
  Back["Return to agent selection"]
  Cancelled["End setup navigation"]
  Failed["Show activation failure"]
  Previewing -->|"Changes require approval"| HookApproval
  HookApproval -->|"Yes, install hooks"| RulesApproval
  RulesApproval -->|"Yes, change rules"| Applying
  Applying -->|"Installation completed"| Activating
  Activating -->|"Activation finished"| Verifying
  Verifying -->|"Credential check finished"| Diagnosing
  Diagnosing -->|"Readiness checks finished"| Done
  HookApproval -->|"Decline hook installation"| Done
  RulesApproval -->|"Decline rule changes"| Done
  HookApproval -->|"Back"| Back
  HookApproval -->|"Exit or end of input"| Cancelled
  RulesApproval -->|"Back"| Previewing
  Applying -->|"Proposal changed; review again"| HookApproval
  Applying -->|"Installation partly completed"| Activating
  Activating -->|"Activation finished"| Done
  Activating -->|"Activation finished"| Cancelled
  Verifying -->|"Credential check finished"| Cancelled
  Activating -->|"Activation failed"| Failed
  Applying -->|"Show installation progress"| Applying
```
