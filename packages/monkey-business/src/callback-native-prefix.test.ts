import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { callbackNativeDescriptors, callbackNativeOwnerSources } from "./callback-native-metadata.ts"
import { decodeCallbackNativePrefix, decodeNativePrefix } from "./callback-native-prefix.ts"

it("pins the complete private descriptor inventory to actual Bend owners", () => {
  for (const source of callbackNativeOwnerSources) {
    const bytes = readFileSync(new URL(`../../../${source.path}`, import.meta.url))
    expect(createHash("sha256").update(bytes).digest("hex"), source.path).toBe(source.sha256)
  }
  const generator = new URL(
    "../../monkey-business-bend/conformance/generate-callback-native-prefix.py",
    import.meta.url
  )
  const generated = spawnSync("python3", [fileURLToPath(generator), "--check"], { encoding: "utf8", timeout: 5000 })
  expect(generated.error).toBeUndefined()
  expect(generated.status, generated.stdout + generated.stderr).toBe(0)
  expect(callbackNativeDescriptors.canonical_canonicalevent.constructors).toHaveLength(136)
  expect(callbackNativeDescriptors.canonical_output.constructors).toEqual([
    { tag: "Canonical.ActionRequested", fields: [["request", "canonical_actionrequest"]] },
    { tag: "Canonical.EventEstablished", fields: [["event", "canonical_domainevent"]] },
    { tag: "Canonical.PolicyDecided", fields: [["decision", "canonical_policydecision"]] }
  ])
  const categorized = [
    ...callbackNativeDescriptors.canonical_actionrequest.constructors,
    ...callbackNativeDescriptors.canonical_domainevent.constructors,
    ...callbackNativeDescriptors.canonical_policydecision.constructors
  ]
  expect(categorized).toHaveLength(215)
  expect(new Set(categorized.map(({ tag }) => tag)).size).toBe(215)
})

it("preserves complete Unicode input labels and rejects malformed scalar transport", () => {
  // One namespace: partition a+NUL+emoji, absent work/credential, prepared é.
  const words = [0, 3, 97, 0, 0x1f600, 0, 0, 1, 233]
  expect(decodeNativePrefix(words, "sharing_original_inputs_namespace")).toEqual({
    $: "sharing_original_inputs.Namespace",
    partition: "a\0😀",
    work: { $: "None" },
    credential: { $: "None" },
    prepared: "é"
  })
  expect(() => decodeNativePrefix([0, 1, 0x110000], "sharing_original_inputs_namespace")).toThrow("character")
  expect(() => decodeNativePrefix([0, 4, 97], "sharing_original_inputs_namespace")).toThrow("string")
  expect(() => decodeNativePrefix([0, 2 ** 32, 0, 1, 0, 0, 0], "session_config")).toThrow("U32")
  expect(decodeNativePrefix([0, 0xffffffff, 0, 1, 0, 0, 0], "session_config")).toMatchObject({
    $: "Session.Settings",
    interval: 0xffffffff
  })
})

it("refuses malformed prefix words, vectors and incomplete or excess payloads atomically", () => {
  expect(decodeCallbackNativePrefix([0])).toEqual([])
  expect(() => decodeCallbackNativePrefix([0, 1])).toThrow("trailing")
  expect(() => decodeCallbackNativePrefix([1])).toThrow("truncated")
  expect(() => decodeCallbackNativePrefix([2049])).toThrow("2048")
  expect(() => decodeCallbackNativePrefix([1, 1, 999999])).toThrow("constructor")
  expect(() => decodeCallbackNativePrefix([NaN])).toThrow()
  expect(() => decodeCallbackNativePrefix([2 ** 48])).toThrow()
  expect(() => decodeCallbackNativePrefix([0.5])).toThrow()
  // One scenario/frame/source event; use the first owner boolean field.
  const ordinal = callbackNativeDescriptors.canonical_canonicalevent.constructors.findIndex((value) =>
    value.fields.some((field) => field[1] === "bool")
  )
  const constructor = callbackNativeDescriptors.canonical_canonicalevent.constructors[ordinal]
  if (!constructor) throw new Error("owner graph lacks expected boolean field")
  const beforeBoolean: number[] = []
  for (const [, type] of constructor.fields) {
    if (type === "bool") break
    if (type !== "nat") throw new Error("first boolean constructor premise changed")
    beforeBoolean.push(1)
  }
  expect(() => decodeCallbackNativePrefix([1, 1, 4, 0, ordinal, ...beforeBoolean, 2])).toThrow("boolean")
})
