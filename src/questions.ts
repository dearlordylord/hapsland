/**
 * The original E0 question set and the state it judges. Historical classifier
 * rationale and fixture runs are retained in the private Hapsland research archive.
 * Changes here affect the bundled production Noul pack and need semantic evaluation.
 */
import { probability } from "./jev-decision.ts";

export type ClassifierState = {
  artifact: {
    /** The file the text comes from. All a linter knows about what it is holding. */
    domain: string;
    /** The text, exactly as it stands. */
    source: string;
  };
};

/**
 * What the text can show, read off the characters alone. Three rungs, each showing
 * everything the one below it shows and more:
 *
 *   1 raw     — one value. Which fields this inhabitant carries, and what they hold.
 *   2 typed   — a declaration. Which fields the shape admits, and which are optional.
 *   3 schema  — a declaration plus the refinements it enforces: ranges, non-empty,
 *               literals, the constructors that make a state unreachable.
 *
 * Native code computes the rung from source text; the source-free rung number is
 * sent to Bend for the rule applicability comparison.
 */
export type Level = 1 | 2 | 3;

export const LEVEL_NAME: Record<Level, string> = {
  1: "raw",
  2: "typed",
  3: "schema",
};

const DECLARES_A_SCHEMA =
  /\bSchema\.(Struct|Union|Literal|Array|optional)\b|\bz\.(object|union|discriminatedUnion|array)\b/;

export const levelOf = (source: string): Level => {
  try {
    JSON.parse(source);
    return 1;
  } catch {
    return DECLARES_A_SCHEMA.test(source) ? 3 : 2;
  }
};


