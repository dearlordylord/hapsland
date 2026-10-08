import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", timeout: 5000 }).split("\0").filter(Boolean)
const forbidden = paths.filter(
  (path) =>
    existsSync(path) &&
    (path.startsWith("native/prebuilt/") ||
      /^prototypes\/bend-.*-source\.tar\.gz$/u.test(path) ||
      /^evidence\/.*\/source-snapshot\.tar\.gz$/u.test(path))
)
if (forbidden.length)
  throw new Error(`Generated binaries or source archives are tracked by Git:\n${forbidden.join("\n")}`)
process.stdout.write("Repository assets: no tracked native outputs or source snapshot archives\n")
