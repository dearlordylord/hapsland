import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runBuildProcess } from "./build-process.mjs"
const run = (script, options = {}) =>
  runBuildProcess(process.execPath, ["-e", script], { timeout: 5000, stdio: "ignore", ...options })
test("successful build process stops before returning", async () => {
  assert.equal((await run("process.exit(0)")).code, 0)
})
test("build failure rejects publication", async () => {
  await assert.rejects(run("process.exit(7)"), /Build process failed \(7\)/)
})
test("deadline stops an unresponsive build process", async () => {
  const begin = Date.now()
  await assert.rejects(
    run("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)", { timeout: 150 }),
    /deadline exceeded/
  )
  assert.ok(Date.now() - begin < 4000)
})
test("missing executable rejects without retaining signal listeners", async () => {
  const before = process.listenerCount("SIGTERM")
  await assert.rejects(runBuildProcess("/nonexistent-hapsland-build-command", [], { timeout: 1000, stdio: "ignore" }), {
    code: "ENOENT"
  })
  assert.equal(process.listenerCount("SIGTERM"), before)
})
test("invalid deadlines fail before spawning", async () => {
  await assert.rejects(run("", { timeout: Infinity }), /finite deadline/)
})

test("captured build output is drained and returned", async () => {
  const result = await run("process.stdout.write('flags');process.stderr.write('diagnostic')", { stdio: "pipe" })
  assert.equal(result.stdout, "flags")
})
test("deadline stops a build and its real child process", async () => {
  const script = `const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{stdio:'ignore'});
    process.on('SIGTERM',()=>{child.kill('SIGTERM');child.on('exit',()=>process.exit(0))});
    setInterval(()=>{},1000);`
  const begin = Date.now()
  await assert.rejects(run(script, { timeout: 200 }), /deadline exceeded/)
  assert.ok(Date.now() - begin < 4000)
})

test("outer deadline owns nested build processes in the same group", async () => {
  const module = new URL("./build-process.mjs", import.meta.url).href
  const script = `import {runBuildProcess} from ${JSON.stringify(module)};
    await runBuildProcess(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{timeout:5000,stdio:'ignore'});`
  const begin = Date.now()
  await assert.rejects(
    runBuildProcess(process.execPath, ["--input-type=module", "-e", script], { timeout: 200, stdio: "ignore" }),
    /deadline exceeded/
  )
  assert.ok(Date.now() - begin < 4000)
})

test("spawn observer receives a live owned group after cleanup guards are installed", async () => {
  const before = process.listenerCount("SIGTERM")
  let observed
  const result = await run("process.exit(0)", {
    onSpawn: (identity) => {
      observed = identity
      assert.equal(identity.pid, identity.group)
      assert.doesNotThrow(() => process.kill(identity.pid, 0))
      assert(process.listenerCount("SIGTERM") > before)
    }
  })
  assert.equal(result.code, 0)
  assert.throws(() => process.kill(-observed.group, 0), { code: "ESRCH" })
  assert.equal(process.listenerCount("SIGTERM"), before)
})

test("throwing spawn observer rejects only after draining its actual process group", async () => {
  let group
  const failure = new Error("observer evidence failed")
  await assert.rejects(
    run("setInterval(()=>{},1000)", {
      onSpawn: (identity) => {
        group = identity.group
        throw failure
      }
    }),
    (error) => error === failure
  )
  assert.throws(() => process.kill(-group, 0), { code: "ESRCH" })
})

test("spawn failure never emits a live process observation", async () => {
  await assert.rejects(
    runBuildProcess("/nonexistent-hapsland-observed-build", [], {
      timeout: 1000,
      stdio: "ignore",
      onSpawn: () => assert.fail("must not observe")
    }),
    { code: "ENOENT" }
  )
})

test("asynchronous observers are rejected before launch and Promise returns are drained", async () => {
  await assert.rejects(run("", { onSpawn: async () => {} }), /synchronous function/)
  let group
  await assert.rejects(
    run("setInterval(()=>{},1000)", {
      onSpawn: (identity) => {
        group = identity.group
        return Promise.reject(new Error("unsupported async observation"))
      }
    }),
    /return synchronously/
  )
  assert.throws(() => process.kill(-group, 0), { code: "ESRCH" })
})

