import { digest, sha256, type Fixture, type FixtureCategory, type Expectation, type ExpectedBand } from "./protocol.ts";

const RULE = "r2_meaningless_combinations";
const clear: ExpectedBand = { minimum: 0, maximum: 0.3 };
const violation: ExpectedBand = { minimum: 0.7, maximum: 1, minimumInclusive: false, maximumInclusive: true };

type FixtureOptions = Omit<Fixture, "expectations" | "domain" | "path" | "contentHash" | "fixtureDigest"> & {
  readonly expected: "clear" | "violation" | "ambiguous" | "unchecked";
  readonly rationale: string;
};

// The first run's nominal dilution files were almost the same size as bounded
// declaration context. This fixed, semantically-clear tail makes the follow-up
// contrast real without introducing another Rule 2 finding.
const contrastTail = `
interface UnrelatedAuditEntry01 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry02 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry03 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry04 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry05 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry06 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry07 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry08 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry09 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry10 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry11 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry12 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry13 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry14 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry15 { id: string; createdAt: string; actor: string }
interface UnrelatedAuditEntry16 { id: string; createdAt: string; actor: string }
`;

const make = (options: FixtureOptions): Fixture => {
  const { expected, rationale, ...fixtureOptions } = options;
  if (fixtureOptions.before === fixtureOptions.after) {
    throw new Error(`fixture ${fixtureOptions.id} must contain a real before/after edit`);
  }
  const contrastRequired = fixtureOptions.contextRequired === true || fixtureOptions.wholeFileDilution === true;
  const before = contrastRequired ? `${fixtureOptions.before}${contrastTail}` : fixtureOptions.before;
  const after = contrastRequired ? `${fixtureOptions.after}${contrastTail}` : fixtureOptions.after;
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
    id: "iface-delivery-ten-fields", name: "ten-field delivery alternatives", category: "interface", rootName: "Delivery", rootKind: "interface",
    before: `type DeliveryChannel = "email" | "sms";
export interface Delivery {
  id: string;
  channel: DeliveryChannel;
  email?: string;
  phone?: string;
  priority: "normal" | "urgent";
  retries: number;
  scheduledAt?: string;
  metadata: Record<string, string>;
  region: string;
  locale: string;
}
`,
    after: `type DeliveryChannel = "email" | "sms";
export interface Delivery {
  id: string;
  channel: DeliveryChannel;
  email: string;
  phone?: string;
  priority: "normal" | "urgent";
  retries: number;
  scheduledAt?: string;
  metadata: Record<string, string>;
  region: string;
  locale: string;
}
`,
    evidence: { requiredReferences: ["DeliveryChannel"] }, contextRequired: true, expected: "violation",
    rationale: "The ten-field interface keeps email and phone independently representable beside the channel discriminator, so channel-specific combinations remain admitted.",
  }),
  make({
    id: "iface-delivery-flat", name: "flat delivery alternatives", category: "interface", rootName: "Delivery", rootKind: "interface",
    before: `type DeliveryChannel = "email" | "sms";
export interface Delivery {
  channel: DeliveryChannel;
  email?: string;
}
`,
    after: `type DeliveryChannel = "email" | "sms";
export interface Delivery {
  channel: DeliveryChannel;
  email?: string;
  phone?: string;
}
`,
    evidence: { requiredReferences: ["DeliveryChannel"] }, contextRequired: true, expected: "violation",
    rationale: "The edited interface leaves both channel-specific fields independently representable; channel does not constrain either field.",
  }),
  make({
    id: "iface-payment-tagged", name: "tagged payment union", category: "interface", rootName: "Payment", rootKind: "interface",
    before: `type PaymentKind = "card" | "bank";
export interface Payment {
  kind: PaymentKind;
}
`,
    after: `type PaymentKind = "card" | "bank";
export interface Payment {
  kind: PaymentKind;
  amount: number;
}
`,
    evidence: { requiredReferences: ["PaymentKind"] }, contextRequired: true, negativeControl: true, expected: "clear",
    rationale: "Kind and amount are independent facts of one payment; the enum context does not introduce conditional payload fields.",
  }),
  make({
    id: "iface-order-valid", name: "explicit order variants", category: "interface", rootName: "Order", rootKind: "interface",
    before: `type OrderState = "physical" | "digital";
export interface Order {
  state: OrderState;
  sku: string;
}
`,
    after: `type OrderState = "physical" | "digital";
export interface Order {
  state: OrderState;
  sku: string;
  downloadUrl?: string;
}
`,
    evidence: { requiredReferences: ["OrderState"] }, contextRequired: true, expected: "ambiguous",
    rationale: "The declaration is intentionally borderline: whether downloadUrl is independent of the state is domain-dependent and is reported without a hard gate label.",
  }),
  make({
    id: "iface-range-diff", name: "self-contained authentication state", category: "interface", rootName: "AuthState", rootKind: "interface",
    before: `export interface AuthState {
  authenticated: boolean;
}
`,
    after: `export interface AuthState {
  authenticated: boolean;
  userId?: string;
}
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "violation",
    rationale: "The diff shows authenticated false beside a settable userId; no external evidence is needed to identify that meaningless combination.",
  }),
  make({
    id: "iface-profile-control", name: "independent profile attributes", category: "interface", rootName: "Profile", rootKind: "interface",
    before: `export interface Profile {
  id: string;
}
`,
    after: `export interface Profile {
  id: string;
  displayName: string;
}
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, wholeFileDilution: true, negativeControl: true, expected: "clear",
    rationale: "The edit adds one required independent profile attribute and creates no conditional field or meaningless combination.",
  }),
  make({
    id: "iface-dilution", name: "large unrelated interface file", category: "interface", rootName: "Shipment", rootKind: "interface",
    before: `interface NoiseA { a: string; b: number; c: boolean }
interface NoiseB { a: string; b: number; c: boolean }
export interface Shipment {
  mode?: "air" | "ground";
  flight?: string;
}
interface NoiseC { a: string; b: number; c: boolean }
interface NoiseD { a: string; b: number; c: boolean }
interface NoiseE { a: string; b: number; c: boolean }
interface NoiseF { a: string; b: number; c: boolean }
interface NoiseG { a: string; b: number; c: boolean }
interface NoiseH { a: string; b: number; c: boolean }
`,
    after: `interface NoiseA { a: string; b: number; c: boolean }
interface NoiseB { a: string; b: number; c: boolean }
export interface Shipment {
  mode?: "air" | "ground";
  flight?: string;
  truck?: string;
}
interface NoiseC { a: string; b: number; c: boolean }
interface NoiseD { a: string; b: number; c: boolean }
interface NoiseE { a: string; b: number; c: boolean }
interface NoiseF { a: string; b: number; c: boolean }
interface NoiseG { a: string; b: number; c: boolean }
interface NoiseH { a: string; b: number; c: boolean }
`,
    evidence: { requiredReferences: [] }, wholeFileDilution: true, expected: "violation",
    rationale: "The target keeps mutually exclusive transport fields flat while unrelated declarations increase whole-file distraction.",
  }),
];

