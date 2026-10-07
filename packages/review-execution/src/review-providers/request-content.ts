import { JEV_PROVIDER, type RequestContentProfile } from "@hapsland/runtime-environment/runtime/backend"
import {
  projectRequestContent,
  projectOpenAIRequestContent,
  type RequestFields
} from "@hapsland/agent-flow-bend/request-content"

const CONTENT_PROJECTORS = { state: projectRequestContent, openai: projectOpenAIRequestContent } satisfies Record<
  RequestContentProfile,
  (fields: RequestFields) => string
>

/** JSON and the compiler ABI are trusted. Field selection and body construction run in Bend. */
export const reviewRequestContent = (
  bytes: Uint8Array,
  profile: RequestContentProfile = JEV_PROVIDER.requestContent
): string => {
  const input: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("review request must be a JSON object")
  let fields: RequestFields = { $: "Nil" }
  for (const [key, value] of Object.entries(input).reverse()) {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError("review field must be JSON")
    fields = { $: "Con", head: { $: "core.Field", key, value: encoded }, tail: fields }
  }
  return CONTENT_PROJECTORS[profile](fields)
}
