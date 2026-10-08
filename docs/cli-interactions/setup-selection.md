# Agent selection and setup navigation

**Purpose:** Show the production outer agent-selection loop and its per-agent handoff.
**Status:** Maintained generated diagram.
**Authority:** Implementation and implementation documentation; installation and interaction contracts own consent.
**Expected use:** Inspect multi-agent ordering, Back and cancellation before opening the linked setup subflow.
**Lifecycle:** Regenerate when the selection interpreter or generated flow changes; review when agent-navigation behavior changes.

Select the agents to configure. Hapsland runs their setup flows in order. Back returns to agent selection and retains the previous selection; cancelling an agent stops later agents. Exit or end of input finishes selection. Open [setup](setup.md) for each agent’s approval flow, and [login](login.md) or [verification](verification.md) for credential choices.

```mermaid
flowchart TD
  SelectingAgents["Select agents to configure"]
  RunningAgents["Run setup for the next selected agent"]
  Done["Finish agent selection"]
  Cancelled["Stop before configuring later agents"]
  SelectingAgents -->|"Select"| RunningAgents
  RunningAgents -->|"Agent setup completed"| RunningAgents
  RunningAgents -->|"Agent setup completed"| Done
  RunningAgents -->|"Back from agent setup"| SelectingAgents
  SelectingAgents -->|"Exit or end of input"| Done
  RunningAgents -->|"Agent setup cancelled"| Cancelled
```
