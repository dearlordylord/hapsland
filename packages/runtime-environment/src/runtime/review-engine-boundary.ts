import { writeSync } from "node:fs"
import { isHookInvocation } from "./hook-invocation.ts"

type ReviewEngineModule = "pipeline" | "native-parser" | "jev-decision" | "bend-extractor" | "cloudflare" | "openai"

/** A hook-client import violation is observable even when its caller fails open. */
export const assertReviewEngineBoundary = (module: ReviewEngineModule): void => {
  if (!isHookInvocation(process.argv.slice(2))) return
  const diagnostic = `Hapsland hook-client review-engine import: ${module}\n`
  try {
    writeSync(2, diagnostic)
  } catch {
    /* An unavailable diagnostic sink cannot authorize the engine. */
  }
  throw new Error("Hapsland review engine is unavailable in a hook-client process")
}
