/**
 * E0 — three Nouls and a Score over the 2×2 fixture plus one real schema
 * (JEV-TYPE-CLASSIFIER.md §3, §5, §6).
 */
import * as Effect from "effect/Effect";
import { decide, Live, MODEL } from "./jev-decision.ts";

import {
  E0,
  NOUL_KEYS,
  measured,
  levelOf,
  LEVEL_NAME,
  APPLIES_FROM,
  band,
  type ClassifierState as Artifact,
} from "./questions.ts";

type Field = {
  path: string;
  type: string;
  optional: "yes" | "no" | "unknown";
  constraints?: string;
  observed?: unknown;
};

/**
 * The fixture keeps a field inventory beside each artifact. It is never sent —
 * `--with-inventory` reproduces the runs up to E4, when it was.
 */
type ClassifierState = Artifact & { inventory: Field[] };

// ── Fixture: dirty ─────────────────────────────────────────────────────────

const sendMouseBodySample = {
  id: "<session>",
  agent: "<agent>",
  x: 0.1,
  y: 0.2,
  button: "left",
  clicks: 2,
  to: { x: 0.9, y: 0.2 },
  modifiers: ["super", "shift"],
  press: "down",
};

const dirty: ClassifierState = {
  artifact: {
    domain: "send-mouse-body.json",
    source: JSON.stringify(sendMouseBodySample, null, 2),
  },
  inventory: [
    { path: "id", type: "string", optional: "unknown", observed: "<session>" },
    { path: "agent", type: "string", optional: "unknown", observed: "<agent>" },
    { path: "x", type: "number", optional: "unknown", observed: 0.1 },
    { path: "y", type: "number", optional: "unknown", observed: 0.2 },
    { path: "button", type: "string", optional: "unknown", observed: "left" },
    { path: "clicks", type: "number", optional: "unknown", observed: 2 },
    { path: "to", type: "{x,y}", optional: "unknown", observed: { x: 0.9, y: 0.2 } },
    { path: "to.x", type: "number", optional: "unknown", observed: 0.9 },
    { path: "to.y", type: "number", optional: "unknown", observed: 0.2 },
    {
      path: "modifiers",
      type: "string[]",
      optional: "unknown",
      observed: ["super", "shift"],
    },
    { path: "press", type: "string", optional: "unknown", observed: "down" },
  ],
};

// ── Fixture: dirty, as a declared type ─────────────────────────────────────
//
// The same bad shape, written out as the type an API of this kind declares.
// Which fields are optional is a judgement call made here, not something the
// JSON sample says — so this artifact is partly authored, and a result on it
// carries that caveat.

const dirtyTypeSource = `type SendMouseBody = {
  id: string;
  agent: string;
  x: number;
  y: number;
  button?: "left" | "right" | "middle";
  clicks?: number;
  to?: { x: number; y: number };
  modifiers?: Array<"super" | "shift" | "ctrl" | "alt">;
  press?: "down" | "up";
};`;

const dirtyType: ClassifierState = {
  artifact: {
    domain: "send-mouse-body.ts",
    source: dirtyTypeSource,
  },
  inventory: [
    { path: "id", type: "string", optional: "no" },
    { path: "agent", type: "string", optional: "no" },
    { path: "x", type: "number", optional: "no" },
    { path: "y", type: "number", optional: "no" },
    { path: "button", type: '"left" | "right" | "middle"', optional: "yes" },
    { path: "clicks", type: "number", optional: "yes" },
    { path: "to", type: "{x,y}", optional: "yes" },
    { path: "to.x", type: "number", optional: "no" },
    { path: "to.y", type: "number", optional: "no" },
    { path: "modifiers", type: '"super" | "shift" | "ctrl" | "alt"[]', optional: "yes" },
    { path: "press", type: '"down" | "up"', optional: "yes" },
  ],
};

// ── Fixture: clean, as a single sample ─────────────────────────────────────
//
// One inhabitant of the `click` variant. Genuinely single-purpose, so rule 1
// is clear on it by construction and says nothing; it is here to show whether
// rules 2 to 5 still fire when no type text is present.