const aliasFixtures: readonly Fixture[] = [
  make({
    id: "alias-discount", name: "discount mode alias", category: "type-alias", rootName: "Discount", rootKind: "type-alias",
    before: `export type DiscountMode = "percent" | "free-shipping";
export type Discount = {
  mode: DiscountMode;
}
`,
    after: `export type DiscountMode = "percent" | "free-shipping";
export type Discount = {
  mode: DiscountMode;
  percentOff?: number;
}
`,
    evidence: { requiredReferences: ["DiscountMode"] }, contextRequired: true, expected: "violation",
    rationale: "The free-shipping mode still admits a percentOff value because the alias leaves the conditional field outside the variant.",
  }),
  make({
    id: "alias-auth", name: "authentication state alias", category: "type-alias", rootName: "AuthState", rootKind: "type-alias",
    before: `export type AuthKind = "anonymous" | "user";
export type AuthState = {
  kind: AuthKind;
}
`,
    after: `export type AuthKind = "anonymous" | "user";
export type AuthState = {
  kind: AuthKind;
  userId?: string;
}
`,
    evidence: { requiredReferences: ["AuthKind"] }, contextRequired: true, expected: "violation",
    rationale: "Anonymous and authenticated states share one object with an optional userId, so an anonymous state may carry an identity.",
  }),
  make({
    id: "alias-period", name: "period composed from context", category: "type-alias", rootName: "Period", rootKind: "type-alias",
    before: `type Instant = string;
export type Period = {
  from?: Instant;
}
`,
    after: `type Instant = string;
export type Period = {
  from?: Instant;
  to?: Instant;
}
`,
    evidence: { requiredReferences: ["Instant"] }, contextRequired: true, expected: "violation",
    rationale: "The period can contain an end without a start and neither endpoint is tied to the other by the alias.",
  }),
  make({
    id: "alias-money", name: "self-contained money pair", category: "type-alias", rootName: "Money", rootKind: "type-alias",
    before: `type MoneyNoise = { id: string; value: number };
type MoneyNoise2 = { id: string; value: number };
type MoneyNoise3 = { id: string; value: number };
type MoneyNoise4 = { id: string; value: number };
export type Money = {
  amount: number;
}
`,
    after: `type MoneyNoise = { id: string; value: number };
type MoneyNoise2 = { id: string; value: number };
type MoneyNoise3 = { id: string; value: number };
type MoneyNoise4 = { id: string; value: number };
export type Money = {
  amount: number;
  currency: "USD" | "CAD";
}
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, wholeFileDilution: true, negativeControl: true, expected: "clear",
    rationale: "Amount and currency are intentionally one value; every representable object has both parts even when a whole-file control includes an unrelated alias.",
  }),
  make({
    id: "alias-report-range", name: "feature rollout state", category: "type-alias", rootName: "FeatureRollout", rootKind: "type-alias",
    before: `export type FeatureRollout = {
  enabled: boolean;
}
`,
    after: `export type FeatureRollout = {
  enabled: boolean;
  rolloutPercentage?: number;
}
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "violation",
    rationale: "The diff admits a disabled feature with a rollout percentage; the condition and conditional field are both visible in the hunk.",
  }),
  make({
    id: "alias-dilution", name: "diluted job command alias", category: "type-alias", rootName: "JobCommand", rootKind: "type-alias",
    before: `type Noise1 = { id: string; createdAt: string };
type Noise2 = { id: string; createdAt: string };
export type JobCommand = {
  kind: "run" | "cancel";
  schedule?: string;
}
type Noise3 = { id: string; createdAt: string };
type Noise4 = { id: string; createdAt: string };
type Noise5 = { id: string; createdAt: string };
type Noise6 = { id: string; createdAt: string };
type Noise7 = { id: string; createdAt: string };
type Noise8 = { id: string; createdAt: string };
`,
    after: `type Noise1 = { id: string; createdAt: string };
type Noise2 = { id: string; createdAt: string };
export type JobCommand = {
  kind: "run" | "cancel";
  schedule?: string;
  reason?: string;
}
type Noise3 = { id: string; createdAt: string };
type Noise4 = { id: string; createdAt: string };
type Noise5 = { id: string; createdAt: string };
type Noise6 = { id: string; createdAt: string };
type Noise7 = { id: string; createdAt: string };
type Noise8 = { id: string; createdAt: string };
`,
    evidence: { requiredReferences: [] }, wholeFileDilution: true, expected: "violation",
    rationale: "Run-only schedule and cancel-only reason remain independently optional; unrelated aliases deliberately dilute the whole-file input.",
  }),
];