export const E0 = {
  // Rule 1 asked as a fault rather than as its premise. Its Question line is out of
  // reach — one half wants a field name in the answer, the other wants call sites —
  // and the premise that survives stripping them, "does this shape span several
  // operations", is a virtue in a union: it scores the good artifacts above the bad
  // one, 0.97 / 0.96 / 0.83. Asking instead what the shape can express inverts nothing
  // and clears every good artifact at 0.03–0.11 (E22). The wording is r2's — what the
  // shape admits, not what a reader must do — which is worth 0.10 on the bad side at no
  // cost to the good one, where a tighter focus line and closer examples both cost (E23).
  r1_inferred_case: probability(
    {
      question:
        "Can `artifact` express values that mean different operations of the domain in `artifact.domain`, with no field of the shape naming which one a value is?",
      focus:
        "A shape with exactly one meaning has no cases to tell apart, and its optional fields are independent attributes of that one meaning. The finding is a shape whose instances mean different things with nothing naming which.",
    },
    {
      true: {
        what: "Instances mean different things and the case is recoverable only from which fields are present or absent, a flat record whose optional fields belong to different operations included",
        examples: [
          "a delivery record carrying `emailAddress` and `phoneNumber`, either absent, where whichever is filled decides how it is sent",
          "a payment holding both `cardLast4` and `bankAccount`, with the caller told to fill one",
          "an event that is a signup when `referrer` is there and a login when it is not",
          "a union of `string | { x: number; y: number }` distinguished only by which type arrived",
          "a report request where `month` alone means one month, `from` with `to` means a custom range, and nothing states which was intended",
        ],
      },
      false: {
        what: "One field names the case and each case's own fields sit with it, or the shape has a single meaning whose fields are independent attributes of it",
        examples: [
          '`{ tag: "ok", value } | { tag: "error", message }`, read by looking at `tag`',
          "each member of the union opens with a literal naming it, and carries only its own fields",
          "a customer record whose optional `nickname` and `phone` are attributes of one meaning rather than alternative modes",
        ],
      },
    },
  ),

  r2_meaningless_combinations: probability(
    {
      question:
        "Does `artifact` let a field be set in combinations where that field has no meaning, because the shape makes it settable independently of whatever gives it meaning?",
      focus:
        "A conditional field is correctly constrained when the shape makes it reachable only where its condition holds — inside one union member, or beside a discriminant that rules the combination out. The finding is a conditional field the shape leaves settable everywhere.",
    },
    {
      // Examples are drawn from domains the fixture does not touch, and each names a
      // combination rather than a field: the finding is a value the shape admits and the
      // domain does not, so "a field goes unread here" is not one. The `false` examples
      // are the same situations repaired by a variant.
      true: {
        what: "At least one combination the shape admits has no meaning in the domain, and nothing in the shape rules it out",
        examples: [
          "a status of `pending` carried alongside a `deliveredAt` timestamp",
          "`authenticated: false` beside a populated `userId`",
          'a `selections` list beside a `kind` that has a `"single"` value, so two selections can sit next to `"single"`',
          "a discount typed `free_shipping` that also carries `percentOff: 30`",
        ],
      },
      false: {
        what: "No field can be set where it means nothing",
        examples: [
          "the backoff schedule lives inside the `retrying` variant, so a policy with no retries cannot carry one",
          "`cancelledAt` exists only on the `cancelled` case of the status union",
          "a job is either `{ schedule: Cron }` or `{ at: Instant }`, never both and never neither",
        ],
      },
    },
  ),

  // Rule 3 bounded the way r2 was. Asked loosely — does the shape spread facts that are
  // only correct together — it never reached `clear` on a good artifact, because every
  // shape spreads something: 0.39 on the good fixture type and 0.42 on a real schema with
  // nothing to find. Asking whether a part can be *set without its partners* clears those
  // at 0.16 and 0.22 and puts an artifact whose only fault is a split correlation at 0.86
  // (E28).
  r3_split_correlations: probability(
    {
      question:
        "Does `artifact` let one part of a fact be set without the parts it is only correct with, because the shape keeps them in separate fields instead of one value?",
      focus:
        "Fields that are independent attributes of one thing are not the finding. The finding is a group that must move together to stay correct — a quantity and its unit, the two ends of a range, the coordinates of a point — which the shape lets be supplied or changed one at a time. A part that is already meaningful on its own is not half of a fact, however closely it goes with its neighbours.",
    },
    {
      true: {
        what: "Two or more fields carry parts of one fact, and the shape lets one be set without the others",
        examples: [
          "an `amount` beside a `currency`, so a number can arrive in no currency at all",
          "`latitude` and `longitude` as separate optional fields, so half a position is representable",
          "`startedAt` and `endedAt` side by side, either settable without the other",
          "a `value` beside a `unit` and a `scale`, each reachable on its own",
        ],
      },
      false: {
        what: "Parts that are only correct together arrive as one value, or each field carries something that means what it says on its own",
        examples: [
          "money is one `{ amount, currency }` value, constructed together and passed whole",
          "a period is one `{ from, to }` value, so an end never exists without its start",
          "a position is a `Point`, not two loose numbers",
          "a `widthMm` and a `heightMm` on one label, each a measurement that means what it says without the other",
        ],
      },
    },
  ),

  // Rule 4, bounded the way r2 and r3 were: the finding is not that two fields
  // correlate but that a value can contradict itself. It was dropped on the mouse
  // fixture, which has almost nothing for it to find; against a pair built for it the
  // separation is 0.85 at every rung, and every clean control reads 0.11-0.14 (E31).
  r4_duplicate_encoding: probability(
    {
      question:
        "Can a value of `artifact` carry one fact twice over and have the two copies disagree, because the shape stores it in more than one place?",
      focus:
        "Fields that happen to correlate are not the finding. The finding is a fact the shape lets be written down twice, so nothing stops one copy from saying something the other contradicts.",
    },
    {
      true: {
        what: "One fact is reachable through two fields at once, and the shape admits values where they disagree",
        examples: [
          "a `birthDate` beside an `age`, either settable, so a value can claim an age its date denies",
          "a `lines` list beside a `lineCount`, which nothing keeps in step",
          "`priceCents` beside a `priceLabel` string that spells the same price out",
          "a `path` beside a `directory` and a `fileName` that repeat its parts",
        ],
      },
      false: {
        what: "Each fact is written down once, and anything else that depends on it is derived rather than stored",
        examples: [
          "a `birthDate` alone, with age computed where it is needed",
          "a `lines` list alone, its length read from the list",
          "one `price: Money` value, formatted at the edge that displays it",
        ],
      },
    },
  ),

  // Rule 6 asks what a primitive claims. Bounded twice: not "does the shape use
  // primitives", which every shape does, but whether a thing the domain names as its
  // own kind is carried so that any value of the primitive fits in its place — and
  // only where the shape makes the domain's distinctions. A table, a DDL, a wire
  // message and a memory layout state an encoding, and a column typed `TEXT` claims
  // nothing about meaning. The exemption lives on the `false` side rather than as an
  // instruction to disregard: told that a primitive is acceptable in a table, the rule
  // moved 0.04 and kept firing; given a false criterion a table can satisfy, it moved
  // 0.43. A false side no notation in the artifact can express has nowhere to land (E35).
  r6_bare_domain_value: probability(
    {
      question:
        "Does `artifact` carry something the domain of `artifact.domain` treats as its own kind of thing as a bare primitive, in a shape where the domain's own distinctions are made — not a shape whose subject is how a value is written down or carried — so that any value of that primitive would fit where the thing belongs?",
      focus:
        "A field typed `string` or `number` is not the finding; most fields bottom out in primitives and most of them should. The finding is a value with a meaning of its own in the domain — an identity, a locator, a revision, a quantity whose unit matters, a member of a fixed set — represented so that nothing distinguishes it from any other value of the same primitive, in a shape that speaks the domain's own vocabulary. A shape whose subject is how values are stored or transmitted — a table or column definition, a row type mirroring one, a wire message, a memory layout — makes no domain distinctions: its primitives state an encoding, so the finding has nothing to be about. A shape that runs the domain's logic speaks the domain's vocabulary whatever its file is named.",
    },
    {
      true: {
        what: "Something the domain names as its own kind of thing is written as a bare primitive in a shape where the domain's own distinctions live, so a value meaning something else entirely fits where it belongs",
        examples: [
          "two identifiers for different kinds of thing both typed plain `string`, so either fits wherever the other is expected",
          "a pair of bare strings returned together, told apart only by their position",
          "a duration carried as a bare number, with nothing saying whether it counts seconds or milliseconds",
          "a display name standing in for the identity of the thing it names, both being strings",
          "a fixed set of roles carried as `string`, so any spelling at all is admissible",
        ],
      },
      false: {
        what: "Each thing the domain names has a type of its own, or the bare primitives sit in a shape that only states how values are written down or carried, or the primitive is free text the domain genuinely accepts",
        examples: [
          "identifiers for two kinds of thing are distinct branded types over string",
          "a duration is a type that carries its unit rather than a loose number",
          "a fixed set of values is a literal union derived from one declared list",
          "free text such as a title or a note is typed `string`, because the domain really does accept any text there",
          "a table definition whose TEXT and INTEGER columns state how rows are stored",
          "a wire message whose string fields state how the values are carried between systems",
        ],
      },
    },
  ),

  // Rule 7 is rule 6's other half. r6 asks whether a thing of the domain is carried as a
  // bare primitive; r7 asks whether a declared type — branded or not — admits values the
  // field's own name rules out. They are orthogonal: `LoanId = string & Brand<"LoanId">`
  // satisfies r6 and reads 0.89 here. Bounded by the name rather than by breadth, since
  // every type is broad somewhere: the finding is a claim in the name the type contradicts,
  // in a notation that could have stated the restriction. That last clause is why r7 needs
  // no storage exemption where r6 does. A `CREATE TABLE` can say `CHECK (price_cents >= 0)`,
  // so the false side is reachable in SQL: the same table reads 0.92 without its constraints
  // and 0.13 with them (E36). Asking it as what the shape admits rather than as a name
  // against a type costs 0.15 on free text at no gain on the faults.
  //
  // The delegation clause on the `false` side is what the mid-band was asking for. A
  // field typed by a name whose definition is not in the artifact — `term: Days` — can be
  // checked neither way from the text, and read 0.50: not drift but a report that the
  // artifact does not say. Inlining `Days` refined drops it to 0.24 and inlining it as a
  // bare brand raises it to 0.77, so the reading tracks visibility. Saying the claim is
  // delegated to that type's own declaration gives the unverifiable case a reachable
  // false side and drops it to 0.17, while the five fault cells move at most 0.03 (E37).
  //
  // Delegation is sound because each artifact is judged on its own: the claim goes to the
  // call that judges that type's declaration, not into the void. That call has to catch it,
  // which is why the question names a declared type as well as a field. Asked only about
  // fields and parameters it read a bare `type Sku = string` at 0.77 and a branded
  // `string & Brand<"Sku">` at 0.59, under the band and the commoner of the two; naming a
  // type takes them to 0.95 and 0.93 and moves no clean side more than 0.04. A consumer
  // importing those aliases reads 0.20, which is the handoff working (E38).
  r7_name_wider_than_type: probability(
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
          "a monetary amount typed as a floating-point number, so fractions of the smallest unit are admissible",
          "a type named for an identifier defined as plain text, so the empty string inhabits it",
          "a type named for a count defined as a plain number, so negatives inhabit it",
        ],
      },
      false: {
        what: "Each name's declared type or definition admits only what its name claims, or the name claims nothing more than the type already says, or the claim is delegated: the declared type is itself a name stating the same claim the field's name makes, so this question applies to that type's declaration rather than here",
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
  ),

  // Rules 8 and 9 both ask whether a callable says what it touches, and they do not
  // overlap: each is blind where the other works. r8 reads the callable's *name* against
  // its declaration, so it needs no body and judges an interface — `save(loan):
  // Promise<void>` reads 0.92 where the same interface returning
  // `Effect<void, DbError, Database>` reads 0.12. r9 reads the *body* against the
  // declaration, so it needs one and says nothing about an interface — it is the sharper
  // instrument where it applies, 0.98 against 0.10 on a pair. Neither covers the other's
  // ground: `transcribe` hiding a GPU and a bucket reads 0.46 by name and 0.98 by body,
  // and `isExpired` reading the clock reads 0.04 by name and 0.91 by body, both being
  // names that claim only a computation (E36, E37).
  r8_name_claims_resource: probability(
    {
      question:
        "Does `artifact` declare a callable whose own name claims a read or a write of a resource — saving, fetching, finding, sending, deleting, renewing — that its parameters and return type do not mention?",
      focus:
        "A name that states only a computation claims nothing: computing, checking, formatting. The finding is a name that reaches past its arguments — a store it saves to, a source it finds in, a channel it sends over — while the declaration names no store, client, or channel among its parameters, and no requirements or error channel stating one in its return type.",
    },
    {
      true: {
        what: "A callable's name claims an effect on a resource its declaration never mentions",
        examples: [
          "`save(x): Promise<void>` — a write with no store in sight",
          "`findById(id): Promise<T | null>` — a read from an unnamed source",
          "`send(msg): void` — a transmission with no channel",
        ],
      },
      false: {
        what: "Each callable's declaration accounts for what its name claims, or no name claims a resource",
        examples: [
          "the store, client, or clock the name implies appears as a parameter",
          "the return type's requirements or error channel names the resource, as `Effect<T, E, Database>`",
          "the name claims only a computation over the arguments given",
        ],
      },
    },
  ),

  r9_body_reaches_undeclared: probability(
    {
      question:
        "Does `artifact` declare a callable whose body reaches for a resource or a change of state that its own parameters and return type do not mention?",
      focus:
        "Doing work is not the finding, and neither is a shape that declares no callable at all — a record of fields has nothing to reach for. The finding is a declaration that reads as a function of its arguments while the body reads a clock, a filesystem, a network, a device, a global or an enclosing object, or writes to one. A callable that takes what it touches as an argument, or states the effect in its return type, is not a finding, however much work it does. Judge only dependencies visible in the supplied root body and included supporting declarations. Omitted references are unknown: do not infer their behavior or treat missing evidence alone as a hidden-resource finding. An omission does not erase a resource use that is already visible in included source.",
    },
    {
      true: {
        what: "A callable's parameters and return type do not account for something its body reads or writes",
        examples: [
          "a function taking a path and returning text while its body uploads to remote storage",
          "a function whose result depends on the current time, with no time among its parameters",
          "a method that reads or mutates the object it hangs off while its parameters mention none of it",
          "a function that selects a device or an accelerator its declaration never names",
          "a procedure that leaves the object it was called on in a different state, returning nothing that says so",
        ],
      },
      false: {
        what: "Everything a callable reaches for appears in its declaration, or the artifact declares no callable",
        examples: [
          "a function receives the client, the clock or the writer it uses as a parameter",
          "a function's return type states the effect it performs and the resources it needs",
          "a pure function of its arguments, returning a value computed from them alone",
          "a record or a table of fields, which calls nothing",
        ],
      },
    },
  ),

  r5_absence_confusion: probability(
    {
      question:
        "Does `artifact` offer two encodings of one state, or collapse two states that the domain distinguishes, around missing values?",
      focus:
        '"Not supplied", "known to be nothing", and "known to be empty" are three different facts.',
    },
    {
      // Same discipline as r2's: situations rather than field names, from domains the
      // fixture does not touch, and the `false` side shows each one repaired. An optional
      // field whose absence has a named meaning is correct, and the `false` examples say
      // so — optionality is not itself the finding.
      true: {
        what: "An optional collection whose absence and emptiness mean the same thing, or a field where undefined, null and empty are all reachable",
        examples: [
          "an optional `tags` list where absent and `[]` are both reachable and denote the same nothing",
          'a `middleName` where missing, `null` and `""` are all reachable',
          "an optional `permissions` list whose absence carries a meaning the shape never names",
          "an `items` list that must not be empty, with emptiness still representable",
        ],
      },
      false: {
        what: "Collections are required and emptiness carries the nothing meaning, or absence has its own named meaning",
        examples: [
          "a required `tags` list where empty is how a caller says there are none",
          'permissions are `{ kind: "inherited" } | { kind: "own", granted: Permission[] }`, so inheritance is a named state rather than a missing field',
          "an attachment list typed non-empty, so the invariant holds at construction",
        ],
      },
    },
  ),

  // shape_risk is not asked. Its four levels are four different rules on one ordered
  // axis — level 3 is rule 1, level 2 is rule 2, level 1 is rule 3 or 5 seen locally —
  // so climbing it switches which rule is under discussion. That carries a severity
  // ordering and a mutual exclusivity nothing has measured: a shape whose only fault is
  // rule 5 cannot score above 1. Rules are what this set reports.
};

