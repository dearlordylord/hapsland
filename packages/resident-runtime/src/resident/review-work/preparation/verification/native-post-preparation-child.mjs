import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
export { nativePostPreparation } from "./native-post-preparation.ts"

// Source identity is diagnostic evidence; execution uses the ordinary import.
export const nativePostPreparationSource = Object.freeze({
  path: "packages/resident-runtime/src/resident/review-work/preparation/verification/native-post-preparation.ts",
  sourceSha256: createHash("sha256")
    .update(await readFile(new URL("./native-post-preparation.ts", import.meta.url)))
    .digest("hex")
})
