# Interface and type design rules

Five checkable rules about the *shape* of a type, distilled from
`typescript/dnd/CLAUDE.md`, `typescript/dnd/.claude/review-rules.md`, and
`typescript/dalph/AGENTS.md`. Scope: data shapes at and behind boundaries —
request/response schemas, domain records, unions, stored state. Out of scope:
naming, branding, failure channels, tests.

Each rule states the invariant, the signals that indicate a violation, the
counter-signals that clear it, and the single question a reviewer answers.

---

## 1. Variants carry an explicit discriminant

**Invariant.** A type whose instances mean different things must say which thing
it is in a dedicated field. Consumers dispatch on that field with an exhaustive
match; no branch is reached by inferring the variant from which other fields
happen to be present.

**Signals.**
- One flat record whose fields belong to two or more distinct operations, kinds,
  or lifecycle phases, with no field naming the kind.
- Code that decides what to do by testing presence (`if (x.to)`,
  `if ("press" in x)`, `x.foo !== undefined`) rather than reading a tag.
- A `default` branch, or a fallthrough, standing in for kinds the type admits.
- A union whose members are distinguished only by the *type* of a shared field
  (`string | {x,y}`) rather than by a tag.

**Counter-signals.**
- A discriminant exists and every consumer matches on it exhaustively.
- The record has exactly one meaning; the varying fields are genuinely
  independent attributes of that one meaning, not alternative modes.

**Question.** Can a reader name the variant by looking at one field, and does
adding a new variant break every consumer at compile time?

---

## 2. Every representable combination is meaningful

**Invariant.** For each field combination the type admits, there is a real state
of the world it denotes. Combinations with no meaning are unrepresentable, not
merely undocumented or rejected at runtime.

**Signals.**
- Fields that are meaningful only when another field holds a particular value,
  left independently optional beside it.
- Jointly optional fields: two or more optionals that are always present
  together or always absent together.
- A boolean that decides whether neighbouring fields are read.
- Sentinel values standing for "not applicable" (`-1`, `""`, `0`, `"none"`,
  `null` used as a mode rather than a value).
- Status, support, provenance, or phase labels whose combinations include
  impossible pairs.
- Validation prose or comments carrying the constraint ("only set when …",
  "ignored if …") instead of the type.

**Counter-signals.**
- The cross-product is enumerated and each cell has a named meaning.
- The conditional fields sit inside the variant that makes them meaningful
  (see rule 1), or inside a nested record that is present as a whole.

**Question.** Pick the two or three combinations nobody intended. Can the type
still express them? If yes, this is a finding.

---

## 3. Correlated facts travel as one value, in one shape

**Invariant.** Facts that are only correct together are carried by a single
value, constructed once. A concept that appears in more than one place has the
same shape in every place.

**Signals.**
- Sibling fields that are components of one concept, spread flat
  (`x`/`y`, `startLine`/`startCol`, `min`/`max`, `amount`/`currency`), where
  updating one without the other compiles.
- The same concept inlined in one position and nested in another, so the two
  occurrences have no common type and no shared constructor.
- A pair whose members are individually optional when only "both" or "neither"
  is meaningful (also rule 2).
- A function that re-establishes a correlation the boundary already proved,
  because the correlation was not carried forward in the type.
- Parallel collections indexed in lockstep (`names[i]` paired with `scores[i]`).

**Counter-signals.**
- One named type (or branded value) is used at every occurrence, with a single
  constructor that enforces the correlation.
- The fields are genuinely independent — either can change alone and the record
  stays correct.

**Question.** Is there an assignment to one half of this group that makes the
other half wrong, and does the type permit it?

---

## 4. One fact has one representation

**Invariant.** A given fact is encoded by exactly one mechanism in the type.
Two fields, or a field and a derivation, must not be able to state the same
thing — and therefore must not be able to disagree.

**Signals.**
- Two fields that overlap in what they express (a list of active items plus a
  per-item flag; a set of held keys plus a transition on one key; a count
  alongside the collection it counts).
- A stored field that is computable from another field in the same shape —
  a total, a length, a cached projection, a normalized copy.
- The same value duplicated across nested levels, or across a record and its
  identifier.
- A second field added to say "which of the first field is current" without
  removing the ability to express none or several.
- Reconciliation code: logic whose job is to keep two fields agreeing, or to
  pick a winner when they disagree.

**Counter-signals.**
- The two fields have distinct domain meanings that merely coincide in common
  cases, and both meanings are exercised.
- The duplicate is an immutable snapshot with a stated lifetime, deliberately
  allowed to diverge from its source, and consumers know which they want.

**Question.** Construct a value where the two encodings disagree. Which one do
consumers believe, and why is that answer in the type rather than in prose?

---

## 5. Unknown, absent, and empty are distinct or unrepresentable

**Invariant.** "No value was supplied", "the value is known to be nothing", and
"the collection is known to be empty" are different facts. A shape either gives
each the distinct meaning its consumers rely on, or admits only the ones that
have a meaning.

**Signals.**
- An optional collection or map (`xs?: T[]`, `T[] | undefined`,
  `Option<Array<T>>`) where no consumer treats missing differently from empty —
  two encodings of one state (also rule 4).
- An optional collection where consumers *do* differ, but the distinction is
  documented only in prose.
- `undefined`, `null`, and `[]`/`{}`/`""` all reachable for the same field.
- A non-empty invariant asserted in comments or checked downstream rather than
  expressed as a non-empty type.
- A defaulting read (`xs ?? []`) at every use site, which erases a distinction
  the shape still offers.
- An optional field standing for a tri-state (unset / off / on) without naming
  the third state.

**Counter-signals.**
- The collection is required; emptiness alone carries the "nothing" meaning.
- Absence has its own named meaning (not yet asked, inherited, unknown) that at
  least one consumer branches on, and non-empty is enforced by the element type
  where required.

**Question.** For each optional field: name the consumer that behaves
differently on absent versus empty. If there is none, the optionality is
redundant; if there is one, is the difference enforced by the type?

---

## Applying these

Order of attack: establish the discriminant (1), move conditional fields into
the variant that makes them meaningful (2), group correlated fields into one
constructed value (3), delete the redundant encoding (4), then settle the
absent/empty question on what remains (5). Rules 1 and 2 usually dissolve
several findings from 3–5 at once, so re-derive the remaining findings after
restructuring rather than fixing each in place.

A violation is reportable when a concrete value can be named that the type
admits and the domain does not, or that the type admits in two ways. Absent
such a value, the finding is stylistic and should be dropped.