// ── Run ────────────────────────────────────────────────────────────────────

export const NOUL_KEYS = [
  "r1_inferred_case",
  "r2_meaningless_combinations",
  "r3_split_correlations",
  "r4_duplicate_encoding",
  "r5_absence_confusion",
  "r6_bare_domain_value",
  "r7_name_wider_than_type",
  "r8_name_claims_resource",
  "r9_body_reaches_undeclared",
] as const;

/**
 * The rung a rule starts working at. Every rule is asked of every text; the rung
 * decides whether the answer is a finding or a number to discount.
 *
 * A floor, because each rung shows what the ones below it show: a rule that needs
 * declared optionality (r5) keeps working when refinements are added on top, and a
 * rule that reads a lone value (r2) keeps working when the text is a schema instead.
 * Gaps, bad − good: r1 0.33 raw, 0.47 typed, 0.41 schema (E22); r2 0.24 / 0.59 / 0.68
 * and r5 0.06 / 0.43 / 0.29 (E19); r3 0.07 raw and 0.56 typed (E28); r4 0.85 at every
 * rung (E31); r6 0.73 typed (E34); r7 0.74 typed on a TypeScript pair and 0.78 on a SQL one
 * (E36); r8 0.80 and r9 0.88 typed (E36, E37). Rules 6 to 9 cannot work at rung 1: branding,
 * refinement, a signature and a body are all invisible in a value.
 *
 * The ladder does not describe what rules 8 and 9 need, and does not have to. Both sit at
 * rung 2 because that is where a declaration appears, while r8 wants a callable and r9 wants
 * a body — a distinction a rung, which says only raw, typed or schema, does not draw. It
 * costs nothing: on a shape with neither, both read 0.04 across nine data shapes and schemas,
 * so they are inert rather than wrong and the floor carries them as it stands. An axis for
 * what kind of thing an artifact declares is deliberately not built.
 *
 * Nothing here is a ceiling. A rule that works at one rung and stops at the next is
 * possible — rule 1's span form reads a lone value and inverts on declarations — and
 * this table cannot say so. Such a rule needs a range, and the ladder is a floor
 * until one is measured.
 */
export const APPLIES_FROM: Record<string, Level> = {
  r1_inferred_case: 1,
  r2_meaningless_combinations: 1,
  r3_split_correlations: 2,
  r4_duplicate_encoding: 1,
  r5_absence_confusion: 2,
  r6_bare_domain_value: 2,
  r7_name_wider_than_type: 2,
  r8_name_claims_resource: 2,
  r9_body_reaches_undeclared: 2,
};

/** Self-consistency cookbook bands. Nothing is calibrated; the middle goes to a person (§4). */
export const band = (p: number) => (p > 0.7 ? "violation" : p < 0.3 ? "clear" : "unclear");