const zodFixtures: readonly Fixture[] = [
  make({
    id: "zod-delivery", name: "Zod delivery schema", category: "zod", rootName: "DeliverySchema", rootKind: "schema",
    before: `import { z } from "zod";
const DeliveryChannel = z.enum(["email", "sms"]);
export const DeliverySchema = z.object({
  channel: DeliveryChannel,
  email: z.string().optional(),
});
`,
    after: `import { z } from "zod";
const DeliveryChannel = z.enum(["email", "sms"]);
export const DeliverySchema = z.object({
  channel: DeliveryChannel,
  email: z.string().optional(),
  phone: z.string().optional(),
});
`,
    evidence: { requiredReferences: ["DeliveryChannel"] }, contextRequired: true, expected: "violation",
    rationale: "The Zod schema validates both channel-specific fields as optional regardless of the channel value.",
  }),
  make({
    id: "zod-notification", name: "Zod notification schema", category: "zod", rootName: "NotificationSchema", rootKind: "schema",
    before: `import { z } from "zod";
const NotificationKind = z.enum(["email", "push"]);
export const NotificationSchema = z.object({
  kind: NotificationKind,
  email: z.string().optional(),
});
`,
    after: `import { z } from "zod";
const NotificationKind = z.enum(["email", "push"]);
export const NotificationSchema = z.object({
  kind: NotificationKind,
  email: z.string().optional(),
  deviceToken: z.string().optional(),
});
`,
    evidence: { requiredReferences: ["NotificationKind"] }, contextRequired: true, expected: "violation",
    rationale: "The schema’s kind enum is context for the two optional payloads, but it does not make the invalid cross-combinations unreachable.",
  }),
  make({
    id: "zod-profile", name: "Zod profile control", category: "zod", rootName: "ProfileSchema", rootKind: "schema",
    before: `import { z } from "zod";
export const ProfileSchema = z.object({ id: z.string() });
`,
    after: `import { z } from "zod";
export const ProfileSchema = z.object({
  id: z.string(),
  displayName: z.string(),
});
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, negativeControl: true, expected: "clear",
    rationale: "The edit adds one required independent profile attribute and creates no conditional field or meaningless combination.",
  }),
  make({
    id: "zod-range", name: "Zod delivery status", category: "zod", rootName: "DeliverySchema", rootKind: "schema",
    before: `import { z } from "zod";
export const DeliverySchema = z.object({
  status: z.enum(["pending", "delivered"]),
});
`,
    after: `import { z } from "zod";
export const DeliverySchema = z.object({
  status: z.enum(["pending", "delivered"]),
  deliveredAt: z.string().optional(),
});
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "violation",
    rationale: "The diff admits pending beside deliveredAt; the condition and conditional field are self-contained.",
  }),
  make({
    id: "zod-payment", name: "Zod payment schema", category: "zod", rootName: "PaymentSchema", rootKind: "schema",
    before: `import { z } from "zod";
const PaymentKind = z.enum(["card", "bank"]);
export const PaymentSchema = z.object({
  kind: PaymentKind,
});
`,
    after: `import { z } from "zod";
const PaymentKind = z.enum(["card", "bank"]);
export const PaymentSchema = z.object({
  kind: PaymentKind,
  amount: z.number(),
});
`,
    evidence: { requiredReferences: ["PaymentKind"] }, contextRequired: true, negativeControl: true, expected: "clear",
    rationale: "Kind and amount are independent facts of one payment; the enum context does not introduce conditional payload fields.",
  }),
  make({
    id: "zod-dilution", name: "diluted Zod command schema", category: "zod", rootName: "CommandSchema", rootKind: "schema",
    before: `import { z } from "zod";
const NoiseA = z.object({ id: z.string(), value: z.number() });
const NoiseB = z.object({ id: z.string(), value: z.number() });
const NoiseD = z.object({ id: z.string(), value: z.number() });
const NoiseE = z.object({ id: z.string(), value: z.number() });
const NoiseF = z.object({ id: z.string(), value: z.number() });
export const CommandSchema = z.object({
  kind: z.enum(["start", "stop"]),
  at: z.string().optional(),
});
const NoiseC = z.object({ id: z.string(), value: z.number() });
`,
    after: `import { z } from "zod";
const NoiseA = z.object({ id: z.string(), value: z.number() });
const NoiseB = z.object({ id: z.string(), value: z.number() });
const NoiseD = z.object({ id: z.string(), value: z.number() });
const NoiseE = z.object({ id: z.string(), value: z.number() });
const NoiseF = z.object({ id: z.string(), value: z.number() });
export const CommandSchema = z.object({
  kind: z.enum(["start", "stop"]),
  at: z.string().optional(),
  reason: z.string().optional(),
});
const NoiseC = z.object({ id: z.string(), value: z.number() });
`,
    evidence: { requiredReferences: [] }, wholeFileDilution: true, expected: "violation",
    rationale: "A stop-only reason and start-only timestamp are both optional in one schema while unrelated schemas increase whole-file noise.",
  }),
];

