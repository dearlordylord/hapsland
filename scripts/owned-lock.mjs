import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises"
import { join } from "node:path"
const json = async (path) => JSON.parse(await readFile(path, "utf8"))
const ownerAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === "ESRCH") return false
    throw error
  }
}
export async function withOwnedLock(directory, work, timeoutMs = 300000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("Owned lock requires a finite deadline")
  await mkdir(directory, { recursive: true })
  const lock = join(directory, "lock"),
    deadline = Date.now() + timeoutMs
  while (true) {
    try {
      await mkdir(lock)
      break
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      const owner = await json(join(lock, "owner.json")).catch((error) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (owner && (!Number.isInteger(owner.pid) || owner.pid <= 1))
        throw new Error(`Invalid artifact lock owner: ${lock}`)
      if (owner && !ownerAlive(owner.pid)) throw new Error(`Abandoned artifact lock needs owned-process audit: ${lock}`)
      if (Date.now() >= deadline) throw new Error(`Artifact lock deadline exceeded: ${lock}`)
      await new Promise((done) => setTimeout(done, 25))
    }
  }
  let preserveLock = false
  try {
    await writeFile(join(lock, "owner.tmp"), JSON.stringify({ pid: process.pid }))
    await rename(join(lock, "owner.tmp"), join(lock, "owner.json"))
    if (Date.now() >= deadline) throw new Error("Owned lock deadline exceeded")
    return await work()
  } catch (error) {
    preserveLock = error.groupUnresolved === true
    throw error
  } finally {
    if (!preserveLock) await rm(lock, { recursive: true, force: true })
  }
}