const cleanSample = {
  session: "<session>",
  agent: "<agent>",
  kind: "click",
  at: { x: 0.1, y: 0.2 },
  button: "left",
  clicks: 2,
  modifiers: ["super", "shift"],
};

const controlSampleState: ClassifierState = {
  artifact: {
    domain: "pointer-command.json",
    source: JSON.stringify(cleanSample, null, 2),
  },
  inventory: [
    { path: "session", type: "string", optional: "unknown", observed: "<session>" },
    { path: "agent", type: "string", optional: "unknown", observed: "<agent>" },
    { path: "kind", type: "string", optional: "unknown", observed: "click" },
    { path: "at", type: "{x,y}", optional: "unknown", observed: { x: 0.1, y: 0.2 } },
    { path: "at.x", type: "number", optional: "unknown", observed: 0.1 },
    { path: "at.y", type: "number", optional: "unknown", observed: 0.2 },
    { path: "button", type: "string", optional: "unknown", observed: "left" },
    { path: "clicks", type: "number", optional: "unknown", observed: 2 },
    {
      path: "modifiers",
      type: "string[]",
      optional: "unknown",
      observed: ["super", "shift"],
    },
  ],
};

// ── Fixture: clean control ─────────────────────────────────────────────────

const controlSource = `type Point = { x: Unit; y: Unit };                 // Unit = number in [0,1]
type Target = { session: SessionId; agent: AgentId };
type PointerCommand = Target & (
  | { kind: "move";     at: Point }
  | { kind: "click";    at: Point; button: Button; clicks: PositiveInt; modifiers: Modifier[] }
  | { kind: "drag";     from: Point; to: Point; button: Button; modifiers: Modifier[] }
  | { kind: "key_hold"; keys: NonEmpty<Modifier>; transition: "down" | "up" }
);`;

const control: ClassifierState = {
  artifact: {
    domain: "pointer-command.ts",
    source: controlSource,
  },
  // Variant membership is carried structurally, by path prefix. Writing it as
  // prose in `constraints` ("present on kind click only") would restate r2's
  // focus pattern in the state's own vocabulary; `constraints` carries only
  // refinements the type declares.
  inventory: [
    { path: "session", type: "SessionId", optional: "no" },
    { path: "agent", type: "AgentId", optional: "no" },
    { path: "kind", type: '"move" | "click" | "drag" | "key_hold"', optional: "no" },
    { path: "move.at", type: "Point", optional: "no" },
    { path: "move.at.x", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "move.at.y", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "click.at", type: "Point", optional: "no" },
    { path: "click.at.x", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "click.at.y", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "click.button", type: "Button", optional: "no" },
    { path: "click.clicks", type: "PositiveInt", optional: "no", constraints: ">= 1" },
    { path: "click.modifiers", type: "Modifier[]", optional: "no" },
    { path: "drag.from", type: "Point", optional: "no" },
    { path: "drag.from.x", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "drag.from.y", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "drag.to", type: "Point", optional: "no" },
    { path: "drag.to.x", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "drag.to.y", type: "Unit", optional: "no", constraints: "number in [0,1]" },
    { path: "drag.button", type: "Button", optional: "no" },
    { path: "drag.modifiers", type: "Modifier[]", optional: "no" },
    { path: "key_hold.keys", type: "NonEmpty<Modifier>", optional: "no", constraints: "at least one element" },
    { path: "key_hold.transition", type: '"down" | "up"', optional: "no" },
  ],
};

// ── Fixture: dirty, as a declared schema ───────────────────────────────────
//
// The same bad shape a third time, in the schema library the real artifact
// below uses. Optionality is declared here rather than inferred, so this is
// the strongest statement of the bad shape: nine fields on one struct, five of
// them optional, no discriminant.

const dirtySchemaSource = `const SendMouseBodySchema = Schema.Struct({
  id: Schema.String,
  agent: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  button: Schema.optional(Schema.Literals(["left", "right", "middle"])),
  clicks: Schema.optional(Schema.Number),
  to: Schema.optional(Schema.Struct({ x: Schema.Number, y: Schema.Number })),
  modifiers: Schema.optional(
    Schema.Array(Schema.Literals(["super", "shift", "ctrl", "alt"])),
  ),
  press: Schema.optional(Schema.Literals(["down", "up"])),
});`;

