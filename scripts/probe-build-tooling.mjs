import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

// Bounded pre-adoption experiment. This does not wire tooling into production.
const repository = resolve(import.meta.dirname, "..")
const [turboArgument, outputArgument] = process.argv.slice(2)
assert(turboArgument && outputArgument, "usage: node scripts/probe-build-tooling.mjs TURBO OUTPUT.json")
const turbo = resolve(turboArgument)
const output = resolve(outputArgument)
assert(!existsSync(output), "retain each observation without overwriting previous evidence")
const fixture = mkdtempSync(join(tmpdir(), "hapsland-tooling-243-"))
const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  fixture,
  scope: "Pre-adoption three-package cache and boundary probe",
  cases: [],
  limitations: [
    "Synthetic domain fixture, not production adoption",
    "No watch, native assets, cross-platform, full resolver, or executable input-closure evidence"
  ]
}
const write = (path, data) => {
  mkdirSync(dirname(join(fixture, path)), { recursive: true })
  writeFileSync(join(fixture, path), data)
}
const json = (path, data) => write(path, `${JSON.stringify(data, null, 2)}\n`)
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(join(fixture, path)))
    .digest("hex")
const run = (command, args, extraEnv = {}) => {
  const result = spawnSync(command, args, {
    cwd: fixture,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      TURBO_TELEMETRY_DISABLED: "1",
      HAPSLAND_PROBE_TARGET: `${process.platform}-${process.arch}`,
      ...extraEnv
    }
  })
  if (result.error) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}
