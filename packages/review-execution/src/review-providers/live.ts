import type * as Layer from "effect/Layer"
import type * as Config from "effect/Config"
import type { DecisionModel } from "effect/ai"
import type * as HttpClient from "effect/http/HttpClient"
import { liveLayer as jevLiveLayer } from "../jev-decision.ts"
import type { ReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import type { ReviewServiceId } from "@hapsland/runtime-environment/runtime/backend"
import { liveLayer as openaiLiveLayer } from "./openai.ts"
import { liveLayer as cloudflareLiveLayer } from "./cloudflare.ts"

type ProviderLayerFactory = (
  settings: ReviewSettings
) => Layer.Layer<DecisionModel.DecisionModel, Config.ConfigError, HttpClient.HttpClient>

/** The sole exhaustive execution registration; declarations live in the provider catalog. */
const REVIEW_PROVIDER_LAYERS = {
  jev: (settings) => jevLiveLayer({ apiUrl: settings.apiBase, credentialEnvVar: settings.credentialEnvVar }),
  openai: (settings) =>
    openaiLiveLayer({ identity: settings.reviewServiceIdentity, credentialEnvVar: settings.credentialEnvVar }),
  cloudflare: (settings) =>
    cloudflareLiveLayer({ identity: settings.reviewServiceIdentity, credentialEnvVar: settings.credentialEnvVar })
} satisfies Record<ReviewServiceId, ProviderLayerFactory>

export const reviewDecisionModelLayer = (settings: ReviewSettings) => REVIEW_PROVIDER_LAYERS[settings.backend](settings)