const dirtySchema: ClassifierState = {
  artifact: {
    domain: "send-mouse-body.schema.ts",
    source: dirtySchemaSource,
  },
  inventory: [
    { path: "id", type: "string", optional: "no" },
    { path: "agent", type: "string", optional: "no" },
    { path: "x", type: "number", optional: "no" },
    { path: "y", type: "number", optional: "no" },
    { path: "button", type: '"left" | "right" | "middle"', optional: "yes" },
    { path: "clicks", type: "number", optional: "yes" },
    { path: "to", type: "{x,y}", optional: "yes" },
    { path: "to.x", type: "number", optional: "no" },
    { path: "to.y", type: "number", optional: "no" },
    { path: "modifiers", type: '"super" | "shift" | "ctrl" | "alt"[]', optional: "yes" },
    { path: "press", type: '"down" | "up"', optional: "yes" },
  ],
};

// ── Fixture: clean, as a declared schema ───────────────────────────────────
//
// The good shape in the same library: one union on `kind`, every field
// required inside the variant that gives it meaning, and the refinements the
// type text of `pointer-command.ts` leaves to named aliases written out as
// checks.

const cleanSchemaSource = `const UnitSchema = Schema.Number.check(Schema.between(0, 1));
const PointSchema = Schema.Struct({ x: UnitSchema, y: UnitSchema });
const ButtonSchema = Schema.Literals(["left", "right", "middle"]);
const ModifierSchema = Schema.Literals(["super", "shift", "ctrl", "alt"]);
const TargetFields = {
  session: Schema.Trimmed.check(Schema.isNonEmpty()),
  agent: Schema.Trimmed.check(Schema.isNonEmpty()),
};

const PointerCommandSchema = Schema.Union([
  Schema.Struct({
    ...TargetFields,
    kind: Schema.Literal("move"),
    at: PointSchema,
  }),
  Schema.Struct({
    ...TargetFields,
    kind: Schema.Literal("click"),
    at: PointSchema,
    button: ButtonSchema,
    clicks: Schema.Number.check(Schema.int(), Schema.greaterThanOrEqualTo(1)),
    modifiers: Schema.Array(ModifierSchema),
  }),
  Schema.Struct({
    ...TargetFields,
    kind: Schema.Literal("drag"),
    from: PointSchema,
    to: PointSchema,
    button: ButtonSchema,
    modifiers: Schema.Array(ModifierSchema),
  }),
  Schema.Struct({
    ...TargetFields,
    kind: Schema.Literal("keyHold"),
    keys: Schema.NonEmptyArray(ModifierSchema),
    transition: Schema.Literals(["down", "up"]),
  }),
]);`;

const cleanSchema: ClassifierState = {
  artifact: {
    domain: "pointer-command.schema.ts",
    source: cleanSchemaSource,
  },
  inventory: [
    { path: "session", type: "string", optional: "no", constraints: "trimmed, non-empty" },
    { path: "agent", type: "string", optional: "no", constraints: "trimmed, non-empty" },
    { path: "kind", type: '"move" | "click" | "drag" | "keyHold"', optional: "no" },
    { path: "move.at.x", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "move.at.y", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "click.at.x", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "click.at.y", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "click.button", type: '"left" | "right" | "middle"', optional: "no" },
    { path: "click.clicks", type: "number", optional: "no", constraints: "integer, >= 1" },
    { path: "click.modifiers", type: '"super" | "shift" | "ctrl" | "alt"[]', optional: "no" },
    { path: "drag.from.x", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "drag.from.y", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "drag.to.x", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "drag.to.y", type: "number", optional: "no", constraints: "between 0 and 1" },
    { path: "drag.button", type: '"left" | "right" | "middle"', optional: "no" },
    { path: "drag.modifiers", type: '"super" | "shift" | "ctrl" | "alt"[]', optional: "no" },
    { path: "keyHold.keys", type: '"super" | "shift" | "ctrl" | "alt"[]', optional: "no", constraints: "at least one element" },
    { path: "keyHold.transition", type: '"down" | "up"', optional: "no" },
  ],
};

