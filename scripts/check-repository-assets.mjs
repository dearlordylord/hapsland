import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
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
process.stdout.write("Repository assets: no tracked native outputs, source snapshot archives, or evidence directory\n")
