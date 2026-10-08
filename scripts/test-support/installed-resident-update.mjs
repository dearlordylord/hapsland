import { createConnection } from "node:net"
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export const installedResidentUpdateJourney = async (
  { cli, archive, temporary, repository, codexHome, codexExecutable, environment },
  { run, parse, expect, quote }
) => {
  // The preceding disabled-review journey deliberately excludes all files.
  await writeFile(environment.REVIEW_USER_CONFIG_PATH, JSON.stringify({ version: 1 }))
  const socketPath = join(environment.REVIEW_RESIDENT_DIR, "resident.sock")
  let phase = "initial activation"
  const rpc = (request) =>
    new Promise((resolveRpc, reject) => {
      const socket = createConnection(socketPath)
      let frame = ""
      const timer = setTimeout(() => socket.destroy(new Error("update fixture IPC deadline")), 2_000)
      socket.on("connect", () => socket.write(JSON.stringify({ version: 1, hookContract: 1, ...request }) + "\n"))
      socket.on("data", (chunk) => {
        frame += chunk.toString()
        if (!frame.includes("\n")) return
        clearTimeout(timer)
        socket.destroy()
        try {
          resolveRpc(JSON.parse(frame.split("\n")[0]))
        } catch (cause) {
          reject(cause)
        }
      })
      socket.on("error", (cause) => reject(new Error(`${phase}: ${request.operation}: ${cause.message}`, { cause })))
      socket.on("close", () => {
        clearTimeout(timer)
        if (!frame.includes("\n")) reject(new Error("update fixture IPC unavailable"))
      })
    })
  const lifecycle = async (executable, request, expectedExit = 0) =>
    parse(
      await run(executable, [`--${request.operation}`], {
        cwd: repository,
        env: environment,
        input: JSON.stringify({ version: 1, ...request }),
        timeoutMs: 15_000
      }),
      `installed ${request.host} ${request.operation}`,
      expectedExit
    )
  const update = async (executable, expectedStatus = "updated", expectedExit = 0) => {
    const preview = await lifecycle(executable, { host: "resident", operation: "update-preview" })
    expect(preview.status === "preview", "resident update preview failed")
    const applied = await lifecycle(
      executable,
      { host: "resident", operation: "update", proposalDigest: preview.proposal.digest },
      expectedExit
    )
    expect(applied.status === expectedStatus, `resident update did not report ${expectedStatus}`)
    return applied
  }
  const extract = async (name) => {
    const root = join(temporary, name)
    await mkdir(root)
    const unpack = await run("tar", ["-xzf", archive, "-C", root])
    expect(unpack.code === 0, "update package extraction failed")
    return join(root, "package", "dist/bin", `${process.platform}-${process.arch}`)
  }
  const selected = () =>
    readFile(join(environment.HOME, ".local/share/hapsland/resident-target.json"), "utf8").then(JSON.parse)
  const originalNative = await readFile(join(codexHome, "hooks.json"), "utf8")
  const originalConfig = await readFile(join(codexHome, "config.toml"), "utf8")
  const originalOwner = await readFile(join(codexHome, ".hapsland/installation-v1.json"), "utf8")
  const originalLauncher = await readFile(join(codexHome, ".hapsland/codex-hook-launcher.sh"), "utf8")
  const claudeHome = join(temporary, "claude-home")
  const claudeExecutable = join(temporary, "claude")
  await writeFile(claudeExecutable, "#!/bin/sh\nprintf '2.1.218\\n'\n", { mode: 0o700 })
  const claudeRequest = { host: "claude", claudeHome, claudeExecutable }
  const claudePreview = await lifecycle(cli, { ...claudeRequest, operation: "install-preview" })
  const claudeInstalled = await lifecycle(cli, {
    ...claudeRequest,
    operation: "install",
    proposalDigest: claudePreview.proposal.digest
  })
  expect(claudeInstalled.status === "complete", "unrelated Claude fixture did not install")
  const claudeFiles = ["settings.json", ".hapsland/claude-installation-v1.json", ".hapsland/claude-hook-launcher.sh"]
  const claudeBefore = await Promise.all(claudeFiles.map((file) => readFile(join(claudeHome, file), "utf8")))
  try {
    const initial = await update(cli)
    const first = await rpc({ operation: "hello" })
    expect(first.build === initial.resident.build, "initial selected resident is not serving")
    const nextBin = await extract("resident-next")
    const nextCli = join(nextBin, "hapsland")
    phase = "idle replacement"
    const next = await update(nextCli)
    let second = await rpc({ operation: "hello" })
    expect(
      second.build !== first.build && second.build === next.resident.build && second.lifetime !== first.lifetime,
      "equal-version resident update did not change actual serving identity"
    )
    expect(
      (await readFile(join(codexHome, "hooks.json"), "utf8")) === originalNative,
      "resident update changed native hooks"
    )
    expect(
      (await readFile(join(codexHome, "config.toml"), "utf8")) === originalConfig,
      "resident update changed trust-relevant settings"
    )
    expect(
      (await readFile(join(codexHome, ".hapsland/installation-v1.json"), "utf8")) === originalOwner,
      "resident update changed hook selection"
    )
    expect(
      (await readFile(join(codexHome, ".hapsland/codex-hook-launcher.sh"), "utf8")) === originalLauncher,
      "resident update rewrote hook implementation selection"
    )

    // A different compatible hook implementation changes only the selected runtime binding.
    await writeFile(
      join(nextBin, "hapsland-hook"),
      `#!/bin/sh\nexec ${quote(join(dirname(cli), "hapsland-hook"))} "$@"\n`,
      { mode: 0o700 }
    )
    const codexRequest = { host: "codex", codexHome, codexExecutable }
    phase = "scoped hook update"
    const hookPreview = await lifecycle(nextCli, { ...codexRequest, operation: "update-preview" })
    const hookUpdate = await lifecycle(nextCli, {
      ...codexRequest,
      operation: "update",
      proposalDigest: hookPreview.proposal.digest
    })
    expect(hookUpdate.status === "updated", "selected runtime hook update failed")
    expect((await selected()).build === second.build, "hook update changed shared resident selection")
    expect(
      (await readFile(join(codexHome, "hooks.json"), "utf8")) === originalNative,
      "compatible hook update rewrote native definitions"
    )
    expect(
      (await readFile(join(codexHome, "config.toml"), "utf8")) === originalConfig,
      "compatible hook update rewrote trust settings"
    )
    for (const [index, file] of claudeFiles.entries())
      expect(
        (await readFile(join(claudeHome, file), "utf8")) === claudeBefore[index],
        "Codex update changed unrelated Claude installation"
      )

    // An idle resident can retire normally while unrelated administration runs.
    phase = "busy activation"
    await update(nextCli)
    second = await rpc({ operation: "hello" })
    const advicee = {
      host: "codex-cli",
      hostVersion: "0.155.1",
      sessionId: "update-busy",
      turnId: "turn",
      toolUseId: "edit",
      subagentId: null
    }
    const sourcePath = join(repository, "update-busy.ts")
    phase = "busy registration"
    const registration = await rpc({
      operation: "register-edit",
      lifetime: second.lifetime,
      root: repository,
      advicee,
      startedAt: Number(process.hrtime.bigint()) / 1_000_000,
      userConfigPath: environment.REVIEW_USER_CONFIG_PATH
    })
    expect(registration.status === "advanced", `busy update permit failed: ${registration.status}`)
    await writeFile(sourcePath, "type UpdateCount = number\n")
    const rootStat = await stat(repository, { bigint: true })
    const gitDirectory = join(repository, ".git")
    const gitStat = await stat(gitDirectory, { bigint: true })
    phase = "busy admission"
    const admitted = await rpc({
      operation: "admit",
      lifetime: second.lifetime,
      composed: true,
      controlledWriter: true,
      observation: {
        root: repository,
        rootIdentity: {
          rootDevice: String(rootStat.dev),
          rootInode: String(rootStat.ino),
          gitDirectory,
          gitDevice: String(gitStat.dev),
          gitInode: String(gitStat.ino)
        },
        advicee,
        candidates: [{ operation: "add", path: "update-busy.ts" }]
      },
      dispatch: {
        statePath: environment.REVIEW_STATE_PATH,
        userConfigPath: environment.REVIEW_USER_CONFIG_PATH,
        credential: null,
        controlled: { delayMs: 5_000, answers: { bare_domain_value: { _tag: "Probability", probability: 0.9 } } }
      }
    })
    expect(admitted.status === "accepted", `busy update admission failed: ${admitted.status}`)
    const deadline = Date.now() + 3_000
    let busy
    do {
      busy = await rpc({ operation: "stats", lifetime: second.lifetime })
      if (busy.running > 0) break
      await new Promise((resume) => setTimeout(resume, 10))
    } while (Date.now() < deadline)
    expect(busy.running > 0, "busy replacement fixture never began reviewing")
    phase = "busy replacement"
    await update(cli)
    const third = await rpc({ operation: "hello" })
    expect(
      third.build === first.build && third.lifetime !== second.lifetime,
      "busy replacement did not serve selected build"
    )
    const obsolete = await rpc({
      operation: "collect",
      composed: true,
      lifetime: second.lifetime,
      root: repository,
      advicee,
      dispatch: { statePath: environment.REVIEW_STATE_PATH, userConfigPath: null, credential: null, controlled: null }
    })
    expect(obsolete.status === "obsolete-lifetime", "abandoned work retained authority in the replacement")

    phase = "retained hook respawn"
    await update(nextCli)
    const selectedOwner = await rpc({ operation: "hello" })
    // Retained old hooks must launch the selected target after its process retires.
    await rpc({ operation: "replace", lifetime: selectedOwner.lifetime })
    const retiredDeadline = Date.now() + 2_000
    while (
      (await access(socketPath).then(
        () => true,
        () => false
      )) &&
      Date.now() < retiredDeadline
    )
      await new Promise((resume) => setTimeout(resume, 10))
    const prompt = JSON.parse(originalNative).hooks.PreToolUse[0].hooks[0].command
    const oldHook = await run("/bin/sh", ["-c", prompt], {
      cwd: repository,
      env: environment,
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        session_id: "old-hook",
        turn_id: "turn",
        tool_use_id: "old-hook-edit",
        tool_name: "apply_patch",
        tool_input: { command: "*** Begin Patch\n*** Add File: old-hook.ts\n+type Count = number\n*** End Patch" },
        cwd: repository
      }),
      timeoutMs: 8_000
    })
    expect(oldHook.code === 0, "retained hook could not run")
    const readinessDeadline = Date.now() + 10_000
    let respawned
    while (!respawned) {
      try {
        const response = await rpc({ operation: "hello" })
        if (response.status === "ready") respawned = response
      } catch (cause) {
        if (Date.now() >= readinessDeadline) throw cause
      }
      if (!respawned) {
        expect(Date.now() < readinessDeadline, "retained hook resident did not become ready")
        await new Promise((resume) => setTimeout(resume, 20))
      }
    }
    expect(respawned.build === (await selected()).build, "retained hook resurrected its previous package resident")

    phase = "failed launch"
    const brokenBin = await extract("resident-broken")
    await writeFile(join(brokenBin, "hapsland-resident"), "#!/bin/sh\nexit 23\n", { mode: 0o700 })
    await update(join(brokenBin, "hapsland"), "partial", 5)
    const retained = await selected()
    expect(
      retained.command.executable === join(brokenBin, "hapsland-resident"),
      "failed replacement rolled back the selected target"
    )
    await update(cli)
    expect((await rpc({ operation: "hello" })).build === first.build, "explicit retry did not restore availability")
  } finally {
    try {
      const owner = await rpc({ operation: "hello" })
      if (owner.status === "ready") await rpc({ operation: "replace", lifetime: owner.lifetime })
    } catch {
      /* Missing endpoint is already unavailable. */
    }
  }
}
