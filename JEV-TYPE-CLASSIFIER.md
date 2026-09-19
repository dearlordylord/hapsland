# Type-shape classifier — Jev request design

Goal: find out which of the five rules in [`TYPE-DESIGN-RULES.md`](./TYPE-DESIGN-RULES.md) Jev can
answer about a data shape, when the request is the user's own source text and nothing else. Show
Jev a shape in any form — a JSON example, a TypeScript type, zod, Effect Schema, JSON Schema — and
get back a verdict per rule that survives.

A rule Jev cannot answer is recorded as such and excluded. Answering it another way — in code,
from a parse of the shape — is a different instrument and out of scope here.

Naming the fields at fault is **out of scope**. Every mechanism for it — a locator Choice, a
per-field Noul, a pair Noul — has to put field names into the request, and §1 does not allow
that. The output is about the shape as a whole.

Running example, given as a bare JSON sample named `SendMouseBody`:

```json
{ "id": "<session>", "agent": "<agent>", "x": 0.1, "y": 0.2, "button": "left",
  "clicks": 2, "to": { "x": 0.9, "y": 0.2 }, "modifiers": ["super", "shift"], "press": "down" }
```

Status: E0 through E27 have run — seven fixture artifacts across three rungs, one of them a
schema from another codebase, plus a 25-file scan of a real package and an outside review of the
question wordings.
Results are in [`JEV-EXPERIMENT-LOG.md`](./JEV-EXPERIMENT-LOG.md), which is the only file that
holds measurements. Numbers here are cost estimates or vendor figures.

What the runs establish so far:

- **Nothing is pre-converted.** The source goes to Jev verbatim; there is no normalizer in the
  request path (§1).
- **All nine rules work.** Each starts at a rung of the ladder in §4: rules 1 and 2 from a lone
  value, rule 5 from a declaration, since one example shows what a shape contains and not what it
  allows.
- **Rules 6 and 7 split primitive obsession in two, and are orthogonal.** Rule 6 asks whether a thing
  the domain names is carried as a bare primitive; rule 7 asks whether what a field, parameter or type
  is defined as admits values its own name rules out. A branded `LoanId` satisfies 6 and fails 7.
- **Rule 7 delegates, and each artifact is judged on its own.** A field typed by a name making the
  same claim sends the question to that type's declaration, which is judged by its own call: the
  consumer reads 0.20 and the alias reads 0.95. This is why the question covers a declared type and
  not only a field — the declaration delegation routes to is otherwise the one shape it misses (E38).
- **Rules 8 and 9 ask whether a callable says what it touches**, one from the name and one from the
  body, and neither can do the other's work: a name claiming only a computation hides a GPU from rule
  8, and an interface has no body for rule 9. Both are inert on data shapes.
- **A false criterion the artifact's notation cannot express has nowhere to land**, so the answer
  defaults to the violation. This is why rule 6 needs a storage exemption phrased as a criterion a
  table can satisfy, why rule 7 needs none at all — SQL can write `CHECK` — and why rule 7's
  delegation clause works where an instruction to disregard would not (§6, E35–E37).
- **The unclear band carries information.** A field typed by a name the artifact never defines reads
  near 0.50 because neither side is checkable from the text; inlining that type's definition moves the
  same cell to 0.24 or 0.77 according to what it says (E37).
- **Rule 3 works from rung 2.** Asked loosely it never reached `clear` on a good artifact, because
  every shape spreads something; asked as whether a part is settable without its partners, it
  clears them and reaches 0.86 on an artifact whose only fault is a split correlation.
- **Rule 4 works from rung 1**, and separates more evenly than any other rule: 0.85 between an
  invoice that stores a fact twice and one that writes it down once, at every rung.
- **Rule 1 is asked as a fault.** Both halves of its Question line are unreachable under §1 — one
  needs a field name in the answer, the other needs call sites — and the span question that
  survives stripping them is high for a well-tagged union and an untagged blob alike (§3). Asking
  what the shape can express instead separates them, and ranks rather than flags (§4).

