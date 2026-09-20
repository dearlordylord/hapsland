import { digest, sha256, type Fixture, type FixtureCategory, type Expectation, type ExpectedBand } from "./protocol.ts";

const RULE = "r2_meaningless_combinations";
const clear: ExpectedBand = { minimum: 0, maximum: 0.3 };
const violation: ExpectedBand = { minimum: 0.7, maximum: 1, minimumInclusive: false, maximumInclusive: true };

type FixtureOptions = Omit<Fixture, "expectations" | "domain" | "path" | "contentHash" | "fixtureDigest"> & {
  readonly expected: "clear" | "violation" | "ambiguous" | "unchecked";
  readonly rationale: string;
};

const make = (options: FixtureOptions): Fixture => {
  const { expected, rationale, ...fixtureOptions } = options;
  const editMarker = (source: string, marker: string) => `${source.trimEnd()} ${marker}\n`;
  const before = fixtureOptions.before === fixtureOptions.after
    ? editMarker(fixtureOptions.before, "/* before-edit */")
    : fixtureOptions.before;
  const after = fixtureOptions.before === fixtureOptions.after
    ? editMarker(fixtureOptions.after, "/* after-edit */")
    : fixtureOptions.after;
  const base = {
    ...fixtureOptions,
    before,
    after,
    path: `fixtures/input-contract/${options.category}/${options.id}.ts`,
    domain: `input-contract/${options.category}/${options.id}`,
    expectations: [{
    ruleId: RULE,
    kind: expected,
    ...(expected === "clear" ? { band: clear } : expected === "violation" ? { band: violation } : {}),
    rationale,
  } satisfies Expectation],
  };
  return {
    ...base,
    contentHash: sha256(base.after),
    fixtureDigest: digest(base),
  };
};

const interfaceFixtures: readonly Fixture[] = [
  make({
    id: "iface-delivery-flat", name: "flat delivery alternatives", category: "interface", rootName: "Delivery", rootKind: "interface",
    before: `type DeliveryChannel = "email" | "sms";\nexport interface Delivery { channel: DeliveryChannel; email?: string; phone?: string; }\n`,
    after: `type DeliveryChannel = "email" | "sms";\nexport interface Delivery { channel: DeliveryChannel; email?: string; phone?: string; }\n`,
    evidence: { requiredReferences: ["DeliveryChannel"] }, contextRequired: true, expected: "violation",
    rationale: "The edited interface leaves both channel-specific fields independently representable; channel does not constrain either field.",
  }),
  make({
    id: "iface-payment-tagged", name: "tagged payment union", category: "interface", rootName: "Payment", rootKind: "interface",
    before: `type PaymentKind = "card" | "bank";\nexport interface Payment { kind: PaymentKind; amount: number; }\n`,
    after: `type PaymentKind = "card" | "bank";\nexport interface Payment { kind: PaymentKind; amount: number; }\n`,
    evidence: { requiredReferences: ["PaymentKind"] }, contextRequired: true, negativeControl: true, expected: "clear",
    rationale: "Kind and amount are independent facts of one payment; the enum context does not introduce conditional payload fields.",
  }),
  make({
    id: "iface-order-valid", name: "explicit order variants", category: "interface", rootName: "Order", rootKind: "interface",
    before: `type OrderState = "physical" | "digital";\nexport interface Order { state: OrderState; sku: string; downloadUrl?: string; }\n`,
    after: `type OrderState = "physical" | "digital";\nexport interface Order { state: OrderState; sku: string; downloadUrl?: string; }\n`,
    evidence: { requiredReferences: ["OrderState"] }, contextRequired: true, expected: "ambiguous",
    rationale: "The declaration is intentionally borderline: whether downloadUrl is independent of the state is domain-dependent and is reported without a hard gate label.",
  }),
  make({
    id: "iface-range-diff", name: "self-contained range", category: "interface", rootName: "Range", rootKind: "interface",
    before: `export interface Range { from?: number; to?: number; }\n`,
    after: `export interface Range { from?: number; to?: number; }\n`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "violation",
    rationale: "Both endpoints are independently optional in the edited declaration; no external evidence is needed to identify the impossible half-range states.",
  }),
  make({
    id: "iface-profile-control", name: "independent profile attributes", category: "interface", rootName: "Profile", rootKind: "interface",
    before: `interface ProfileNoise { id: string; value: number; }\nexport interface Profile { nickname?: string; phone?: string; }\n`,
    after: `interface ProfileNoise { id: string; value: number; }\nexport interface Profile { nickname?: string; phone?: string; }\n`,
    evidence: { requiredReferences: [], optionalReferences: ["AuditTrail"] }, diffSufficient: true, wholeFileDilution: true, negativeControl: true, expected: "clear",
    rationale: "Nickname and phone are independent attributes of one profile, so their cross-product is meaningful even with an unrelated declaration in the whole-file control.",
  }),
  make({
    id: "iface-dilution", name: "large unrelated interface file", category: "interface", rootName: "Shipment", rootKind: "interface",
    before: `interface NoiseA { a: string; b: number; c: boolean }\ninterface NoiseB { a: string; b: number; c: boolean }\nexport interface Shipment { mode?: "air" | "ground"; flight?: string; truck?: string; }\ninterface NoiseC { a: string; b: number; c: boolean }\ninterface NoiseD { a: string; b: number; c: boolean }\n`,
    after: `interface NoiseA { a: string; b: number; c: boolean }\ninterface NoiseB { a: string; b: number; c: boolean }\nexport interface Shipment { mode?: "air" | "ground"; flight?: string; truck?: string; }\ninterface NoiseC { a: string; b: number; c: boolean }\ninterface NoiseD { a: string; b: number; c: boolean }\n`,
    evidence: { requiredReferences: [] }, wholeFileDilution: true, expected: "violation",
    rationale: "The target keeps mutually exclusive transport fields flat while unrelated declarations increase whole-file distraction.",
  }),
];

