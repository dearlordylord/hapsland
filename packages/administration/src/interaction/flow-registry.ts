// Closed administration input inventory. Domain policy stays with each interpreter.
export type InputKind = "choose" | "chooseMany" | "confirm" | "hidden"
type FlowDefinition = {
  owner: string
  entry: string
  diagram: `docs/cli-interactions/${string}.md`
  inputs: readonly InputKind[]
  composes: readonly string[]
}
export const uiFlows = {
  "setup-selection": {
    owner: "packages/administration/src/onboarding/setup-selection.ts",
    entry: "runSetupSelection",
    diagram: "docs/cli-interactions/setup-selection.md",
    inputs: ["chooseMany"],
    composes: ["setup"]
  },
  setup: {
    owner: "packages/administration/src/onboarding/pilot.ts",
    entry: "runPilotSetup",
    diagram: "docs/cli-interactions/setup.md",
    inputs: ["confirm"],
    composes: ["login", "verification"]
  },
  login: {
    owner: "packages/administration/src/credentials/login-conversation.ts",
    entry: "runLoginConversation",
    diagram: "docs/cli-interactions/login.md",
    inputs: ["choose", "confirm"],
    composes: []
  },
  verification: {
    owner: "packages/administration/src/onboarding/verification-conversation.ts",
    entry: "runVerificationConversation",
    diagram: "docs/cli-interactions/verification.md",
    inputs: ["choose", "confirm"],
    composes: []
  },
  rules: {
    owner: "packages/administration/src/rules/conversation.ts",
    entry: "runRuleConversation",
    diagram: "docs/cli-interactions/rules.md",
    inputs: ["choose", "confirm"],
    composes: []
  },
  update: {
    owner: "packages/administration/src/onboarding/update.ts",
    entry: "updateClients",
    diagram: "docs/cli-interactions/update.md",
    inputs: ["choose", "confirm"],
    composes: []
  },
  maintenance: {
    owner: "packages/administration/src/onboarding/maintenance.ts",
    entry: "maintainClients",
    diagram: "docs/cli-interactions/maintenance.md",
    inputs: ["choose", "confirm"],
    composes: []
  }
} as const satisfies Record<string, FlowDefinition>
export type UiFlowId = keyof typeof uiFlows

// Fragments cannot dispatch another conversation. Their parents own diagrams.
export const inputFragments = {
  "credential-entry": {
    owner: "packages/administration/src/credentials/masked-input.ts",
    entry: "captureCredential",
    inputs: ["hidden"],
    parents: ["login", "verification"]
  },
  "agent-selection": {
    owner: "packages/administration/src/onboarding/client-selection.ts",
    entry: "selectSetupClients",
    inputs: ["chooseMany"],
    parents: ["setup-selection"]
  }
} as const satisfies Record<
  string,
  { owner: string; entry: string; inputs: readonly InputKind[]; parents: readonly UiFlowId[] }
>
export const inputOwners = { ...uiFlows, ...inputFragments }
export type InputOwnerId = keyof typeof inputOwners

// Fixed transport/assembly owners may provide adapters; they cannot add dialogs.
export const interactionInfrastructure = [
  "packages/administration/src/interaction/interaction.ts",
  "packages/administration/src/interaction/flow-input.ts",
  "packages/administration/src/interaction/interaction-session.ts",
  "packages/administration/src/interaction/selection.ts",
  "packages/administration/src/interaction/terminal.ts",
  "packages/administration/src/interaction/controlling-input.ts"
] as const
export const interactionCompositionRoots = [
  "packages/cli-entry/src/cli.ts",
  "packages/administration/src/rules/command.ts"
] as const
export const directUiExceptions = {
  "interactive-json-setup": {
    owner: "packages/cli-entry/src/cli.ts",
    entry: "runJsonSetup",
    composes: ["login"],
    reason:
      "JSON stays on stdin; explicitly authorized input uses the registered login flow on the controlling terminal."
  },
  "credential-stdin": {
    owner: "packages/administration/src/credentials/direct-input.ts",
    entry: "runDirectCredentialInput",
    composes: [],
    reason: "Explicit direct native-save automation; no dialog."
  },
  logout: {
    owner: "packages/cli-entry/src/cli.ts",
    entry: "logoutSavedCredential",
    composes: [],
    reason: "Direct native deletion; no dialog."
  },
  inspection: {
    owner: "packages/cli-entry/src/cli.ts",
    entry: "runOperation",
    composes: [],
    reason: "Doctor, rules inspection and dashboard report observations without input dialogs."
  },
  "unattended-setup": {
    owner: "packages/administration/src/onboarding/unattended.ts",
    entry: "runUnattendedSetup",
    composes: [],
    reason: "Version-one preview/apply authorization is supplied as structured input; no implicit terminal consent."
  }
} as const satisfies Record<string, { owner: string; entry: string; composes: readonly UiFlowId[]; reason: string }>
