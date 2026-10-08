import type { Effect } from "effect"
import type { UiFlowId } from "../packages/administration/src/interaction/flow-registry.ts"
import { generateSetupSelectionDiagram } from "./generate-setup-selection-diagram.mts"
import { generateSetupDiagram } from "./generate-setup-diagram.mts"
import { generateLoginDiagram } from "./generate-login-diagram.mts"
import { generateVerificationDiagram } from "./generate-verification-diagram.mts"
import { generateRulesDiagram } from "./generate-rules-diagram.mts"
import { generateUpdateDiagram } from "./generate-update-diagram.mts"
import { generateMaintenanceDiagram } from "./generate-maintenance-diagram.mts"

// Adding a production workflow without its replay generator is a type error.
export const diagramGenerators = {
  "setup-selection": generateSetupSelectionDiagram,
  setup: generateSetupDiagram,
  login: generateLoginDiagram,
  verification: generateVerificationDiagram,
  rules: generateRulesDiagram,
  update: generateUpdateDiagram,
  maintenance: generateMaintenanceDiagram
} satisfies Record<UiFlowId, Effect.Effect<string, unknown>>