const aliasFixtures: readonly Fixture[] = [
  make({
    id: "alias-discount", name: "discount mode alias", category: "type-alias", rootName: "Discount", rootKind: "type-alias",
    before: `export type DiscountMode = "percent" | "free-shipping";\nexport type Discount = { mode: DiscountMode; percentOff?: number; };\n`,
    after: `export type DiscountMode = "percent" | "free-shipping";\nexport type Discount = { mode: DiscountMode; percentOff?: number; };\n`,
    evidence: { requiredReferences: ["DiscountMode"] }, contextRequired: true, expected: "violation",
    rationale: "The free-shipping mode still admits a percentOff value because the alias leaves the conditional field outside the variant.",
  }),
  make({
    id: "alias-auth", name: "authentication state alias", category: "type-alias", rootName: "AuthState", rootKind: "type-alias",
    before: `export type AuthKind = "anonymous" | "user";\nexport type AuthState = { kind: AuthKind; userId?: string; };\n`,
    after: `export type AuthKind = "anonymous" | "user";\nexport type AuthState = { kind: AuthKind; userId?: string; };\n`,
    evidence: { requiredReferences: ["AuthKind"] }, contextRequired: true, expected: "violation",
    rationale: "Anonymous and authenticated states share one object with an optional userId, so an anonymous state may carry an identity.",
  }),
  make({
    id: "alias-period", name: "period composed from context", category: "type-alias", rootName: "Period", rootKind: "type-alias",
    before: `type Instant = string;\nexport type Period = { from?: Instant; to?: Instant; };\n`,
    after: `type Instant = string;\nexport type Period = { from?: Instant; to?: Instant; };\n`,
    evidence: { requiredReferences: ["Instant"] }, contextRequired: true, expected: "violation",
    rationale: "The period can contain an end without a start and neither endpoint is tied to the other by the alias.",
  }),
  make({
    id: "alias-money", name: "self-contained money pair", category: "type-alias", rootName: "Money", rootKind: "type-alias",
    before: `type MoneyNoise = { id: string; value: number };\nexport type Money = { amount: number; currency: "USD" | "CAD"; };\n`,
    after: `type MoneyNoise = { id: string; value: number };\nexport type Money = { amount: number; currency: "USD" | "CAD"; };\n`,
    evidence: { requiredReferences: [] }, diffSufficient: true, wholeFileDilution: true, negativeControl: true, expected: "clear",
    rationale: "Amount and currency are intentionally one value; every representable object has both parts even when a whole-file control includes an unrelated alias.",
  }),
  make({
    id: "alias-report-range", name: "report range", category: "type-alias", rootName: "ReportRange", rootKind: "type-alias",
    before: `export type ReportRange = { month?: string; from?: string; to?: string; };\n`,
    after: `export type ReportRange = { month?: string; from?: string; to?: string; };\n`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "unchecked",
    rationale: "The report-range fixture is retained as a human-authored unchecked example until the product owner confirms whether month and custom ranges are mutually exclusive.",
  }),
  make({
    id: "alias-dilution", name: "diluted job command alias", category: "type-alias", rootName: "JobCommand", rootKind: "type-alias",
    before: `type Noise1 = { id: string; createdAt: string };\ntype Noise2 = { id: string; createdAt: string };\nexport type JobCommand = { kind: "run" | "cancel"; schedule?: string; reason?: string };\ntype Noise3 = { id: string; createdAt: string };\ntype Noise4 = { id: string; createdAt: string };\n`,
    after: `type Noise1 = { id: string; createdAt: string };\ntype Noise2 = { id: string; createdAt: string };\nexport type JobCommand = { kind: "run" | "cancel"; schedule?: string; reason?: string };\ntype Noise3 = { id: string; createdAt: string };\ntype Noise4 = { id: string; createdAt: string };\n`,
    evidence: { requiredReferences: [] }, wholeFileDilution: true, expected: "violation",
    rationale: "Run-only schedule and cancel-only reason remain independently optional; unrelated aliases deliberately dilute the whole-file input.",
  }),
];

