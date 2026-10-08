import assert from "node:assert/strict"
import type { UiFlowId } from "../packages/administration/src/interaction/flow-registry.ts"

// Display labels describe choices and outcomes; replay events stay internal.
const states: Record<UiFlowId, Record<string, string>> = {
  login: {
    SelectingDestination: "Choose where to save the key",
    PreparingTarget: "Check the destination",
    EnteringKey: "Enter the key privately",
    ConfirmingSave: "Confirm saving the key",
    SavingKey: "Save the key",
    CheckingActive: "Show the credential currently in use",
    Done: "Show the result",
    Cancelled: "Exit without saving"
  },
  "setup-selection": {
    SelectingAgents: "Select agents to configure",
    RunningAgents: "Run setup for the next selected agent",
    Done: "Finish agent selection",
    Cancelled: "Stop before configuring later agents"
  },
  setup: {
    Previewing: "Review proposed setup",
    HookApproval: "Approve hook installation?",
    RulesApproval: "Approve rule changes?",
    Applying: "Install approved changes",
    Activating: "Activate the public command",
    Verifying: "Offer an optional paid key check",
    Diagnosing: "Check readiness",
    Done: "Show setup result",
    Back: "Return to agent selection",
    Cancelled: "End setup navigation",
    Failed: "Show activation failure"
  },
  verification: {
    Loading: "Read the active credential source",
    Approval: "Approve a paid key check?",
    Checking: "Check the key",
    Done: "Show the check or save result",
    Recovery: "Choose how to correct the credential",
    ReplacementApproval: "Approve replacing the saved key?",
    EnteringKey: "Enter the replacement key privately",
    SavingKey: "Save the replacement key",
    Cancelled: "End credential verification"
  },
  rules: {
    Scope: "Choose rule scope",
    Previewing: "Prepare the proposed changes",
    Preview: "Review proposed rule changes",
    Approval: "Approve applying these changes?",
    Applying: "Apply approved rule changes",
    Done: "Show the result",
    Cancelled: "Exit without applying changes"
  },
  update: {
    Discovering: "Find installed agents",
    Targeting: "Select the update target",
    Previewing: "Check each agent for updates",
    Review: "Review proposed updates",
    Approval: "Approve the grouped updates?",
    Applying: "Update the next agent",
    Activating: "Activate the agent command",
    Done: "Show update results",
    Cancelled: "End update navigation"
  },
  maintenance: {
    Discovering: "Find installed agents",
    Inspecting: "Inspect the agent installation",
    Previewing: "Prepare proposed maintenance",
    Review: "Review proposed changes",
    Approval: "Approve maintenance?",
    Applying: "Apply approved maintenance",
    Activating: "Activate the agent command",
    ActivatingEmpty: "Restore the active package",
    Done: "Show maintenance results",
    Cancelled: "End maintenance navigation"
  }
}
const actions: Record<string, string> = {
  selected: "Select",
  prepared: "Destination checked",
  entered: "Key entered",
  approved: "Save approved or declined",
  active: "Active source identified",
  back: "Back",
  exit: "Exit or end of input",
  ended: "Exit or end of input",
  continue: "Continue",
  scope: "Scope selected",
  previewed: "Preview ready",
  discovered: "Discovery finished",
  targeted: "Target selected",
  progressed: "Show installation progress",
  activated: "Activation finished",
  diagnosed: "Readiness checks finished",
  verified: "Credential check finished",
  failed: "Activation failed",
  inputEnded: "Cancel key entry",
  recheck: "Recheck",
  replace: "Replace saved key",
  "approve y": "Yes",
  "approve non-y": "Decline",
  "approveHooks y": "Yes, install hooks",
  "approveHooks non-y": "Decline hook installation",
  "approveRules y": "Yes, change rules",
  "approveRules non-y": "Decline rule changes",
  "approveReplacement y": "Yes, replace saved key",
  "agent completed": "Agent setup completed",
  "agent back": "Back from agent setup",
  "agent cancelled": "Agent setup cancelled",
  "applied completed": "Installation completed",
  "applied partial": "Installation partly completed",
  "applied needs-user-action": "Proposal changed; review again",
  "previewed needs-user-action": "Changes require approval",
  "observed stored": "Key saved",
  "observed stale": "Proposal changed; review again",
  "observed busy": "Another operation is running",
  "observed indeterminate": "Result is uncertain",
  "observed accepted": "Key accepted",
  "observed rejected": "Key rejected",
  "observed applied": "Rule changes applied",
  "observed partial": "Maintenance partly completed",
  "observed restored": "Installation restored",
  "observed removed": "Installation removed",
  "observed rate-limited": "Provider rate limit reached",
  "observed unconfirmed": "Check could not be confirmed",
  "loaded saved ready": "Saved key available",
  "loaded environment ready": "Environment key available",
  "loaded file ready": "File key available",
  "loaded saved unavailable": "No key available",
  "loaded saved other provider": "Configured provider does not use this key check",
  "stored stored": "Replacement saved",
  "stored busy": "Another save is running",
  "stored indeterminate": "Save result is uncertain",
  "activated complete": "Activation completed",
  "activated failed": "Activation failed",
  "activatedEmpty complete": "Active package restored",
  "inspected install": "Repair or reinstall selected",
  "inspected uninstall": "Uninstall selected",
  "previewed proposal": "Changes require approval",
  "previewed intact": "Installation is already intact"
}
for (const agent of ["claude", "codex"]) {
  const name = agent === "claude" ? "Claude" : "Codex"
  actions[`previewed ${agent} proposal`] = `${name} update proposed`
  actions[`previewed ${agent} current`] = `${name} is already current`
  actions[`activated ${agent} complete`] = `${name} activation completed`
  actions[`activated ${agent} failed`] = `${name} activation failed`
  actions[`observed ${agent} updated`] = `${name} updated`
  actions[`observed ${agent} partial`] = `${name} partly updated`
  actions[`observed ${agent} busy`] = `${name}: another operation is running`
  actions[`observed ${agent} indeterminate`] = `${name}: update result is uncertain`
}

/** Project witnessed production transitions into readable flow labels. */
export const userFlowDiagram = (flow: UiFlowId, edges: ReadonlySet<string>): string => {
  const nodes = new Set<string>()
  const rendered = [...edges].map((edge) => {
    const match = /^\s*(\w+) -->\|"([^"]+)"\| (\w+)$/.exec(edge)
    assert(match, `Invalid ${flow} flow edge`)
    const [, before, event, after] = match
    assert(before && event && after, `Incomplete ${flow} flow edge`)
    nodes.add(before)
    nodes.add(after)
    const label =
      flow === "login" && event === "approved"
        ? after === "Cancelled"
          ? "Decline saving"
          : "Yes, save the key"
        : flow === "login" && event === "prepared" && after === "SelectingDestination"
          ? "Destination unavailable; choose another"
          : actions[event]
    assert(label, `Missing user-visible action label: ${flow}: ${event}`)
    return `  ${before} -->|"${label}"| ${after}`
  })
  return [...nodes]
    .map((node) => {
      const label = states[flow][node]
      assert(label, `Missing user-visible state label: ${flow}: ${node}`)
      return `  ${node}["${label}"]`
    })
    .concat(rendered)
    .join("\n")
}
