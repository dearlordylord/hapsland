// Official release archives; update versions and all digests together after proof validation.
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { appendFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { spawn, spawnSync } from "node:child_process"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import { createGunzip, createZstdDecompress } from "node:zlib"

// The existing CI tooling step invokes this mode; local documentation installs stay local.
if (process.argv.includes("--github-actions") && process.env.GITHUB_ACTIONS !== "true") {
  process.exit(0)
}

const root = resolve(import.meta.dirname, "..")
// bendlang/bend v2.0.35, source 79df8d9.
// Digests from first-party GitHub release asset metadata, not downloaded at install time.
const platforms = {
  "linux-x64": {
    bend: "63039d1a119f716767ac5a7d8fe0717cfacf219c6c253c35192148e0dade722f",
    leanName: "linux",
    lean: "caaa98356098c85dc0fcbbd28e1ec66f39eb6551829972b752ff20e1286b646b"
  },
  "linux-arm64": {
    bend: "09b813073241628f590f2c2fe420299ec25e4dddd6cf3fdc49c9486339989564",
    leanName: "linux_aarch64",
    lean: "40b04fdb7fb849d3c80e10c3bbeebc7b7354b6d3f07450b9168c2149b40d2a82"
  }
}
const platform = `${process.platform}-${process.arch}`
const selected = platforms[platform]
if (!selected) throw new Error(`No pinned Bend proof toolchain for ${platform}`)
const bendRoot = join(root, ".tools/bend", `2.0.35-${platform}`)
const leanRoot = join(root, ".tools/lean", `4.34.0-${platform}`)
await mkdir(join(root, ".tools/bend"), { recursive: true })
const temporary = await mkdtemp(join(root, ".tools/bend", ".install-"))
const run = (binary, args, env = process.env) => {
  const result = spawnSync(binary, args, { stdio: "inherit", env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${binary} exited ${result.status}`)
}
async function install(url, expected, destination, compressed) {
  const archive = join(temporary, compressed)
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok) throw new Error(`Toolchain download failed: HTTP ${response.status}`)
  const hash = createHash("sha256")
  await pipeline(
    Readable.fromWeb(response.body),
    new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk)
        callback(null, chunk)
      }
    }),
    createWriteStream(archive)
  )
  if (hash.digest("hex") !== expected) throw new Error(`Toolchain SHA256 mismatch: ${url}`)
  const staging = join(temporary, `${compressed}-unpacked`)
  await mkdir(staging)
  const child = spawn("tar", ["-xf", "-", "-C", staging, "--strip-components=1"], {
    stdio: ["pipe", "inherit", "inherit"]
  })
  const completed = new Promise((accept, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => (code === 0 ? accept() : reject(new Error(`tar exited ${code}`))))
  })
  await Promise.all([
    pipeline(
      createReadStream(archive),
      compressed.endsWith(".zst") ? createZstdDecompress() : createGunzip(),
      child.stdin
    ),
    completed
  ])
  await mkdir(resolve(destination, ".."), { recursive: true })
  await rm(destination, { recursive: true, force: true })
  await rename(staging, destination)
}
try {
  await install(
    `https://github.com/bendlang/bend/releases/download/v2.0.35/bend-2.0.35-${platform}.tar.gz`,
    selected.bend,
    bendRoot,
    "bend.tar.gz"
  )
  await install(
    `https://github.com/leanprover/lean4/releases/download/v4.34.0/lean-4.34.0-${selected.leanName}.tar.zst`,
    selected.lean,
    leanRoot,
    "lean.tar.zst"
  )
  const bins = [join(bendRoot, "bin"), join(leanRoot, "bin")]
  const env = { ...process.env, PATH: [...bins, process.env.PATH].join(":") }
  // Do not permit an external kernel override to replace the bundled kernel.
  delete env.BENDTT
  run(join(bins[0], "bend"), ["version"], env)
  run(join(bins[1], "lean"), ["--version"], env)
  // Build and check the actual kernel before the bounded progress harness starts.
  run(join(bins[0], "bend"), [join(root, "packages/agent-flow-bend/progress-proof/PROOF.bend"), "--verdict"], env)
  if (process.env.GITHUB_PATH) await appendFile(process.env.GITHUB_PATH, `${bins.join("\n")}\n`)
  console.log(`Bend proof toolchain ready. Add to PATH: ${bins.join(":")}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
