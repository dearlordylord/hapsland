import { resolvePinnedTypeScript } from "../pinned-typescript.mjs"
import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRun, focusedSelection, runSelectedTests, main as runChecks } from "./run-checks.mjs"
import { resolveVerificationPlan } from "./verification-plan.mjs"
import { sourceIdentity } from "./source-identity.mjs"
import { requiredTestArtifacts } from "./inventory.mjs"
import { prepareArchive } from "./prepare-archive.mjs"

export async function verify(argv, root = resolve(import.meta.dirname, "../..")) {
  const inputs = {},
    tests = [],
    options = []
  for (const argument of argv.filter((value) => value !== "--")) {
    const match = /^--(profile|native-target|host|provider|model|scenario|timeout-ms)=(.+)$/.exec(argument)
    if (match) {
      const key = { "native-target": "nativeTarget", "timeout-ms": "timeoutMs" }[match[1]] ?? match[1]
      if (inputs[key] !== undefined) throw new Error(`Duplicate ${match[1]} option`)
      inputs[key] = key === "timeoutMs" ? Number(match[2]) : match[2]
    } else if (argument.startsWith("-")) options.push(argument)
    else tests.push(argument)
  }
  const selection = tests.length ? await focusedSelection(root, [...tests, ...options]) : undefined
  if (!selection && options.length) throw new Error("Test options require explicit test files")
  const plan = resolveVerificationPlan({
    ...inputs,
    selectedTests: tests,
    testOptions: options,
    consumerArtifacts: inputs.profile === "boundary" ? requiredTestArtifacts(root, tests) : []
  })
  if (plan.profile === "quality") return runChecks(["quality", `--timeout-ms=${plan.timeoutMs}`], root, plan)
  const run = await createRun({
    root,
    mode: "focused",
    scope: `profile:${plan.profile}`,
    timeoutMs: plan.timeoutMs,
    selectedTestFiles: plan.selectedTestFiles,
    plan
  })
  let archive, piPreflight
  try {
    const digest = await sourceIdentity(root, undefined, undefined, { deadline: run.context.deadline })
    const manifestPath = join(run.runDirectory, "manifest.json")
    await writeFile(
      manifestPath,
      JSON.stringify({ ...JSON.parse(await readFile(manifestPath, "utf8")), sourceDigest: digest }, null, 2)
    )
    for (const stage of plan.stages.filter((stage) => stage.kind !== "tests")) {
      if (run.aborted) break
      if (stage.kind === "package")
        archive = await prepareArchive({
          root,
          runDirectory: run.runDirectory,
          runStage: run.runStage,
          deadline: run.context.deadline
        })
      else {
        const command =
          stage.kind === "agent-preflight"
            ? { executable: process.execPath, args: [join(root, "scripts/native-pi-preflight.mjs")] }
            : stage.kind === "toolchain"
              ? {
                  executable:
                    stage.target === "typescript"
                      ? (await resolvePinnedTypeScript()).executable
                      : stage.target === "rust"
                        ? "rustc"
                        : "bend",
                  args: stage.target === "bend" ? ["version"] : ["--version"]
                }
              : stage.kind === "agent"
                ? {
                    executable: process.execPath,
                    args: [
                      join(root, "scripts/run-native-crossfile-current.mjs"),
                      `--host=${stage.host}`,
                      "--language=typescript",
                      `--scenario=${stage.scenario}`,
                      `--model=${stage.model}`,
                      `--provider=${stage.provider}`,
                      ...(archive ? [`--archive=${archive.archivePath}`] : [])
                    ]
                  }
                : { executable: "npm", args: ["run", "check:fast"] }
        const result = await run.runStage({
          name: stage.name,
          command: command.executable,
          args: command.args,
          env: piPreflight ? { HAPSLAND_PI_PREFLIGHT: piPreflight } : {}
        })
        if (stage.kind === "agent-preflight" && result.state === "passed")
          piPreflight = (await readFile(result.logPath, "utf8")).trim()
        if (result.state !== "passed") throw new Error(`${stage.name} failed`)
      }
    }
    if (selection && !run.aborted)
      await runSelectedTests(
        run,
        root,
        selection,
        archive ? { HAPSLAND_TEST_PACKAGE_ARCHIVE: archive.archivePath } : {}
      )
    if ((await sourceIdentity(root, undefined, undefined, { deadline: run.context.deadline })) !== digest)
      throw new Error("Verification inputs changed during the run")
  } catch (error) {
    await run.recordFailedStage({ name: "verification", error })
  }
  return run.finish()
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verify(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