## 0. Local setup

The recorded experiments originally called Jev through the vendored
`@distilled.cloud/typesafe-ai` wrapper. The runnable scripts now use the matched Effect 4 RC
integration: `Decision` / `DecisionModel` from `effect/unstable/ai` and
`@effect/ai-typesafe`. The vendor tree remains as an archival migration oracle, but it is no
longer a root workspace or production dependency. The structured Noul wording in this file is
rendered deterministically into the string fields accepted by `Decision.probability`.

```ts
import * as Effect from "effect/Effect";
import { Decision, DecisionModel } from "effect/unstable/ai";
import { Live } from "./src/jev-decision.ts";

const program = Effect.gen(function* () {
  const definition = Decision.make({
    input: StateSchema,
    decisions: { /* Decision.probability(...) entries */ },
  });
  const { answers, usage } = yield* DecisionModel.decide(definition, { input: state });
});

Effect.runPromise(program.pipe(Effect.provide(Live)));
```

Credentials come from `TYPESAFE_API_KEY` through `TypeSafeClient.layerConfig()`. The model is
pinned in the local layer to `jev-latest`. A working call lives in `src/hello.ts` —
`bun run hello`.

---

## 1. Decisions

**Cost does not grow with the field count at all.** Every question is about `artifact` as a
whole, so a 200-field schema costs exactly what its source text costs and not a token more. This
is a consequence of the next decision rather than a separate one: nothing per-field can be asked
without naming fields in the request.

**Nothing derived from the shape goes into a question — not even field names.** The locator
Choice this design was built around needs its options supplied, a per-field Noul needs its field
named in the text, and a pair Noul needs two. All of them are code reading the shape and putting
the result in front of Jev, and all of them are out. What this costs is the entire localization
half of the original goal: no ranked sites, no "which field", no pair analysis. What it buys is
a request that is the user's own text and nothing else, at any schema size.

**Aim for the most precise finding available, and let granularity go first.** Precision about
*whether* a shape breaks a rule is what this is for, and it is not traded away. How finely the
finding is located — this field, this pair, this record — is. When the only way to say something
sharper is to feed derived content back into the request, the coarser answer is the right answer,
and it is not a defeat to be worked around later. Do not push against the rule above: no
reintroducing names, paths, types or inventories to buy a more specific finding. A whole-shape
verdict that is honestly arrived at beats a field-level one that is not.

**Rules go in `criteria`, not in `state`.** The rule text is the judgment, and judgment belongs
in the question (JEV.md rule 5). The state holds only the thing being judged. That way one state
serves every question set, and only the question text grows.

**Nothing is pre-converted before it goes to Jev. Ever.** Whatever the user has — a JSON example,
a TypeScript type, a zod schema, a JSON Schema — goes into `artifact.source` verbatim, and that
is the whole of what Jev sees besides the file name. There is
no normalizer in the request path, and adding one is not a fix for a weak answer. Questions are
worded about `artifact` as a whole and never mention TypeScript, zod or JSON, so supporting a new
representation costs nothing at all.

This is measured, not assumed. On declared types a field inventory changes nothing: rule 5's gap
is identical with and without it, rule 3 moves 0.01, and dropping it cuts input tokens by 44%.

The inventory looked indispensable to rule 4 while the only artifact was the mouse fixture: its
one-row-per-field layout was what made "these two fields could contradict each other" visible
there, and without it the bad artifact fell 0.72 to 0.24. Against an invoice that carries
`lineCount` beside `lines`, the source alone separates 0.93 from 0.07. What the inventory supplied
was not information the text lacked but a fault the fixture did not have.

**Rule 1 is asked as a fault, not as its Question line.** That line asks two things: can a reader
name the variant from one field, and does adding a variant break every consumer at compile time.
The first needs a field name in the answer, which §1 does not allow out any more than in; the
second needs call sites, which the state does not hold. Strip both and what is left is "does this
shape span several operations", the rule's premise rather than the rule — a virtue in a union,
and it scores the good artifacts above the bad one. Asking instead what the shape forces on a
reader — must the case be recovered from which fields happen to be present — keeps the rule
inside §1 and inverts nowhere. §3 has the forms tried and what each measured.

