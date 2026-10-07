import { ConfigProvider, Effect } from "effect"
import { createHash } from "node:crypto"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it, vi } from "vitest"
import { saveCredential } from "@hapsland/credential-storage/credentials/secret-service"

const fixture = vi.hoisted((): { stat: string | undefined } => ({ stat: undefined }))
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (String(args[0]) === `/proc/${process.pid}/stat`) {
        if (fixture.stat === undefined) throw new Error("process disappeared")
        return fixture.stat
      }
      return Reflect.apply(actual.readFileSync, actual, args)
    }
  }
})

it.each([
  { stat: undefined, birth: null },
  { stat: "", birth: null },
  { stat: "malformed process stat", birth: null },
  { stat: "12 (command) S", birth: null },
  { stat: `12 (command with ) inside) ${Array(19).fill("0").join(" ")} `, birth: null },
  {
    stat: `12 (command with ) inside) ${Array(19).fill("0").join(" ")} 12345`,
    birth: createHash("sha256")
      .update("process-birth-linux\0" + "12345")
      .digest("hex")
  }
])("records conservative Linux lock ownership for process stat $stat", async ({ stat, birth }) => {
  const root = mkdtempSync(join(tmpdir(), "linux-lock-identity-"))
  const state = join(root, "state.json")
  const receipt = join(root, "owner.json")
  const helper = join(root, "helper.cjs")
  const platform = Object.getOwnPropertyDescriptor(process, "platform")!
  fixture.stat = stat
  writeFileSync(
    helper,
    `#!${process.execPath}\nconst fs=require('node:fs');fs.writeFileSync(${JSON.stringify(receipt)},fs.readFileSync(${JSON.stringify(state + ".lock/owner.json")}));process.stdin.resume();process.stdin.on('end',()=>console.log('{"version":1,"status":"stored"}'));\n`
  )
  chmodSync(helper, 0o700)
  Object.defineProperty(process, "platform", { ...platform, value: "linux" })
  try {
    const result = await Effect.runPromise(
      saveCredential("test-only-key", state).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_CREDENTIAL_HELPER: helper })))
      )
    )
    expect(result.status).toBe("stored")
    expect(JSON.parse(readFileSync(receipt, "utf8"))).toMatchObject({ pid: process.pid, processBirthIdentity: birth })
  } finally {
    Object.defineProperty(process, "platform", platform)
    fixture.stat = undefined
    rmSync(root, { recursive: true, force: true })
  }
})
