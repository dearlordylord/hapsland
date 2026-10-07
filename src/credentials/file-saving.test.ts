import { ConfigProvider, Effect, Schema } from "effect"
import { execFileSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { credentialPolicy, CredentialPolicy } from "@hapsland/runtime-inputs/credentials/policy"
import { makeCredentialOwner } from "@hapsland/credential-storage/credentials/owner"

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hapsland-save-"))
  execFileSync("git", ["init", "-q", root])
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
const run = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_HELPER: join(root, "missing-native-helper") })
        )
      )
    )
  )
const owner = () =>
  makeCredentialOwner({
    root,
    userDirectory: join(root, "user"),
    statePath: join(root, "state.json"),
    envVar: "TYPESAFE_API_KEY",
    referenceExplicit: false
  })

it("offers user plaintext saving by default and never offers project .env as a save destination", () => {
  expect(Schema.decodeUnknownSync(CredentialPolicy)(JSON.parse(JSON.stringify(credentialPolicy)))).toEqual(
    credentialPolicy
  )
  expect(credentialPolicy.defaultDestination).toBe("user")
  expect(credentialPolicy.destinations.map((destination) => destination.kind)).toEqual([
    "user",
    "project-local",
    "native"
  ])
})

it("saves a user key privately, preserves other entries and reports the effective file", async () => {
  const service = owner()
  const proposal = await run(service.prepare("user"))
  expect(proposal.availability).toBe("available")
  expect(proposal.plan.target).toBe(join(root, "user", ".env"))
  expect(JSON.stringify(proposal)).not.toContain("private-fixture-key")
  const result = await run(service.save(proposal.id, "private-fixture-key"))
  expect(result.status).toBe("stored")
  expect(statSync(proposal.plan.target).mode & 0o777).toBe(0o600)
  expect(statSync(join(root, "user")).mode & 0o777).toBe(0o700)
  writeFileSync(proposal.plan.target, 'OTHER="keep # this"\nTYPESAFE_API_KEY=old\n', { mode: 0o600 })
  const replacement = await run(service.prepare("user"))
  expect((await run(service.save(replacement.id, 'new\nquoted"key'))).status).toBe("stored")
  expect(readFileSync(proposal.plan.target, "utf8")).toContain('OTHER="keep # this"')
  const selected = await run(service.active())
  expect(selected).toMatchObject({ status: "present", source: "user", file: proposal.plan.target })
  expect(JSON.stringify(selected)).not.toContain("quoted")
})

it("refuses project saving until ignored and rejects tracked targets", async () => {
  const service = owner()
  expect((await run(service.prepare("project-local"))).availability).toBe("blocked")
  writeFileSync(join(root, ".gitignore"), ".env.local\n")
  const proposal = await run(service.prepare("project-local"))
  expect(proposal.availability).toBe("available")
  expect((await run(service.save(proposal.id, "project-fixture"))).status).toBe("stored")
  execFileSync("git", ["-C", root, "add", "-f", ".env.local"])
  expect((await run(service.prepare("project-local"))).reason).toContain("tracked")
})

it("protects changes after preview and invalidates approval on reuse or concurrent saves", async () => {
  const service = owner()
  const first = await run(service.prepare("user"))
  const second = await run(service.prepare("user"))
  expect((await run(service.save(first.id, "first-fixture"))).status).toBe("stored")
  expect((await run(service.save(second.id, "second-fixture"))).status).toBe("stale")
  expect((await run(service.save(first.id, "reuse-fixture"))).status).toBe("stale")
  const changed = await run(service.prepare("user"))
  writeFileSync(changed.plan.target, "TYPESAFE_API_KEY=external-change\n", { mode: 0o600 })
  expect((await run(service.save(changed.id, "overwrite-fixture"))).status).toBe("stale")
  expect(readFileSync(changed.plan.target, "utf8")).toContain("external-change")
})

it("refuses symlinked and permissive files and preserves a prior credential on precommit failure", async () => {
  const service = owner()
  const proposal = await run(service.prepare("user"))
  expect((await run(service.save(proposal.id, "old-fixture"))).status).toBe("stored")
  chmodSync(proposal.plan.target, 0o644)
  expect((await run(service.prepare("user"))).availability).toBe("blocked")
  chmodSync(proposal.plan.target, 0o600)
  const valid = await run(service.prepare("user"))
  expect((await run(service.save(valid.id, "bad'\"fixture"))).status).toBe("unavailable")
  expect(readFileSync(proposal.plan.target, "utf8")).toContain("old-fixture")
  rmSync(proposal.plan.target)
  symlinkSync(join(root, "unexpected"), proposal.plan.target)
  expect((await run(service.prepare("user"))).availability).toBe("blocked")
})

it("a file destination preview never accesses the native store", async () => {
  const helper = join(root, "native-helper.cjs")
  const marker = join(root, "native-called")
  writeFileSync(
    helper,
    `#!/usr/bin/env node\nrequire("node:fs").writeFileSync(${JSON.stringify(marker)}, "called"); console.log('{"version":1,"status":"missing"}');\n`,
    { mode: 0o700 }
  )
  await Effect.runPromise(
    owner()
      .prepare("user")
      .pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_HELPER: helper }))))
  )
  expect(() => readFileSync(marker)).toThrow()
})
