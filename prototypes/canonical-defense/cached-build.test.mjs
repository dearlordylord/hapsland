import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { cachedBinary } from "./cached-build.mjs"

const owner = dirname(fileURLToPath(import.meta.url))
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "defense-cache-test-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const prototypeDir = join(root, "prototypes/canonical-defense")
  const bendDirectory = join(root, ".bend/bend2")
  const bin = join(root, "bin")
  for (const directory of [prototypeDir, bendDirectory, bin]) mkdirSync(directory, { recursive: true })
  for (const name of ["run.sh", "cached-build.mjs", "clang-no-stack-check.sh", "recording-launch.mjs"]) copyFileSync(join(owner, name), join(prototypeDir, name))
  writeFileSync(join(prototypeDir, "DefenseMain.bend"), 'import Base\nimport ./Dependency.bend\n')
  writeFileSync(join(prototypeDir, "Dependency.bend"), 'import "./effect.c"\n')
  writeFileSync(join(prototypeDir, "effect.c"), '#include "./header.h"\n')
  writeFileSync(join(prototypeDir, "header.h"), "// native header\n")
  writeFileSync(join(bendDirectory, "base.bend"), "// base runtime\n")
  writeFileSync(join(bin, "bend"), `#!/bin/sh
if [ "$1" = version ]; then printf '%s\\n' "bend \${CACHE_TEST_VERSION:-2.0.34}"; exit; fi
printf 'build\\n' >> "$CACHE_TEST_COUNT"
if [ -n "$CACHE_TEST_MUTATE" ]; then printf '// changed\\n' >> "$CACHE_TEST_MUTATE"; fi
cat > "$3" <<'GAME'
#!/bin/sh
printf '%s\\n' "$@"
GAME
chmod +x "$3"
if [ "$CACHE_TEST_FAIL" = 1 ]; then exit 1; fi
`, { mode: 0o755 })
  writeFileSync(join(bin, "clang"), '#!/bin/sh\nprintf "Apple clang version 21.0.0\\n"\n', { mode: 0o755 })
  writeFileSync(join(bin, "uname"), '#!/bin/sh\nif [ "$1" = -s ]; then echo Darwin; else echo arm64; fi\n', { mode: 0o755 })
  const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: root, CACHE_TEST_COUNT: join(root, "count") }
  delete environment.CC
  delete environment.BEND_CANONICAL_DEFENSE_CC
  const options = { prototypeDir, bendDirectory, cacheDir: join(root, "cache"), environment, notice: () => {} }
  return { ...options, root, bin, count: () => readFileSync(environment.CACHE_TEST_COUNT, "utf8").trim().split("\n").length, run: () => cachedBinary(options) }
}

test("unchanged bytes reuse the executable; transitive effects and runtime changes rebuild", t => {
  const f = fixture(t)
  const first = f.run()
  assert.equal(first.reused, false)
  utimesSync(join(f.prototypeDir, "effect.c"), new Date(), new Date())
  assert.deepEqual(f.run(), { ...first, reused: true })
  assert.equal(f.count(), 1)
  writeFileSync(join(f.prototypeDir, "header.h"), "// changed native header\n")
  assert.notEqual(f.run().key, first.key)
  writeFileSync(join(f.bendDirectory, "base.bend"), "// changed runtime\n")
  assert.equal(f.run().reused, false)
  assert.equal(f.count(), 3)
})

test("tool versions, compiler contents, flags and wrapper code invalidate reuse", t => {
  const f = fixture(t)
  const first = f.run()
  f.environment.CACHE_TEST_VERSION = "2.0.35"
  assert.notEqual(f.run().key, first.key)
  writeFileSync(join(f.bin, "clang"), '#!/bin/sh\nprintf "Apple clang version 21.0.1\\n"\n')
  assert.equal(f.run().reused, false)
  f.environment.CPATH = "/other/includes"
  assert.equal(f.run().reused, false)
  writeFileSync(join(f.prototypeDir, "clang-no-stack-check.sh"), "#!/bin/sh\n# changed wrapper\n")
  assert.equal(f.run().reused, false)
  assert.equal(f.count(), 5)
})

test("missing receipts and damaged executables are rebuilt", t => {
  const f = fixture(t)
  const first = f.run()
  unlinkSync(`${first.binary}.json`)
  assert.equal(f.run().reused, false)
  writeFileSync(first.binary, "damaged executable")
  assert.equal(f.run().reused, false)
  assert.equal(f.count(), 3)
})

test("failed or changing builds never publish a reusable binary", t => {
  const f = fixture(t)
  f.environment.CACHE_TEST_FAIL = "1"
  assert.throws(f.run, /Bend build failed/)
  assert.deepEqual(readdirSync(f.cacheDir), [])
  delete f.environment.CACHE_TEST_FAIL
  f.environment.CACHE_TEST_MUTATE = join(f.prototypeDir, "effect.c")
  assert.throws(f.run, /inputs changed during compilation/)
  assert.deepEqual(readdirSync(f.cacheDir), [])
  delete f.environment.CACHE_TEST_MUTATE
  assert.equal(f.run().reused, false)
  assert.equal(f.run().reused, true)
  assert.equal(f.count(), 3)
})

test("run.sh builds once, reuses the cache and selects recording mode", t => {
  const f = fixture(t)
  for (const argument of ["--new", "--new"]) {
    const result = spawnSync("bash", [join(f.prototypeDir, "run.sh"), argument], { env: f.environment, encoding: "utf8", timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, `--threads\n4\n`)
    assert.match(result.stderr, /building|using cached build/)
  }
  assert.equal(f.count(), 1)
})
