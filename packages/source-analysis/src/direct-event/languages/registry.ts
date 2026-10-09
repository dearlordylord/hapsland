import { extname } from "node:path"
import type { ReviewArtifact } from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { LanguageAdapter } from "./contracts.ts"
import { tsAdapter } from "./typescript.ts"
import { rustAdapter } from "./rust-adapter.ts"
import { bendAdapter } from "./bend/adapter.ts"
import { goAdapter } from "./go-adapter.ts"
export const registeredLanguages: readonly LanguageAdapter[] = [tsAdapter, rustAdapter, bendAdapter, goAdapter]

export const languageForPath = (path: string): LanguageAdapter | undefined =>
  registeredLanguages.find((language) => language.extensions.includes(extname(path).toLowerCase()))

export const isBundledArtifact = (artifact: ReviewArtifact): boolean =>
  registeredLanguages.some((language) => language.isBundledArtifact?.(artifact) === true)
