import { execFileSync } from "node:child_process"
import { existsSync, statSync } from "node:fs"
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", timeout: 5000 }).split("\0").filter(Boolean)
const forbidden = paths.filter(
  (path) =>
    existsSync(path) &&
    (path.startsWith("native/prebuilt/") ||
      /^prototypes\/bend-.*-source\.tar\.gz$/u.test(path) ||
      path.startsWith("evidence/"))
)
if (forbidden.length)
  throw new Error(`Generated binaries, source archives, or run output are tracked by Git:\n${forbidden.join("\n")}`)
const migrationGuide = "docs/bend-migration.md"
const migrationGuideLimit = 16 * 1024
if (existsSync(migrationGuide) && statSync(migrationGuide).size > migrationGuideLimit)
  throw new Error(
    `${migrationGuide} exceeds ${migrationGuideLimit} bytes: keep the current acceptance path here; experiment history belongs in Git, not an archive copy`
  )
process.stdout.write("Repository assets: no tracked native outputs, source snapshot archives, or evidence directory\n")