const zodFixtures: readonly Fixture[] = [
  make({
    id: "zod-delivery", name: "Zod delivery schema", category: "zod", rootName: "DeliverySchema", rootKind: "schema",
    before: `import { z } from "zod";\nconst DeliveryChannel = z.enum(["email", "sms"]);\nexport const DeliverySchema = z.object({ channel: DeliveryChannel, email: z.string().optional(), phone: z.string().optional() });\n`,
    after: `import { z } from "zod";\nconst DeliveryChannel = z.enum(["email", "sms"]);\nexport const DeliverySchema = z.object({ channel: DeliveryChannel, email: z.string().optional(), phone: z.string().optional() });\n`,
    evidence: { requiredReferences: ["DeliveryChannel"] }, contextRequired: true, expected: "violation",
    rationale: "The Zod schema validates both channel-specific fields as optional regardless of the channel value.",
  }),
  make({
    id: "zod-notification", name: "Zod notification schema", category: "zod", rootName: "NotificationSchema", rootKind: "schema",
    before: `import { z } from "zod";\nconst NotificationKind = z.enum(["email", "push"]);\nexport const NotificationSchema = z.object({ kind: NotificationKind, email: z.string().optional(), deviceToken: z.string().optional() });\n`,
    after: `import { z } from "zod";\nconst NotificationKind = z.enum(["email", "push"]);\nexport const NotificationSchema = z.object({ kind: NotificationKind, email: z.string().optional(), deviceToken: z.string().optional() });\n`,
    evidence: { requiredReferences: ["NotificationKind"] }, contextRequired: true, expected: "violation",
    rationale: "The schema’s kind enum is context for the two optional payloads, but it does not make the invalid cross-combinations unreachable.",
  }),
  make({
    id: "zod-profile", name: "Zod profile control", category: "zod", rootName: "ProfileSchema", rootKind: "schema",
    before: `import { z } from "zod";\nexport const ProfileSchema = z.object({ nickname: z.string().optional(), phone: z.string().optional() });\n`,
    after: `import { z } from "zod";\nexport const ProfileSchema = z.object({ nickname: z.string().optional(), phone: z.string().optional() });\n`,
    evidence: { requiredReferences: [] }, diffSufficient: true, negativeControl: true, expected: "clear",
    rationale: "Both optional fields describe independent profile attributes; no combination is inherently meaningless.",
  }),
  make({
    id: "zod-range", name: "Zod range schema", category: "zod", rootName: "RangeSchema", rootKind: "schema",
    before: `import { z } from "zod";\nexport const RangeSchema = z.object({ from: z.number().optional(), to: z.number().optional() });\n`,
    after: `import { z } from "zod";\nexport const RangeSchema = z.object({ from: z.number().optional(), to: z.number().optional() });\n`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "violation",
    rationale: "The schema admits a range with only one endpoint, a concrete meaningless combination for the stated range domain.",
  }),
  make({
    id: "zod-payment", name: "Zod payment schema", category: "zod", rootName: "PaymentSchema", rootKind: "schema",
    before: `import { z } from "zod";\nconst PaymentKind = z.enum(["card", "bank"]);\nexport const PaymentSchema = z.object({ kind: PaymentKind, amount: z.number() });\n`,
    after: `import { z } from "zod";\nconst PaymentKind = z.enum(["card", "bank"]);\nexport const PaymentSchema = z.object({ kind: PaymentKind, amount: z.number() });\n`,
    evidence: { requiredReferences: ["PaymentKind"] }, contextRequired: true, negativeControl: true, expected: "clear",
    rationale: "Kind and amount are independent facts of one payment; the enum context does not introduce conditional payload fields.",
  }),
  make({
    id: "zod-dilution", name: "diluted Zod command schema", category: "zod", rootName: "CommandSchema", rootKind: "schema",
    before: `import { z } from "zod";\nconst NoiseA = z.object({ id: z.string(), value: z.number() });\nconst NoiseB = z.object({ id: z.string(), value: z.number() });\nexport const CommandSchema = z.object({ kind: z.enum(["start", "stop"]), at: z.string().optional(), reason: z.string().optional() });\nconst NoiseC = z.object({ id: z.string(), value: z.number() });\n`,
    after: `import { z } from "zod";\nconst NoiseA = z.object({ id: z.string(), value: z.number() });\nconst NoiseB = z.object({ id: z.string(), value: z.number() });\nexport const CommandSchema = z.object({ kind: z.enum(["start", "stop"]), at: z.string().optional(), reason: z.string().optional() });\nconst NoiseC = z.object({ id: z.string(), value: z.number() });\n`,
    evidence: { requiredReferences: [] }, wholeFileDilution: true, expected: "violation",
    rationale: "A stop-only reason and start-only timestamp are both optional in one schema while unrelated schemas increase whole-file noise.",
  }),
];

