import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, access, writeFile, mkdir, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runBuildProcess } from "./build-process.mjs"
import { withBuildCustodyGate } from "./build-custody-gate.mjs"
import { reconcileBuildCustody } from "./reconcile-build-custody.mjs"
import { withBuildLock } from "./build-lock.mjs"

async function abandoned(t) {
  const root = await mkdtemp(join(tmpdir(), "hapsland-custody-recovery-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const lockModule = new URL("./build-lock.mjs", import.meta.url).href
  const processModule = new URL("./build-process.mjs", import.meta.url).href
  const worker = `import {withBuildLock} from ${JSON.stringify(lockModule)};
    await withBuildLock(${JSON.stringify(root)},async()=>{throw new Error('failed build child')});`
  const supervisor = `import {withBuildLock} from ${JSON.stringify(lockModule)};
    import {runBuildProcess} from ${JSON.stringify(processModule)};
    await withBuildLock(${JSON.stringify(root)},async(env)=>{
      try { await runBuildProcess(process.execPath,['--input-type=module','-e',${JSON.stringify(worker)}],{env,timeout:5000,stdio:'pipe'}); }
      catch { process.exit(17); }
    });`
  await assert.rejects(
    runBuildProcess(process.execPath, ["--input-type=module", "-e", supervisor], { timeout: 8000, stdio: "pipe" }),
    /Build process failed \(17\)/
  )
  const directory = join(root, ".test-runs/product-build")
  const lease = await readFile(join(directory, "lease.json"), "utf8")
  return { root, directory, lease }
}

test("real failed child and exited supervisor can reconcile all custody before the next build", async (t) => {
  const { root, directory, lease } = await abandoned(t)
  await assert.rejects(
    withBuildLock(root, async () => assert.fail("must not enter")),
    /Abandoned artifact lock/
  )
  const evidence = await reconcileBuildCustody(root)
  assert.equal(await readFile(join(evidence, "custody/lease.json"), "utf8"), lease)
  assert.equal(JSON.parse(await readFile(join(evidence, "audit.json"))).stoppedWritersVerified, true)
  for (const name of ["lock", "lease.json", "groups", "admission/lock"])
    await assert.rejects(access(join(directory, name)), { code: "ENOENT" })
  await withBuildLock(root, async (env) => {
    assert.notEqual(env.HAPSLAND_BUILD_LOCK_LEASE, JSON.parse(lease).token)
  })
})

test("lock-only removal cannot overwrite retained lease or poison a safely reconciled build", async (t) => {
  const { root, directory, lease } = await abandoned(t)
  await rm(join(directory, "lock"), { recursive: true })
  // A real new owner exits after refusing admission, leaving an auditable lock.
  const script = `import {withBuildLock} from ${JSON.stringify(new URL("./build-lock.mjs", import.meta.url).href)};
    await withBuildLock(${JSON.stringify(root)},async()=>{throw new Error('must not enter')});`
  await assert.rejects(
    runBuildProcess(process.execPath, ["--input-type=module", "-e", script], { timeout: 5000, stdio: "pipe" }),
    /Build process failed \(1\)/
  )
  assert.equal(await readFile(join(directory, "lease.json"), "utf8"), lease)
  await reconcileBuildCustody(root)
  await withBuildLock(root, async () => {})
})

test("reconciliation refuses a live owner without altering custody", async (t) => {
  const { root, directory } = await abandoned(t)
  await writeFile(join(directory, "lock/owner.json"), JSON.stringify({ pid: process.pid }))
  await assert.rejects(reconcileBuildCustody(root), /live or reused/)
  await access(join(directory, "lease.json"))
  await access(join(directory, "groups"))
})

test("live registered groups and incomplete registrations remain untouched", async (t) => {
  const { root, directory } = await abandoned(t)
  const lease = JSON.parse(await readFile(join(directory, "lease.json")))
  let ready, failed
  const started = new Promise((resolve, reject) => {
    ready = resolve
    failed = reject
  })
  const completed = runBuildProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    timeout: 8000,
    stdio: "pipe",
    onSpawn: ({ pid }) => {
      ready({ pid })
    }
  }).catch((error) => {
    failed(error)
    return error
  })
  const child = await started
  try {
    await writeFile(
      join(directory, "groups/live.json"),
      JSON.stringify({ pid: child.pid, group: child.pid, start: "live", token: lease.token })
    )
    await assert.rejects(reconcileBuildCustody(root), /Ambiguous build custody record/)
    await rm(join(directory, "groups/live.json"))
    await writeFile(
      join(directory, `groups/${child.pid}.json`),
      JSON.stringify({ pid: child.pid, group: child.pid, start: "live", token: lease.token })
    )
    await assert.rejects(reconcileBuildCustody(root), /live or reused/)
    await writeFile(
      join(directory, `groups/${child.pid}.json`),
      JSON.stringify({ pid: lease.pid, group: child.pid, start: "live", token: lease.token })
    )
    await assert.rejects(reconcileBuildCustody(root), /live or reused/)
    await access(join(directory, "lock/owner.json"))
  } finally {
    process.kill(-child.pid, "SIGTERM")
    assert.match((await completed).message, /Build process failed \(SIGTERM\)/)
    assert.throws(() => process.kill(-child.pid, 0), { code: "ESRCH" })
  }
  await writeFile(join(directory, "groups/incomplete.tmp"), "{")
  await assert.rejects(reconcileBuildCustody(root), /Ambiguous/)
  assert.equal(await readFile(join(directory, "groups/incomplete.tmp"), "utf8"), "{")
})

