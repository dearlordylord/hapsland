import { request } from "node:http"
import { Effect, Scope, Exit } from "effect"
import { expect, it } from "vitest"
import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { makeInspectionHttpServer } from "./http.ts"
import { makeInspectionStorage } from "./storage.ts"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "../resident/paths.ts"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"

it("serves pre-launch real resident history through protected HTTP and SSE after that resident closes", async () => {
  const root = await makeGitFixture()
  await put(root, "type.ts", "type OrderCount = number\n")
  await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
  const stored = nativeDeferred<void>()
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
    inspectionPersistence: {
      write: (record, encoded, allowed) =>
        history.write(record, encoded, allowed).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (record.fact.kind === "unit-prepared") stored.resolve()
            })
          )
        )
    }
  })
  const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
  if (!observation) throw new Error("missing fixture observation")
  expect(
    Effect.runSync(
      resident.admit(observation, {
        statePath: join(root, "consent"),
        userConfigPath: join(root, "absent-user"),
        credential: null,
        controlled: { answers: {} }
      })
    ).status
  ).toBe("accepted")
  await stored.promise
  await Effect.runPromise(resident.close)
  const scope = await Effect.runPromise(Scope.make())
  try {
    const server = await Effect.runPromise(
      makeInspectionHttpServer(history).pipe(Effect.provideService(Scope.Scope, scope))
    )
    const response = await fetch(`${server.url}snapshot`)
    expect(response.status).toBe(200)
    const snapshot = await response.json()
    expect(snapshot).toMatchObject({
      records: [
        { fact: { kind: "recording-state" } },
        { fact: { kind: "edit-received" } },
        { fact: { kind: "edit-admission" } },
        { fact: { kind: "unit-prepared" } }
      ]
    })
    const page = await fetch(server.url)
    expect(page.status).toBe(200)
    expect(page.headers.get("content-security-policy")).toContain("script-src 'sha256-")
    expect(await page.text()).toContain("Hapsland inspection")
    expect(JSON.stringify(snapshot)).not.toContain("type OrderCount")
    expect((await fetch(`${server.origin}/snapshot`)).status).toBe(404)
    expect((await fetch(`${server.url}snapshot`, { headers: { origin: "https://evil.invalid" } })).status).toBe(403)
    const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const call = request(`${server.url}snapshot`, { headers: { host: "evil.invalid" } }, (response) => {
        response.resume()
        response.on("end", () => resolve(response.statusCode))
      })
      call.on("error", reject)
      call.end()
    })
    expect(hostileHostStatus).toBe(403)
    expect((await fetch(`${server.url}snapshot`, { method: "POST" })).status).toBe(405)
    const events = await fetch(`${server.url}events`)
    expect(events.headers.get("content-type")).toContain("text/event-stream")
    const reader = events.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('"edit-admission"')
    await reader.cancel()
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
})

it("rejects direct network exposure before opening a server", async () => {
  const history = makeInspectionStorage("/unused", { retentionMs: 1000, storageBytes: 1048576 })
  await expect(
    Effect.runPromise(Effect.scoped(makeInspectionHttpServer(history, { host: "0.0.0.0" })))
  ).rejects.toThrow("loopback")
})
