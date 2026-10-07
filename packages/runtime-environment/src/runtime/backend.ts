/** Supported review destinations are constructed from validated user configuration. */
export const JEV_BACKEND = "jev" as const
export const JEV_API_BASE = "https://api.typesafe.ai/v1" as const
export const JEV_DESTINATION = "https://api.typesafe.ai/v1/systemone" as const
export const JEV_PROVIDER = {
  id: JEV_BACKEND,
  name: "Jev",
  credentialEnvVar: "TYPESAFE_API_KEY",
  credentialIssuer: "TypeSafe",
  keysUrl: "https://console.typesafe.ai/keys"
} as const
export const CLOUDFLARE_PROVIDER = {
  id: "cloudflare",
  name: "Cloudflare",
  credentialEnvVar: "CLOUDFLARE_API_TOKEN"
} as const
export const OPENAI_API_BASE = "https://api.openai.com/v1" as const
export const OPENAI_DESTINATION = "https://api.openai.com/v1/decisions" as const
export const OPENAI_PROVIDER = { id: "openai", name: "OpenAI", credentialEnvVar: "OPENAI_API_KEY" } as const
export const REVIEW_PROVIDERS = {
  [JEV_PROVIDER.id]: JEV_PROVIDER,
  [CLOUDFLARE_PROVIDER.id]: CLOUDFLARE_PROVIDER,
  [OPENAI_PROVIDER.id]: OPENAI_PROVIDER
}
export type BackendId = keyof typeof REVIEW_PROVIDERS
export type Destination = string
