import { afterEach, describe, expect, it } from "vitest"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { activitySessionKey, pruneActivityStore } from "./storage.ts"
import { recordActivity } from "./status.ts"
import { advicee } from "../direct-event/test-fixtures.ts"

const directories: string[] = []
const fixture = () => {
  const path = mkdtempSync(join(tmpdir(), "activity-store-"))
  directories.push(path)
  return path
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
const add = (root: string, session: string, at: number) => {
  const directory = join(root, activitySessionKey(session))
  mkdirSync(directory)
  const path = join(directory, "marker.json")
  writeFileSync(path, "{}")
  utimesSync(path, at / 1000, at / 1000)
  return directory
}

describe("shared activity store retention", () => {
  it("expires inactive sessions at the age boundary and removes oldest sessions to fit the disk budget", () => {
    const path = fixture()
    const expired = add(path, "expired", 1000)
    const old = add(path, "old", 2000)
    const recent = add(path, "recent", 3000)
    pruneActivityStore(path, { now: 4000, retentionMs: 3000 })
    expect(existsSync(expired)).toBe(false)
    expect(existsSync(old)).toBe(true)
    const size = (dir: string) =>
      [dir, join(dir, "marker.json")].reduce((n, p) => {
        const stat = lstatSync(p)
        return n + Math.max(stat.size, stat.blocks * 512)
      }, 0)
    pruneActivityStore(path, { now: 4000, retentionMs: 3000, maxBytes: size(recent) })
    expect(existsSync(old)).toBe(false)
    expect(existsSync(recent)).toBe(true)
  })

  it("protects unrelated directories and symlink targets", () => {
    const path = fixture()
    const outside = fixture()
    writeFileSync(join(outside, "keep"), "private")
    const unrelated = join(path, "unrelated")
    mkdirSync(unrelated)
    writeFileSync(join(unrelated, "keep"), "keep")
    symlinkSync(outside, join(path, activitySessionKey("linked")))
    const session = add(path, "real", 1000)
    symlinkSync(outside, join(session, "linked"))
    pruneActivityStore(path, { now: 4000, retentionMs: 1000, maxBytes: 0 })
    expect(existsSync(session)).toBe(false)
    expect(existsSync(join(outside, "keep"))).toBe(true)
    expect(existsSync(unrelated)).toBe(true)
    expect(readdirSync(path)).toHaveLength(2)
  })

  it("bounds operational activity even when optional analytics is disabled", () => {
    const path = fixture()
    const expired = add(path, "expired", 1000)
    recordActivity({ statePath: path, root: "/repo", advicee: advicee(), lifetime: "resident", stage: "clear" })
    expect(existsSync(expired)).toBe(false)
    expect(existsSync(join(path, activitySessionKey("session")))).toBe(true)
  })
})