The working set is all five rules.

**The file name goes in the state.** A finding only counts when you can point at a
value "the type allows and the domain does not" (TYPE-DESIGN-RULES.md, closing paragraph).
Whether `clicks: 2` next to `press: "down"` is wrong is a question about mice, not about shapes.
With no domain, Jev answers from its own weights, which JEV.md rule 5 forbids. E3 checks how much
the name alone is doing.

**A lone value is weaker evidence than a declaration, and code reads which it has off the text.**
One example cannot show what is optional, what the alternatives are, or what can be null. Rules 3
and 5 ask what the shape *allows* in ways only a declaration answers: r5's gap on a value is 0.00
against 0.47 on a declaration (E15, E16), and r3's is 0.07 against 0.56 (E28). Rules 1, 2 and 4
read a value — a record that mixes several operations, a field set where it means nothing, a count
beside the list it counts are all visible in one inhabitant. So a rule is not simply on or off:
each starts at a rung, and reporting it below that rung is reporting noise.

**Anything that depends on the calling code is out of scope.** Rules 1 and 5 ask about consumers
— "every consumer matches exhaustively", "name the consumer that behaves differently on absent
versus empty". No call sites are supplied here, so every question is worded about the shape alone
and the consumer half is left to a person. Asking about consumers with none in the state gets a
plausible answer about nothing (gotcha 20).

**Bad is `true`.** Every Noul is worded so `1.0` means *violation*. That lets `max` aggregate them
and makes the SDE-cascade verifier rules apply (narrow, grounded, `max` not mean). A Noul whose
`1.0` means something short of a violation does not belong in the set: rule 1's span question is
the one such case, and §3 records what it measured. Its fault form carries the rule instead.

---

## 2. State

This is all of it: the text, and the file it came from.

```ts
type ClassifierState = {
  artifact: {
    domain: string;                // the file name — "send-mouse-body.ts"
    source: string;                // the text, exactly as it stands
  };
};
```

A linter has a path and a buffer, so those are the two fields. `domain` carries the file name
because that is the only description of the subject matter anybody can produce while typing, and
r2's `instructions` point at it by name.

The target is a linter that sends edits as they happen. Nothing upstream says what the text is —
a JSON payload, a TypeScript type, a Zod schema and a half-written union all arrive as characters,
and all are delivered the same way. E15 measures the cost of that: with `source` alone the
declared-type gaps are r2 0.59 and r5 0.47, both at or above what a full description buys them.

A written domain line is therefore optional, and the file name stands in for it. What a sentence
adds lands on instruments that read the label rather than the shape (§4, E15, E16).

A field inventory — one row per path, with type and optionality — was part of this design and is
not any more. On declared types it changed no answer worth the tokens; on samples it carried one
rule that has no other home. §1 has the measurements and what dropping it costs.

With rules 1 and 4 dropped, no parser is required anywhere. `source` goes to Jev as the user
supplied it, and code reads nothing out of it.

Size: the example artifact is ~250 tokens. A 200-field schema is however long its source is —
a few thousand tokens — well inside the 32k budget, and questions are what grow after that.

---

## 3. Question sets

One question set. E1 (locators plus per-field Nouls) and E2 (a pair pass) were the localization
half of this design and are not built: every question in them names fields in the request, which
§1 forbids.

| | Questions | Cost in N fields | Output |
|---|---|---|---|
| **E0** conformance | 2 | flat | one probability per rule |

### E0 — two Nouls

Each Noul restates a rule's **Question** line as one snap judgment, inverted so `1.0` is a
violation. A worklist ranks on the worst of them.

### Rule 1 — excluded, with three forms recorded

Three forms were tried. All three are recorded here so none gets tried again.