const effectFixtures: readonly Fixture[] = [
  make({
    id: "effect-delivery", name: "Effect delivery schema", category: "effect-schema", rootName: "DeliverySchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";\nconst DeliveryChannel = Schema.Literals(["email", "sms"]);\nexport const DeliverySchema = Schema.Struct({ channel: DeliveryChannel, email: Schema.optionalKey(Schema.String), phone: Schema.optionalKey(Schema.String) });\n`,
    after: `import * as Schema from "effect/Schema";\nconst DeliveryChannel = Schema.Literals(["email", "sms"]);\nexport const DeliverySchema = Schema.Struct({ channel: DeliveryChannel, email: Schema.optionalKey(Schema.String), phone: Schema.optionalKey(Schema.String) });\n`,
    evidence: { requiredReferences: ["DeliveryChannel"] }, contextRequired: true, expected: "violation",
    rationale: "The Effect Schema declaration leaves fields for both delivery modes available in every channel.",
  }),
  make({
    id: "effect-job", name: "Effect job schema", category: "effect-schema", rootName: "JobSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";\nconst JobKind = Schema.Literals(["run", "cancel"]);\nexport const JobSchema = Schema.Struct({ kind: JobKind, schedule: Schema.optionalKey(Schema.String), reason: Schema.optionalKey(Schema.String) });\n`,
    after: `import * as Schema from "effect/Schema";\nconst JobKind = Schema.Literals(["run", "cancel"]);\nexport const JobSchema = Schema.Struct({ kind: JobKind, schedule: Schema.optionalKey(Schema.String), reason: Schema.optionalKey(Schema.String) });\n`,
    evidence: { requiredReferences: ["JobKind"] }, contextRequired: true, expected: "violation",
    rationale: "The kind does not constrain the two optional fields, so a cancelled job can carry a run schedule.",
  }),
  make({
    id: "effect-money", name: "Effect money control", category: "effect-schema", rootName: "MoneySchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";\nexport const MoneySchema = Schema.Struct({ amount: Schema.Number, currency: Schema.Literals(["USD", "CAD"]) });\n`,
    after: `import * as Schema from "effect/Schema";\nexport const MoneySchema = Schema.Struct({ amount: Schema.Number, currency: Schema.Literals(["USD", "CAD"]) });\n`,
    evidence: { requiredReferences: [] }, diffSufficient: true, negativeControl: true, expected: "clear",
    rationale: "Amount and currency are one complete money value; the schema does not create conditional fields.",
  }),
  make({
    id: "effect-range", name: "Effect range schema", category: "effect-schema", rootName: "RangeSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";\nexport const RangeSchema = Schema.Struct({ from: Schema.optionalKey(Schema.String), to: Schema.optionalKey(Schema.String) });\n`,
    after: `import * as Schema from "effect/Schema";\nexport const RangeSchema = Schema.Struct({ from: Schema.optionalKey(Schema.String), to: Schema.optionalKey(Schema.String) });\n`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "violation",
    rationale: "The range schema admits an end without a beginning and vice versa, which the domain does not define.",
  }),
  make({
    id: "effect-notification", name: "Effect notification schema", category: "effect-schema", rootName: "NotificationSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";\nconst NotificationKind = Schema.Literals(["email", "push"]);\nexport const NotificationSchema = Schema.Struct({ kind: NotificationKind, email: Schema.optionalKey(Schema.String), deviceToken: Schema.optionalKey(Schema.String) });\n`,
    after: `import * as Schema from "effect/Schema";\nconst NotificationKind = Schema.Literals(["email", "push"]);\nexport const NotificationSchema = Schema.Struct({ kind: NotificationKind, email: Schema.optionalKey(Schema.String), deviceToken: Schema.optionalKey(Schema.String) });\n`,
    evidence: { requiredReferences: ["NotificationKind"] }, contextRequired: true, expected: "violation",
    rationale: "The notification kind is supplied as context but both transport-specific fields remain independently optional.",
  }),
  make({
    id: "effect-dilution", name: "diluted Effect command schema", category: "effect-schema", rootName: "CommandSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";\nconst NoiseA = Schema.Struct({ id: Schema.String, value: Schema.Number });\nconst NoiseB = Schema.Struct({ id: Schema.String, value: Schema.Number });\nexport const CommandSchema = Schema.Struct({ kind: Schema.Literals(["start", "stop"]), at: Schema.optionalKey(Schema.String), reason: Schema.optionalKey(Schema.String) });\nconst NoiseC = Schema.Struct({ id: Schema.String, value: Schema.Number });\n`,
    after: `import * as Schema from "effect/Schema";\nconst NoiseA = Schema.Struct({ id: Schema.String, value: Schema.Number });\nconst NoiseB = Schema.Struct({ id: Schema.String, value: Schema.Number });\nexport const CommandSchema = Schema.Struct({ kind: Schema.Literals(["start", "stop"]), at: Schema.optionalKey(Schema.String), reason: Schema.optionalKey(Schema.String) });\nconst NoiseC = Schema.Struct({ id: Schema.String, value: Schema.Number });\n`,
    evidence: { requiredReferences: [] }, wholeFileDilution: true, expected: "violation",
    rationale: "The full schema file includes unrelated declarations around a command with two conditionally meaningless fields.",
  }),
];

