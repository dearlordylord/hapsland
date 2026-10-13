import type { lstat } from "node:fs/promises"
import type { eligibleNamedPath } from "@hapsland/native-observation/direct-event/selection"
import type { StableCapture } from "@hapsland/native-observation/direct-event/capture"

/** Read-only tracing of the original cache; observers must not mutate its contents. */
export type NativeIoPorts = {
  readonly readStatus?: typeof lstat
  readonly selectPath?: typeof eligibleNamedPath
  readonly cacheCreated?: (cache: ReadonlyMap<string, StableCapture>, role: "caller" | "private") => void
  readonly cacheStore?: (role: "caller" | "private", path: string, capture: StableCapture) => void
}
