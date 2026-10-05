import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

/** The laboratory is an offline Node source-checkout tool. Missing source is a failure. */
export function labSourceIdentity(): string {
  const hash = createHash("sha256")
  for (const path of ["./identity.ts", "./index.ts", "./review-profile.ts", "./mechanics.generated.mjs", "./mechanics.generated.d.mts",
    "./mechanics.generated.json", "../DefenseMechanics.bend", "../../../packages/monkey-business-bend/Numeric.bend",
    "../../../scripts/build-game-mechanics.mjs"]) {
    const bytes = readFileSync(new URL(path, import.meta.url))
    hash.update(`${path}\0${bytes.length}\0`)
    hash.update(bytes)
  }
  return `sha256:${hash.digest("hex")}`
}

/** Inputs are recorded as JSON data; changes in game accounting must invalidate replay too. */
export function configurationIdentity(input: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`
}
