import { afterEach, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as fc from "fast-check"
import { hasGitMetadata, rootRelativePath } from "./root.ts"

const roots: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-root-"))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

it.each(["directory", "worktree-file"])("finds a %s Git marker from a descendant", (kind) => {
  const root = fixture()
  const nested = join(root, "first", "second")
  mkdirSync(nested, { recursive: true })
  expect(hasGitMetadata(nested)).toBe(false)
  if (kind === "directory") mkdirSync(join(root, ".git"))
  else writeFileSync(join(root, ".git"), "gitdir: /unused-administration-path\n")
  expect(hasGitMetadata(nested)).toBe(true)
  expect(hasGitMetadata(root)).toBe(true)
})

it("rejects traversal and NUL paths while preserving the root and contained paths", () => {
  const root = fixture()
  const cwd = join(root, "nested")
  expect(rootRelativePath(root, cwd, "..")).toBe(".")
  expect(rootRelativePath(root, cwd, "file.ts")).toBe("nested/file.ts")
  expect(rootRelativePath(root, cwd, "../../outside.ts")).toBeUndefined()
  expect(rootRelativePath(root, root, "..")).toBeUndefined()
  expect(rootRelativePath(root, root, "file\0.ts")).toBeUndefined()
  expect(rootRelativePath(root, cwd, root)).toBe(".")
})

it("normalizes contained paths without treating similarly named siblings as descendants", () => {
  const root = fixture()
  const segment = fc.stringMatching(/^[a-z][a-z0-9]{0,12}$/)
  fc.assert(
    fc.property(fc.array(segment, { minLength: 1, maxLength: 5 }), (segments) => {
      const target = join(root, ...segments)
      expect(rootRelativePath(root, root, target)).toBe(segments.join("/"))
      expect(rootRelativePath(root, root, join(`${root}-sibling`, ...segments))).toBeUndefined()
      expect(rootRelativePath(root, join(root, "cwd"), join("..", ...segments))).toBe(segments.join("/"))
    }),
    { numRuns: 100 }
  )
})