*As a single Noul — dead.* Asking "does this hold values that mean different things, with no
field naming which" fuses an open-ended question with a negative claim. Measured 0.26 on the bad
artifact against 0.06 on the good one: the weakest of the five rules, far short of the
≥0.80 / ≤0.20 separation predicted. Neither wording knob rescued it — dropping `focus` moved it
0.12, dropping `inspect` moved it 0.03, and the noise floor is 0.06. Do not reinstate it in any
wording; the fault is the question's shape, not its words.

*Split into two — wrong answers, which is worse.* The split is sound in principle: ask whether
the record covers several operations, ask separately which field names the kind, and require
both. On the bad *sample* it behaves, returning `none`. On the bad *declared type* the Choice
picks **`button`** — typed `"left" | "right" | "middle"`, which looks exactly like a discriminant
— and the rule then clears the very artifact it exists to catch. Reproduced across runs at
p≈0.50. The question asks which field names the kind, but never asks whether the kinds it names
are the ones that matter, so any string-literal union can acquit a record.

*Split in half, keeping only the span Noul — measures nothing.* With the locator gone, what is
left asks whether the shape spans two or more operations. That is the rule's premise, not the
rule: a correctly tagged union spans several operations and is right to. It scores the good
fixture type 0.97, a real tagged Effect Schema 0.96, and the untagged bad type 0.83 — the good
artifacts *above* the bad one. As a standalone verdict it is worse than useless, and no wording
fixes a question that is not the rule.

**So rule 1 is excluded.** Both halves of its Question line are out of reach here: "can a reader
name the variant by looking at one field" needs a field name, which cannot enter the request (§1)
and cannot come back in a whole-shape verdict; "does adding a new variant break every consumer at
compile time" needs call sites, which the state does not hold. Two of the rule's four signals are
consumer-side for the same reason.

A structural check in code — read the field list, find the field whose literals partition the
variant groups — does answer it, and correctly on the fixture. It is not a Jev question, it needs
a parser the request path does not otherwise need, and it is a different instrument from the one
being measured. Out of scope, not deferred.

Every question below is about `artifact` as a whole.

```ts
const E0 = {
  // The focus clause must exonerate conditionality the shape expresses. Asking only "is a
  // field meaningful only under a condition" describes a correctly tagged union exactly as
  // well as an untagged record, and scored both as violations — 0.84 against 0.79, a gap of
  // 0.05. What separates them is whether the shape *allows* the meaningless combination, not
  // whether a conditional field exists. It reads from rung 1 (§4, APPLIES_FROM).
  r2_meaningless_combinations: noul({
    question: "Does `artifact` let a field be set in combinations where that field has no meaning, because the shape makes it settable independently of whatever gives it meaning?",
    focus: "A conditional field is correctly constrained when the shape makes it reachable only where its condition holds — inside one union member, or beside a discriminant that rules the combination out. The finding is a conditional field the shape leaves settable everywhere.",
  }, {
    // Examples name combinations, not fields, and come from domains the fixture does not
    // touch. The bar is a value the shape admits and the domain does not: a field that
    // simply goes unread in some combination is not one, which is what the `false` side's
    // retry example says. E13: the good type falls 0.37 → 0.29 and the real schema
    // 0.30 → 0.25, both into `clear`; the bad type holds at 0.86.
    true:  { what: "At least one combination the shape admits has no meaning in the domain, and nothing in the shape rules it out",
             examples: ["a status of `pending` carried alongside a `deliveredAt` timestamp",
                        "`authenticated: false` beside a populated `userId`",
                        'a `selections` list beside a `kind` that has a `"single"` value, so two selections can sit next to `"single"`',
                        "a discount typed `free_shipping` that also carries `percentOff: 30`"] },
    false: { what: "No field can be set where it means nothing",
             examples: ["the backoff schedule lives inside the `retrying` variant, so a policy with no retries cannot carry one",
                        "`cancelledAt` exists only on the `cancelled` case of the status union",
                        "a job is either `{ schedule: Cron }` or `{ at: Instant }`, never both and never neither"] },
  }),

  // r3_split_correlations, dropped. Wording as measured:
  //   question: "Does `artifact` spread facts that are only correct together across separate
  //              fields, or give one concept two different shapes?"
  //   true:  components of one concept as sibling fields, or one concept flat in one position
  //          and nested in another — examples `x`/`y`, `amount` beside `currency`
  // It never reached `clear`: 0.59 on the good fixture type, 0.35 on a real schema with nothing
  // to find, 0.34–0.76 across 25 files of a real package. See §4.

  r4_duplicate_encoding: noul({
    question: "Can two parts of `artifact` state the same fact, and therefore disagree?",
  }, {
    true:  { what: "Two fields overlap in what they express, or one is computable from another in the same shape",
             examples: ["a count beside the collection it counts", "a list of active items beside a per-item active flag"] },
    false: { what: "Each fact is encoded once" },
  }),

  r5_absence_confusion: noul({
    question: "Does `artifact` offer two encodings of one state, or collapse two states that the domain distinguishes, around missing values?",
    focus: "\"Not supplied\", \"known to be nothing\", and \"known to be empty\" are three different facts.",
  }, {
    true:  { what: "An optional collection whose absence and emptiness mean the same thing, or a field where undefined, null and empty are all reachable" },
    false: { what: "Collections are required and emptiness carries the nothing meaning, or absence has its own named meaning" },
  }),

  // shape_risk, a four-level Score, is not asked. Its levels are four different rules
  // on one ordered axis — level 3 is rule 1, level 2 is rule 2, level 1 is rule 3 or 5
  // seen locally — so climbing it switches which rule is under discussion, and it
  // carries a severity ordering and a mutual exclusivity nothing has measured: a shape
  // whose only fault is rule 5 cannot reach level 2. E17 has what its ranking was worth.
};
```

