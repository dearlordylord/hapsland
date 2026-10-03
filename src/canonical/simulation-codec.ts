import { readRecord, readNat, decoder, Word, readBendList } from "./boundary-schema.ts";

const prefix = "../agent-flow-bend/";
const policyModules = new Set([
  "Admission", "Canonical", "Collection", "CollectionState", "CollectorAuthority",
  "Configuration", "Delivery", "DeliveryState", "Dispatch", "EditHistory", "Flow",
  "Handoff", "ImportGraph", "Ledger", "Notice", "NoticeState", "Quiescence",
  "Retention", "Reuse", "ReuseState", "RevisionState", "Round", "RulePolicy",
  "SubmissionState", "Work",
]);
const localModules = new Set(["Driver", "Types", "Scheduler", "Engine", "Workload", "Random", "Numeric", "Session", "Advicees", "AdviceeScope", "CredentialFacts", "CredentialContext", "FaultTargets", "JevEffects", "TreeFacts", "PreparationScenario", "AdviceeLifecycle", "AdviceeLifecycleCleanup", "AdviceeActivity", "PermitScenario", "Callbacks", "NoticeScenario", "RuntimeScenarios", "FreshnessScenario", "ScopedRevision", "SharingScenario", "SharingRuntime", "CacheScenario", "CacheRuntime"]);
const baseTags = new Set(["Nil", "Con", "Some", "None", "Tuple", "LT", "EQ", "GT"]);
const readWord = decoder(Word);
const convertTag = (value: unknown, encode: boolean): string => {
  if (typeof value !== "string") throw new TypeError("invalid shared constructor tag");
  if (baseTags.has(value)) return value;
  const plain = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  const match = /^([A-Za-z]+)\.([A-Za-z][A-Za-z0-9_]*)$/.exec(plain);
  if (match === null) throw new TypeError("invalid shared constructor namespace");
  const module = match[1];
  if (module === undefined) throw new TypeError("invalid shared constructor namespace");
  if (policyModules.has(module)) return encode ? prefix + plain : plain;
  if (localModules.has(module) && value === plain) return plain;
  throw new TypeError("invalid shared constructor namespace");
};
/** The emitter ABI uses exact Nat values and U32 probability words. Linked lists
 * are traversed iteratively with the existing canonical boundary limit. */
const convert = (value: unknown, encode: boolean, word = false): unknown => {
  if (typeof value === "bigint") {
    if (value < 0n || value > 281474976710655n) throw new RangeError("shared Nat outside u48 range");
    const native = readNat(Number(value));
    return word ? readWord(native) : encode ? BigInt(native) : native;
  }
  if (typeof value === "number") {
    const native = word ? readWord(value) : readNat(value);
    return encode && !word ? BigInt(native) : native;
  }
  if (value === null || typeof value !== "object") return value;
  const record = readRecord(value);
  if (record.$ === "Con" || record.$ === "Nil") {
    const items = readBendList(value, item => convert(item, encode), 2048);
    return items.reduceRight<unknown>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
  }
  const tag = convertTag(record.$, encode);
  const words = tag === "RulePolicy.Words" || tag === prefix + "RulePolicy.Words" || tag === "Numeric.Words";
  return Object.fromEntries(Object.entries(record).map(([key, field]) => [key,
    key === "$" ? tag : convert(field, encode, words && (key === "high" || key === "low"))]));
};
export const encodeSharedValue = (value: unknown): unknown => convert(value, true);
export const decodeSharedValue = (value: unknown): unknown => convert(value, false);
