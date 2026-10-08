import { lstat, mkdir, mkdtemp, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { pathToFileURL } from "node:url"
import { withBuildCustodyGate } from "./build-custody-gate.mjs"

const absent = (identity) => {
  try {
    process.kill(identity, 0)
  } catch (error) {
    if (error.code === "ESRCH") return
    throw error
  }
  throw new Error(`Build custody still has a live or reused process identity: ${identity}`)
}
const pid = (value) => Number.isSafeInteger(value) && value > 1
const token = (value) => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
async function snapshot(directory) {
  const records = {}
  const visit = async (path, name) => {
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) throw new Error(`Ambiguous build custody symlink: ${name}`)
    if (stat.isDirectory()) {
      records[name] = null
      for (const child of (await readdir(path)).sort()) await visit(join(path, child), `${name}/${child}`)
    } else if (stat.isFile()) records[name] = await readFile(path, "utf8")
    else throw new Error(`Ambiguous build custody entry: ${name}`)
  }
  for (const name of ["lock", "lease.json", "groups", "admission"])
    await visit(join(directory, name), name).catch((error) => {
      if (error.code !== "ENOENT") throw error
    })
  return records
}
function audit(records, admission = true) {
  const identities = new Set()
  const read = (name) => {
    if (typeof records[name] !== "string") throw new Error(`Incomplete build custody: ${name}`)
    return JSON.parse(records[name])
  }
  const owner = read("lock/owner.json")
  const lease = read("lease.json")
  if (
    !pid(owner.pid) ||
    !pid(lease.pid) ||
    !pid(lease.group) ||
    !token(lease.token) ||
    !["open", "closing"].includes(lease.state)
  )
    throw new Error("Invalid build custody owner or lease")
  identities.add(owner.pid).add(lease.pid).add(lease.group).add(-lease.group)
  for (const name of Object.keys(records)) {
    if (records[name] === null) {
      if (!["lock", "groups", "admission", "admission/lock"].includes(name))
        throw new Error(`Unexpected build custody directory: ${name}`)
      continue
    }
    if (["lock/owner.json", "lease.json"].includes(name)) continue
    if (name === "admission/lock/owner.json" && admission) {
      const record = read(name)
      if (!pid(record.pid)) throw new Error("Invalid build admission owner")
      identities.add(record.pid)
    } else if (/^groups\/\d+\.json$/.test(name)) {
      const record = read(name)
      if (
        !pid(record.pid) ||
        !pid(record.group) ||
        !token(record.token) ||
        typeof record.start !== "string" ||
        !record.start.trim()
      )
        throw new Error(`Invalid build group evidence: ${name}`)
      // Previous tokens are auditable evidence, never registrations for a new lease.
      identities.add(record.pid).add(record.group).add(-record.group)
    } else throw new Error(`Ambiguous build custody record: ${name}`)
  }
  if (admission && records["admission/lock"] === null) read("admission/lock/owner.json")
  for (const identity of identities) absent(identity)
}

// Ordinary builders hold a shared kernel gate, so this exclusive holder can
// audit and archive admission without removing any newly acquired live lock.
export async function reconcileBuildCustody(root) {
  const directory = resolve(root, ".test-runs/product-build")
  return withBuildCustodyGate(
    root,
    async () => {
      const stat = await lstat(directory).catch((error) => {
        if (error.code !== "ENOENT") throw error
      })
      if (stat === undefined) return undefined
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Ambiguous build custody directory")
      const before = await snapshot(directory)
      audit(before)
      const audits = resolve(root, ".test-runs/build-custody-audits")
      await mkdir(audits, { recursive: true })
      const evidence = await mkdtemp(join(audits, "stopped-writers-"))
      await writeFile(
        join(evidence, "audit.json"),
        JSON.stringify({ stoppedWritersVerified: true, records: before }, null, 2),
        { mode: 0o600 }
      )
      if (JSON.stringify(await snapshot(directory)) !== JSON.stringify(before))
        throw new Error(`Build custody changed during audit; evidence: ${evidence}`)
      audit(before)
      // Same-filesystem rename preserves every record atomically. Failure leaves
      // custody intact; death after rename leaves it archived and the gate released.
      await rename(directory, join(evidence, "custody"))
      return evidence
    },
    { shared: false }
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 3) throw new Error("usage: node scripts/reconcile-build-custody.mjs [checkout-root]")
  const evidence = await reconcileBuildCustody(process.argv[2] ?? resolve(import.meta.dirname, ".."))
  console.log(
    evidence === undefined
      ? "No retained build custody to reconcile"
      : `Reconciled stopped build writers; audit: ${evidence}`
  )
}
