import { Schema } from "effect"
import { decoder, readNat } from "@hapsland/canonical-policy/canonical/boundary-schema"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"
import { callbackNativeDescriptors } from "./callback-native-metadata.ts"

type Fields = ReadonlyArray<readonly [string, string]>
type Constructor = { readonly tag?: string; readonly kind?: string; readonly fields: Fields }
type Descriptor =
  | { readonly kind: "adt" | "variant"; readonly constructors: readonly Constructor[] }
  | { readonly kind: "record"; readonly fields: Fields }
  | { readonly kind: "list" | "maybe"; readonly element: string; readonly representation: "bend" | "plain" }
type Descriptors = Readonly<Record<string, Descriptor>>
const descriptors: Descriptors = callbackNativeDescriptors
const FieldsSchema = Schema.Array(Schema.Tuple([Schema.String, Schema.String]))
const DescriptorSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("adt"),
    constructors: Schema.Array(Schema.Struct({ tag: Schema.String, fields: FieldsSchema }))
  }),
  Schema.Struct({
    kind: Schema.Literal("variant"),
    constructors: Schema.Array(Schema.Struct({ kind: Schema.String, fields: FieldsSchema }))
  }),
  Schema.Struct({ kind: Schema.Literal("record"), fields: FieldsSchema }),
  Schema.Struct({
    kind: Schema.Literals(["list", "maybe"]),
    element: Schema.String,
    representation: Schema.Literals(["bend", "plain"])
  })
])
const readDescriptors = decoder(Schema.Record(Schema.String, DescriptorSchema))
const primitives = new Set(["nat", "u32", "string", "bool"])

function descriptorReferences(descriptor: Descriptor): readonly string[] {
  if (descriptor.kind === "list" || descriptor.kind === "maybe") return [descriptor.element]
  if (!("constructors" in descriptor) && !("fields" in descriptor))
    throw new TypeError("invalid prefix descriptor fields")
  const groups =
    "constructors" in descriptor ? descriptor.constructors.map((value) => value.fields) : [descriptor.fields]
  const references: string[] = []
  for (const fields of groups) {
    const names = new Set<string>()
    for (const [name, type] of fields) {
      if (names.has(name) || name === "__proto__" || name === "constructor" || name === "prototype")
        throw new TypeError("invalid prefix descriptor field")
      if ((descriptor.kind === "adt" && name === "$") || (descriptor.kind === "variant" && name === "kind"))
        throw new TypeError("prefix descriptor overwrites constructor identity")
      names.add(name)
      references.push(type)
    }
  }
  return references
}

/** Record-only cycles consume no word and would make the iterative parser loop. */
function validateRecordCycles(registry: Descriptors): void {
  const visited = new Set<string>(),
    active = new Set<string>()
  for (const [name, descriptor] of Object.entries(registry)) {
    if (descriptor.kind !== "record" || visited.has(name)) continue
    const tasks = [{ name, finish: false }]
    while (tasks.length) {
      const task = tasks.pop()
      if (!task) throw new TypeError("invalid prefix descriptor traversal")
      if (task.finish) {
        active.delete(task.name)
        visited.add(task.name)
        continue
      }
      if (active.has(task.name)) throw new TypeError("non-consuming prefix descriptor cycle")
      if (visited.has(task.name)) continue
      const value = registry[task.name]
      if (!value || value.kind !== "record") throw new TypeError("invalid prefix record reference")
      active.add(task.name)
      tasks.push({ name: task.name, finish: true })
      for (const [, type] of value.fields)
        if (registry[type]?.kind === "record") tasks.push({ name: type, finish: false })
    }
  }
}

function checkedDescriptors(input: unknown): Descriptors {
  const registry = readDescriptors(input)
  for (const [name, descriptor] of Object.entries(registry)) {
    if (primitives.has(name)) throw new TypeError("prefix descriptor redefines a primitive")
    for (const type of descriptorReferences(descriptor)) {
      if (!primitives.has(type) && !Object.hasOwn(registry, type))
        throw new TypeError(`unknown prefix descriptor reference ${type}`)
    }
  }
  validateRecordCycles(registry)
  return registry
}
type Task = { readonly type: string; readonly publish: (value: unknown) => void } | { readonly finish: () => void }

