import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, access, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { runBuildProcess } from "./build-process.mjs"
import { withBuildLock } from "./build-lock.mjs"
const execute = promisify(execFile)
const fixture = async (work) => {
  const root = await mkdtemp(join(tmpdir(), "hapsland-build-lock-"))
  try {
    await work(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
test("nested build process inherits the live parent's lease without reacquiring", () =>
  fixture(async (root) => {
    await withBuildLock(root, async (env) => {
      const script = `import {withBuildLock} from ${JSON.stringify(new URL("./build-lock.mjs", import.meta.url).href)}; await withBuildLock(${JSON.stringify(root)}, async()=>console.log('nested'));`
      const result = await execute(process.execPath, ["--input-type=module", "-e", script], { env, timeout: 5000 })
      assert.equal(result.stdout.trim(), "nested")
      assert.equal(JSON.parse(await readFile(join(root, ".test-runs/product-build/lock/owner.json"))).pid, process.pid)
    })
    await assert.rejects(access(join(root, ".test-runs/product-build/lock")), { code: "ENOENT" })
  }))
test("independent builds serialize their mutation windows", () =>
  fixture(async (root) => {
    const events = []
    let release
    const held = new Promise((resolve) => {
      release = resolve
    })
    let entered
    const ready = new Promise((resolve) => {
      entered = resolve
    })
    const first = withBuildLock(root, async () => {
      events.push("first")
      entered()
      await held
      events.push("released")
    })
    await ready
    const second = withBuildLock(root, async () => {
      events.push("second")
    })
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.deepEqual(events, ["first"])
    release()
    await Promise.all([first, second])
    assert.deepEqual(events, ["first", "released", "second"])
  }))
test("failed build cleans its lease and permits the next build", () =>
  fixture(async (root) => {
    await assert.rejects(
      withBuildLock(root, async () => {
        throw new Error("producer failed")
      }),
      /producer failed/
    )
    await assert.rejects(access(join(root, ".test-runs/product-build/lease.json")), { code: "ENOENT" })
    await withBuildLock(root, async () => {})
  }))

test("unresolved owned descendants preserve both lock and lease for audit", () =>
  fixture(async (root) => {
    await assert.rejects(
      withBuildLock(root, async () => {
        throw Object.assign(new Error("group unresolved"), { groupUnresolved: true })
      }),
      /group unresolved/
    )
    const directory = join(root, ".test-runs/product-build")
    const lease = JSON.parse(await readFile(join(directory, "lease.json")))
    const owner = JSON.parse(await readFile(join(directory, "lock/owner.json")))
    assert.equal(lease.pid, owner.pid)
    assert.equal(owner.pid, process.pid)
    assert.equal(typeof lease.token, "string")
  }))

test("registered detached task retains custody until explicit recovery", () =>
  fixture(async (root) => {
    let child, closed
    try {
      await assert.rejects(
        withBuildLock(root, async (env) => {
          const script = `import {withBuildLock} from ${JSON.stringify(new URL("./build-lock.mjs", import.meta.url).href)};
      await withBuildLock(${JSON.stringify(root)}, async()=>{
        process.on('SIGTERM',()=>process.exit(0));
        console.log('registered');setInterval(()=>{},1000);
        await new Promise(()=>{});
      });`
          child = spawn(process.execPath, ["--input-type=module", "-e", script], {
            env,
            detached: true,
            stdio: ["ignore", "pipe", "pipe"]
          })
          closed = new Promise((resolve) => child.once("close", resolve))
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("registration deadline")), 5000)
            child.stdout.once("data", () => {
              clearTimeout(timer)
              resolve()
            })
            child.once("error", (error) => {
              clearTimeout(timer)
              reject(error)
            })
          })
        }),
        /Registered build task group outlived/
      )
      await access(join(root, ".test-runs/product-build/lock"))
      await access(join(root, ".test-runs/product-build/lease.json"))
    } finally {
      child?.kill("SIGTERM")
      await closed
    }
    assert.throws(() => process.kill(-child.pid, 0), { code: "ESRCH" })
    await access(join(root, ".test-runs/product-build/lock"))
  }))

test("unreadable group evidence keeps checkout ownership for audit", () =>
  fixture(async (root) => {
    await assert.rejects(
      withBuildLock(root, async () => {
        const groups = join(root, ".test-runs/product-build/groups")
        await mkdir(groups)
        await writeFile(join(groups, "broken.json"), "{invalid")
      }),
      (error) => error instanceof SyntaxError && error.groupUnresolved === true
    )
    await access(join(root, ".test-runs/product-build/lock/owner.json"))
    await access(join(root, ".test-runs/product-build/lease.json"))
    assert.equal(await readFile(join(root, ".test-runs/product-build/groups/broken.json"), "utf8"), "{invalid")
  }))

test("changed process group identity is retained without signalling its current owner", () =>
  fixture(async (root) => {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" })
    const closed = new Promise((resolve) => child.once("close", resolve))
    try {
      await assert.rejects(
        withBuildLock(root, async () => {
          const directory = join(root, ".test-runs/product-build")
          const lease = JSON.parse(await readFile(join(directory, "lease.json")))
          await mkdir(join(directory, "groups"))
          await writeFile(
            join(directory, "groups/changed.json"),
            JSON.stringify({ pid: child.pid, group: child.pid, start: "different lifetime", token: lease.token })
          )
        }),
        (error) => error.groupUnresolved === true
      )
      assert.doesNotThrow(() => process.kill(child.pid, 0))
      await access(join(root, ".test-runs/product-build/lock/owner.json"))
    } finally {
      child.kill("SIGTERM")
      await closed
    }
  }))

