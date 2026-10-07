import { test } from "node:test"
import assert from "node:assert/strict"
import { nativeLinkerPaths } from "./native-linker-inputs.mjs"
test("accounts for linker libraries and startup objects separately from generated object", () => {
  assert.deepEqual(
    nativeLinkerPaths("/stage/current.o\n/usr/lib/crt.o\n/usr/lib/libc.so\n/usr/lib/libc.so\n", "/stage/current.o"),
    ["/usr/lib/crt.o", "/usr/lib/libc.so"]
  )
})
for (const trace of ["", "/usr/lib/libc.so", "unknown contribution\n/stage/current.o"])
  test(`rejects missing or unaccounted linker contributions ${JSON.stringify(trace)}`, () =>
    assert.throws(() => nativeLinkerPaths(trace, "/stage/current.o"), /native linker trace/i))
test("generated object identity cannot be a broad filename pattern", () =>
  assert.throws(() => nativeLinkerPaths("/tmp/cc1.o", "cc*.o"), /must be explicit/))