test("abandoned admission is audited together with groups from previous lease tokens", async (t) => {
  const { root, directory } = await abandoned(t)
  const lease = JSON.parse(await readFile(join(directory, "lease.json")))
  await mkdir(join(directory, "admission/lock"))
  await writeFile(join(directory, "admission/lock/owner.json"), JSON.stringify({ pid: lease.pid }))
  await writeFile(
    join(directory, "lease.json"),
    JSON.stringify({ ...lease, token: "11111111-1111-1111-1111-111111111111" })
  )
  await reconcileBuildCustody(root)
  await withBuildLock(root, async () => {})
})

test("live admission, missing lease and symlink evidence refuse recovery", async (t) => {
  const { root, directory, lease } = await abandoned(t)
  await mkdir(join(directory, "admission/lock"))
  await writeFile(join(directory, "admission/lock/owner.json"), JSON.stringify({ pid: process.pid }))
  await assert.rejects(reconcileBuildCustody(root), /live or reused/)
  await rm(join(directory, "admission/lock"), { recursive: true })
  await rm(join(directory, "lease.json"))
  await assert.rejects(reconcileBuildCustody(root), /Incomplete build custody/)
  await writeFile(join(directory, "lease.json"), lease)
  await symlink(join(directory, "lease.json"), join(directory, "groups/alias.json"))
  await assert.rejects(reconcileBuildCustody(root), /symlink/)
  await access(join(directory, "lock/owner.json"))
})

test("exclusive recovery cannot enter while a live admission worker holds the shared gate", async (t) => {
  const { root, directory } = await abandoned(t)
  let entered, release
  const ready = new Promise((resolve) => {
    entered = resolve
  })
  const held = new Promise((resolve) => {
    release = resolve
  })
  const worker = withBuildCustodyGate(root, async () => {
    await mkdir(join(directory, "admission/lock"))
    await writeFile(join(directory, "admission/lock/owner.json"), JSON.stringify({ pid: process.pid }))
    entered()
    await held
  })
  await ready
  try {
    await assert.rejects(
      withBuildCustodyGate(root, async () => assert.fail("must not enter"), { shared: false, timeoutMs: 50 }),
      /gate deadline/
    )
    assert.equal(JSON.parse(await readFile(join(directory, "admission/lock/owner.json"))).pid, process.pid)
  } finally {
    release()
    await worker
  }
  await assert.rejects(reconcileBuildCustody(root), /live or reused/)
})

