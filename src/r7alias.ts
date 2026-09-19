/**
 * E38 — does the call that judges the alias catch it?
 *
 * Rule 7 delegates: a field typed by a name making the same claim sends the question to
 * that type's own declaration. That is only sound if the declaration, judged as its own
 * artifact, fires — and rule 7 asks about "a field or parameter", which a type alias is
 * neither. Two wordings: the rule as adopted, and the same naming a declared type as a
 * third thing the question covers.
 *
 *   bun run src/r7alias.ts
 */
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";
import { decide, Live, probability } from "./jev-decision.ts";

import { E0 } from "./questions.ts";

const r7 = E0.r7_name_wider_than_type;

/** The adopted rule with "or a declared type" added to the question and one example. */
const R7_ALIAS = probability(
  {
    question:
      "Does `artifact` declare a field, a parameter, or a type whose own name states what it holds, while its declared type or definition still admits values that name rules out?",
    focus:
      "Breadth is not the finding. A type is right to be broad where the domain really accepts anything: free text, a note, a comment. The finding is a name that makes a claim — a count, a price, a duration, a URL, a file extension, a code, a percentage — carried by a definition that admits values contradicting the claim: the empty string where a code is meant, a negative or fractional value where a count is meant, any text at all where one of a few spellings is meant. A named type is judged the same way as a field: the name makes the claim and the definition either holds it or does not. The notation in use must be able to say it: a refinement, a constraint, a narrower type, a union of the values actually allowed.",
  },
  {
    true: {
      what: "A field, parameter or type name states what it holds, and what it is defined as admits values that contradict the name",
      examples: [
        "a field named for a code or an identifier typed as text, so the empty string is admissible",
        "a count or a quantity typed as a general number, so negative and fractional values are admissible",
        "a field named for a link typed as text, so any text at all is a link",
        "a field named for one of a few known values typed as text, so any spelling is admissible",
        "a type named for an identifier defined as plain text, so the empty string inhabits it",
        "a type named for a count defined as a plain number, so negatives inhabit it",
      ],
    },
    false: {
      what: "Each name's declared type or definition admits only what the name claims, or the name claims nothing more than the definition already says, or the claim is delegated: the declared type is itself a name stating the same claim, so this question applies to that type's declaration rather than here",
      examples: [
        "a code is a type refined to reject the empty string",
        "a count is a type refined to whole numbers not below zero",
        "a set of known values is a union of exactly those values",
        "a column carries a constraint stating the values it accepts",
        "free text such as a title or a body is typed as text, because any text is genuinely allowed",
        "a duration named `term` typed `Days`, a rate named `rate` typed `FeePerDay` — the type's own name carries the claim, and whether it is refined is settled where that type is declared",
      ],
    },
  },
);

type Case = { label: string; domain: string; want: string; source: string };

const CASES: Case[] = [
  {
    label: "the delegation target, bare",
    domain: "catalog-types.ts",
    want: "fire",
    source: `export type Sku = string;
export type PriceCents = number;
export type StockCount = number;`,
  },
  {
    label: "the delegation target, branded but unrefined",
    domain: "catalog-types.ts",
    want: "fire",
    source: `export type Sku = string & Brand.Brand<"Sku">;
export type PriceCents = number & Brand.Brand<"PriceCents">;
export type StockCount = number & Brand.Brand<"StockCount">;`,
  },
  {
    label: "the delegation target, refined",
    domain: "catalog-types.ts",
    want: "clear",
    source: `export const Sku = Schema.NonEmptyString.pipe(Schema.brand("Sku"));
export const PriceCents = Schema.Int.pipe(Schema.greaterThanOrEqualTo(0), Schema.brand("PriceCents"));
export const StockCount = Schema.Int.pipe(Schema.greaterThanOrEqualTo(0), Schema.brand("StockCount"));`,
  },
  {
    label: "falsifier — an alias that is honestly free text",
    domain: "note-types.ts",
    want: "clear",
    source: `export type NoteBody = string;
export type NoteTitle = string;`,
  },
  {
    label: "the consumer that delegates",
    domain: "catalog-item.ts",
    want: "clear (delegated)",
    source: `import type { Sku, PriceCents, StockCount } from "./catalog-types.ts";

export type CatalogItem = {
  sku: Sku;
  priceCents: PriceCents;
  stockCount: StockCount;
};`,
  },
  {
    label: "guard — a bare consumer, nothing to delegate to",
    domain: "catalog-item.ts",
    want: "fire",
    source: `export type CatalogItem = {
  sku: string;
  priceCents: number;
  stockCount: number;
};`,
  },
];

const REPEATS = 3;

const program = Effect.gen(function* () {
  const rs = yield* Effect.forEach(
    CASES.flatMap((c) => Array.from({ length: REPEATS }, () => c)),
    (c) =>
      Effect.gen(function* () {
        const { answers } = yield* decide({
          state: { artifact: { domain: c.domain, source: c.source } },
          decisions: { r7, r7a: R7_ALIAS },
        }).pipe(Effect.retry({ times: 4, schedule: Schedule.exponential(2000) }));
        process.stderr.write(".");
        return {
          c,
          r7: answers.r7.probability,
          r7a: answers.r7a.probability,
        };
      }),
    { concurrency: 4 },
  );
  process.stderr.write("\n");

  console.log("adopted  +types      Δ   want              artifact");
  for (const c of CASES) {
    const mine = rs.filter((r) => r.c.label === c.label);
    const avg = (f: (r: (typeof mine)[number]) => number) =>
      mine.reduce((s, r) => s + f(r), 0) / mine.length;
    const a = avg((r) => r.r7);
    const b = avg((r) => r.r7a);
    console.log(
      `  ${a.toFixed(3)}   ${b.toFixed(3)}  ${(b - a >= 0 ? "+" : "") + (b - a).toFixed(2)}   ` +
        `${c.want.padEnd(16)}  ${c.label}`,
    );
  }
});

Effect.runPromise(
  program.pipe(Effect.provide(Live)),
);
