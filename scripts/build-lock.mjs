import { buildProcessGroup, registerBuildGroup, stopBuildGroups } from "./build-groups.mjs"
import { randomUUID } from "node:crypto"
import { readFile, writeFile, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { withOwnedLock } from "./owned-lock.mjs"
const key = "HAPSLAND_BUILD_LOCK_LEASE"
export const withBuildLock = async (root, work, timeoutMs = 180000) => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("Build lock requires a finite acquisition deadline")
  const acquisitionDeadline = Date.now() + timeoutMs
  if (!Number.isSafeInteger(acquisitionDeadline)) throw new Error("Build lock acquisition deadline is out of range")
  const acquisitionBudget = () => {
    const remaining = acquisitionDeadline - Date.now()
    if (remaining <= 0) throw new Error("Build lock acquisition deadline exceeded")
    return remaining
  }
  const directory = resolve(root, ".test-runs/product-build")
  const leasePath = resolve(directory, "lease.json")
  const inherited = process.env[key]
  if (inherited) {
    await withOwnedLock(
      resolve(directory, "admission"),
      async () => {
        acquisitionBudget()
        const lease = JSON.parse(await readFile(leasePath, "utf8"))
        const owner = JSON.parse(await readFile(resolve(directory, "lock/owner.json"), "utf8"))
        if (
          lease.state !== "open" ||
          lease.token !== inherited ||
          lease.pid !== owner.pid ||
          !Number.isInteger(lease.pid) ||
          !Number.isSafeInteger(lease.group) ||
          lease.group <= 1
        )
          throw new Error("Invalid or closed inherited build lock lease")
        acquisitionBudget()
        process.kill(lease.pid, 0)
        await registerBuildGroup(directory, lease)
        acquisitionBudget()
      },
      Math.min(5000, acquisitionBudget())
    )
    acquisitionBudget()
    return work({ ...process.env })
  }
  return withOwnedLock(
    directory,
    async () => {
      acquisitionBudget()
      const token = randomUUID()
      const lease = { token, pid: process.pid, group: buildProcessGroup(), state: "open" }
      await writeFile(leasePath, JSON.stringify(lease), { mode: 0o600 })
      let preserveLease = false
      let result, failure
      try {
        acquisitionBudget()
        result = await work({ ...process.env, [key]: token })
      } catch (error) {
        preserveLease = error.groupUnresolved === true
        failure = error
      }
      try {
        await withOwnedLock(
          resolve(directory, "admission"),
          async () => {
            lease.state = "closing"
            await writeFile(leasePath, JSON.stringify(lease), { mode: 0o600 })
          },
          5000
        )
        await stopBuildGroups(directory, lease)
      } catch (error) {
        preserveLease ||= error.groupUnresolved !== false
        failure = error
      }
      if (!preserveLease) {
        await rm(leasePath, { force: true })
        await rm(resolve(directory, "groups"), { recursive: true, force: true })
      }
      if (failure) {
        failure.groupUnresolved = preserveLease
        throw failure
      }
      return result
    },
    acquisitionBudget()
  )
}