// ── Fixture: one fault, one rule ───────────────────────────────────────────
//
// Every other pair here is bad at several rules at once, so a reading cannot be
// attributed. This pair differs in one thing only: whether parts that are correct
// only together arrive as one value. Nothing here is optional, there are no cases
// to discriminate, and no collection — so rules 1, 2 and 5 have nothing to find in
// either half.

const splitSource = `type Quote = {
  quoteId: QuoteId;
  issuedAt: Instant;
  amount: number;
  currency: string;
  validFrom: Instant;
  validUntil: Instant;
};`;

const split: ClassifierState = {
  artifact: { domain: "quote.ts", source: splitSource },
  inventory: [
    { path: "quoteId", type: "QuoteId", optional: "no" },
    { path: "issuedAt", type: "Instant", optional: "no" },
    { path: "amount", type: "number", optional: "no" },
    { path: "currency", type: "string", optional: "no" },
    { path: "validFrom", type: "Instant", optional: "no" },
    { path: "validUntil", type: "Instant", optional: "no" },
  ],
};

const joinedSource = `type Quote = {
  quoteId: QuoteId;
  issuedAt: Instant;
  price: Money;                 // { amount: MinorUnits; currency: CurrencyCode }
  validity: Period;             // { from: Instant; to: Instant }, to after from
};`;

const joined: ClassifierState = {
  artifact: { domain: "quote.ts", source: joinedSource },
  inventory: [
    { path: "quoteId", type: "QuoteId", optional: "no" },
    { path: "issuedAt", type: "Instant", optional: "no" },
    { path: "price", type: "Money", optional: "no" },
    { path: "validity", type: "Period", optional: "no", constraints: "to after from" },
  ],
};

// ── Fixture: one fault, one rule — a fact stored twice ─────────────────────
//
// `lineCount` restates the length of `lines`, and `totalLabel` restates `total`.
// Nothing here is optional, there are no cases, and no correlation is split, so
// rules 1, 2, 3 and 5 have nothing to find in either half.

const duplicatedSource = `type Invoice = {
  invoiceId: InvoiceId;
  issuedAt: Instant;
  lines: LineItem[];
  lineCount: number;
  total: Money;
  totalLabel: string;
};`;

const duplicated: ClassifierState = {
  artifact: { domain: "invoice.ts", source: duplicatedSource },
  inventory: [
    { path: "invoiceId", type: "InvoiceId", optional: "no" },
    { path: "issuedAt", type: "Instant", optional: "no" },
    { path: "lines", type: "LineItem[]", optional: "no" },
    { path: "lineCount", type: "number", optional: "no" },
    { path: "total", type: "Money", optional: "no" },
    { path: "totalLabel", type: "string", optional: "no" },
  ],
};

const onceSource = `type Invoice = {
  invoiceId: InvoiceId;
  issuedAt: Instant;
  lines: LineItem[];
};`;

const once: ClassifierState = {
  artifact: { domain: "invoice.ts", source: onceSource },
  inventory: [
    { path: "invoiceId", type: "InvoiceId", optional: "no" },
    { path: "issuedAt", type: "Instant", optional: "no" },
    { path: "lines", type: "LineItem[]", optional: "no" },
  ],
};

// ── Fixture: a schema from another codebase ────────────────────────────────
//
// The MCP `battle_lifecycle` tool input from typescript/dnd
// (packages/mcp/src/battle-lifecycle-tool-input.ts, lines 12–59), copied
// verbatim. Nothing about it was written for this fixture, and nobody who
// wrote it knew about TYPE-DESIGN-RULES.md.
//
// The field list below is written the way a normalizer would emit it: variant
// membership in the path prefix (§5). No parser exists yet, so writing it by
// hand is the stand-in, and that is this artifact's weakest joint.

