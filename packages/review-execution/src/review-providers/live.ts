import type * as Layer from "effect/Layer"
import type * as Config from "effect/Config"
import type { DecisionModel } from "effect/ai"
import type * as HttpClient from "effect/http/HttpClient"
import { liveLayer as jevLiveLayer } from "../jev-decision.ts"
import type { ReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import type { BackendId } from "@hapsland/runtime-environment/runtime/backend"
import { liveLayer as openaiLiveLayer } from "./openai.ts"
import { liveLayer as cloudflareLiveLayer } from "./cloudflare.ts"

type ProviderLayerFactory = (
  settings: ReviewSettings,
  httpClient?: HttpClient.HttpClient
) => Layer.Layer<DecisionModel.DecisionModel, Config.ConfigError>

/** The sole exhaustive execution registration; declarations live in the provider catalog. */
const REVIEW_PROVIDER_LAYERS = {
  jev: (settings, httpClient) =>
    jevLiveLayer({
      apiUrl: settings.apiBase,
      credentialEnvVar: settings.credentialEnvVar,
      ...(httpClient === undefined ? {} : { httpClient })
    }),
  openai: (settings, httpClient) =>
    openaiLiveLayer({
      identity: settings.providerIdentity,
      credentialEnvVar: settings.credentialEnvVar,
      ...(httpClient === undefined ? {} : { httpClient })
    }),
  cloudflare: (settings, httpClient) =>
    cloudflareLiveLayer({
      identity: settings.providerIdentity,
      credentialEnvVar: settings.credentialEnvVar,
      ...(httpClient === undefined ? {} : { httpClient })
    })
} satisfies Record<BackendId, ProviderLayerFactory>

export const reviewDecisionModelLayer = (settings: ReviewSettings, httpClient?: HttpClient.HttpClient) =>
  REVIEW_PROVIDER_LAYERS[settings.backend](settings, httpClient)