export const inputComparisonFixtures: readonly Fixture[] = [
  ...interfaceFixtures,
  ...aliasFixtures,
  ...zodFixtures,
  ...effectFixtures,
];

export const fixtureById = new Map(inputComparisonFixtures.map((fixture) => [fixture.id, fixture]));

export const fixtureSummary = {
  total: inputComparisonFixtures.length,
  categories: Object.fromEntries(([
    "interface", "type-alias", "zod", "effect-schema",
  ] as FixtureCategory[]).map((category) => [category, inputComparisonFixtures.filter((fixture) => fixture.category === category).length])),
  contextRequired: inputComparisonFixtures.filter((fixture) => fixture.contextRequired).length,
  diffSufficient: inputComparisonFixtures.filter((fixture) => fixture.diffSufficient).length,
  wholeFileDilution: inputComparisonFixtures.filter((fixture) => fixture.wholeFileDilution).length,
  negativeControls: inputComparisonFixtures.filter((fixture) => fixture.negativeControl).length,
};

if (
  fixtureSummary.total !== 24 ||
  Object.values(fixtureSummary.categories).some((count) => count < 6) ||
  fixtureSummary.contextRequired < 12 ||
  fixtureSummary.diffSufficient < 6 ||
  fixtureSummary.wholeFileDilution < 6
) {
  throw new Error("input comparison corpus does not satisfy the pre-registered minimums");
}
