import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { execFile } from "node:child_process"
import { lstat, readFile, readlink, realpath, readdir } from "node:fs/promises"
import { isAbsolute, join, relative, resolve } from "node:path"
import { promisify } from "node:util"

const execute = promisify(execFile)
const generatedRoots = new Set([".test-runs", "dist", "coverage", "node_modules"])

// Directory owners consumed by compilation, boundary checks and deterministic fixtures.
const verificationRoots = new Set([
  "src",
  "scripts",
  "packages",
  "native",
  "bin",
  "schemas",
  "vendor",
  "evidence",
  "conformance",
  "assets",
  "prototypes"
])
const verificationFiles = new Set([
  "package.json",
  "package-runtime.json",
  "bun.lock",
  "crap4ts.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.package.json",
  "tsconfig.packages.json",
  "turbo.json",
  ".gitignore",
  ".gitmodules",
  ".hapsland.jsonc"
])

const packagedInputs = async (root) => {
  let text
  try {
    text = await readFile(join(root, "package.json"), "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw error
  }
  const manifest = JSON.parse(text)
  return (manifest.files ?? []).map((path) => {
    // A glob conservatively selects its directory prefix; exact files stay exact.
    const normalized = path.replace(/^\.\//, "").replace(/\/$/, "")
    const wildcard = normalized.search(/[?*[]/)
    const separator = normalized.lastIndexOf("/", wildcard)
    return wildcard < 0 ? normalized : separator < 0 ? "" : normalized.slice(0, separator)
  })
}

/** Identify verification inputs, including dirty, deleted and new files in their owners. */
export const sourceIdentity = (
  root,
  excludedDirectory,
  selection,
  { deadline = Date.now() + 30000, excludedFiles = [], excludedDirectories = [] } = {}
) => {
  for (const path of [...excludedFiles, ...excludedDirectories])
    if (typeof path !== "string" || isAbsolute(path) || path.split("/").some((part) => ["", ".", ".."].includes(part)))
      throw new Error("Source output exclusions require exact relative owner paths")
  return identifyInputs(root, excludedDirectory, true, selection, deadline, { excludedFiles, excludedDirectories })
}

async function linkedInputDigest(path, ancestors = new Set(), deadline) {
  if (Date.now() >= deadline) throw new Error("Source identity deadline exceeded")
  let actual
  try {
    actual = await realpath(path)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    return "missing-target"
  }
  if (ancestors.has(actual)) return "cycle"
  const metadata = await lstat(actual),
    digest = createHash("sha256")
  digest.update(`${metadata.mode}\0`)
  if (metadata.isFile()) digest.update(await readFile(actual))
  else if (metadata.isDirectory()) {
    const next = new Set([...ancestors, actual])
    for (const name of (await readdir(actual)).sort()) {
      if (name === ".git") continue
      digest.update(`${name}\0${await linkedInputDigest(join(actual, name), next, deadline)}\0`)
    }
  } else throw new Error("Unsupported linked source input")
  return digest.digest("hex")
}

async function identifyInputs(root, excludedDirectory, selectVerificationInputs, selection, deadline, exclusions = {}) {
  if (!Number.isFinite(deadline) || Date.now() >= deadline) throw new Error("Source identity deadline exceeded")
  const packaged = selectVerificationInputs ? await packagedInputs(root) : []

  const { stdout } = await execute("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: Math.max(1, deadline - Date.now())
  })
  const { stdout: index } = await execute("git", ["ls-files", "--stage", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: Math.max(1, deadline - Date.now())
  })
  const gitlinks = new Map(
    index
      .split("\0")
      .filter(Boolean)
      .flatMap((entry) => {
        const match = /^160000 ([a-f0-9]+) \d\t(.*)$/s.exec(entry)
        return match ? [[match[2], match[1]]] : []
      })
  )
  const excluded = excludedDirectory && relative(root, excludedDirectory).replaceAll("\\", "/")
  const files = [...new Set(stdout.split("\0").filter(Boolean))]
    .sort()
    .filter(
      (file) =>
        !generatedRoots.has(file.split("/")[0]) &&
        (selection === undefined || selection(file)) &&
        (selection !== undefined ||
          !selectVerificationInputs ||
          verificationRoots.has(file.split("/")[0]) ||
          verificationFiles.has(file) ||
          packaged.some((path) => path === "" || file === path || file.startsWith(`${path}/`))) &&
        !(exclusions.excludedFiles ?? []).includes(file) &&
        !(exclusions.excludedDirectories ?? []).some(
          (directory) => file === directory || file.startsWith(`${directory}/`)
        ) &&
        !(
          excluded &&
          !isAbsolute(excluded) &&
          excluded !== ".." &&
          !excluded.startsWith("../") &&
          (file === excluded || file.startsWith(`${excluded}/`))
        )
    )
  const identifyFile = async (file) => {
    if (Date.now() >= deadline) throw new Error("Source identity deadline exceeded")
    const hash = createHash("sha256")
    hash.update(`${file}\0`)
    let metadata
    try {
      metadata = await lstat(join(root, file))
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      if (gitlinks.has(file)) throw new Error(`Archive input submodule is missing or uninitialized: ${file}`)
      hash.update("deleted\0")
      return hash.digest("hex")
    }
    hash.update(`${metadata.mode}\0`)
    if (metadata.isSymbolicLink()) {
      hash.update(
        `link\0${await readlink(join(root, file))}\0${await linkedInputDigest(join(root, file), new Set(), deadline)}\0`
      )
    } else if (metadata.isFile()) {
      hash.update(`file\0${metadata.size}\0`)
      for await (const bytes of createReadStream(join(root, file), {
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now()))
      }))
        hash.update(bytes)
    } else if (metadata.isDirectory() && gitlinks.has(file)) {
      const directory = join(root, file)
      let checkout
      try {
        const top = await execute("git", ["rev-parse", "--show-toplevel"], { cwd: directory, encoding: "utf8" })
        if (resolve(top.stdout.trim()) !== resolve(directory)) throw new Error("No submodule checkout")
        checkout = await execute("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" })
      } catch {
        throw new Error(`Archive input submodule is missing or uninitialized: ${file}`)
      }
      hash.update(`submodule\0${gitlinks.get(file)}\0${checkout.stdout.trim()}\0`)
      // The declared vendor dependency owns its complete checkout, including root files.
      hash.update(await identifyInputs(directory, excludedDirectory, false, undefined, deadline))
    } else throw new Error(`Unsupported archive input: ${file}`)
    return hash.digest("hex")
  }
  let cursor = 0
  const identities = new Array(files.length)
  await Promise.all(
    Array.from({ length: Math.min(8, files.length) }, async () => {
      while (cursor < files.length) {
        const index = cursor++
        identities[index] = await identifyFile(files[index])
      }
    })
  )
  if (Date.now() >= deadline) throw new Error("Source identity deadline exceeded")
  return createHash("sha256").update(JSON.stringify(identities)).digest("hex")
}