test("shell interposition preserves actual group for nested producer deadlines", async () => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-interposed-group-"))
  const evidence = join(root, "observed.json")
  const module = new URL("./build-process.mjs", import.meta.url).href
  const script = `import {runBuildProcess} from ${JSON.stringify(module)};
    import {writeFileSync} from "node:fs";
    await runBuildProcess(process.execPath,["-e","setInterval(()=>{},1000)"],{
      timeout:100,stdio:"ignore",onSpawn:(identity)=>{
        writeFileSync(${JSON.stringify(evidence)},JSON.stringify({caller:process.pid,...identity}));
      }
    });`
  let outer
  const begin = Date.now()
  try {
    await assert.rejects(
      runBuildProcess("/bin/sh", ["-c", '"$0" --input-type=module -e "$1"', process.execPath, script], {
        timeout: 2000,
        stdio: "ignore",
        onSpawn: (identity) => {
          outer = identity
        }
      }),
      /Build process (?:failed|group outlived)/
    )
    const nested = JSON.parse(await readFile(evidence, "utf8"))
    assert.notEqual(nested.caller, outer.group, "Fixture did not interpose shell process")
    assert.equal(nested.group, outer.group, "Nested deadline targeted caller PID instead of actual process group")
    assert(Date.now() - begin < 1500, "Nested deadline fell through to outer deadline")
    assert.throws(() => process.kill(-outer.group, 0), { code: "ESRCH" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

const teardownScript = (evidence, milliseconds, leaderExitAt = 0) => `
  const {spawn}=require('node:child_process');
  const child=spawn(process.execPath,['-e',${JSON.stringify(`
    const {writeFileSync}=require('node:fs');
    process.on('disconnect',()=>setTimeout(()=>{
      writeFileSync(${JSON.stringify(evidence)}, 'natural cleanup');
      process.exit(0);
    },${milliseconds}));
    process.send('ready');
  `)}],{stdio:['ignore','ignore','ignore','ipc']});
  child.once('message',()=>setTimeout(()=>{
    require('node:fs').writeFileSync(${JSON.stringify(evidence + ".leader")}, 'leader exited');
    process.exit(0);
  },Math.max(0,${leaderExitAt}-Date.now())));
`

test("successful wrapper waits for its real descendant natural cleanup before returning", async () => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-natural-join-"))
  const evidence = join(root, "cleanup.txt")
  let group
  try {
    const result = await run(teardownScript(evidence, 30), {
      onSpawn: (identity) => {
        group = identity.group
      }
    })
    assert.equal(result.code, 0)
    assert.equal(await readFile(evidence, "utf8"), "natural cleanup")
    assert.throws(() => process.kill(-group, 0), { code: "ESRCH" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("persistent descendant after join grace rejects and is physically drained", async () => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-persistent-join-"))
  const evidence = join(root, "cleanup.txt")
  let group
  try {
    await assert.rejects(
      run(teardownScript(evidence, 1000), {
        onSpawn: (identity) => {
          group = identity.group
        }
      }),
      /group outlived its leader/
    )
    await assert.rejects(readFile(evidence), { code: "ENOENT" })
    assert.throws(() => process.kill(-group, 0), { code: "ESRCH" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("natural teardown grace cannot extend the original command deadline", async () => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-deadline-join-"))
  const evidence = join(root, "cleanup.txt")
  let group
  // The leader exits near the command deadline. Starting a fresh grace then
  // would let this descendant finish and incorrectly publish success.
  try {
    await assert.rejects(
      run(teardownScript(evidence, 80, Date.now() + 250), {
        timeout: 300,
        onSpawn: (identity) => {
          group = identity.group
        }
      }),
      /deadline exceeded/
    )
    assert.equal(await readFile(evidence + ".leader", "utf8"), "leader exited")
    await assert.rejects(readFile(evidence), { code: "ENOENT" })
    assert.throws(() => process.kill(-group, 0), { code: "ESRCH" })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
