import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

test("diagnostic binary cache invalidates build inputs and corruption, but always rechecks books", (t) => {
  const root = mkdtempSync(join(tmpdir(), "kernel-cache-test-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, "scripts/performance"), { recursive: true })
  const runner = join(root, "scripts/performance/bend-kernel-attribution.mjs")
  copyFileSync(new URL("./bend-kernel-attribution.mjs", import.meta.url), runner)
  const toolchain = join(root, "toolchain")
  mkdirSync(join(toolchain, "bin"), { recursive: true })
  const source = join(root, "kernel.lean")
  const book = join(root, "book")
  writeFileSync(
    source,
    "def Term.infer (ck : Book)\n-- Γ ⊢ v\ndef Term.check (ck : Book)\nend\ndef main (args : List String) : IO UInt32 := do\n"
  )
  writeFileSync(book, "first book")
  // Fake compilation isolates cache behavior; production compilation is checked separately.
  writeFileSync(
    join(toolchain, "bin/lean"),
    '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Lean (version 4.34.1, test)"; else cat >/dev/null; fi\n',
    { mode: 0o700 }
  )
  writeFileSync(
    join(toolchain, "bin/leanc"),
    `#!/bin/sh
cat > "$5" <<'BINARY'
#!/bin/sh
printf 'ALL PROOFS CHECK\\n'
printf 'checked\\n' >> "$KERNEL_TEST_LOG"
BINARY
chmod +x "$5"
`,
    { mode: 0o700 }
  )
  const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex")
  const run = () => {
    const result = spawnSync(process.execPath, [runner, source, digest(source), book, digest(book), toolchain], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, KERNEL_TEST_LOG: join(root, "checks") }
    })
    assert.equal(result.status, 0, result.stdout + result.stderr)
    return result.stderr
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((row) => row.stage === "checker-build")
  }
  const cold = run()
  assert.equal(cold.cache, "miss")
  assert.equal(run().cache, "hit")
  writeFileSync(book, "different book")
  assert.equal(run().cache, "hit")
  writeFileSync(source, readFileSync(source, "utf8") + "-- changed instrumentation input\n")
  const changed = run()
  assert.equal(changed.cache, "miss")
  assert.notEqual(changed.cacheKey, cold.cacheKey)
  writeFileSync(join(toolchain, "runtime-library"), "changed runtime")
  const toolchainChanged = run()
  assert.equal(toolchainChanged.cache, "miss")
  writeFileSync(join(root, ".test-runs/kernel-attribution-cache", toolchainChanged.cacheKey, "kernel"), "corrupt")
  assert.equal(run().cache, "miss")
  assert.equal(run().cache, "hit")
  assert.equal(readFileSync(join(root, "checks"), "utf8").trim().split("\n").length, 14)
})
