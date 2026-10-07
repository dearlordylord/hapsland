import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { mkdir, writeFile, rename, readdir, readFile } from "node:fs/promises"
import { resolve } from "node:path"
const query = (pid, field) => {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", `${field}=`], { encoding: "utf8", timeout: 5000 }).trim()
  } catch (error) {
    if (error.status === 1 && !error.stdout?.toString().trim()) return undefined
    throw error
  }
}
const processStart = (pid) => {
  if (process.platform !== "linux") return query(pid, "lstart")
  try {
    const encoded = readFileSync(`/proc/${pid}/stat`, "utf8")
    const fields = encoded.slice(encoded.lastIndexOf(")") + 2).split(" ")
    if (!/^\d+$/.test(fields[19])) throw new Error("Invalid build process start identity")
    return `linux:${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${fields[19]}`
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ESRCH") return undefined
    throw error
  }
}
export const buildProcessGroup = () => {
  const group = Number(query(process.pid, "pgid"))
  if (!Number.isSafeInteger(group) || group <= 1) throw new Error("Cannot establish build process group")
  return group
}
const alive = (group) => {
  try {
    process.kill(-group, 0)
    return true
  } catch (error) {
    if (error.code === "ESRCH") return false
    throw error
  }
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
export async function registerBuildGroup(directory, lease) {
  const group = buildProcessGroup()
  if (process.pid === lease.pid) return
  const start = processStart(group)
  if (!start) throw new Error("Build process group leader is absent before registration")
  const groups = resolve(directory, "groups")
  await mkdir(groups, { recursive: true })
  const path = resolve(groups, `${process.pid}.json`)
  await writeFile(path + ".tmp", JSON.stringify({ pid: process.pid, group, start, token: lease.token }))
  await rename(path + ".tmp", path)
}
export async function stopBuildGroups(directory, lease) {
  const groups = resolve(directory, "groups")
  const files = await readdir(groups).catch((error) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  let found = false,
    unresolved = false
  for (const file of files) {
    if (!file.endsWith(".json"))
      throw Object.assign(new Error("Incomplete build group registration"), { groupUnresolved: true })
    const record = JSON.parse(await readFile(resolve(groups, file), "utf8"))
    if (
      !Number.isSafeInteger(record.pid) ||
      record.pid <= 1 ||
      typeof record.start !== "string" ||
      !record.start.trim() ||
      record.token !== lease.token ||
      !Number.isSafeInteger(record.group) ||
      record.group <= 1
    )
      throw Object.assign(new Error("Invalid build group registration"), { groupUnresolved: true })
    if (record.group === lease.group) {
      try {
        process.kill(record.pid, 0)
        found = true
        unresolved = true
      } catch (error) {
        if (error.code !== "ESRCH") throw error
      }
      continue
    }
    if (!alive(record.group)) continue
    found = true
    const current = processStart(record.group)
    if (process.platform !== "linux" || current === undefined || current !== record.start) {
      unresolved = true
      continue
    }
    for (const signal of ["SIGTERM", "SIGKILL"]) {
      try {
        process.kill(-record.group, signal)
      } catch (error) {
        if (error.code !== "ESRCH") throw error
      }
      await pause(100)
      if (!alive(record.group)) break
    }
    for (let attempt = 0; alive(record.group) && attempt < 20; attempt++) await pause(50)
    unresolved ||= alive(record.group)
  }
  if (found)
    throw Object.assign(new Error("Registered build task group outlived its stage"), { groupUnresolved: unresolved })
}
