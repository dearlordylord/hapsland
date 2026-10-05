/** Supported review destinations are constructed from validated user configuration. */
export const JEV_BACKEND = "jev" as const
export const JEV_API_BASE = "https://api.typesafe.ai/v1" as const
export const JEV_DESTINATION = "https://api.typesafe.ai/v1/systemone" as const
export type BackendId = "jev" | "cloudflare"
export type Destination = string