### Localization — not built

Rules 2 to 4 each implicate *two* fields, and rule 5 is per-field by construction, so saying
which field is at fault was always going to need field names in the request: as Choice options
for a locator, or inside the text of a per-field or per-pair Noul. §1 rules that out, so the
output is one verdict per rule and no sites.

Two things that were designed for this and are worth keeping in mind if the decision is ever
revisited: locator probabilities are a ranking conditioned on a fault existing and must never be
thresholded or compared across artifacts; and a locator's top choice can be confidently wrong in
a way that reads as a clean verdict, which is how rule 1 came to clear the bad artifact by
selecting `button` (§3).

Rule 5's verdict was to be `factsDistinct !== encodingsOffered`, with the model supplying the
first term per field and code counting the second. Without per-field questions it stays a
whole-shape judgement, which is what `r5_absence_confusion` asks.

---

## 4. Reading the answers

```ts
// self-consistency cookbook bands; nothing is calibrated yet, so route the middle to a human
const band = (p: number) => p > 0.70 ? "violation" : p < 0.30 ? "clear" : "unclear";

// Every rule is asked of every text. What separates them is how much the text shows,
// which is a property of the characters, so code computes it — no caller supplies it,
// and the request is identical at every rung.
//
//   1 raw     one value: which fields this inhabitant carries and what they hold
//   2 typed   a declaration: which fields the shape admits, and which are optional
//   3 schema  a declaration plus enforced refinements: ranges, non-empty, literals
const levelOf = (source: string): 1 | 2 | 3 => {
  try { JSON.parse(source); return 1; } catch {
    return /\bSchema\.(Struct|Union|Literal|Array|optional)\b|\bz\.(object|union|discriminatedUnion|array)\b/
      .test(source) ? 3 : 2;
  }
};

// The rung a rule starts working at. A floor, because each rung shows what the ones
// below it show. Gaps, bad − good (E19): r2 0.24 / 0.59 / 0.68, r5 0.06 / 0.43 / 0.29.
// Rules 6 to 9 start at 2: branding, refinement, a signature and a body are all
// invisible in a value, so each pair's halves serialize to the same JSON (E34, E36).
const APPLIES_FROM = { r2: 1, r5: 2, r6: 2, r7: 2, r8: 2, r9: 2 } as const;

for (const rule of ["r2", "r5"] as const) {
  report(rule, band(E0[rule].noul),
    levelOf(source) >= APPLIES_FROM[rule]
    ? "measured"                                              // a verdict, no sites
    : "below the rung this rule starts at");
}
```