const realSchemaSource = `const CombatantIdTextSchema = Schema.Trimmed.check(Schema.isNonEmpty()).pipe(
  Schema.annotate({
    description: "Combatant id from the current Battle projection.",
  }),
);

const InitiativeSwapCandidateWitnessSchema = Schema.Union([
  Schema.Struct({ tag: Schema.Literal("notAlly") }),
  Schema.Struct({ tag: Schema.Literal("unwillingAlly") }),
  Schema.Struct({ tag: Schema.Literal("willingAlly") }),
]);

const ApplyInitiativeSwapOperationSchema = Schema.Struct({
  kind: Schema.Literal("applyInitiativeSwap"),
  sourceId: CombatantIdTextSchema,
  candidateId: CombatantIdTextSchema,
  candidateWitness: InitiativeSwapCandidateWitnessSchema,
});

const FinalizeInitialInitiativeSetupOperationSchema = Schema.Struct({
  kind: Schema.Literal("finalizeInitialInitiativeSetup"),
});

const AddCombatantOperationSchema = Schema.Struct({
  kind: Schema.Literal("addCombatant"),
  combatant: BattleCombatantArgsSchema.pipe(
    Schema.annotate({
      description:
        "A finalized Character Session or installed SRD Stat Block projection admitted by the existing Battle owners.",
    }),
  ),
});

const RemoveCombatantOperationSchema = Schema.Struct({
  kind: Schema.Literal("removeCombatant"),
  combatantId: CombatantIdTextSchema,
});

const BattleLifecycleOperationSchema = Schema.Union([
  ApplyInitiativeSwapOperationSchema,
  FinalizeInitialInitiativeSetupOperationSchema,
  AddCombatantOperationSchema,
  RemoveCombatantOperationSchema,
]);

const BattleLifecycleArgsSchema = Schema.Struct({
  operation: BattleLifecycleOperationSchema,
});`;

const realSchema: ClassifierState = {
  artifact: {
    domain: "battle-lifecycle-tool-input.ts",
    source: realSchemaSource,
  },
  inventory: [
    { path: "operation.kind", type: '"applyInitiativeSwap" | "finalizeInitialInitiativeSetup" | "addCombatant" | "removeCombatant"', optional: "no" },
    { path: "operation.applyInitiativeSwap.sourceId", type: "string", optional: "no", constraints: "trimmed, non-empty" },
    { path: "operation.applyInitiativeSwap.candidateId", type: "string", optional: "no", constraints: "trimmed, non-empty" },
    { path: "operation.applyInitiativeSwap.candidateWitness.tag", type: '"notAlly" | "unwillingAlly" | "willingAlly"', optional: "no" },
    { path: "operation.addCombatant.combatant", type: "BattleCombatantArgs", optional: "no" },
    { path: "operation.removeCombatant.combatantId", type: "string", optional: "no", constraints: "trimmed, non-empty" },
  ],
};

/**
 * E3/E10 ablation (§6): strip the file name, leaving only the text. A gap that
 * survives is read off the structure; a gap that collapses is read off the label.
 */
const ablate = (state: ClassifierState): ClassifierState => ({
  ...state,
  artifact: { ...state.artifact, domain: "" },
});

const ABLATE = process.argv.includes("--ablate");

/**
 * E6 (§6): send the artifact alone — name, domain, representation, evidence
 * and the verbatim source — with no field inventory. Tests whether the
 * inventory was ever doing work for the model, or only for code.
 */
const WITH_INVENTORY = process.argv.includes("--with-inventory");

/** Print the exact request payload instead of calling: `bun run e0 --dump`. */
const DUMP = process.argv.includes("--dump");

const runOne = (label: string, state: ClassifierState) =>
  Effect.gen(function* () {
    if (DUMP) {
      console.log(`\n=== ${label} — state as sent ===`);
      console.log(JSON.stringify(WITH_INVENTORY ? state : { artifact: state.artifact }, null, 2));
      return { nouls: {} as Record<string, number> };
    }
    const { answers, usage } = yield* decide({
      // §1: the source goes verbatim and nothing else. `state.inventory` is never
      // sent; it survives only to reproduce the runs up to E4.
      state: WITH_INVENTORY ? state : { artifact: state.artifact },
      decisions: E0,
    });

    const level = levelOf(state.artifact.source);
    console.log(
      `\n=== ${label} (${state.artifact.domain}) — level ${level} ${LEVEL_NAME[level]} ===`,
    );
    console.log(`model: ${MODEL}`);

    const nouls: Record<string, number> = {};
    for (const key of NOUL_KEYS) {
      const a = answers[key];
      nouls[key] = a.probability;
      const note = measured(key, state.artifact.source)
        ? band(a.probability)
        : `${band(a.probability)}  [below rung ${APPLIES_FROM[key]} ${LEVEL_NAME[APPLIES_FROM[key]!]}, where this rule starts]`;
      console.log(`  ${key.padEnd(28)} noul=${a.probability.toFixed(4)}  ${note}`);
    }

    console.log("  usage:", usage);

    return { nouls };
  });

