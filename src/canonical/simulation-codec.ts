import { readRecord, readNat, decoder, Word, readBendList } from "./boundary-schema.ts"

const prefix = "../agent-flow-bend/"
const policyModules = new Set([
  "Admission",
  "Canonical",
  "Collection",
  "CollectionState",
  "CollectorAuthority",
  "Configuration",
  "Delivery",
  "DeliveryState",
  "Dispatch",
  "EditHistory",
  "Flow",
  "Handoff",
  "ImportGraph",
  "Ledger",
  "Notice",
  "NoticeState",
  "Quiescence",
  "Retention",
  "Reuse",
  "ReuseState",
  "RevisionState",
  "Round",
  "RulePolicy",
  "SubmissionState",
  "Work"
])
const localModules = new Set([
  "Driver",
  "Types",
  "Scheduler",
  "Engine",
  "Workload",
  "Random",
  "Numeric",
  "Session",
  "Advicees",
  "AdviceeScope",
  "CredentialFacts",
  "CredentialContext",
  "FaultTargets",
  "JevEffects",
  "TreeFacts",
  "PreparationScenario",
  "AdviceeLifecycle",
  "AdviceeLifecycleCleanup",
  "AdviceeActivity",
  "PermitScenario",
  "Callbacks",
  "OutputScenario",
  "OutputCompletion",
  "NoticeScenario",
  "ExpiryScenario",
  "RuntimeScenarios",
  "FreshnessScenario",
  "ScopedRevision",
  "SharingScenario",
  "SharingRuntime",
  "CacheScenario",
  "CacheRuntime",
  "CollectionScenario",
  "WriterScenario",
  "CollectorScenario",
  "StopScenario"
])
const baseTags = new Set(["Nil", "Con", "Some", "None", "Tuple", "LT", "EQ", "GT"])
const readWord = decoder(Word)
const sharedNamespace = (value: string): { plain: string; module: string } => {
  const plain = value.startsWith(prefix) ? value.slice(prefix.length) : value
  const match = /^([A-Za-z]+)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(plain)
  const module = match?.[1]
  if (module === undefined) throw new TypeError("invalid shared constructor namespace")
  return { plain, module }
}
const convertTag = (value: unknown, encode: boolean): string => {
  if (typeof value !== "string") throw new TypeError("invalid shared constructor tag")
  if (baseTags.has(value)) return value
  const { plain, module } = sharedNamespace(value)
  if (policyModules.has(module)) return encode ? prefix + plain : plain
  if (localModules.has(module) && value === plain) return plain
  throw new TypeError("invalid shared constructor namespace")
}
const convertBigNat = (value: bigint, encode: boolean, word: boolean): number | bigint => {
  if (value < 0n || value > 281474976710655n) throw new RangeError("shared Nat outside u48 range")
  const native = readNat(Number(value))
  return word ? readWord(native) : encode ? BigInt(native) : native
}
const convertNumber = (value: number, encode: boolean, word: boolean): number | bigint => {
  const native = word ? readWord(value) : readNat(value)
  return encode && !word ? BigInt(native) : native
}
const wordTags = new Set(["RulePolicy.Words", prefix + "RulePolicy.Words", "Numeric.Words"])
const wordFields = new Set(["high", "low"])
const unchangedEncoded = new WeakSet<object>()
const unchangedDecoded = new WeakSet<object>()
const frozenDataRecord = (record: Record<string, unknown>): boolean =>
  Object.isFrozen(record) &&
  Reflect.ownKeys(record).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key)
    return typeof key === "string" && descriptor?.enumerable === true && "value" in descriptor
  })
const unchangedList = (record: Record<string, unknown>, items: ReadonlyArray<unknown>): boolean => {
  let cursor = record
  let unchanged = true
  for (const item of items) {
    if (!frozenDataRecord(cursor) || cursor.head !== item) unchanged = false
    cursor = readRecord(cursor.tail)
  }
  return unchanged && frozenDataRecord(cursor)
}
const convertListRecord = (record: Record<string, unknown>, encode: boolean, frozen: boolean): unknown => {
  const items = readBendList(record, (item) => convert(item, encode), 2048)
  if (frozen && unchangedList(record, items)) return record
  return items.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" })
}
const assignConvertedField = (record: Record<string, unknown>, key: string, value: unknown): void => {
  if (key === "__proto__")
    Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true })
  else record[key] = value
}
const convertRecordField = (key: string, field: unknown, tag: string, words: boolean, encode: boolean): unknown =>
  key === "$" ? tag : convert(field, encode, words && wordFields.has(key))
const convertObjectRecord = (record: Record<string, unknown>, encode: boolean, frozen: boolean): unknown => {
  const tag = convertTag(record.$, encode)
  const words = wordTags.has(tag)
  let result: Record<string, unknown> | undefined = frozen ? undefined : {}
  for (const [key, field] of Object.entries(record)) {
    const converted = convertRecordField(key, field, tag, words, encode)
    if (result === undefined && converted !== field) result = { ...record }
    if (result !== undefined) assignConvertedField(result, key, converted)
  }
  return result ?? record
}
const convertRecord = (record: Record<string, unknown>, encode: boolean): unknown => {
  const frozen = frozenDataRecord(record)
  if (record.$ === "Con" || record.$ === "Nil") return convertListRecord(record, encode, frozen)
  return convertObjectRecord(record, encode, frozen)
}
/** The emitter ABI uses exact Nat values and U32 probability words. Linked lists
 * are traversed iteratively with the existing canonical boundary limit. */
const convert = (value: unknown, encode: boolean, word = false): unknown => {
  if (typeof value === "bigint") return convertBigNat(value, encode, word)
  if (typeof value === "number") return convertNumber(value, encode, word)
  if (value === null || typeof value !== "object") return value
  const unchanged = encode ? unchangedEncoded : unchangedDecoded
  if (unchanged.has(value)) return value
  const result = convertRecord(readRecord(value), encode)
  // Reuse only validated graphs whose conversion changes no frozen node.
  if (result === value) unchanged.add(value)
  return result
}
export const encodeSharedValue = (value: unknown): unknown => convert(value, true)
export const decodeSharedValue = (value: unknown): unknown => convert(value, false)

/** Validate directly into the Number/plain-tag representation accepted by the emitted Engine wrapper. */
export const encodeEngineValue = (value: unknown): unknown => convert(value, false)
