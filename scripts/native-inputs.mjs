import { buildDeclaredParserSources } from "./native-binding-source.mjs"
import { resolve } from "node:path"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { readPackageGraph } from "./package-graph.mjs"
import { nativeTaskPlans, prepareNativeTaskInputs } from "./native-task-inputs.mjs"
import { withBuildLock } from "./build-lock.mjs"
import {
  nativeInputRecipe,
  readNativeInputBundle,
  retainNativeInputBundle,
  nativeInputDirectory
} from "./native-input-bundle.mjs"
import { runBuildProcess } from "./build-process.mjs"

export async function provisionNativeInputs(root, operation, profile, supplied) {
  if (!["linux-arm64", "darwin-arm64"].includes(profile))
    throw new Error("Native inputs require linux-arm64 or darwin-arm64")
  const graph = readPackageGraph(root)
  const plans = nativeTaskPlans(root, graph, profile)
  const recipe = nativeInputRecipe(root, plans, profile)
  const name = `native-inputs-${profile}-${recipe.digest}`
  let directory
  if (operation === "build") {
    if (profile !== `${process.platform}-${process.arch}` || process.version !== "v24.20.0")
      throw new Error("Native input production requires the target host and Node 24.20.0")
    const owners = plans
      .filter((plan) =>
        plan.assets.some(
          ({ asset }) => asset.producer.kind === "c" || asset.producer.profiles[profile].sourceBuild === true
        )
      )
      .map((plan) => plan.node.manifest.name)
    directory = await withBuildLock(root, async (environment) => {
      await buildDeclaredParserSources(root, plans, profile, environment)
      await prepareNativeTaskInputs(root, graph, environment, owners, [profile])
      for (const owner of owners)
        await runBuildProcess(process.execPath, [resolve(root, "scripts/native-task.mjs"), profile], {
          cwd: graph.packages.get(owner).path,
          env: environment,
          timeout: 120000
        })
      if (JSON.stringify(nativeInputRecipe(root, plans, profile)) !== JSON.stringify(recipe))
        throw new Error("Native sources changed during production")
      return retainNativeInputBundle(
        root,
        recipe,
        plans.flatMap((plan) =>
          plan.assets
            .filter(({ asset }) => asset.producer.kind === "c" || asset.producer.profiles[profile].sourceBuild === true)
            .map(({ output }) => output)
        )
      )
    })
  } else if (operation === "import" || operation === "fetch") {
    let temporary
    try {
      if (operation === "fetch") {
        if (supplied) throw new Error("Fetch takes no bundle path")
        const response = await runBuildProcess(
          "gh",
          ["api", `repos/dearlordylord/hapsland/actions/artifacts?name=${name}&per_page=100`],
          { cwd: root, stdio: "pipe", timeout: 30000 }
        )
        const artifact = JSON.parse(response.stdout).artifacts.find(
          (entry) => !entry.expired && entry.workflow_run?.head_branch === "master"
        )
        if (!artifact)
          throw new Error(
            `No current native input artifact: ${name}. Build it on ${profile}, or run the Native inputs workflow for master.`
          )
        mkdirSync(resolve(root, ".test-runs"), { recursive: true })
        temporary = mkdtempSync(resolve(root, ".test-runs/native-download-"))
        await runBuildProcess(
          "gh",
          [
            "run",
            "download",
            String(artifact.workflow_run.id),
            "--repo",
            "dearlordylord/hapsland",
            "--name",
            name,
            "--dir",
            temporary
          ],
          { cwd: root, timeout: 60000 }
        )
        supplied = temporary
      }
      if (!supplied) throw new Error("Import requires the bundle directory")
      readNativeInputBundle(resolve(supplied), recipe, { transport: true })
      directory = await withBuildLock(root, async () =>
        retainNativeInputBundle(
          root,
          recipe,
          recipe.assets.map((asset) => resolve(supplied, asset.path))
        )
      )
    } finally {
      if (temporary) rmSync(temporary, { recursive: true, force: true })
    }
  } else if (operation === "identity") {
    directory = nativeInputDirectory(root, recipe)
  } else throw new Error("Use native:inputs -- build|fetch|import|identity <profile> [bundle-directory]")
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(process.env.GITHUB_OUTPUT, `name=${name}\ndirectory=${directory}\n`, { flag: "a" })
  return { name, directory }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length < 4 || process.argv.length > 5)
    throw new Error("Use native:inputs -- build|fetch|import|identity <profile> [bundle-directory]")
  const result = await provisionNativeInputs(resolve(import.meta.dirname, ".."), ...process.argv.slice(2))
  process.stdout.write(`${result.name}\n${result.directory}\n`)
}