/** Private lossless transport only. Reconstructed DTOs still require their production codecs. */
function decodePrefix(input: unknown, root: string, descriptors: Descriptors): unknown {
  if (!Object.hasOwn(descriptors, root)) throw new Error(`unknown native prefix root ${root}`)
  if (!Array.isArray(input)) throw new Error("native prefix must be a numeric vector")
  // The transport uses the existing native runner's 16MiB stdout bound. Each
  // encoded Nat requires at least one byte; logical lists retain their 2048 bound.
  if (input.length > 16 * 1024 * 1024) throw new Error("native prefix exceeds transport byte bound")
  const words: number[] = []
  for (let index = 0; index < input.length; index++) words.push(readNat(input[index]))
  let cursor = 0
  function word(): number {
    const value = words[cursor++]
    if (value === undefined) throw new Error("truncated native prefix")
    return value
  }
  let output: unknown
  const tasks: Task[] = [
    {
      type: root,
      publish: (value) => {
        output = value
      }
    }
  ]
  function fields(values: Fields, record: Record<string, unknown>): void {
    for (let index = values.length - 1; index >= 0; index--) {
      const field = values[index]
      if (!field) throw new Error("invalid generated field descriptor")
      const [key, type] = field
      tasks.push({
        type,
        publish: (value) => {
          record[key] = value
        }
      })
    }
  }
  while (tasks.length) {
    const task = tasks.pop()
    if (!task) throw new Error("invalid prefix task stack")
    if ("finish" in task) {
      task.finish()
      continue
    }
    const { type, publish } = task
    if (type === "nat") {
      publish(word())
      continue
    }
    if (type === "u32") {
      const value = word()
      if (value > 0xffffffff) throw new Error("invalid prefix U32")
      publish(value)
      continue
    }
    if (type === "string") {
      const count = word()
      if (count > words.length - cursor) throw new Error("truncated prefix string")
      const characters: string[] = []
      for (let index = 0; index < count; index++) {
        const code = word()
        if (code > 0x10ffff) throw new Error("invalid prefix character")
        characters.push(String.fromCodePoint(code))
      }
      publish(characters.join(""))
      continue
    }
    if (type === "bool") {
      const value = word()
      if (value !== 0 && value !== 1) throw new Error("invalid prefix boolean")
      publish(value === 1)
      continue
    }
    const descriptor = descriptors[type]
    if (!descriptor) throw new Error(`unknown prefix type ${type}`)
    if (descriptor.kind === "adt" || descriptor.kind === "variant") {
      const constructor = descriptor.constructors[word()]
      if (!constructor) throw new Error(`unknown prefix constructor for ${type}`)
      const record: Record<string, unknown> =
        descriptor.kind === "adt" ? { $: constructor.tag } : { kind: constructor.kind }
      publish(record)
      fields(constructor.fields, record)
    } else if (descriptor.kind === "record") {
      const record: Record<string, unknown> = {}
      publish(record)
      fields(descriptor.fields, record)
    } else if (descriptor.kind === "maybe") {
      const present = word()
      if (present !== 0 && present !== 1) throw new Error("invalid prefix Maybe")
      if (present === 0) publish(descriptor.representation === "plain" ? null : { $: "None" })
      else if (descriptor.representation === "plain") tasks.push({ type: descriptor.element, publish })
      else {
        const record: Record<string, unknown> = { $: "Some" }
        publish(record)
        tasks.push({
          type: descriptor.element,
          publish: (value) => {
            record.value = value
          }
        })
      }
    } else if (descriptor.kind === "list") {
      const count = word()
      if (count > 2048) throw new Error("native logical vector exceeds 2048 elements")
      const values: unknown[] = Array(count)
      tasks.push({
        finish: () => {
          if (descriptor.representation === "plain") publish(values)
          else {
            let list: unknown = { $: "Nil" }
            for (let index = count - 1; index >= 0; index--) list = { $: "Con", head: values[index], tail: list }
            publish(list)
          }
        }
      })
      for (let index = count - 1; index >= 0; index--)
        tasks.push({
          type: descriptor.element,
          publish: (value) => {
            values[index] = value
          }
        })
    } else {
      throw new Error("invalid generated prefix descriptor")
    }
  }
  if (cursor !== words.length) throw new Error("trailing native prefix words")
  return freezeCanonicalData(output)
}

/** Business roots remain statically restricted to the maintained default registry. */
export function decodeNativePrefix(input: unknown, root: keyof typeof callbackNativeDescriptors): unknown {
  return decodePrefix(input, root, descriptors)
}

/** Optional generated owner roots use this same parser after exact descriptor validation. */
export function decodeNativePrefixWithDescriptors(input: unknown, root: string, registry: unknown): unknown {
  return decodePrefix(input, root, checkedDescriptors(registry))
}

/** Original callback envelope stays the default family entrypoint. */
export function decodeCallbackNativePrefix(input: unknown): unknown {
  return decodeNativePrefix(input, "wire_scenarios")
}