How much the text shows is the sharpest lesson from the runs, and the floor is a label rather
than a gate. A rule read below its rung does not go quiet — r4 on a declared type scores the bad
artifact *below* the good one, so a number that looks like a verdict can point the wrong way. r5
on a lone value is the live case: its gap there is 0.00.

The ladder does not reach rules 8 and 9. One needs a callable and the other needs a body, and a rung
distinguishes raw from typed from schema and nothing else. Both sit at 2 because that is where a
declaration appears, and the floor holds them only because each is quiet rather than wrong on a shape
with neither — 0.04 across nine data shapes and schemas (E37).

Nothing in the ladder is a ceiling, and one rule is known to need one: rule 1's span form
separates the samples by 0.30 and *inverts* on declarations, −0.16, because a tagged union spans
several operations by design. A rule with a range rather than a floor needs a table this one
cannot write, and the ladder stays a floor until such a rule is measured in.

**Rule 1 reads the strength of the fault.** On a shape whose cases have disjoint field groups it
reaches 0.76 against 0.03 for the same shape as a tagged union — the widest separation any rule
here produces. On one whose cases share their required fields, as a mouse command shares `x` and
`y`, it reads 0.52–0.61 and stays `unclear` however the question is worded (E22, E23) and whatever
the file name says (E24). Both readings are honest: fields shared across cases are the weaker form
of the fault, and a shape can be read as one meaning with attributes until the groups come apart.

Use `max` within a rule, never mean: a violation is reportable when *one* bad value can be named,
and averaging 36 clean fields buries the one dirty one. Do not combine rules into a weighted
score — a weighting would claim an accuracy nothing has measured. Report each rule's probability
and its ranked sites, and add a combined number only once there are labelled artifacts to fit it
against.

A worklist needs one number per file, and it is the worst rule — `max` over the Nouls, for the
reason above. A file where r2 reads 0.73 and r5 reads 0.49 ranks on 0.73.

---

## 5. Fixture

Four artifacts, arranged so that any comparison changes one thing at a time.

| | JSON sample | Declared type |
|---|---|---|
| **bad shape** | `SendMouseBody`, the original blob | `SendMouseBody` written out as a type |
| **good shape** | one `click` command as JSON | `PointerCommand`, the union below |

Compare down a column and the only difference is whether the shape is well designed. Compare
across a row and the only difference is how much the evidence shows. Earlier runs had only the
diagonal — bad sample against good type — so their gaps mixed the two, and none of them separate
design quality from evidence level.

A bad artifact on its own can only show that Jev detects something; a model that answers
"violation" to everything scores perfectly on it. The good artifacts are what show whether it
tells them apart.

### Bad — `SendMouseBody`

| Site | Rule | Expected | The value that shows it |
|---|---|---|---|
| whole record | 1 | violation — **no working question** (§3) | move / click / drag / key-hold in one flat record, told apart by which fields are set |
| `press` ↔ `clicks` | 2, 4 | violation | `{clicks: 2, press: "down"}` — finished clicks beside a half-press |
| `to` ↔ `button` | 2 | violation | `{to: {...}, button: "left", clicks: 2}` — a drag target on a double-click |
| `x`/`y` vs `to` | 3 | violation | one concept, flat in one place and nested in the other, no shared type |
| `x` ↔ `y` | 3 | violation | changing `x` alone compiles and means a different point |
| `modifiers` ↔ `press` | 4 | violation | a held-key set and a key transition can disagree about `super` |
| `modifiers` | 5 | needs the declared type | one sample cannot show whether absent and empty are both reachable |
| `id`, `agent` | all | clear | independent identifiers |

Rules 3 and 5 are only askable of the declared-type version; see `APPLIES_FROM` in §4.

The declared-type version of this artifact is written by hand, and which fields are marked
optional is a judgement made in the writing. A different transcription could move that whole
column, so treat results on it as weaker than results on the sample.

