import { BUN_VERSION } from "../runtime/bun-runtime.ts"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { ConfigProvider, Effect } from "effect"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import {
  previewPiInstallation,
  installPiIntegration,
  previewPiUpdate,
  updatePiIntegration,
  uninstallPiIntegration,
  inspectPiInstallation,
  diagnosePiIntegration,
  hasPiRegistration
} from "./pi-installation.ts"
const directories: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-pi-install-"))
  directories.push(root)
  const home = join(root, "custom-home")
  const host = join(root, "pi")
  const runtime = join(root, "synthetic-bun")
  const entrypoint = join(root, "release", "cli.js")
  mkdirSync(join(root, "release", "pi"), { recursive: true })
  writeFileSync(join(root, "release", "pi", "extension.js"), "export default function(){}\n")
  writeFileSync(entrypoint, "")
  writeFileSync(host, "#!/bin/sh\necho 1.0.0\n", { mode: 0o700 })
  writeFileSync(runtime, `#!/bin/sh\necho ${BUN_VERSION}\n`, { mode: 0o700 })
  const configuration = ConfigProvider.layer(
    ConfigProvider.fromUnknown({ REVIEW_INSTALL_RUNTIME: runtime, REVIEW_INSTALL_ENTRYPOINT: entrypoint })
  )
  const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect.pipe(Effect.provide(configuration)))
  return {
    root,
    home,
    host,
    runtime,
    entrypoint,
    run,
    request: { piHome: home, piExecutable: host },
    extension: join(home, "extensions", "hapsland.ts"),
    ownership: join(home, ".hapsland", "pi-installation-v1.json")
  }
}
afterEach(() => {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true })
})
const digest = (value: unknown): string => {
  const result = value as { status: string; proposal?: { digest: string } }
  expect(result.status).toBe("preview")
  if (!result.proposal) throw new Error("proposal missing")
  return result.proposal.digest
}
it("manages a custom profile with exact proposals, retained package updates, repair and owned removal", async () => {
  const t = fixture()
  mkdirSync(join(t.home, "extensions"), { recursive: true })
  writeFileSync(join(t.home, "settings.json"), '{"model":"gpt-6-luna","provider":"local"}')
  writeFileSync(join(t.home, "extensions", "other.ts"), "unrelated")
  const preview = await t.run(previewPiInstallation(t.request))
  expect(existsSync(t.extension)).toBe(false)
  const approved = { ...t.request, proposalDigest: digest(preview) }
  expect((await t.run(installPiIntegration(approved))).status).toBe("complete")
  expect(hasPiRegistration(t.request)).toBe(true)
  expect(readFileSync(t.extension, "utf8")).toContain("release/pi/extension.js")
  expect(
    (
      await t.run(
        installPiIntegration({ ...t.request, proposalDigest: digest(await t.run(previewPiInstallation(t.request))) })
      )
    ).status
  ).toBe("already-current")
  expect(await t.run(inspectPiInstallation(t.request))).toMatchObject({ installed: true })
  const before = readFileSync(t.extension, "utf8")
  const doctor = await t.run(diagnosePiIntegration(t.request))
  expect(doctor).toMatchObject({ readOnly: true, providerCalls: 0, status: "unknown" })
  expect(readFileSync(t.extension, "utf8")).toBe(before)
  rmSync(t.extension)
  expect(
    (
      await t.run(
        installPiIntegration({ ...t.request, proposalDigest: digest(await t.run(previewPiInstallation(t.request))) })
      )
    ).status
  ).toBe("complete")
  const newer = join(t.root, "new-release", "cli.js")
  mkdirSync(join(t.root, "new-release", "pi"), { recursive: true })
  writeFileSync(join(t.root, "new-release", "pi", "extension.js"), "")
  const targetConfig = ConfigProvider.layer(
    ConfigProvider.fromUnknown({ REVIEW_INSTALL_RUNTIME: t.runtime, REVIEW_INSTALL_ENTRYPOINT: newer })
  )
  const update = await Effect.runPromise(previewPiUpdate(t.request).pipe(Effect.provide(targetConfig)))
  expect(
    (
      await Effect.runPromise(
        updatePiIntegration({ ...t.request, proposalDigest: digest(update) }).pipe(Effect.provide(targetConfig))
      )
    ).status
  ).toBe("complete")
  expect(readFileSync(t.extension, "utf8")).toContain("new-release/pi/extension.js")
  expect(
    (
      await t.run(
        uninstallPiIntegration({ ...t.request, proposalDigest: digest(await t.run(uninstallPiIntegration(t.request))) })
      )
    ).status
  ).toBe("complete")
  expect(
    (
      await t.run(
        uninstallPiIntegration({ ...t.request, proposalDigest: digest(await t.run(uninstallPiIntegration(t.request))) })
      )
    ).status
  ).toBe("already-current")
  expect(existsSync(t.extension)).toBe(false)
  expect(existsSync(t.ownership)).toBe(false)
  expect(readFileSync(join(t.home, "settings.json"), "utf8")).toBe('{"model":"gpt-6-luna","provider":"local"}')
  expect(readFileSync(join(t.home, "extensions", "other.ts"), "utf8")).toBe("unrelated")
})
it("rejects stale approvals, unsupported runtime profiles, local modifications and nonregular artifacts", async () => {
  const t = fixture()
  const original = digest(await t.run(previewPiInstallation(t.request)))
  expect((await t.run(installPiIntegration({ ...t.request, proposalDigest: "0".repeat(64) }))).status).toBe(
    "proposal-mismatch"
  )
  expect((await t.run(installPiIntegration({ ...t.request, proposalDigest: original }))).status).toBe("complete")
  writeFileSync(t.extension, "user-modified")
  expect((await t.run(uninstallPiIntegration(t.request))).status).toBe("conflict")
  expect((await t.run(previewPiUpdate(t.request))).status).toBe("conflict")
  expect(await t.run(diagnosePiIntegration(t.request))).toMatchObject({ status: "not-ready" })
  expect(readFileSync(t.extension, "utf8")).toBe("user-modified")
  rmSync(t.extension)
  symlinkSync(join(t.home, "settings.json"), t.extension)
  expect((await t.run(previewPiInstallation(t.request))).status).toBe("conflict")
  writeFileSync(t.host, "#!/bin/sh\necho 0.99.1\n", { mode: 0o700 })
  expect((await t.run(previewPiInstallation(t.request))).status).toBe("unsupported")
})
it("reports a missing profile read-only and refuses malformed ownership", async () => {
  const t = fixture()
  expect(await t.run(diagnosePiIntegration(t.request))).toMatchObject({ status: "not-ready" })
  expect(existsSync(t.home)).toBe(false)
  mkdirSync(join(t.home, ".hapsland"), { recursive: true })
  writeFileSync(t.ownership, "{broken")
  expect((await t.run(inspectPiInstallation(t.request))).status).toBe("conflict")
  expect((await t.run(previewPiInstallation(t.request))).status).toBe("conflict")
})
it("resumes an interrupted owned write and preserves unexpected files during recovery", async () => {
  const t = fixture()
  const install = await t.run(previewPiInstallation(t.request))
  const approved = digest(install)
  expect((await t.run(installPiIntegration({ ...t.request, proposalDigest: approved }))).status).toBe("complete")
  const content = readFileSync(t.extension, "utf8")
  const ownership = readFileSync(t.ownership, "utf8")
  const journal = join(t.home, ".hapsland", "pi-installation-journal-v1.json")
  writeFileSync(journal, JSON.stringify({ version: 1, operation: "update", home: t.home, content, ownership }))
  expect(await t.run(inspectPiInstallation(t.request))).toMatchObject({ recovery: { operation: "update" } })
  const recovered = await t.run(previewPiUpdate(t.request))
  expect((await t.run(updatePiIntegration({ ...t.request, proposalDigest: digest(recovered) }))).status).toBe(
    "complete"
  )
  expect(existsSync(journal)).toBe(false)
  writeFileSync(journal, JSON.stringify({ version: 1, operation: "update", home: t.home, content, ownership }))
  writeFileSync(t.extension, "unrecognized edit")
  expect((await t.run(previewPiUpdate(t.request))).status).toBe("conflict")
  expect(readFileSync(t.extension, "utf8")).toBe("unrecognized edit")
})

it("loads the owned wrapper with the verified retained runtime and entrypoint", async () => {
  const t = fixture()
  writeFileSync(join(t.root, "release", "pi", "extension.js"), "export const createPiExtension = options => options;\n")
  const preview = await t.run(previewPiInstallation(t.request))
  expect((await t.run(installPiIntegration({ ...t.request, proposalDigest: digest(preview) }))).status).toBe("complete")
  const loaded = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "const module = await import(process.argv[1]); process.stdout.write(JSON.stringify(module.default));",
        pathToFileURL(t.extension).href
      ],
      { encoding: "utf8" }
    )
  ) as { command: string[] }
  expect(loaded.command).toEqual([t.runtime, t.entrypoint])
})
