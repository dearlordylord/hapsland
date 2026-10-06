import { expect, it } from "vitest"
import { chmod, link, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { MAX_RESIDENT_ENDPOINT_BYTES, publishResidentEndpoint, readResidentEndpoint } from "./endpoint.ts"
import { residentPaths } from "./paths.ts"

const record = {
  version: 1 as const,
  host: "127.0.0.1" as const,
  port: 12345,
  certificate: "public-certificate",
  token: "a".repeat(64),
  pid: process.pid,
  lifetime: "test-lifetime"
}

it("publishes a private complete endpoint and atomically replaces its identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hapsland-endpoint-record-"))
  const paths = residentPaths(directory)
  try {
    await Effect.runPromise(publishResidentEndpoint(paths, record))
    expect((await stat(paths.endpoint)).mode & 0o777).toBe(0o600)
    expect(await Effect.runPromise(readResidentEndpoint(paths))).toEqual(record)
    const replacement = { ...record, port: 12346, token: "b".repeat(64), lifetime: "replacement" }
    await Effect.runPromise(publishResidentEndpoint(paths, replacement))
    expect(await Effect.runPromise(readResidentEndpoint(paths))).toEqual(replacement)
    expect(await readdir(directory)).toEqual(["endpoint.json"])
    expect(await readFile(paths.endpoint, "utf8")).not.toContain("PRIVATE KEY")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

for (const [name, mutation] of [
  ["remote host", { host: "192.0.2.1" }],
  ["zero port", { port: 0 }],
  ["fractional port", { port: 123.5 }],
  ["out-of-range port", { port: 65536 }],
  ["invalid token", { token: "short" }],
  ["unexpected field", { privateKey: "secret" }],
  ["unsupported version", { version: 2 }],
  ["empty lifetime", { lifetime: "" }],
  ["oversized certificate", { certificate: "x".repeat(4097) }]
] as const) {
  it(`rejects a record with ${name} without exposing its contents`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hapsland-endpoint-invalid-"))
    const paths = residentPaths(directory)
    try {
      await writeFile(paths.endpoint, JSON.stringify({ ...record, ...mutation }), { mode: 0o600 })
      const failure = await Effect.runPromise(readResidentEndpoint(paths).pipe(Effect.flip))
      expect(failure.message).toBe("resident endpoint unavailable or unsafe")
      expect(JSON.stringify(failure)).not.toContain(record.token)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}

for (const kind of ["public-file", "public-directory", "symlink", "hardlink", "oversized"] as const) {
  it(`rejects an unsafe ${kind} endpoint before using its address`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "hapsland-endpoint-unsafe-"))
    const paths = residentPaths(directory)
    try {
      await Effect.runPromise(publishResidentEndpoint(paths, record))
      if (kind === "public-file") await chmod(paths.endpoint, 0o644)
      if (kind === "public-directory") await chmod(directory, 0o755)
      if (kind === "hardlink") await link(paths.endpoint, join(directory, "alias"))
      if (kind === "symlink") {
        const target = join(directory, "target")
        await writeFile(target, JSON.stringify(record), { mode: 0o600 })
        await rm(paths.endpoint)
        await symlink(target, paths.endpoint)
      }
      if (kind === "oversized") await writeFile(paths.endpoint, "x".repeat(MAX_RESIDENT_ENDPOINT_BYTES + 1))
      await expect(Effect.runPromise(readResidentEndpoint(paths))).rejects.toThrow(
        "resident endpoint unavailable or unsafe"
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
}