test("a killed exclusive holder releases its gate and intact custody can be reconciled", async (t) => {
  const { root, directory, lease } = await abandoned(t)
  const module = new URL("./build-custody-gate.mjs", import.meta.url).href
  const script = `import {withBuildCustodyGate} from ${JSON.stringify(module)};
    await withBuildCustodyGate(${JSON.stringify(root)},async()=>{process.kill(process.pid,'SIGKILL')},{shared:false});`
  await assert.rejects(
    runBuildProcess(process.execPath, ["--input-type=module", "-e", script], { timeout: 5000, stdio: "pipe" }),
    /Build process failed \(SIGKILL\)/
  )
  assert.equal(await readFile(join(directory, "lease.json"), "utf8"), lease)
  await reconcileBuildCustody(root)
  await withBuildLock(root, async () => {})
})

test("failed atomic archive leaves every custody record intact and permits retry", async (t) => {
  const { root, directory, lease } = await abandoned(t)
  const parent = join(root, ".test-runs")
  const { chmod } = await import("node:fs/promises")
  await mkdir(join(parent, "build-custody-audits"), { recursive: true })
  await chmod(parent, 0o500)
  try {
    await assert.rejects(
      reconcileBuildCustody(root),
      (error) => ["EACCES", "EPERM"].includes(error.code) && error.syscall === "rename"
    )
    assert.equal(await readFile(join(directory, "lease.json"), "utf8"), lease)
    await access(join(directory, "lock/owner.json"))
    await access(join(directory, "groups"))
  } finally {
    await chmod(parent, 0o700)
  }
  await reconcileBuildCustody(root)
  await withBuildLock(root, async () => {})
})

test("completed archive is idempotent and retains the admission evidence", async (t) => {
  const { root, directory, lease } = await abandoned(t)
  await mkdir(join(directory, "admission/lock"))
  await writeFile(join(directory, "admission/lock/owner.json"), JSON.stringify({ pid: JSON.parse(lease).pid }))
  const evidence = await reconcileBuildCustody(root)
  await access(join(evidence, "custody/admission/lock/owner.json"))
  assert.equal(await reconcileBuildCustody(root), undefined)
  await withBuildLock(root, async () => {})
})

for (const point of ["before", "after"]) {
  test(`recovery killed ${point} the atomic rename can retry without partial custody`, async (t) => {
    const { root, directory, lease } = await abandoned(t)
    const module = new URL("./reconcile-build-custody.mjs", import.meta.url).href
    const script = `import fs from 'node:fs/promises';
      import {syncBuiltinESMExports} from 'node:module';
      const original = fs.rename;
      fs.rename = async (from, to) => {
        if(from === ${JSON.stringify(directory)}) {
          ${point === "after" ? "await original(from,to);" : ""}
          process.kill(process.pid,'SIGKILL');
        }
        return original(from,to);
      };
      syncBuiltinESMExports();
      const {reconcileBuildCustody} = await import(${JSON.stringify(module)});
      await reconcileBuildCustody(${JSON.stringify(root)});`
    await assert.rejects(
      runBuildProcess(process.execPath, ["--input-type=module", "-e", script], { timeout: 5000, stdio: "pipe" }),
      /Build process failed \(SIGKILL\)/
    )
    if (point === "before") {
      assert.equal(await readFile(join(directory, "lease.json"), "utf8"), lease)
      await reconcileBuildCustody(root)
    } else {
      assert.equal(await reconcileBuildCustody(root), undefined)
      const { readdir } = await import("node:fs/promises")
      const audits = join(root, ".test-runs/build-custody-audits")
      const entries = await readdir(audits)
      assert.equal(entries.length, 1)
      assert.equal(await readFile(join(audits, entries[0], "custody/lease.json"), "utf8"), lease)
    }
    await withBuildLock(root, async () => {})
  })
}
