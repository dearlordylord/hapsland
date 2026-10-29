import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs"
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
  const bendDirectory = join(root, "bend2")
  const bin = join(root, "bin")
  for (const directory of ["packages/monkey-business-bend", "packages/agent-flow-bend"]) mkdirSync(join(root, directory), { recursive: true })
  for (const file of ["packages/monkey-business-bend/compiler.mjs", "packages/agent-flow-bend/package.json"]) copyFileSync(join(owner, "../..", file), join(root, file))
  for (const directory of [prototypeDir, bendDirectory, bin]) mkdirSync(directory, { recursive: true })
  for (const name of ["run.sh", "cached-build.mjs", "clang-no-stack-check.sh", "recording-launch.mjs", "register-bank.mjs"]) copyFileSync(join(owner, name), join(prototypeDir, name))
  writeFileSync(join(prototypeDir, "DefenseMain.bend"), 'import Base\nimport ./Dependency.bend\n')
  writeFileSync(join(prototypeDir, "Dependency.bend"), 'import "./effect.c"\n')
  writeFileSync(join(prototypeDir, "effect.c"), '#include "./header.h"\n')
  writeFileSync(join(prototypeDir, "header.h"), "// native header\n")
  writeFileSync(join(bendDirectory, "base.bend"), "// base runtime\n")
  writeFileSync(join(bin, "bend"), `#!/bin/sh
if [ "$1" = version ]; then printf '%s\\n' "bend \${CACHE_TEST_VERSION:-2.0.39}"; exit; fi
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
  delete environment.HAPSLAND_GAME_CPU_BANK
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
  assert.throws(f.run, /requires exact bend 2\.0\.39; observed bend 2\.0\.35/)
  assert.equal(f.count(), 1)
  delete f.environment.CACHE_TEST_VERSION
  writeFileSync(join(f.bin, "clang"), '#!/bin/sh\nprintf "Apple clang version 21.0.1\\n"\n')
  assert.equal(f.run().reused, false)
  f.environment.CPATH = "/other/includes"
  assert.equal(f.run().reused, false)
  writeFileSync(join(f.prototypeDir, "clang-no-stack-check.sh"), "#!/bin/sh\n# changed wrapper\n")
  assert.equal(f.run().reused, false)
  assert.equal(f.count(), 4)
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
    assert.equal(result.stdout, `+RTS\n--threads\n4\n-RTS\n`)
    assert.match(result.stderr, /building|using cached build/)
  }
  assert.equal(f.count(), 1)
})

function bankFixture(t) {
  const f = fixture(t)
  f.environment.HAPSLAND_GAME_CPU_BANK = "1"
  writeFileSync(join(f.bin, "bend"), `#!/bin/sh
if [ "$1" = version ]; then echo 'bend 2.0.39'; exit; fi
printf 'build\\n' >> "$CACHE_TEST_COUNT"
cat > "$3" <<'C'
#define WL_BANK Term r0, r1;
#define WL_SIG Env e, DEV Term* sp, u32 seq, u32 rn, Term r0, Term r1
#define WL_ALL e, sp, seq, rn, r0, r1
#define WL_OPEN    { WL_BANK u32 rn;
#if !DEVICE
#undef  WL_SPIN
  return WL_FID_ENTER(WL_ALL);
C
if [ "$CACHE_TEST_BAD_LAYOUT" = 1 ]; then echo '#define WL_BANK bad;' >> "$3"; fi
`, { mode: 0o755 })
  writeFileSync(join(f.bin, "clang"), `#!/bin/sh
if [ "$1" = --version ]; then echo 'clang version 21.0.0'; exit; fi
printf '%s\\n' "$@" > "$CACHE_TEST_FLAGS"
if [ "$CACHE_TEST_FAIL_CLANG" = 1 ]; then exit 1; fi
while [ "$1" != -o ]; do shift; done
shift
printf '#!/bin/sh\\nexit 0\\n' > "$1"
chmod +x "$1"
`, { mode: 0o755 })
  f.environment.CACHE_TEST_FLAGS = join(f.root, "flags")
  return f
}

test("explicit Linux bank mode has a separate identity, flags and validated lowering", t => {
  const f = bankFixture(t)
  const first = f.run()
  const saved = JSON.parse(readFileSync(`${first.binary}.json`, "utf8"))
  assert.equal(saved.inputs.mode, "linux-cpu-register-bank-O0")
  assert.deepEqual(saved.inputs.compileFlags, ["-std=c11", "-O0", "-Wno-unused-value", "-lm", "-pthread", "-lX11"])
  assert.match(readFileSync(f.environment.CACHE_TEST_FLAGS, "utf8"), /-O0\n/)
  assert.equal(f.run().reused, true)
  writeFileSync(join(f.prototypeDir, "register-bank.mjs"), readFileSync(join(f.prototypeDir, "register-bank.mjs"), "utf8") + "\n// revision\n")
  assert.notEqual(f.run().key, first.key)
  assert.throws(() => cachedBinary({ ...f, host: {platform:"darwin",arch:"arm64",release:"test"} }), /requires Linux/)
})

test("unknown emitted layouts and compiler failures cannot publish bank binaries", t => {
  const f = bankFixture(t)
  f.environment.CACHE_TEST_BAD_LAYOUT = "1"
  assert.throws(f.run, /Unsupported Bend register macro/)
  assert.deepEqual(readdirSync(f.cacheDir), [])
  delete f.environment.CACHE_TEST_BAD_LAYOUT
  f.environment.CACHE_TEST_FAIL_CLANG = "1"
  assert.throws(f.run, /Clang CPU bank build failed/)
  assert.deepEqual(readdirSync(f.cacheDir), [])
  delete f.environment.CACHE_TEST_FAIL_CLANG
  assert.equal(f.run().reused, false)
})


test("failed compiler stops its linker descendants before removing staging", async t => {
  const f = fixture(t)
  const marker = join(f.root, "orphan-linker-finished")
  const linker = join(f.root, "delayed-linker.cjs")
  writeFileSync(linker, `setTimeout(() => require("node:fs").writeFileSync(process.argv[2], "linked"), 600)`)
  writeFileSync(join(f.bin, "bend"), `#!/bin/sh
if [ "$1" = version ]; then echo 'bend 2.0.39'; exit; fi
"$CACHE_TEST_NODE" "$CACHE_TEST_LINKER" "$CACHE_TEST_MARKER" </dev/null >/dev/null 2>&1 &
exit 1
`, { mode: 0o755 })
  Object.assign(f.environment, { CACHE_TEST_NODE: process.execPath, CACHE_TEST_LINKER: linker, CACHE_TEST_MARKER: marker })
  assert.throws(f.run, /Bend build failed/)
  await new Promise(resolve => setTimeout(resolve, 1000))
  assert.equal(existsSync(marker), false, "a failed build must not leave a linker running after staging cleanup")
  assert.deepEqual(readdirSync(f.cacheDir), [])
})


test("local O0 launch selects wrapper and keeps a distinct cache identity", t => {
  const f = fixture(t)
  const ordinary = f.run()
  f.environment.HAPSLAND_GAME_OPTIMIZATION = "0"
  const local = f.run()
  assert.notEqual(local.key, ordinary.key)
  assert.equal(f.run().reused, true)
  const launch = spawnSync("bash", [join(f.prototypeDir, "run.sh"), "--new"], { env: f.environment, encoding: "utf8", timeout: 10000 })
  assert.equal(launch.status, 0, launch.stderr)
  assert.equal(launch.stdout, "+RTS\n--threads\n4\n-RTS\n")
  const flags = join(f.root, "local-flags")
  writeFileSync(join(f.bin, "clang"), `#!/bin/sh
printf '%s\\n' "$@" > "$CACHE_TEST_FLAGS"
`, { mode: 0o755 })
  const result = spawnSync("bash", [join(f.prototypeDir, "clang-no-stack-check.sh"), "-O3", "source.c"], {
    env: { ...f.environment, BEND_CANONICAL_DEFENSE_CC: join(f.bin, "clang"), CACHE_TEST_FLAGS: flags },
    encoding: "utf8", timeout: 5000
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(readFileSync(flags, "utf8"), /-O3\nsource.c\n-fno-stack-check\n-O0\n$/)
})