const executable = (name) => join(fixture, "packages", name, "artifact", name)
const invoke = (name) => run(executable(name), [])
const build = (name, expectedSuccess = true, env = {}) => {
  rmSync(join(fixture, "events"), { recursive: true, force: true })
  const result = run(turbo, ["run", "assemble", "--cache=local:rw", "--concurrency=2"], env)
  const events = existsSync(join(fixture, "events")) ? readdirSync(join(fixture, "events")).sort() : []
  const observation = { name, ...result, events }
  report.cases.push(observation)
  assert.equal(result.status === 0, expectedSuccess, JSON.stringify(observation))
  return observation
}
try {
  report.versions = {
    turbo: run(turbo, ["--version"]),
    typescript: run(process.execPath, [join(repository, "node_modules/typescript/bin/tsc"), "--version"]),
    bun: run(join(repository, "node_modules/.bin/bun"), ["--version"])
  }
  json("package.json", {
    name: "tooling-probe",
    private: true,
    packageManager: "npm@11.6.0",
    workspaces: ["packages/*"]
  })
  json("package-lock.json", {
    name: "tooling-probe",
    lockfileVersion: 3,
    packages: {
      "": { name: "tooling-probe", workspaces: ["packages/*"] },
      ...Object.fromEntries(
        ["inputs", "admin", "hook"].flatMap((name) => [
          [
            `packages/${name}`,
            {
              name: `@probe/${name}`,
              version: "1.0.0",
              ...(name === "hook" ? { dependencies: { "@probe/inputs": "1.0.0" } } : {})
            }
          ],
          [`node_modules/@probe/${name}`, { resolved: `packages/${name}`, link: true }]
        ])
      )
    }
  })
  json("turbo.json", {
    globalDependencies: ["task.mjs", "boundary-policy.json", "toolchain.json"],
    globalEnv: ["HAPSLAND_PROBE_TARGET"],
    tasks: {
      compile: { dependsOn: ["^compile"], inputs: ["src/**", "tsconfig.json", "package.json"], outputs: ["dist/**"] },
      assemble: { dependsOn: ["compile", "^compile"], inputs: ["package.json"], outputs: ["artifact/**"] }
    }
  })
  json("boundary-policy.json", { deny: ["administration"] })
  json("toolchain.json", {
    node: process.version,
    bun: report.versions.bun.stdout.trim(),
    typescript: report.versions.typescript.stdout.trim(),
    platform: process.platform,
    architecture: process.arch
  })
  mkdirSync(join(fixture, "node_modules/@probe"), { recursive: true })
  for (const name of ["inputs", "admin", "hook"]) {
    const dependencies = name === "hook" ? { "@probe/inputs": "1.0.0" } : {}
    json(`packages/${name}/package.json`, {
      name: `@probe/${name}`,
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
      dependencies,
      scripts: {
        compile: `node ../../task.mjs ${name} compile`,
        ...(name === "inputs" ? {} : { assemble: `node ../../task.mjs ${name} assemble` })
      }
    })
    json(`packages/${name}/tsconfig.json`, {
      compilerOptions: {
        target: "ESNext",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        declaration: true,
        noEmitOnError: true,
        outDir: "dist",
        rootDir: "src"
      },
      include: ["src/**/*.ts"]
    })
    symlinkSync(`../../packages/${name}`, join(fixture, "node_modules/@probe", name))
  }
  write("packages/inputs/src/index.ts", 'export const input = (): string => "one";\n')
  write("packages/admin/src/index.ts", 'console.log("administration-one");\n')
  write("packages/hook/src/index.ts", 'import { input } from "@probe/inputs"; console.log(input());\n')
  write(
    "task.mjs",
    `import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const [name, task] = process.argv.slice(2);
mkdirSync("../../events", { recursive: true });
writeFileSync("../../events/" + name + "-" + task, "executed");
const args = task === "compile" ? [${JSON.stringify(join(repository, "node_modules/typescript/bin/tsc"))}, "-p", "tsconfig.json"] : ["build", "dist/index.js", "--compile", "--minify", "--outfile", "artifact/" + name];
const result = spawnSync(task === "compile" ? process.execPath : ${JSON.stringify(join(repository, "node_modules/.bin/bun"))}, args, {stdio:"inherit", timeout:20000});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`
  )
  build("clean")
  assert.equal(invoke("hook").stdout.trim(), "one")
  assert.equal(build("warm").events.length, 0, "warm build must execute no task adapters")
  rmSync(join(fixture, "packages/inputs/dist"), { recursive: true })
  rmSync(join(fixture, "packages/hook/artifact"), { recursive: true })
  assert.equal(build("deleted-output-restoration").events.length, 0)
  assert.equal(invoke("hook").stdout.trim(), "one")
  const hookBefore = hash("packages/hook/artifact/hook")
  write("packages/admin/src/index.ts", 'console.log("administration-two");\n')
  const admin = build("administration-only")
  assert.deepEqual(admin.events, ["admin-assemble", "admin-compile"])
  assert.equal(hash("packages/hook/artifact/hook"), hookBefore)
  const declarations = hash("packages/inputs/dist/index.d.ts")
  write("packages/inputs/src/index.ts", 'export const input = (): string => "two";\n')
  build("shared-implementation")
  assert.equal(hash("packages/inputs/dist/index.d.ts"), declarations)
  assert.equal(invoke("hook").stdout.trim(), "two")
  write("packages/inputs/src/index.ts", "export const input = (): string => 42;\n")
  build("upstream-error", false)
  write("packages/inputs/src/index.ts", 'export const input = (): string => "two";\n')
  assert.equal(build("repair-cache-restoration").events.length, 0)
  assert.equal(invoke("hook").stdout.trim(), "two")
  json("boundary-policy.json", { deny: ["administration", "provider-execution"] })
  assert(build("boundary-policy-invalidation").events.includes("hook-assemble"))
  assert(
    build("target-invalidation", true, { HAPSLAND_PROBE_TARGET: "different-target" }).events.includes("hook-assemble")
  )
  const boundaries = run(turbo, ["boundaries"])
  report.boundaries = { allowed: boundaries }
  assert.equal(boundaries.status, 0)
  write("packages/hook/src/index.ts", 'import "../../admin/src/index.ts";\n')
  report.boundaries.relativeForbidden = run(turbo, ["boundaries"])
  write("packages/hook/src/index.ts", 'const target = "../../admin/src/index.ts"; await import(target);\nexport {};\n')
  report.boundaries.computedLoader = run(turbo, ["boundaries"])
  report.completed = true
} catch (error) {
  report.failure = error.stack
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    JSON.stringify(
      {
        completed: report.completed ?? false,
        failure: report.failure,
        cases: report.cases.map((c) => ({ name: c.name, status: c.status, executed: c.events })),
        boundaries:
          report.boundaries && Object.fromEntries(Object.entries(report.boundaries).map(([k, v]) => [k, v.status])),
        fixture
      },
      null,
      2
    )
  )
}
