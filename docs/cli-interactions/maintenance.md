# Maintenance interaction

**Purpose:** Show production repair, reinstall and uninstall navigation and recovery.
**Status:** Maintained generated diagram.
**Authority:** Implementation and controlled validation evidence for #244; accepted installation contracts and lifecycle owners retain authority.
**Expected use:** Inspect per-agent consent and observed recovery results; use `npm run interaction:diagrams:check` for non-writing freshness.
**Lifecycle:** Regenerate with `npm run interaction:diagrams:write` when the reducer, interpreter or diagram generation changes; review when accepted maintenance behavior changes.

Review repair, reinstall or uninstall changes and confirm before applying them. Back returns to the review; Exit ends navigation. Repair resumes the inspected operation. Uninstall does not activate a package. Reinstall can restore the active package when no registrations exist. Partial, busy or uncertain results remain visible; activation failure does not undo a completed change.

```mermaid
flowchart TD
  Discovering["Find installed agents"]
  Inspecting["Inspect the agent installation"]
  Previewing["Prepare proposed maintenance"]
  Review["Review proposed changes"]
  Approval["Approve maintenance?"]
  Applying["Apply approved maintenance"]
  Activating["Activate the agent command"]
  Done["Show maintenance results"]
  Cancelled["End maintenance navigation"]
  ActivatingEmpty["Restore the active package"]
  Discovering -->|"Discovery finished"| Inspecting
  Inspecting -->|"Repair or reinstall selected"| Previewing
  Previewing -->|"Changes require approval"| Review
  Review -->|"Continue"| Approval
  Approval -->|"Yes"| Applying
  Applying -->|"Installation restored"| Activating
  Activating -->|"Activation completed"| Done
  Inspecting -->|"Uninstall selected"| Previewing
  Applying -->|"Installation removed"| Done
  Approval -->|"Decline"| Done
  Approval -->|"Back"| Review
  Review -->|"Exit or end of input"| Cancelled
  Approval -->|"Exit or end of input"| Cancelled
  Previewing -->|"Installation is already intact"| Done
  Applying -->|"Maintenance partly completed"| Activating
  Applying -->|"Another operation is running"| Done
  Applying -->|"Result is uncertain"| Done
  Activating -->|"Activation failed"| Done
  Discovering -->|"Discovery finished"| ActivatingEmpty
  ActivatingEmpty -->|"Active package restored"| Done
```