const program = Effect.gen(function* () {
  const cells = [
    { key: "dirty-json", label: "DIRTY / json sample", state: dirty },
    { key: "clean-json", label: "CLEAN / json sample", state: controlSampleState },
    { key: "dirty-ts", label: "DIRTY / declared type", state: dirtyType },
    { key: "clean-ts", label: "CLEAN / declared type", state: control },
    { key: "dirty-schema", label: "DIRTY / declared schema", state: dirtySchema },
    { key: "clean-schema", label: "CLEAN / declared schema", state: cleanSchema },
    { key: "split", label: "SPLIT / correlations apart", state: split },
    { key: "joined", label: "JOINED / correlations as values", state: joined },
    { key: "duplicated", label: "DUPLICATED / one fact stored twice", state: duplicated },
    { key: "once", label: "ONCE / each fact written down once", state: once },
    { key: "real-schema", label: "REAL / effect schema from dnd", state: realSchema },
  ].map((c, i) =>
    ABLATE ? { ...c, state: ablate(c.state) } : c,
  );
  if (ABLATE) console.log("Ablation: file name removed, text alone.");
  if (WITH_INVENTORY)
    console.log("Sending the field inventory as well — reproduces runs before E6.");

  const results: Record<string, Awaited<ReturnType<typeof runOne>> extends never ? never : any> = {};
  const states: Record<string, ClassifierState> = {};
  for (const c of cells) {
    results[c.key] = yield* runOne(c.label, c.state);
    states[c.key] = c.state;
  }

  // Each comparison holds the representation fixed, so the only thing that
  // differs inside a pair is whether the shape is well designed.
  const compare = (title: string, dirtyKey: string, cleanKey: string) => {
    const d = results[dirtyKey];
    const c = results[cleanKey];
    console.log(`\n=== ${title} ===`);
    for (const key of NOUL_KEYS) {
      const dv = d.nouls[key]!;
      const cv = c.nouls[key]!;
      const off = measured(key, states[dirtyKey]!.artifact.source)
        ? ""
        : `   [below rung ${APPLIES_FROM[key]} ${LEVEL_NAME[APPLIES_FROM[key]!]}, where this rule starts]`;
      console.log(
        `  ${key.padEnd(28)} dirty=${dv.toFixed(4)} (${band(dv)})  clean=${cv.toFixed(4)} (${band(cv)})  gap=${(dv - cv).toFixed(4)}${off}`,
      );
    }
  };

  if (DUMP) return;                       // nothing was asked, so nothing to compare

  compare("JSON sample vs JSON sample", "dirty-json", "clean-json");
  compare("Declared type vs declared type", "dirty-ts", "clean-ts");
  compare("Declared schema vs declared schema", "dirty-schema", "clean-schema");
  compare("Split correlations vs joined", "split", "joined");
  compare("Duplicated fact vs written once", "duplicated", "once");

  // E8: no pairing — the real schema has no matched counterpart, so it is read
  // against the fixture's two declared types rather than against a control.
  const real = results["real-schema"]!;
  console.log("\n=== Real schema, read against the declared-type column ===");
  for (const key of NOUL_KEYS) {
    console.log(
      `  ${key.padEnd(28)} real=${real.nouls[key]!.toFixed(4)} (${band(real.nouls[key]!)})  bad=${results["dirty-ts"]!.nouls[key]!.toFixed(4)}  good=${results["clean-ts"]!.nouls[key]!.toFixed(4)}`,
    );
  }
});

Effect.runPromise(program.pipe(Effect.provide(Live)));
