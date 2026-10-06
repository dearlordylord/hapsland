import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveBunRuntime } from "../pinned-bun.mjs"

/** Standalone Bun commands cannot resolve the preload's development dependencies. */
export const prepareBunCoveragePreload = (directory) => {
  const output = join(directory, "coverage-preload.mjs")
  execFileSync(
    resolveBunRuntime().executable,
    [
      "build",
      fileURLToPath(new URL("./bun-coverage-preload.mjs", import.meta.url)),
      "--target=bun",
      "--external=@babel/preset-typescript/package.json",
      "--outfile",
      output
    ],
    { env: { ...process.env, BUN_OPTIONS: "" }, encoding: "utf8", timeout: 10000 }
  )
  return output
}