### Good — the same domain, restructured

```ts
type Point = { x: Unit; y: Unit };                 // Unit = number in [0,1]
type Target = { session: SessionId; agent: AgentId };
type PointerCommand = Target & (
  | { kind: "move";     at: Point }
  | { kind: "click";    at: Point; button: Button; clicks: PositiveInt; modifiers: Modifier[] }
  | { kind: "drag";     from: Point; to: Point; button: Button; modifiers: Modifier[] }
  | { kind: "key_hold"; keys: NonEmpty<Modifier>; transition: "down" | "up" }
);
```

The sample version is one `click` command: `{ session, agent, kind: "click", at, button, clicks,
modifiers }`.

Rules 2 and 5 expect `clear` on both good artifacts.

**Nothing code writes about the shape is neutral.** When a field inventory was still sent, writing
variant membership as a sentence — "present on kind click and drag only" — repeated r2's own
wording inside the state and measurably pushed the good artifact worse on rules 3, 4, 5 and the
Score. The inventory is gone and that failure mode with it, but the lesson holds for anything code
ever puts in front of Jev.

If a run disagrees with a row here, fix the criteria wording, not the expectation — and re-check
the rewrite on artifacts outside this fixture (gotcha 14).

---

## 6. Experiments, in order

Full numbers are in the log; this is what each run settled.

**E0 — run.** The prediction was that one question, rule 1 as a single Noul, would open a
≥0.8 / ≤0.2 gap, and that nothing downstream was worth building if it did not. It did not, at
0.26 against 0.06.

**E2b — run.** Rewording r2 to exonerate conditionality the shape expresses moved the good
artifact from 0.79 to 0.25 while the bad one stayed at 0.82. Because r2 was the only change, the
other eight questions acted as a repeat on identical input, which put **noul movement inside
0.06** — the working noise floor, and the reason nothing smaller counts as a result.

**E3, ablation — run**, with the name replaced and the domain line emptied. Rules 2 to 5 held or
widened their gaps, so what they detect is the shape rather than the label. The exception is the
Score, whose gap shrank by a third, making it the most label-dependent instrument here. Note this
ran on the old two-artifact fixture, so it inherits that confound.

**E4, the full 2×2 — run**, and it revised most of what came before. Comparing like with like:

- **Rule 1 gets a wrong answer on the bad declared type**, twice. The Choice picks `button`
  because a string-literal union looks like a discriminant, and the rule then clears the artifact
  it exists to catch. See §3.
- **Evidence level moves the rules as much as design does** — r2 and r5 separate on a declared
  type and not on a sample; r4 separates on samples and inverts on this fixture's types, which is a
  property of a fixture with nothing for it to find (E31). §4's `APPLIES_FROM` holds each rule's
  floor.
- **Every earlier gap was inflated by the format.** All of them compared a bad sample against a
  good type. r2's gap is 0.63 like-for-like on types and 0.05 like-for-like on samples; the 0.57
  from E2b sat between the two because it was measuring both things at once.

**E8, a real schema — run.** An Effect Schema from another codebase, added as a fifth artifact:
a tagged union of four operations nested under one `operation` key. Rules 2 and 5 clear it, more
cleanly than they clear the hand-written good type; r3 lands at 0.34, `unclear`, on an artifact
with nothing for it to find; the Score reads it as good at 0.33. The span Noul scores it 0.96,
against 0.97 for the good fixture type and 0.83 for the bad one, which is what settled rule 1's
exclusion. The fixture does not flatter the questions.

**E10, ablation on the 2×2 — run.** Name replaced, domain emptied. The label is worth ~9% of the
Score's gap, not the third E3 reported on the confounded pair, and the order is unchanged. r5 is
better without a domain line. So a ranking needs no domain lines at all.

**E11, a ranked worklist — run.** 25 files of a real package, each sent whole and verbatim, sorted
by the Score. Both ends of the ranking are right against a reading of the files, and the order
reproduces across runs. Nothing reached severity 2: a file holding a dozen schemas is judged as
one shape, so a bad schema among clean siblings averages down.

