import { type DirectAdvicee } from "@hapsland/native-observation/direct-event/observation"
import type { RoundWork } from "../state/round-records.ts"
import { type ResidentDispatchContext, type ResidentRequest } from "@hapsland/resident-transport/resident/protocol"
import { type ClaudeOutputMode } from "./collection.ts"

export type ResponseAuthority = {
  readonly lifetime: string
  readonly partition: string
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly claudeFeedbackMode: ClaudeOutputMode
  readonly credentialGeneration: number | null
  readonly credentialStatePath: string | null
  readonly credentialRequired: boolean
  readonly credentialEnvironmentOnly: boolean
  readonly expiresAt: number
  readonly round: RoundWork | undefined
}

export type EditRequest = Extract<ResidentRequest, { operation: "admit-and-collect" }>

export type EditCollectionRequest = {
  readonly requestRoute: "edit"
  readonly operation: "collect"
  readonly lifetime: string
  readonly root: string
  readonly advicee: DirectAdvicee
  readonly dispatch: ResidentDispatchContext
  readonly composed: true
  readonly mode: "ordinary"
}

type LocalCollectionRequest = Omit<Extract<ResidentRequest, { operation: "collect" }>, "composed"> & {
  readonly composed: boolean
}

export type HandoffRequest = ResidentRequest | EditCollectionRequest | LocalCollectionRequest

export type ResponseContext = { readonly authority?: ResponseAuthority; readonly token?: string }
