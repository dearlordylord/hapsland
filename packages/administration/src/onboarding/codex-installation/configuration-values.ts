import { type FileSnapshot } from "./file-snapshots.ts"

export type JsonObject = { [key: string]: unknown }

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const parseJsonObject = (file: FileSnapshot): JsonObject => {
  if (!file.exists) return {}
  let value: unknown
  try {
    value = JSON.parse(file.content)
  } catch {
    throw new Error(`configuration is malformed JSON: ${file.path}`)
  }
  if (!isObject(value)) throw new Error(`configuration root must be an object: ${file.path}`)
  return value
}

export const encodeJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
