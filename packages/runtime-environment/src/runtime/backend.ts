import * as Schema from "effect/Schema"
import * as Record from "effect/Record"

/** Closed provider set. Every provider declaration and execution registration must cover it. */
export const ReviewProviderId = Schema.Literals(["jev", "cloudflare", "openai"])
export type BackendId = typeof ReviewProviderId.Type
export const [JEV_BACKEND, CLOUDFLARE_BACKEND, OPENAI_BACKEND] = ReviewProviderId.literals

export type RequestContentProfile = "state" | "openai"
export type WireQuestionIdProfile = "rule-id" | "opaque"
type CredentialMode = "jev-key-store" | "environment"
export type ProviderLimits = Readonly<{
  /** Undefined means unknown, never unlimited. */
  questions?: number
  httpBodyBytes?: number
  questionInstructionsCharacters?: number
  requestTokens?: number
  contextWindowTokens?: number
  stateAndLongestQuestionTokens?: number
  source: string
  checkedOn: string
}>

type ProviderDeclaration = Readonly<{
  name: string
  credentialEnvVar: string
  credentials: CredentialMode
  apiBase: string
  /** Placeholders reference fields of the validated provider selection. */
  destination: string
  requestContent: RequestContentProfile
  wireIds: WireQuestionIdProfile
}>

const defineProvider = <
  const Id extends BackendId,
  const Models extends Readonly<Record<string, ProviderLimits>>,
  const Declaration extends ProviderDeclaration,
  const Fields extends Schema.Struct.Fields
>(
  id: Id,
  declaration: Declaration & { readonly models: Models },
  fields: (model: Schema.Literals<Array<keyof Models & string>>) => Fields
) => {
  const model = Schema.Literals(Record.keys<keyof Models & string, ProviderLimits>(declaration.models))
  const defaultModel = model.literals[0]
  if (defaultModel === undefined) throw new TypeError("Review provider has no model")
  return {
    ...declaration,
    id,
    model,
    defaultModel,
    schema: Schema.Struct({
      provider: Schema.Literal(id).annotate({ description: "Review backend provider." }),
      ...fields(model)
    })
  }
}

const limits = (value: ProviderLimits): ProviderLimits => Object.freeze(value)
const clefLimits = limits({
  questions: 64,
  httpBodyBytes: 13 * 1024 * 1024,
  contextWindowTokens: 65_536,
  source: "https://developers.cloudflare.com/workers-ai/models/clef/",
  checkedOn: "2026-10-02"
})

/** Provider declarations: configuration, credentials, models, destinations and wire framing. */
export const REVIEW_PROVIDERS = {
  [JEV_BACKEND]: {
    ...defineProvider(
      JEV_BACKEND,
      {
        name: "Jev",
        credentialEnvVar: "TYPESAFE_API_KEY",
        credentials: "jev-key-store",
        apiBase: "https://api.typesafe.ai/v1",
        destination: "https://api.typesafe.ai/v1/systemone",
        requestContent: "state",
        wireIds: "rule-id",
        models: {
          "jev-latest": limits({
            requestTokens: 64_000,
            stateAndLongestQuestionTokens: 32_000,
            source: "https://docs.typesafe.ai/models",
            checkedOn: "2026-10-02"
          })
        }
      },
      () => ({})
    ),
    credentialIssuer: "TypeSafe",
    keysUrl: "https://console.typesafe.ai/keys"
  },
  [CLOUDFLARE_BACKEND]: defineProvider(
    CLOUDFLARE_BACKEND,
    {
      name: "Cloudflare",
      credentialEnvVar: "CLOUDFLARE_API_TOKEN",
      credentials: "environment",
      apiBase: "https://api.cloudflare.com/client/v4",
      destination: "https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/@cf/cloudflare/{model}",
      requestContent: "state",
      wireIds: "opaque",
      models: {
        clef: clefLimits,
        "clef-flash": limits({
          ...clefLimits,
          source: "https://developers.cloudflare.com/workers-ai/models/clef-flash/"
        })
      }
    },
    (model) => ({
      model: model.annotate({ description: "Cloudflare model selector." }),
      accountId: Schema.String.check(Schema.isPattern(/^[a-fA-F0-9]{32}$/u)).annotate({
        description: "Cloudflare account ID, 32 hexadecimal characters."
      })
    })
  ),
  [OPENAI_BACKEND]: defineProvider(
    OPENAI_BACKEND,
    {
      name: "OpenAI",
      credentialEnvVar: "OPENAI_API_KEY",
      credentials: "environment",
      apiBase: "https://api.openai.com/v1",
      destination: "https://api.openai.com/v1/decisions",
      requestContent: "openai",
      wireIds: "opaque",
      models: {
        "gpt-6-luna": limits({
          questionInstructionsCharacters: 1_048_576,
          source: "https://developers.openai.com/api/reference/resources/decisions/methods/create",
          checkedOn: "2026-10-07"
        })
      }
    },
    (model) => ({ model: model.annotate({ description: "OpenAI Decisions model selector." }) })
  )
} satisfies {
  readonly [Id in BackendId]: ProviderDeclaration & {
    readonly id: Id
    readonly schema: Schema.Schema<{ readonly provider: Id }>
    readonly models: Readonly<Record<string, ProviderLimits>>
    readonly credentialIssuer?: string
    readonly keysUrl?: string
  }
}

const CREDENTIAL_ENVIRONMENT_ONLY = { "jev-key-store": false, environment: true } satisfies Record<
  CredentialMode,
  boolean
>

export const providerEnvironmentOnly = (id: BackendId): boolean =>
  CREDENTIAL_ENVIRONMENT_ONLY[REVIEW_PROVIDERS[id].credentials]

export const ReviewBackendSettings = Schema.Union(
  Object.values(REVIEW_PROVIDERS).map((provider) => provider.schema)
).annotate({
  identifier: "ReviewBackendSettings",
  description:
    "User-owned review destination and provider-specific model/account selection. Projects cannot set this field."
})
export type ReviewBackendSettings = typeof ReviewBackendSettings.Type
export type ReviewModel = (typeof REVIEW_PROVIDERS)[BackendId]["model"]["Type"]
export const DEFAULT_REVIEW_BACKEND = { provider: JEV_BACKEND } as const satisfies ReviewBackendSettings

export const JEV_PROVIDER = REVIEW_PROVIDERS[JEV_BACKEND]
export const CLOUDFLARE_PROVIDER = REVIEW_PROVIDERS[CLOUDFLARE_BACKEND]
export const OPENAI_PROVIDER = REVIEW_PROVIDERS[OPENAI_BACKEND]
export const JEV_API_BASE = JEV_PROVIDER.apiBase
export const JEV_DESTINATION = JEV_PROVIDER.destination
export const OPENAI_API_BASE = OPENAI_PROVIDER.apiBase
export const OPENAI_DESTINATION = OPENAI_PROVIDER.destination
export type Destination = string

const modelSelectors = Object.values(REVIEW_PROVIDERS).flatMap((provider) => provider.model.literals)
if (new Set(modelSelectors).size !== modelSelectors.length)
  throw new TypeError("Review model selectors must be unique across providers")

export const reviewModelDefinition = (model: ReviewModel) => {
  for (const provider of Object.values(REVIEW_PROVIDERS)) {
    const entry = Object.entries(provider.models).find(([id]) => id === model)
    if (entry !== undefined) return { provider, limits: entry[1] }
  }
  throw new TypeError("Unknown review model")
}