const effectFixtures: readonly Fixture[] = [
  make({
    id: "effect-delivery", name: "Effect delivery schema", category: "effect-schema", rootName: "DeliverySchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";
const DeliveryChannel = Schema.Literals(["email", "sms"]);
export const DeliverySchema = Schema.Struct({
  channel: DeliveryChannel,
  email: Schema.optionalKey(Schema.String),
});
`,
    after: `import * as Schema from "effect/Schema";
const DeliveryChannel = Schema.Literals(["email", "sms"]);
export const DeliverySchema = Schema.Struct({
  channel: DeliveryChannel,
  email: Schema.optionalKey(Schema.String),
  phone: Schema.optionalKey(Schema.String),
});
`,
    evidence: { requiredReferences: ["DeliveryChannel"] }, contextRequired: true, expected: "violation",
    rationale: "The Effect Schema declaration leaves fields for both delivery modes available in every channel.",
  }),
  make({
    id: "effect-job", name: "Effect job schema", category: "effect-schema", rootName: "JobSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";
const JobKind = Schema.Literals(["run", "cancel"]);
export const JobSchema = Schema.Struct({
  kind: JobKind,
  schedule: Schema.optionalKey(Schema.String),
});
`,
    after: `import * as Schema from "effect/Schema";
const JobKind = Schema.Literals(["run", "cancel"]);
export const JobSchema = Schema.Struct({
  kind: JobKind,
  schedule: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});
`,
    evidence: { requiredReferences: ["JobKind"] }, contextRequired: true, expected: "violation",
    rationale: "The kind does not constrain the two optional fields, so a cancelled job can carry a run schedule.",
  }),
  make({
    id: "effect-money", name: "Effect money control", category: "effect-schema", rootName: "MoneySchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";
export const MoneySchema = Schema.Struct({
  amount: Schema.Number,
});
`,
    after: `import * as Schema from "effect/Schema";
export const MoneySchema = Schema.Struct({
  amount: Schema.Number,
  currency: Schema.Literals(["USD", "CAD"]),
});
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, negativeControl: true, expected: "clear",
    rationale: "Amount and currency are one complete money value; the schema does not create conditional fields.",
  }),
  make({
    id: "effect-range", name: "Effect authentication schema", category: "effect-schema", rootName: "AuthSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";
export const AuthSchema = Schema.Struct({
  authenticated: Schema.Boolean,
});
`,
    after: `import * as Schema from "effect/Schema";
export const AuthSchema = Schema.Struct({
  authenticated: Schema.Boolean,
  userId: Schema.optionalKey(Schema.String),
});
`,
    evidence: { requiredReferences: [] }, diffSufficient: true, expected: "violation",
    rationale: "The diff admits authenticated false beside a userId; no outbound declaration is needed to see the meaningless combination.",
  }),
  make({
    id: "effect-notification", name: "Effect notification schema", category: "effect-schema", rootName: "NotificationSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";
const NotificationKind = Schema.Literals(["email", "push"]);
export const NotificationSchema = Schema.Struct({
  kind: NotificationKind,
  email: Schema.optionalKey(Schema.String),
});
`,
    after: `import * as Schema from "effect/Schema";
const NotificationKind = Schema.Literals(["email", "push"]);
export const NotificationSchema = Schema.Struct({
  kind: NotificationKind,
  email: Schema.optionalKey(Schema.String),
  deviceToken: Schema.optionalKey(Schema.String),
});
`,
    evidence: { requiredReferences: ["NotificationKind"] }, contextRequired: true, expected: "violation",
    rationale: "The notification kind is supplied as context but both transport-specific fields remain independently optional.",
  }),
  make({
    id: "effect-dilution", name: "diluted Effect command schema", category: "effect-schema", rootName: "CommandSchema", rootKind: "schema",
    before: `import * as Schema from "effect/Schema";
const NoiseA = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseB = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseD = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseE = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseF = Schema.Struct({ id: Schema.String, value: Schema.Number });
export const CommandSchema = Schema.Struct({
  kind: Schema.Literals(["start", "stop"]),
  at: Schema.optionalKey(Schema.String),
});
const NoiseC = Schema.Struct({ id: Schema.String, value: Schema.Number });
`,
    after: `import * as Schema from "effect/Schema";
const NoiseA = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseB = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseD = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseE = Schema.Struct({ id: Schema.String, value: Schema.Number });
const NoiseF = Schema.Struct({ id: Schema.String, value: Schema.Number });
export const CommandSchema = Schema.Struct({
  kind: Schema.Literals(["start", "stop"]),
  at: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
});
const NoiseC = Schema.Struct({ id: Schema.String, value: Schema.Number });
`,
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
  fixtureSummary.total !== 25 ||
  Object.values(fixtureSummary.categories).some((count) => count < 6) ||
  fixtureSummary.contextRequired < 12 ||
  fixtureSummary.diffSufficient < 6 ||
  fixtureSummary.wholeFileDilution < 6
) {
  throw new Error("input comparison corpus does not satisfy the pre-registered minimums");
}