test("closed admission refuses a late worker before its mutation callback", () =>
  fixture(async (root) => {
    await withBuildLock(root, async (env) => {
      const path = join(root, ".test-runs/product-build/lease.json")
      const lease = JSON.parse(await readFile(path))
      await writeFile(path, JSON.stringify({ ...lease, state: "closing" }))
      const script = `import {withBuildLock} from ${JSON.stringify(new URL("./build-lock.mjs", import.meta.url).href)};
      await withBuildLock(${JSON.stringify(root)},async()=>console.log('must not mutate'));`
      await assert.rejects(
        execute(process.execPath, ["--input-type=module", "-e", script], { env, timeout: 5000 }),
        (error) =>
          error.stderr.includes("closed inherited build lock lease") && !error.stdout.includes("must not mutate")
      )
    })
  }))

test("build lock rejects invalid acquisition budgets before filesystem mutation", () =>
  fixture(async (root) => {
    for (const timeout of [0, -1, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER])
      await assert.rejects(
        withBuildLock(root, async () => assert.fail("must not mutate"), timeout),
        /deadline/
      )
    await assert.rejects(access(join(root, ".test-runs/product-build")), { code: "ENOENT" })
  }))

test("contended root acquisition stops at caller budget without invoking work", () =>
  fixture(async (root) => {
    let release, entered
    const held = new Promise((resolve) => {
      release = resolve
    })
    const ready = new Promise((resolve) => {
      entered = resolve
    })
    const first = withBuildLock(root, async () => {
      entered()
      await held
    })
    await ready
    try {
      const started = Date.now()
      await assert.rejects(
        withBuildLock(root, async () => assert.fail("must not mutate"), 30),
        /deadline exceeded/
      )
      assert(Date.now() - started < 1000, "Caller acquisition budget was ignored")
      await access(join(root, ".test-runs/product-build/lease.json"))
    } finally {
      release()
      await first
    }
  }))

test("lease creation cannot begin work after acquisition deadline", (context) =>
  fixture(async (root) => {
    let tick = 1000
    const clock = context.mock.method(Date, "now", () => ++tick)
    try {
      await assert.rejects(
        withBuildLock(root, async () => assert.fail("must not mutate"), 5),
        /deadline exceeded/
      )
      await assert.rejects(access(join(root, ".test-runs/product-build/lock")), { code: "ENOENT" })
      await assert.rejects(access(join(root, ".test-runs/product-build/lease.json")), { code: "ENOENT" })
    } finally {
      clock.mock.restore()
    }
  }))

test("inherited admission uses caller budget and refuses late mutation", () =>
  fixture(async (root) => {
    await withBuildLock(root, async (env) => {
      const admission = join(root, ".test-runs/product-build/admission/lock")
      await mkdir(admission, { recursive: true })
      await writeFile(join(admission, "owner.json"), JSON.stringify({ pid: process.pid }))
      try {
        const script = `import {withBuildLock} from ${JSON.stringify(new URL("./build-lock.mjs", import.meta.url).href)};
          await withBuildLock(${JSON.stringify(root)},async()=>console.log('must not mutate'),30);`
        await assert.rejects(
          execute(process.execPath, ["--input-type=module", "-e", script], { env, timeout: 2000 }),
          (error) => error.stderr.includes("deadline exceeded") && !error.stdout.includes("must not mutate")
        )
      } finally {
        await rm(admission, { recursive: true })
      }
    })
  }))

// Exercise the real inherited lease and failed subprocess, rather than an
// exception thrown directly by the owner's callback.
test("failed registered build child releases custody before the next build", () =>
  fixture(async (root) => {
    const script = `import {withBuildLock} from ${JSON.stringify(new URL("./build-lock.mjs", import.meta.url).href)};
      await withBuildLock(${JSON.stringify(root)},async()=>{throw new Error('real child failed')});`
    await assert.rejects(
      withBuildLock(root, (env) =>
        runBuildProcess(process.execPath, ["--input-type=module", "-e", script], { env, timeout: 5000, stdio: "pipe" })
      ),
      /Build process failed/
    )
    for (const name of ["lock", "lease.json", "groups"])
      await assert.rejects(access(join(root, ".test-runs/product-build", name)), { code: "ENOENT" })
    await withBuildLock(root, async () => {})
  }))

test("cleanup failure preserves the initiating build failure and retained custody", () =>
  fixture(async (root) => {
    await assert.rejects(
      withBuildLock(root, async () => {
        const directory = join(root, ".test-runs/product-build")
        await mkdir(join(directory, "groups"))
        await writeFile(join(directory, "groups/broken.json"), "{")
        throw new Error("source compilation failed")
      }),
      (error) => {
        assert(error instanceof AggregateError)
        assert.match(error.message, /source compilation failed; build custody cleanup failed/)
        assert.equal(error.errors[0].message, "source compilation failed")
        assert.equal(error.groupUnresolved, true)
        return true
      }
    )
    await access(join(root, ".test-runs/product-build/lock/owner.json"))
  }))