**E12, r3 dropped — run.** Two rules and the Score. §4 has the numbers.

Localization is out of scope (§1), so E1 and E2 are not built.

---

## 7. Budget

State is just the artifact now: ~250 tokens for the example, and for a 200-field schema whatever
its source runs to — a few thousand. E0 adds ~600 question tokens and sends no field list at all,
which measured 1297 input tokens on the good type against 2332 when an inventory was still
attached.

Nothing scales with the field count, so a 200-field schema costs its source text plus the same
~600 question tokens — a few thousand in total, well inside the 32k budget.

Latency: the vendor's measured multi-question calls (8–14 questions) are 111–114ms, and E0 is
three questions plus a Score.

---

## 8. Risks

- **A rule asked at the wrong evidence level does not go quiet.** It returns a confident-looking
  number that tracks nothing, and it can point the wrong way: r4 scores the bad declared type
  *below* the good one. This is the most dangerous failure here, because nothing in the answer
  marks it. `APPLIES_FROM` in §4 is the only guard.
- **A Choice always picks something, and it can pick wrongly.** Its probabilities are a ranking
  conditioned on a fault existing; they mean nothing on their own and shrink as the option count
  grows. Worse, the top choice itself can be wrong in a way that reads as a clean verdict: asked
  which field names the kind, it selected `button` on an artifact with no discriminant, because a
  string-literal union looks like one, and the rule then cleared the artifact it existed to catch.
  Never threshold a Choice probability, and never let one clear an artifact.
- **A question that is the premise of a rule reads like the rule and is not.** The span Noul asks
  whether a shape covers several operations, which every well-designed tagged union does. It
  returns a confident number, it moves between artifacts, and it ranks the good ones above the
  bad. Nothing in the answer says it is measuring the wrong thing; only comparing a good artifact
  against a bad one does. Check each Noul against the artifact that should *clear* it.
- **Anything code puts in front of Jev is read as evidence.** This is why the source now goes
  verbatim. When a field inventory was still sent, a `constraints` line whose wording echoed a
  rule's own phrasing scored as that rule. If a path list is ever added for locators (§1), the
  same caution applies to how those names are chosen.
- **A question that names a pattern finds that pattern; a question that asks for a negative gets a
  shrug.** r2, when it said "look for a field meaningful only under a condition", fired on a
  correctly tagged union nearly as often as on a flat record. Rule 1's single Noul, saying "and no
  field names the kind", would not commit on the artifact that most clearly breaks it. Prefer searching
  for the thing that would clear the artifact over asserting that it is absent, and write criteria
  that can come back false.
- **Answers move between runs, so small differences are not results.** Nouls stay within 0.06 on
  identical input; locator probabilities move about twice that while the chosen option stays put.
  The vendor's own repeat study found judgment-heavy questions the least stable kind, and these
  rules are judgment-heavy. The 0.30/0.70 bands carry that, and the middle goes to a person.
- **A four-artifact fixture is not calibration.** It can show a gap opens; it cannot fix a
  threshold. Bands stay at 0.30/0.70 until there is a labelled set to fit them against. Two of the
  four artifacts were also written by hand for this fixture, so they show what the design *can*
  separate, not what it will meet in real input.

---

## Unresolved

1. Is r2's mid-band reading on clean flat records — 0.42 to 0.71 where a tagged union reads
   0.12 — reducible by wording without costing the bad side? Every clean artifact that reads low
   is a union, and most types in a codebase are flat records.
2. Are r3 and r5 fixable below their rung by rewording, or is each one inherently a question
   about something only a declaration shows? If inherent, a raw sample simply has fewer rules
   available, and that belongs in the output.
3. Each rule has one pair that isolates it — greenhouse for r1, mount for r2, quote for r3,
   invoice for r4, hive for r5. Whether a rule tuned on its own pair still behaves on artifacts
   that break several rules at once is untested.
4. How many artifacts before the bands mean anything — is five enough to start, or does the first
   real use need a labelled corpus?
