# Experiment log — type-shape classifier

Observed results from calls to `jev-1.13.0` via `@distilled.cloud/typesafe-ai`. Design lives in
[`JEV-TYPE-CLASSIFIER.md`](./JEV-TYPE-CLASSIFIER.md); this file holds what came back.

Numbers in **bold** in a table are the cell the entry turns on. A single run is what an early
experiment gets; from E20 on, cells are three runs and the figure is their mean. Run-to-run spread
on identical input is 0.01–0.03 measured (E20) against 0.06 quoted from the cookbook, so read
anything smaller as noise, and read the direction and the band rather than the decimal.

Bands: `>0.70` violation, `<0.30` clear, between = unclear.

Entries are numbered in the order they were run, E0 upward. Two of those numbers also named
question sets in the design — E1 for locators, E2 for a pair pass — and both were dropped before
either ran, so no entry here carries those names.

---

## E0 run 1 — 2026-09-17 — questions verbatim, prose-constraint control

`src/e0.ts`, two calls, six questions each. Fixture per §5: `SendMouseBody` as a JSON sample,
`PointerCommand` as a declared TypeScript type. The control's inventory carried variant membership
as prose in `constraints` ("present on kind click and drag only").

Dirty / control: r1 0.30 / 0.06, r2 0.82 / 0.69, r3 0.90 / 0.64, r4 0.76 / 0.36, r5 0.42 / 0.34.

**Outcome.** Ordering correct on all five rules, magnitudes wrong. r2 fires on both artifacts; only
r1 reaches `clear` on the control, where §5 expects every rule to.

---

## E0 run 2 — 2026-09-17 — structural control inventory, r1 decomposed

Two changes from an external review of run 1: the control's inventory carries variant membership
**structurally**, as path prefixes (`click.button`, `drag.to.x`) rather than as prose; and four
diagnostics are added to isolate why r1 underperforms.

Dirty / control: r1 0.26 / 0.06, r2 0.84 / **0.79**, r3 0.89 / 0.55, r4 0.72 / 0.28, r5 0.44 / 0.28.

r1 diagnostics — `r1_no_focus` 0.38 / 0.07, `r1_no_inspect` 0.29 / 0.05, `r1_kinds_span` (positive
half only) **0.52 / 0.97**, `r1_locus` (a Choice over inventory paths) `none` p=0.64 / `kind` p=1.00.

### Findings

**The control-inventory prose was inflating three rules.** Moving variant membership into path
prefixes dropped r4 and r5 into `clear`. Describing the artifact in the rules' own vocabulary
inside the state is a measurable contributor to how dirty it reads — the reason §1 sends the text
and nothing derived from it.

**r2 does not discriminate in this wording, and the structural fix made it worse** (control 0.69 →
0.79). Its criteria describe a correctly tagged union as accurately as an untagged one: `click.button`
*is* meaningful only when `kind` takes a particular value. It detects conditionality and cannot
distinguish conditionality the shape expresses from conditionality it hides.

**`r1_kinds_span` inverts, and correctly so.** The control genuinely spans four operations and
declares them; the dirty artifact's one inhabitant cannot show that its inhabitants span operations
at all. The span half of rule 1 is a claim about variation across values, which single-sample
evidence cannot support.

**The `focus` clause suppresses by ~0.12.** Its "deciding the kind from which other fields happen to
be present does not count" reads as an instruction to discard the only reasoning a sample permits.
The first of several results that machinery added to a question costs it.

---

## E2b — 2026-09-17 — reworded r2, rule 1 decomposed

Rule 1 split into `r1_kinds_span` + `r1_locus`; r2's focus clause rewritten to exonerate a
conditional field that is reachable only where its condition holds. Nothing else changed, state
untouched.

| Question | Dirty | Control | Gap | Δ control vs run 2 |
|---|---|---|---|---|
| r2_meaningless_combinations | 0.82 | **0.25 clear** | **0.57** | **−0.54** |
| r3_split_correlations | 0.90 | 0.57 | 0.33 | +0.02 |
| r4_duplicate_encoding | 0.78 | 0.30 | 0.48 | +0.02 |
| r5_absence_confusion | 0.41 | 0.28 | 0.13 | 0.00 |

### Findings

**The r2 rewording is the largest single effect measured.** The control fell two bands into `clear`
while the dirty artifact held. Naming conditionality as insufficient — asking whether the shape
*lets the field be set while its condition is false* — is what separates a tagged union from a flat
record. This is the first instance of the move that later recovers r1, r3 and r4: ask what the shape
admits, not what a reader must do.

**Eight unchanged questions give a free repeat.** Every other movement between run 2 and this run is
run-to-run variation on identical input, and none exceeds 0.06. Differences below that are not
interpretable.

**Locator probabilities move much more than nouls, and the argmax does not.** Dirty `none` went 0.64
→ 0.51 with no input change while the selection held. The option ordering is stable, the mass on it
is not.

---

## E3 ablation — 2026-09-17 — name replaced, domain removed

`name` becomes `Body1`/`Body2` and `domain` is emptied on both artifacts of the E2b pair. That pair
compares a bad sample against a good type, so evidence level is confounded with the label here;
E10 is the like-for-like measurement.

Gaps, ablated vs E2b: r2 0.52 / 0.57, r3 0.43 / 0.33, r4 0.51 / 0.48, r5 0.18 / 0.13,
`r1_kinds_span` −0.66 / −0.47.

### Findings

**Rules 2, 3, 4 and 5 read the shape, not the label.** Every gap held or widened with the name and
domain gone, and the locator is untouched. Whatever these questions detect survives the removal of
every hint about what the data means.

**`r1_kinds_span` is the exception, by construction.** Its text asks about "distinct operations of
the domain in `artifact.domain`", and that field is now empty. The ablation removes the question's
own referent; reading the drop as label-dependence would be wrong.

---

## E4 — 2026-09-17 — full 2×2 fixture, like-for-like comparisons

Four artifacts, so each comparison holds the format fixed and the only thing differing inside a pair
is whether the shape is well designed: `SendMouseBody` and `PointerCommand`, each as a JSON sample
and as a declared type. The bad type's optional markers (`button?`, `to?`, `press?`) are a judgement
made when writing it, not something the sample states. The good sample is one `click` command, which
is genuinely single-purpose, so rule 1 cannot fail on it. Run twice; every noul agrees within 0.05.

| Question | Samples: bad / good / gap | Types: bad / good / gap |
|---|---|---|
| r1_kinds_span | 0.46 / 0.19 / 0.27 | 0.78 / 0.97 / −0.19 |
| r2_meaningless_combinations | 0.81 / 0.75 / **0.06** | 0.86 / 0.23 / **0.63** |
| r3_split_correlations | 0.89 / 0.68 / 0.21 | 0.83 / 0.60 / 0.23 |
| r4_duplicate_encoding | 0.74 / 0.41 / 0.33 | 0.23 / 0.33 / **−0.10** |
| r5_absence_confusion | 0.42 / 0.46 / **−0.04** | 0.69 / 0.29 / **0.40** |
| r1_locus | `none` p≈0.50 / `kind` p≈0.98 | **`button`** p≈0.50 / `kind` p≈0.99 |

### Findings

**Rule 1 produces a false acquittal on the bad declared type, in both runs.** `r1_locus` selects
`button` rather than `none`, so §4's conjunction returns *clear (discriminant: button)* on the
artifact rule 1 exists to catch. `button` is typed `"left" | "right" | "middle"` — what a
discriminant looks like — and the question asks which field names the kind without asking whether the
kinds it names are the ones that matter. A wrong verdict rather than an abstention.

**Each of r2, r4 and r5 reads at one evidence level here.** r2 needs a declared type (0.63 against
0.05): a single sample cannot show reachability. r5 needs one (0.40 against −0.05). r4 separates
samples (0.31) and inverts on types — on this fixture, which E31 later shows has almost nothing for
it to find.

**The earlier gaps were inflated by the format.** Every result before this entry compared a bad
sample against a good type. r2's gap is 0.63 like-for-like on types and 0.05 on samples; the 0.57 in
E2b sat between them because it measured both variables at once. Nothing logged before E4 separates
shape from format.

---

## E5 — 2026-09-17 — rule 1's structural check, no model involved

`src/discriminant.ts`, 16 unit cases, no API calls. "Which field names the kind" is a fact about the
shape, so read it off the inventory instead of asking: a discriminant has to *partition* the record.

It removes E4's false acquittal — `button` is rejected, its literals name no variant groups — and
flags an untagged union without a model. It produces three false positives, all failures of the
inventory rather than of the logic: a tag behind a named alias (`kind: Kind`, literals not in the
rendered `type` string), a union normalized without path prefixes, and a field named the same as a
variant group.

**The burden moves to the normalizer**, and a rendered type string is the wrong interface to read a
tag off. **The failure direction reverses, which is an improvement**: E4's failure cleared a bad
artifact silently, these fail loudly on good ones. For a design linter a false positive is visible
and arguable; a false negative is neither. The check is out of the request path from E9 on.

---

## E6 — 2026-09-17 — no field inventory, artifact only

The state carries only `artifact` — name, domain, representation, evidence, verbatim source. No
`inventory`, and `r1_locus` is not asked, since without paths there are no options.

| Question | Types: bad / good / gap | Gap with inventory | Samples: bad / good / gap | Gap with inventory |
|---|---|---|---|---|
| r1_kinds_span | 0.81 / 0.97 / −0.16 | −0.19 | 0.56 / 0.26 / 0.30 | 0.29 |
| r2_meaningless_combinations | 0.89 / 0.34 / 0.55 | 0.63 | 0.83 / 0.69 / 0.14 | 0.05 |
| r3_split_correlations | 0.84 / 0.60 / 0.24 | 0.25 | 0.86 / 0.79 / **0.07** | 0.23 |
| r4_duplicate_encoding | 0.24 / 0.19 / 0.05 | −0.05 | **0.24** / 0.19 / **0.05** | **0.31** |
| r5_absence_confusion | 0.70 / 0.30 / **0.40** | **0.40** | 0.37 / 0.40 / −0.03 | −0.05 |

### Findings

**On declared types the inventory does nothing for the model.** r5's gap is identical to two
decimals, r3 moves 0.01, r2 loses a little and still separates cleanly — against a 44% cut in input
tokens. The inventory is not earning its place on this evidence level, and it is dropped here.

**On samples, r4 falls 0.72 → 0.24 when it goes.** The raw `source` holds the same values, so this is
presentation: one row per path with `clicks: 2` and `press: "down"` on adjacent lines is what made
"these two could contradict each other" visible on this fixture. E31 measures r4 against an artifact
built for it and finds 0.92 on bare source, so what the inventory supplied here was a substitute for
a fault the fixture lacks, not information the source lacks.

**Rule 1's structural check is unaffected.** It reads the shape in code and sends nothing.

---

## E7 — 2026-09-17 — the documented default

`bun run e0` with the design as §1 leaves it: source verbatim, no inventory, r4 not asked, rule 1
decided in code. Reproduces E6 within the noise floor and settles one thing.

Types bad / good: r2 0.89 / 0.38, r3 0.84 / 0.59, r5 0.70 / 0.27. Samples: r2 0.82 / 0.69,
r3 **0.86 / 0.82**, r5 0.37 / 0.36.

**r3 does not work on samples in this wording** — gap 0.04 here, 0.07 in E6, against 0.23 when the
inventory was sent. On a bare JSON sample nothing then discriminates except the Score. **The rule-1
code check gives the right verdict on both declared types**, the first end-to-end correct rule-1
result in the log.

---

## E8 — 2026-09-17 — a schema from another codebase

A fifth artifact: the MCP `battle_lifecycle` tool input from `typescript/dnd`, an Effect Schema
copied verbatim. Nobody who wrote it had seen TYPE-DESIGN-RULES.md. Shape: a union of four variants
each tagged by a `kind` literal, with a second tagged union nested inside one of them, and no
optional keys anywhere — so every rule should clear it. There is no pairing, so no gap.

| Question | Real | Fixture bad | Fixture good |
|---|---|---|---|
| r1_kinds_span | 0.96 | 0.83 | 0.97 |
| r2_meaningless_combinations | **0.29 clear** | 0.89 | 0.40 |
| r3_split_correlations | **0.34 unclear** | 0.84 | 0.57 |
| r5_absence_confusion | **0.17 clear** | 0.70 | 0.33 |

### Findings

**Rules 2 and 5 do better on the real schema than on the hand-written good type.** The first
artifact on which r5 reaches `clear`, and the plainest case for it: no optional key, no collection,
no absence to confuse.

**r3 does not reach `clear` on an artifact with nothing for it to find.** 0.34, four hundredths
above the band, and the third artifact where it sits just above `clear` — the evidence on which it
is dropped in E12 and the problem the bounded wording fixes in E28.

**Rule 1's code check gives a false positive.** `variantGroups` takes only the first path segment,
so a union one level below the root is invisible: every path begins `operation.`, the check reads
one variant group and falls through to the flat-record branch. A second, narrower hole: a variant
with no fields beyond its tag contributes no path and no group, so a union of one field-bearing
variant and several fieldless ones would fall the same way.

**`BattleCombatantArgsSchema` is an opaque reference**, defined in another file, so neither Jev nor
the field list can see inside a whole variant's payload. Inlining it would be a normalizer in the
request path (§1). A real schema importing its parts is the common case, and what it means is that a
verdict covers only the source the user hands over.

---

## E9 — 2026-09-17 — rule 1 excluded, four questions

Rule 1 out of the request; three Nouls and the Score. Every cell reproduces E7 and E8 inside the
noise floor, largest move 0.02.

**Dropping two questions from the batch changes nothing.** Questions in one request are evaluated
independently against the same state, so the set can be changed without re-measuring the rest.

---

## E10 — 2026-09-17 — ablation on the 2×2, name and domain removed

`bun run e0 --ablate` on the like-for-like fixture; E3 ran this on the confounded pair.

| Declared types | Labelled (E9) | Ablated |
|---|---|---|
| r2 gap | 0.49 | 0.45 |
| r3 gap | 0.24 | 0.17 |
| r5 gap | 0.39 | **0.49** |

**The label is worth ~9% of the Score's gap, not the third E3 reported**, and the order real < good
< bad is unchanged with and without it. **r5 is better without a domain line**, driven by the good
type falling 0.29 → 0.19: absent-versus-empty is a question about the shape and the domain sentence
is noise in it. So a ranking can be produced with no domain lines at all, which is what makes a scan
over a codebase possible.

---

## E11 — 2026-09-17 — ranked worklist over a real package

`bun run scan ../dnd/packages/mcp/src --limit 25`. Each file goes to Jev whole and verbatim as one
artifact. 128 files, 60 declare shapes, 25 scored, 8 at a time. Ranked by Score: first
`character-tool-output.ts` at 1.49, last `dice-tool-input.ts` at 0.17.

### Findings

**The ends of the ranking are right.** `dice-tool-input.ts` brands its id, bounds every integer and
uses a non-empty array — nothing to find. First is a 376-line output schema with seven optional
fields, r5 0.70. Neither was labelled in advance, so this is the ranking agreeing with a reading of
the files rather than with a fixture.

**Whole-file artifacts compress the scale.** Nothing reached the 2.0 the bad fixture type scores. A
file holding a dozen schemas is judged as one shape, so one bad schema among clean siblings is
averaged down rather than flagged — measured directly in E25.

**Confidence runs inverse to score**, 0.83 at the bottom against 0.13 and 0.00 at the top. The Score
is least sure exactly where the ranking matters.

**Cost**: 25 files, one call each, ~1–8k input tokens per call.

---

## E12 — 2026-09-17 — r3 dropped

`r3_split_correlations` out of the set, on the evidence of E7–E11: it never reached `clear` on any
good artifact, including one with nothing for it to find, so its verdict carried no information.
Every fixture cell reproduces E9 within the noise floor and the scan reproduces its first three and
last two files. The rule returns in E28, bounded.

---

## E13 — 2026-09-17 — examples in r2's criteria

Four `examples` added to r2's `true` side and three to its `false` side. Examples name combinations,
not fields, and come from domains the fixture does not touch; the `false` side shows the same
situations repaired by a variant. Question block grows 156 input tokens per call.

| r2, declared types | Without examples | With examples |
|---|---|---|
| bad | 0.88 | 0.86 |
| good | 0.37 | **0.29 clear** |
| real schema | 0.30 | **0.25 clear** |

**The gain is on the good side.** The examples remove false positives rather than sharpen detection,
which is what a question with a 0.88 bad-artifact reading needs.

**The `false` examples describe tagged unions, and so does the good fixture type**, so this fixture
cannot separate a sharpened rule from a template match. The scan is the check that can: every real
file moves down by a few hundredths rather than by the 0.08 the tagged-union fixture moves, so the
effect is not uniform deflation.

---

## E14 — 2026-09-17 — both rules reported at every evidence level

`WORKS_ON` set to `both`, so the sample column prints verdicts instead of a suppression note. The
gate is code-side throughout: every question is answered for every state, and this changes what is
shown, not what is asked.

**r2 survives the move**: on samples it orders the pair correctly with a 0.27 gap against 0.55 on
declared types — smaller, and enough to act on when the artifact is all there is.

**r5 does not**: sample gap 0.03, half the noise floor, both cells `unclear`. The rule needs
optionality markers and a single JSON value carries none.

---

## E15 — 2026-09-17 — the state is the text

Two runs over the four fixture artifacts, stripping the state toward what a realtime linter can
send: edits arrive as characters, with nothing upstream saying whether they are a payload or a
declaration.

| Gap, bad − good | Full state | No `representation`, no `evidence` | `source` alone |
|---|---|---|---|
| r2, declarations | 0.55 | 0.58 | **0.59** |
| r5, declarations | 0.45 | 0.44 | **0.47** |
| r2, values | 0.27 | 0.26 | 0.20 |
| r5, values | 0.03 | 0.07 | **0.00** |

**Telling the model what the artifact is changes nothing.** Dropping `representation` and `evidence`
moves every gap inside the noise floor. The model reads what the text is from the text, and a linter
needs no preamble around the edit.

**r5 on a lone value is dead**, gap 0.00: good and bad samples both read 0.33. Absence and emptiness
are facts about a declaration. `JSON.parse` succeeding is what a linter can compute about the text to
know it is holding one — the seed of the rung ladder in E22.

---

## E16 — 2026-09-17 — file name as the domain line

State `{ domain, source }` with the file name in `domain` — what a linter holds while someone types.

| Gap, bad − good | Declarations | Values |
|---|---|---|
| r2_meaningless_combinations | **0.61** | 0.27 |
| r5_absence_confusion | **0.47** | 0.03 |

**The rules hold with a file name in place of a domain sentence.** Declaration gaps of 0.61 and 0.47
are the widest measured for both rules at this point, and the good type reads `clear` on both.

**Ranking movement in the middle is larger than a rank or two.** `sqlite-play-session-schema.ts`
moves from rank 2 to rank 10 with the file name as the only change, so it is a signal the model
reads — a name announcing a schema is not the same input as a bare `name` field carrying the same
string. Order at the top and bottom is unchanged.

---

## E17 — 2026-09-17 — the Score dropped, worklist ranked on the worst rule

`shape_risk` out of the set. Its four levels are four different rules on one ordered axis, so it
claims a severity ordering between rules and a mutual exclusivity among them, neither of which is
measured. The worklist ranks on `max` over the rules instead.

Fixture declarations, bad / good: r2 0.85 / 0.27, r5 0.73 / 0.28. Both gaps reproduce E16 inside the
noise floor.

**The two rankings disagree in the middle and at the top.**
`character-session-operation-tool-input.ts` ranks 1 on rules and 19 by Score;
`sqlite-play-session-actions.ts` ranks 21 and 4. The ends agree and the interior does not, which is
what a severity axis that is not a rule would look like.

**The rule ranking compresses into 0.18–0.73** against the Score's 0.14–1.47 — an order worth
reading, not a set of verdicts.

---

## E18 — 2026-09-17 — examples in r5's criteria

Two wordings of four `true` examples and three `false` ones, against r5's prose-only criteria.
Declaration column, bad − good:

| r5 wording | bad | good | gap |
|---|---|---|---|
| prose only | 0.73 | 0.28 | **0.45** |
| examples naming readers | 0.65 | 0.29 | 0.36 |
| examples about the shape alone | 0.68 | 0.27 | 0.41 |

**Examples that mention consumers cost the rule 0.09.** `tags ?? []` at every reader, a non-empty
invariant checked by the code that reads it — both name call sites, and the state holds none (§1). A
question about something absent from the state gets a plausible answer about nothing.

**Rewriting them as facts about the shape recovers most of it**, and that is what the set carries:
both rules then state their criteria the same way.

**r2 and r5 respond differently to the same technique.** r2 gained from examples on the good side
(E13); r5 loses on the bad side. r2's sites are pairs of fields visible in the text, r5's turn on
which encodings are reachable, and an example of *that* is hard to state without pointing at a
consumer.

---

## E19 — 2026-09-17 — the same shape in three notations

A third pair: the bad and good shapes written as Effect schemas. Six artifacts, one call each, so
nothing shares a state.

| Artifact | r2 | r5 |
|---|---|---|
| pointer-command.json / send-mouse-body.json | 0.52 / 0.76 | 0.28 / 0.34 |
| pointer-command.ts / send-mouse-body.ts | 0.26 / 0.85 | 0.26 / 0.69 |
| pointer-command.schema.ts / send-mouse-body.schema.ts | **0.19** / 0.87 | **0.42** / 0.71 |
| battle-lifecycle-tool-input.ts | 0.22 | 0.17 |

Gaps: values r2 0.24, r5 0.06; types r2 0.59, r5 0.43; schemas r2 0.68, r5 0.29.

**r2 is widest on schemas.** A schema declares optionality rather than leaving it to a reader, so
the combinations it admits are on the page.

**r5 is narrowest on schemas**, because the good side reads 0.42 rather than 0.26 — both bad sides
agree. `Schema.Array(ModifierSchema)` is required and emptiable, which the criteria call correct, and
`Schema.NonEmptyArray` is the named repair, yet the rule is less sure here than on the same shape in
type text. Which construct draws it is untested.

**The notation moves the numbers as much as the design does on one rule.** One shape written three
ways spans 0.19–0.52 on r2's good side, so a worklist mixing JSON, type aliases and schema files is
not ranking on design alone.

---

## E20 — 2026-09-17 — does r5 scale with the number of violating fields?

Repeats are the instrument here: a 1-vs-3 difference of about 0.1 sits inside the single-run floor.
Three runs per cell, and every entry from here on is three runs per cell.

One artifact, `article-draft.ts`, in three versions with the same six field names and only the
optionality markers flipped, so length and subject are fixed and the number of r5 sites is the only
variable.

| r5 sites | current wording | existential wording |
|---|---|---|
| 0 | **0.193** | 0.283 |
| 1 | **0.747** | 0.843 |
| 3 | **0.770** | 0.913 |

The existential wording adds to the focus line that one such field settles the question and that the
count does not change it, and rewrites both criteria as "at least one field is…" / "no field is…".

**The rule is already existential.** One site reads 0.747 and three read 0.770 — a difference at the
edge of what repeats on identical input produce. A single violating field carries a shape to the
same verdict three do.

**Saying so out loud makes it more count-sensitive, not less.** The 1-to-3 step widens from 0.023 to
0.070 and both violating cells rise: telling the model one instance is enough reads as emphasis on
the finding rather than as a rule about counting. **It also costs the clean side**, 0.193 → 0.283, up
to the `clear` boundary. Not adopted.

**Run-to-run spread on this artifact is 0.01–0.03**, against the 0.06 quoted from the cookbook. The
cookbook floor is a ceiling on what to expect, not a constant.

---

## E21 — 2026-09-17 — what holds r5 up on the bad type

Same type in three versions: as the fixture has it, with the four variant-bound optionals made
required, and with only the one r5 site (`modifiers?`) repaired.

| Version | r5 | r2 |
|---|---|---|
| as-is — r2 faults and one r5 site | 0.693 | 0.860 |
| r5 site alone, variant fields required | 0.720 | 0.820 |
| r5 site repaired, r2 faults left | **0.420** | 0.853 |

**Co-present r2 faults do not dilute r5**, 0.693 against 0.720.

**Variant-bound optionality is r5's false-positive floor.** With the one real absence fault gone the
rule still reads 0.420 — the same figure the good schema reads (E19). Of the bad type's 0.69, about
0.27 is the finding and the rest is that floor.

A scoping attempt — a focus sentence saying a field left out because another field names the case
has an explained absence, plus two shape-only `false` examples of it — clears both good artifacts
(0.273 → 0.160, 0.427 → 0.257) and costs the bad side more: the bad type falls 0.167 while its
repaired twin falls 0.034, narrowing the contrast the wording was written to sharpen from 0.303 to
0.170. Not adopted.

---

## E22 — 2026-09-17 — the ladder, and rule 1 asked as a fault

Three rungs, read off the characters and never sent: **1 raw** is one value, **2 typed** a
declaration, **3 schema** a declaration with enforced refinements. `levelOf` computes the rung,
`APPLIES_FROM` holds the rung each rule starts at, and the worklist ranks a file only on the rules
its rung reaches.

Rule 1 rejoins the set in a new form. The premise form asks whether the shape spans several
operations; the fault form asks whether a reader must recover the case from which fields happen to be
present.

| Artifact | rung | premise form | fault form |
|---|---|---|---|
| bad `send-mouse-body.json` / good `pointer-command.json` | 1 raw | — | 0.433 / **0.107** |
| bad `send-mouse-body.ts` / good `pointer-command.ts` | 2 typed | 0.833 / **0.957** | 0.513 / **0.040** |
| bad `send-mouse-body.schema.ts` / good `pointer-command.schema.ts` | 3 schema | 0.773 / **0.973** | 0.443 / **0.030** |
| real `battle-lifecycle-tool-input.ts` | 3 schema | 0.963 | **0.040** |
| single-meaning `customer.ts` | 2 typed | 0.393 | **0.060** |

### Findings

**The inversion is a property of the question, not of the rule.** The premise form puts all three
good artifacts above the bad one; the fault form puts them at 0.03–0.11, the lowest readings any rule
has produced on this fixture. Nothing about the artifacts changed.

**Rule 1 works from rung 1.** Gaps of 0.33 raw, 0.47 typed, 0.41 schema. A lone value already shows a
record carrying click fields, drag fields and a key transition at once, and that is the fault — so
the rule's floor is 1, where the expectation was 2.

**The good side is where this rule earns its place.** A single-meaning control with two unrelated
optionals reads 0.060 and the real tagged union 0.040 — more confidently `clear` than r2 or r5 say
it.

**The bad side stops around 0.5.** Adding a flat-record clause to `true.what` moved it 0.353 → 0.507
without touching the good side, so the ceiling is not exhausted. E29 finds it is the artifact.

---

## E23 — 2026-09-17 — three ways to raise rule 1's bad side

Three candidate causes of the 0.5 ceiling, each tried alone and then together.

1. *Wording.* The question asks what a reader must do; r2's asks what the shape can express.
2. *Focus.* The exoneration — a shape with one meaning has independent attributes — is an escape a
   flat record can take. Replaced with a test.
3. *Examples.* All five `true` examples are two-way exclusives with disjoint fields. Added two
   many-way cases whose groups share required fields, as the fixture's does.

| Variant | bad ts | bad schema | good ts | real | one-meaning | gap |
|---|---|---|---|---|---|---|
| reader wording | 0.500 | 0.447 | 0.040 | 0.033 | 0.060 | 0.460 |
| **admits wording** | **0.600** | **0.537** | 0.043 | 0.040 | 0.057 | **0.557** |
| tightened focus | 0.463 | 0.397 | 0.040 | 0.040 | 0.070 | 0.423 |
| shared-field examples | 0.483 | 0.433 | 0.040 | 0.033 | 0.060 | 0.443 |
| all three | 0.453 | 0.410 | 0.040 | 0.040 | 0.057 | 0.413 |

**Asking what the shape admits is worth 0.10 on the bad side and nothing on the good side.** Every
clean cell holds within 0.01. The same move that saved r2 in E2b, and the one wording property the
working rules share.

**The other two hypotheses were wrong, and cost.** A focus line that defines the test loses 0.04,
closer examples lose 0.02, and all three together land below the wording alone. Three entries now say
the same thing — E18's readers, E20's count instruction, and this — that adding machinery to a
question dilutes it, and that the gain is in how the question itself is put.

---

## E24 — 2026-09-17 — how much of rule 1 is the file name

The bad declared type under seven names, ordered from one that suggests a single meaning to one that
spells out the operations.

| Name | r1 | r2 | r5 |
|---|---|---|---|
| *(none)* | 0.417 | 0.833 | 0.643 |
| `pointer-state.ts` | 0.563 | 0.847 | 0.633 |
| `send-mouse-body.ts` | 0.600 | 0.853 | 0.683 |
| `mouse-operations.ts` | 0.657 | 0.847 | 0.660 |
| `click-drag-keyhold-request.ts` | **0.660** | 0.860 | 0.687 |

**Rule 1 is the name-sensitive rule.** It moves 0.24 across the sweep; r2 moves 0.027 and r5 0.054,
both inside the floor. The two rules whose fault is visible in the text read the text; the rule that
needs to know the domain has several operations reads the name.

**Naming the operations is not enough to fire it**, 0.660 at the far end — so the E23 ceiling is not
domain starvation alone.

**A suggestive name cannot manufacture a violation.** The good type reads 0.050 under the name that
promises three operations. A discriminant on the page settles the question against the label, which
is the failure mode a name in the state was most likely to introduce.

---

## E25 — 2026-09-17 — one bad declaration among clean siblings

The bad declared type placed in one text with up to six well-designed declarations from unrelated
domains — a tagged invitation status, a feature flag union, a money pair, a page with a named end
cursor, an audit entry, a sensor reading. One artifact, `mouse-api.ts`.

| Text | r1 | r2 | r5 |
|---|---|---|---|
| bad alone | 0.593 | **0.833** | **0.700** |
| bad + 1 clean sibling | 0.513 | 0.823 | 0.670 |
| bad + 3 clean siblings | 0.437 | 0.667 | 0.547 |
| bad + 6 clean siblings | 0.393 | 0.720 | 0.573 |
| 3 clean, bad, 3 clean | 0.170 | **0.440** | 0.480 |
| 6 clean siblings, bad last | 0.187 | **0.397** | 0.503 |
| 6 clean siblings, no bad | 0.080 | 0.153 | 0.240 |

**A verdict is about the text, not about the worst declaration in it.** `max` aggregates rules;
nothing aggregates declarations, and one call cannot be asked to.

**Position outweighs count.** The same seven declarations read 0.720 on r2 with the bad one first,
0.440 buried and 0.397 last. Moving the fault down the text costs more than doubling the clean
material around it, r1 most sharply.

**Bulk produces no false positives.** Six clean declarations read 0.080 / 0.153 / 0.240, the cleanest
multi-declaration reading measured. The failure mode is misses only.

**So the scale the rules were measured on is one declaration.** A violation at 0.833 alone lands at
0.440 when it sits fourth of seven — inside the band where a linter shows nothing.

---

## E26 — 2026-09-17 — instructing the rules against dilution

Two scoping sentences appended to every question's `focus`, with ", in at least one declaration of
the text" appended to each `true.what`. The first names the subject — judge each declaration on its
own and answer for the worst. The second denies the arithmetic — the answer is not a proportion.
E25's fixture.

| Text | Wording | r1 | r2 | r5 |
|---|---|---|---|---|
| bad alone | current | 0.637 | 0.840 | 0.700 |
| | worst declaration | 0.620 | 0.843 | 0.727 |
| | not a proportion | 0.627 | 0.847 | 0.723 |
| 3 clean, bad, 3 clean | current | 0.170 | 0.383 | 0.497 |
| | worst declaration | 0.150 | **0.493** | **0.630** |
| | not a proportion | 0.133 | **0.507** | 0.580 |
| 6 clean, no bad | current | 0.077 | 0.157 | 0.253 |
| | worst declaration | 0.080 | 0.190 | 0.293 |

**Dilution is partly a reading of the subject, not a fixed property.** Naming the worst declaration
as the subject recovers a quarter of r2's loss and a third of r5's, at no cost on single-declaration
text.

**It is not a repair.** A buried r2 fault reads 0.507 against 0.840 alone and stays inside `unclear`,
so a linter still shows nothing. The two wordings are level with each other, and the clean control
drifts up 0.03–0.04 on both — inside `clear`, and the only cost measured. **r1 does not respond**: it
is short of evidence, not of instruction, the same result E23 and E24 reach from two other
directions.

Neither sentence is adopted; the question set is worded for the artifact it was measured on. This
entry is where to start if a whole-file fallback is ever wanted.

---

## E27 — 2026-09-17 — an outside review of the three wordings

The question set, the state shape, the constraints and every measured number so far were given to
`kimi -m kimi-code/k3-256k` with one instruction: name the defect, give a paste-ready replacement,
predict the effect and name the cell that would falsify it. Its three rewrites were applied together
— questions are evaluated independently, so one run measures each.

Its shared diagnosis: all three questions route the semantic claim through `artifact.domain`, a file
name that carries no evidence, while the field names in `source` go unmentioned.

| Rule | Cell | Current | Reviewed | Δ |
|---|---|---|---|---|
| r1 | bad ts | 0.613 | 0.497 | **−0.117** |
| | good ts / real schema | 0.050 / 0.040 | 0.050 / 0.043 | 0.000 |
| r2 | bad ts / bad schema | 0.853 / 0.857 | 0.870 / 0.843 | +0.017 / −0.013 |
| | good ts | 0.257 | **0.133** | −0.123 |
| | real schema | 0.153 | **0.103** | −0.050 |
| | one-meaning control | 0.483 | 0.423 | −0.060 |
| r5 | bad ts | 0.693 | 0.540 | **−0.153** |
| | variant-bound floor | 0.403 | **0.523** | **+0.120** |
| | one-meaning control | 0.337 | 0.190 | −0.147 |

### Findings

**r2's rewrite is adopted and does what it predicted.** The diagnosis was that the question is an
unbounded existential — every type admits meaningless values, negative coordinates and empty ids
included — so a clean shape can never read low. Bounding it to a conditional field the shape leaves
settable everywhere halves the clean side and the bad side does not give back. The declared-type gap
is 0.70.

**r1's rewrite fails its own falsifier.** Predicted 0.72–0.82 on the bad type, measured 0.497, with
the good side unmoved. Pointing the question at field names rather than at the file name loses signal
— the third independent result (E23, E24, here) that r1's ceiling is not in its wording.

**r5's rewrite fails both of its falsifiers.** The bad type falls 0.153 and the variant-bound floor —
the number the rewrite was written to lower — rises 0.120, to within noise of the bad reading it is
supposed to be distinguished from.

**The review's structural note stands whatever the wordings say.** r5's third `true` example — an
optional field whose absence carries a meaning the shape never names — fires on every rule 1
violation, so r5's bad-side reading is partly borrowed from r1's evidence. On a flat record with no
collections and no null/empty triple, that is most of what r5 has to go on, and `max` over the two
rules counts one defect twice.

---

## E28 — 2026-09-17 — rule 3 reopened, bounded

Asked loosely — does the shape spread facts that are only correct together across separate fields —
rule 3 measures what every shape does to something. Bounded the way r2 was in E27, the question
becomes whether one part can be *set without* the parts it is only correct with. Two new artifacts
differ in that and nothing else: `quote.ts` with `amount`, `currency`, `validFrom`, `validUntil`
loose, and the same type carrying `price: Money` and `validity: Period`.

| Cell | rung | loose | bounded |
|---|---|---|---|
| split `quote.ts` | 2 typed | 0.407 | **0.857** |
| joined `quote.ts` | 2 typed | 0.273 | **0.133** |
| bad type / good type | 2 typed | 0.583 / 0.387 | 0.723 / **0.163** |
| bad sample / good sample | 1 raw | 0.573 / 0.603 | 0.717 / **0.643** |
| real schema | 3 schema | 0.417 | **0.217** |
| one-meaning control | 2 typed | 0.237 | **0.110** |

**The rule was not weak, the question was unbounded.** Every cell the loose form could not clear now
clears. The second rule recovered by the same move, after r2 in E27.

**Rule 3 starts at rung 2.** The samples separate by 0.074, the declarations by 0.56. A lone value
shows `x` beside `y` but not whether either can arrive without the other, and the good sample's 0.643
is the false positive that sets the floor.

**The fixture now has a pair that isolates one rule.** On the quote pair r1 reads 0.07 against 0.07
and r5 0.09 against 0.09, while r3 reads 0.86 against 0.13.

**r2 leaks onto the split artifact**, 0.57 against 0.30 on the joined one. An `amount` with no
currency is also a combination that denotes nothing, so the two rules genuinely overlap here rather
than one misfiring, and `max` treats both as one finding.

---

## E29 — 2026-09-17 — single-fault pairs, and rule 1 firing

A second outside review proposed one change to r5, named two artifacts that would expose a misfire in
r2 and r3, and specified three single-fault pairs in domains the criteria examples do not touch.

| Cell | rung | r1 | r2 | r3 | r5 |
|---|---|---|---|---|---|
| greenhouse bad — six variant fields, no discriminant | 2 | **0.763** | 0.833 | 0.217 | 0.343 |
| greenhouse good — union on `kind` | 2 | **0.030** | 0.087 | 0.217 | 0.120 |
| mount bad — `trackingRateDegPerSec` loose beside `tracking: boolean` | 2 | 0.167 | **0.877** | 0.240 | 0.260 |
| mount good — two variants on `tracking` | 2 | 0.160 | **0.070** | 0.190 | 0.203 |
| booking schema, combination ruled out by a refinement | 3 | 0.087 | 0.123 | 0.153 | 0.253 |
| label size, `widthMm` and `heightMm` both required | 2 | 0.050 | 0.250 | **0.487** | 0.103 |
| address, four fields correlated in the domain | 2 | 0.060 | **0.507** | 0.303 | 0.180 |

### Findings

**Rule 1 fires, and the ceiling was the artifact.** 0.763 against 0.030, a gap of 0.73 — the widest
any rule has produced here, and r1's first reading in the violation band. `send-mouse-body`'s four
cases all share `x` and `y`, the weakest form of the fault; the greenhouse command's cases have
disjoint field groups. Three experiments treated a ceiling of 0.5–0.66 as a wording problem (E22,
E23, E27) and a fourth as a domain-evidence problem (E24). It was neither.

**Two more single-fault pairs exist.** The mount pair moves r2 from 0.877 to 0.070 while the other
three rules stay flat within 0.06 — a discriminant is present in both halves and only the binding of
one field changes. The hive pair moves r5 from 0.717 to 0.327 on optionality of one collection.

**r1's fault does not entail r2's.** The review predicted that a flat multi-case struct must also
read high on r2. It does on the greenhouse pair, 0.833 — but the mount pair shows the converse
separation, r2 0.877 with r1 at 0.167, so the two rules are independently addressable.

**A refinement counts as ruling a combination out.** r2 reads 0.123 on a flat Effect schema whose
`filter` forbids the meaningless combination, though the criteria name only a union member and a
discriminant. The predicted rung-3 false positive does not occur.

**Two false positives found.** r3 reads 0.487 on a label size whose `widthMm` and `heightMm` cannot
be supplied one at a time — the bounded question asks whether a part can be set without its partners
and the answer here is no. r2 reads 0.507 on a plain address, four fields correlated in the domain
with none conditional on another. Nobody predicted the second.

**The r5 change fails its own falsifier and is not adopted.** Extending r5's `false` side to name
variant-bound absence left the floor at 0.417 → 0.427. What it did instead was fix the good-schema
anomaly of E19, 0.410 to 0.297, at a cost of 0.050 on the bad side — the second falsifier, tripped
exactly.

---

## E30 — 2026-09-17 — two false positives, one fix taken

One clause per rule against E29's misfires, measured together on every cell either could disturb.
r3 gains, in `focus` and on the `false` side: a part already meaningful on its own is not half of a
fact, however closely it goes with its neighbours. r2 gains: a field whose correct values depend on
another, but which means something in every combination the shape admits, is not the finding.

| Cell | r3 current | r3 patched | r2 current | r2 patched |
|---|---|---|---|---|
| label size — the r3 false positive | 0.427 | **0.130** | 0.260 | 0.207 |
| address — the r2 false positive | 0.290 | 0.207 | 0.487 | **0.397** |
| quote split — r3's true positive | 0.860 | 0.813 | 0.553 | 0.490 |
| quote joined | 0.127 | 0.123 | 0.317 | 0.263 |
| mount bad — r2's true positive | 0.237 | 0.183 | 0.880 | **0.783** |
| mount good | 0.193 | 0.170 | 0.070 | 0.073 |
| bad type / good type | 0.727 / 0.163 | 0.747 / 0.150 | 0.860 / 0.147 | 0.807 / 0.147 |
| greenhouse bad | 0.213 | 0.167 | 0.817 | **0.613** |

**r3's clause is adopted.** The false positive falls into `clear` and the true positive holds. What
separates the two artifacts is not whether both fields are required — `amount` and `currency` are
both required too — but whether a part means anything alone. A label has a width; an amount has no
meaning without its currency.

**r2's clause is rejected.** It half-fixes the address, still inside `unclear`, and charges three
true positives for it: greenhouse bad out of the violation band entirely, mount bad 0.880 to 0.783. A
false positive on an address is cheaper than a missed violation on a command type, so the address
reading stands as a known cost.

**Overlap between rules is not a defect to engineer away, short of redundancy.** Two rules reading
one fault is acceptable and `max` reports it once; two rules that never move apart would mean one of
them carries nothing. Each rule has a pair on which it moves and the others hold: r1 on the
greenhouse pair (0.763/0.030 while r3 holds at 0.217 and r5 at 0.343/0.120), r2 on the mount pair
(0.877/0.070 while r1 holds at 0.167/0.160), r3 on the quote pair (0.790/0.130 while r1 holds at 0.07
and r5 at 0.09), r5 on the hive pair (0.717/0.357 while r1 holds at 0.12/0.10 and r3 at 0.11/0.13).

### r2's floor on flat records

The hive pair read all four rules, and r2 answered 0.853 on the faulty half and **0.690 on the clean
one**. Four variants of that clean record:

| Clean record | r2 |
|---|---|
| `hiveId`, `inspectedAt`, `queenSeen`, `framesReplaced` | 0.710 |
| the boolean removed | 0.550 |
| the collection removed | 0.580 |
| a number in place of the boolean | 0.633 |

Neither the boolean nor the collection causes it: a three-field record with nothing optional and
nothing conditional reads 0.550.

**r2's clean readings in the fixture are earned by union structure, not by the absence of a fault.**
Every good artifact in the 2×2 is a tagged union and reads 0.12–0.15; every clean flat record
measured reads mid-band — address 0.507, customer 0.423, hive 0.550–0.710. Within a pair r2 still
separates cleanly, 0.877 against 0.070 on the mount pair, but an absolute r2 reading on a lone flat
record is not a verdict about that record. Most types in a real codebase are flat records, so this is
the largest open problem in the set.

---

## E31 — 2026-09-17 — rule 4 reopened against an artifact built for it

Rule 4 was dropped after the bad sample fell from 0.72 to 0.24 when the field inventory stopped being
sent, and after it inverted on declared types. Both results came from the mouse fixture, which has
almost nothing for rule 4 to find. A pair built for it: an invoice carrying `lineCount` beside `lines`
and `totalLabel` beside `total`, against the same invoice with each fact written down once. Both
wordings, all three rungs.

| Cell | rung | loose | bounded |
|---|---|---|---|
| invoice, fact stored twice / written once | 1 raw | 0.913 / 0.127 | **0.923 / 0.107** |
| invoice, fact stored twice / written once | 2 typed | 0.697 / 0.060 | **0.930 / 0.080** |
| invoice, fact stored twice / written once | 3 schema | 0.700 / 0.060 | **0.933 / 0.083** |
| `total` beside `lines`, derivable rather than restated | 2 typed | 0.130 | 0.580 |
| bad type / good type | 2 typed | 0.213 / 0.217 | 0.423 / 0.140 |
| address / hive good | 2 typed | 0.063 / 0.077 | 0.123 / 0.107 |

**Rule 4 separates by 0.85 at every rung**, the widest and the most even of any rule here, and its
floor is 1. A lone value shows `lineCount: 2` beside a two-element list; a declaration shows the same
thing without the values.

**What was missing in E6 was an artifact, not an inventory.** The loose wording — the one recorded as
having no surviving configuration — separates this pair 0.70 against 0.06. The inventory was never
supplying information the source lacked; it was standing in for a fault the fixture did not have.

**Every clean control stays quiet**, 0.107 to 0.140, the flat records included. Rule 4 is the only
rule that clears a plain flat record as confidently as it clears a tagged union — the one place r2 is
weakest.

**A derived value reads mid-band**, 0.580 for a `total` beside the `lines` it could be computed from.
Nothing restates it in words, but a total that can disagree with its own lines is the same hazard in
weaker form.

**The pair confirms the isolation.** r4 moves 0.93 to 0.07 while r1 moves 0.01, r3 0.17 and r5 0.03.
r2 reads 0.53 against 0.23 — its flat-record floor again, not a finding about this pair.

---

## E32 — 2026-09-17 — the rules turned on this log

A one-off run, kept as a result rather than as a script. Each entry of this file went to Jev as one
artifact beside a statement of what the project currently runs, and two nouls said whether the entry
still carries anything: `spent` — is everything it establishes a fact about an instrument now gone —
and `restated` — does a later entry establish all of it again. Both worded so 1.0 means droppable, both bounded the way the type rules
are.

Across all 33 sections: `spent` 0.06–0.38, `restated` 0.08–0.19. The highest `spent` readings are
E0 run 1 at 0.38 and E17 at 0.28, both entries whose tables are largely Score columns.

Two synthetic entries as falsifiers, written to sit at the ends: one is a bare `shape_risk` table with
no finding beyond its own numbers, the other a noise-floor measurement.

| Probe | spent | restated |
|---|---|---|
| Score table, no finding | **0.67** | 0.16 |
| noise floor, three runs | **0.18** | 0.18 |

**The question works and the answer is flat.** A constructed spent entry reads 0.67 against 0.18, so
the 0.06–0.38 spread on the real log is a reading rather than a failure to discriminate: no entry
here is wholly spent. Every one carries at least one finding that a current wording, rung or reading
rests on, even where its tables measure instruments that are gone.

**So the compaction is inside entries, not by entry.** What came out was dropped columns, token
counts, per-cell probability dumps and rankings that reproduce an earlier ranking — none of it a
finding, none of it separable at the granularity a per-entry question can see.

**`restated` carries nothing at all**, a 0.11 spread with the synthetic pair inside it. Judging
whether a later entry says the same thing requires the later entries, and the state holds one entry
at a time. It is the E18 failure in another domain: a question about something absent from the state
gets a plausible answer about nothing.

---

## E33 — 2026-09-17 — the rules against artifacts a reviewer objected to

Eight snippets taken verbatim from pull requests, each with the reviewer's own comment recorded beside
it and never sent. Where the review changed the code, both halves are here. `src/prcheck.ts`, three
runs per cell, `*` marks the violation band. Rules 6 and 7 are in the set, so this is the whole
question set as it stands.

| Artifact | r1 | r2 | r3 | r4 | r6 | r7 | r5 | objected to |
|---|---|---|---|---|---|---|---|---|
| consent, as proposed | 0.18 | **0.80** | 0.25 | 0.24 | 0.39 | 0.48 | 0.44 | every column nullable |
| consent, as merged | 0.11 | 0.66 | 0.13 | 0.14 | 0.39 | 0.43 | 0.31 | — |
| redirect, two optional names | **0.76** | 0.55 | 0.31 | 0.12 | 0.25 | 0.37 | 0.39 | which operation this is |
| move, caller supplies turn and mode | 0.14 | 0.40 | 0.18 | 0.22 | 0.47 | 0.39 | 0.22 | state restated by the caller |
| player name, empty or absent | **0.70** | **0.80** | 0.19 | 0.33 | 0.34 | **0.78** | **0.83** | `PlayerName \| ""` and optional |
| display name as identity | 0.11 | 0.41 | 0.17 | 0.16 | 0.52 | 0.56 | 0.13 | a name used as an identity |
| speech segments as bare tuples | 0.13 | 0.15 | 0.23 | 0.15 | **0.74** | **0.73** | 0.13 | `tuple[str, str]` |
| boundary primitives | 0.06 | 0.26 | 0.43 | **0.79** | 0.43 | **0.89** | 0.23 | every field admits nonsense |

**Five of eight fire, four of them on the rule the objection names.** `player name` fires on r5 at
0.83, which is the reviewer's point exactly — `PlayerName | ""` optional gives three spellings of
nothing.

**One fires through the wrong rule.** The consent pair separates 0.80 / 0.66 on r2 and only 0.44 /
0.31 on r5, where the fault is. The objection is that `consent_given` is nullable when consent is
either given or not; r5 reads it as a small thing and r2 as a large one. Both directions are right,
the gap is 0.14, and r2's flat-record floor (E30) is what it costs.

**One is out of reach.** `move(coords, currentPlayer, gameType)` reads 0.14–0.47 everywhere. The
objection is that the game already holds the turn and the mode, so a second copy can disagree — a fact
about the surrounding component, not about this signature. Nothing derived from outside the artifact
is sent (§1), so there is nothing for r4 to compare against. Not a wording failure.

**Two were holes and are now closed.** `tuple[str, str]` and the boundary type read below 0.45 on
every rule of the five-rule set. They were what rules 6 and 7 were built from, and they now read 0.74
and 0.89.

**One is still open.** `PlayerName = string` used as `currentPlayer` reads r6 0.52 — the cost recorded
in E35.

---

## E34 — 2026-09-17 — rule 6, a thing of the domain as a bare primitive

Every rule in the set to this point is relational: it asks how fields sit with each other. Nothing
asks whether one field's type says what that field means. Rule 6 asks that, bounded the way r2 and r3
were — not "does the shape use primitives", which every shape does, but whether a thing the domain
names as its own kind is carried so that any value of the primitive fits in its place.

Isolating pair, a library loan in a domain no criteria example touches, three runs per cell:

| Cell | r6 |
|---|---|
| `Loan` with loanId / memberId / isbn / branchCode as `string`, dueIn as `number` | **0.903** |
| the same with LoanId / MemberId / Isbn / BranchCode / Days | **0.163** |
| `def transcribe(path: str) -> tuple[str, str]` | 0.833 |
| the same as a record of two NewTypes | 0.327 |
| `PlayerName = string` as `currentPlayer` in a game response | 0.707 |
| falsifier: postal address, line1 / line2 / city / postcode all `string` | 0.273 |
| falsifier: board with width / height numbers and a cell grid | 0.240 |
| falsifier: note with `title: string`, `body: string` | 0.127 |
| falsifier: a tagged union of pointer commands, nothing shared | 0.313 |

**Gap 0.74 on the pair, and all four falsifiers clear.** The address one is the load-bearing falsifier:
four adjacent strings that are correctly strings, which an unbounded reading of this rule would fire
on.

**The floor is rung 2, and rung 1 is impossible.** A first version of this run counted a raw-value
cell at 0.833 as a pass. It is a false positive by construction: branding is invisible in a value, so
both halves of the pair serialize to identical JSON and no wording can separate them.

---

## E35 — 2026-09-17 — rule 6 against storage, and where a false side can land

A primitive is a statement about storage. Where a shape's subject is how a value is written down — a
table, a DDL, a row, a wire message, a packed layout — a column typed `TEXT` is an encoding, not a
claim that any string is a meeting, and the rule must not fire. Where the shape carries domain logic,
it must. No code-side gate: the distinction has to live in the question.

Three wordings in one request. `plain` is E34's. `scoped` appends one exonerating sentence to `focus`:
a shape whose subject is storage or transport states an encoding, and a primitive is the right thing
to find there. `kimi` is an outside rewrite that instead puts the exemption on the **`false` side**, as
a criterion a table can satisfy.

| Cell | kind | plain | scoped | kimi |
|---|---|---|---|---|
| SQLAlchemy `sa.Table` of `sa.Column(..., sa.String)` | storage | 0.803 | 0.757 | **0.423** |
| literal `CREATE TABLE artifacts(sha256 TEXT, byteLength INTEGER, …)` | storage | 0.783 | 0.743 | **0.340** |
| `.proto` message with `string sku = 1; string url = 2;` | storage | 0.730 | 0.583 | **0.427** |
| packed frame header, comment says wire layout, little-endian | storage | 0.740 | 0.367 | **0.170** |
| plain TS row type in `artifact-index-row.ts` | storage | 0.703 | 0.507 | **0.383** |
| `Loan` with bare primitives | logic, faulty | 0.907 | 0.870 | **0.853** |
| `PlayerName = string` | logic, faulty | 0.710 | 0.673 | **0.553** |
| `tuple[str, str]` | logic, faulty | 0.833 | 0.827 | **0.820** |
| `Loan` with things named | logic, clean | 0.153 | 0.153 | **0.123** |
| note with free text | logic, clean | 0.133 | 0.123 | **0.133** |
| trap: bare-primitive signatures in `loan-repository.ts` | logic, faulty | 0.863 | 0.847 | **0.770** |

**An instruction to disregard is worth 0.04; a reachable false criterion is worth 0.43.** The
exonerating sentence moves only the storage shapes with no storage library in them — the frame header
by 0.37, the bare row type by 0.20 — and leaves `sa.Table` and `CREATE TABLE`, where storage intent is
most explicit, at 0.74 and still firing. The same content as a `false` criterion drops those two to
0.42 and 0.34.

**Why: a false side the artifact's notation cannot express has nowhere to land.** Told a primitive is
acceptable in a table, the model weighs an instruction against visible evidence — `sa.Column
("meeting_id", sa.String)` really is a meeting identity carried as a bare string — and the evidence
wins. Given a criterion the table itself satisfies, the answer has somewhere to go. The same content
in SQL and in TypeScript moved five times differently, which is what points at the notation rather
than at the premise.

**The trap holds.** Domain logic in a file named `loan-repository.ts` still reads 0.770, so the
distinction is read off the content and not off the file name.

**The cost, accepted.** `PlayerName = string` in `GameResponse` falls 0.707 → 0.553 and leaves the
violation band. A response payload is arguably transport, so the reading may be right; where the cut
falls for request and response types is not measured.

Adopted as written, wording `kimi`, floor rung 2.

---

## E36 — 2026-09-17 — rule 7, and rule 8 on artifacts with no body

Rule 6 asks whether a thing of the domain is carried as a bare primitive. Rule 7 asks the other half:
whether a declared type — branded or not — admits values the field's own name rules out. Rule 8, a
first look, asks the most repeated objection in the review corpus: whether a callable says what it
touches. Both measured on the same 20 cells, so the data shapes double as rule 8's false side.

Two wordings of rule 7: `A` reads a name against its type, `B` asks what the shape admits.

| Cell | kind | r7 A | r7 B | r8 |
|---|---|---|---|---|
| `RecItem` with sku / url / amount / currency bare | r7 fault | **0.900** | 0.917 | 0.040 |
| the same, refined and branded, currency a literal union | r7 clean | **0.160** | 0.130 | 0.050 |
| `CREATE TABLE catalog_item(sku TEXT, url TEXT, price_cents INTEGER, …)` | r7 fault | **0.917** | 0.937 | 0.040 |
| the same with `CHECK` on every column | r7 clean | **0.133** | 0.150 | 0.043 |
| `{ minSegmentDurationSeconds: number; maxRetries: number }` | r7 fault | 0.930 | 0.930 | 0.040 |
| `Upload` dataclass, audio_filename / audio_extension as `str` | r7 fault | 0.893 | 0.913 | 0.043 |
| `LoanId = string & Brand<"LoanId">` beside `renewalCount: number` | r7 fault | 0.893 | 0.933 | 0.050 |
| falsifier: note with free text | quiet | **0.233** | 0.380 | 0.040 |
| falsifier: tagged union of pointer commands | quiet | **0.103** | 0.243 | 0.040 |
| `transcribe(path)` whose body reaches `.to("cuda")` and `put_object` | r8 fault | 0.460 | 0.410 | **0.980** |
| the same, taking the model and the writer as parameters | r8 clean | 0.420 | 0.480 | **0.100** |
| `isExpired(session)` reading `Date.now()` | r8 fault | 0.310 | 0.410 | **0.907** |
| `isExpired(session, now)` | r8 clean | 0.173 | 0.260 | **0.120** |
| a class with `__init__` then `prepare()` setting `self.audio` | r8 fault | 0.723 | 0.717 | 0.920 |
| a method whose body never reads `self` | r8 fault | 0.093 | 0.180 | 0.103 |
| `interface LoanRepository` returning `Promise<void>` | r8 fault | 0.380 | 0.473 | **0.143** |
| the same as `Effect<…, DbError, Database \| Clock>` | r8 clean | 0.297 | 0.397 | **0.123** |
| `interface LoanMath`, pure operations over named types | r8 clean | 0.497 | 0.650 | 0.070 |
| schema with a refined attempt count and a literal status | quiet | 0.120 | 0.327 | 0.047 |
| `remainingQuota(userId)` reading a store, returning a bare number | both | 0.513 | 0.693 | 0.857 |

**Rule 7 works, on two isolating pairs in two notations.** `RecItem` 0.900 / 0.160, gap 0.74.
`CREATE TABLE` 0.917 / 0.133, gap 0.78. Wording A wins: it costs nothing on the faults and clears the
two falsifiers by 0.15 and 0.14 more than B.

**Rule 7 needs no storage exemption, and that is E35's finding read from the other side.** Rule 6 fires
on a table and must be stopped. Rule 7 fires on a table and is right to, because SQL *can* state the
repair — `CHECK (price_cents >= 0)` — so the false side is reachable in that notation. The same table
swings 0.78 on its constraints alone. Where a notation can express the fix, the rule reads the fix.

**Rules 6 and 7 are orthogonal.** A branded `LoanId` satisfies rule 6 and reads 0.893 here. Branding
names a thing; it does not narrow what the thing admits.

**Rule 8 separates further than anything else in the set, where there is a body.** 0.980 / 0.100 and
0.907 / 0.120 on two isolating pairs, gaps of 0.88 and 0.79. It is inert on data: 0.040–0.050 across
nine shapes and schemas.

**Rule 8 is dead where there is no body.** An interface hiding a database behind `Promise<void>` reads
0.143; the same interface naming `Database | Clock` in its requirements reads 0.123. A gap of 0.02
against a run-to-run spread of 0.01–0.03. With a body the violation is a contradiction inside the
artifact — the body names `cuda`, the signature does not — and both halves are visible. With no body,
the hidden effect is only a violation against knowledge of what `save` must do, which is not in the
state. Rule 8 is about implementations, not declarations.

**Rule 8 misses the inverse fault.** A method that never reads `self` declares a dependency it does not
use, and reads 0.103. That is a different question, not a wording problem.

Rule 7 adopted as wording A, floor rung 2 — a refinement is invisible in a value, so rung 1 is
impossible for the same reason as rule 6.

---

## E37 — 2026-09-17 — the mid-band is a reading, and rule 8 asked of a name

An outside review of E36 rejected both of that entry's readings and proposed a falsifier for each.

**Rule 7's 0.497 on `LoanMath` is not drift; it is unverifiability.** `term: Days`, `rate: FeePerDay`
— the artifact never shows what `Days` is, so neither the true side nor the false side can be checked
from the text, and the answer lands in the middle. Calling the cell clean imports knowledge of what
`Days` means from outside the artifact, which is the move E36 diagnoses in rule 8. The falsifier is to
make the definitions visible:

| `interface LoanMath`, three runs | r7 |
|---|---|
| named types only, definitions elsewhere | 0.507 |
| definitions inlined as bare brands over `number` | **0.767** |
| definitions inlined as refined schemas | **0.237** |

The reading tracks what the text shows, not what kind of artifact it is. The 0.31–0.46 readings E36
attributes to "function bodies" are the same thing: cells whose named types are opaque.

**The fix is a reachable false side, again.** Not an instruction that a parameter list is acceptable,
which E35 measured as weak, but a criterion the artifact can satisfy by comparing two visible names: a
field named `term` typed `Days` has *delegated* its claim to that type's declaration, where this
question applies instead.

| Cell | r7 | with delegation | Δ |
|---|---|---|---|
| `LoanMath`, opaque named types | 0.500 | **0.170** | −0.33 |
| `RecItem` bare | 0.900 | 0.897 | −0.00 |
| `{ minSegmentDurationSeconds: number; maxRetries: number }` | 0.927 | 0.913 | −0.01 |
| `CREATE TABLE` without constraints | 0.917 | 0.910 | −0.01 |
| branded but unrefined | 0.900 | 0.870 | −0.03 |
| `type Sku = string` used as `sku: Sku` | 0.903 | **0.783** | −0.12 |

Predicted at ≤0.25 with faults moving under 0.05, and both held. The last row is the cost the reviewer
named in advance: a well-named bare alias can hide behind delegation. It costs 0.12 and the cell keeps
firing, because the alias is declared in the same artifact and the comparison is still available. An
alias imported from elsewhere would escape, and that is untested.

**Rule 8 is recoverable on artifacts with no body — by asking about the name instead.** E36 concluded
that a hidden effect is only a violation against outside knowledge. That is true of the *body*
question and false of the rule. A callable's name is inside the artifact, so `save(loan):
Promise<void>` is a contradiction the text can show: a write with no store in sight.

| Cell | by name | by body |
|---|---|---|
| `interface LoanRepository` returning `Promise<void>` | **0.923** | 0.143 |
| the same as `Effect<…, DbError, Database \| Clock>` | **0.120** | 0.123 |
| `interface LoanMath`, pure operations | 0.050 | 0.070 |
| a plain data shape | 0.037 | 0.040 |
| `transcribe(path)` whose body reaches a GPU and a bucket | 0.460 | **0.980** |
| the same, taking the model and the writer | 0.220 | **0.100** |
| `isExpired(session)` reading `Date.now()` | 0.040 | **0.907** |
| `isExpired(session, now)` | 0.040 | **0.120** |

Predicted at 0.65–0.80 for the first row and ≤0.20 for the second; the first beat its prediction.

**The two forms are complementary, not a rewording of each other.** Each is blind where the other
works. The name question cannot see a GPU inside `transcribe`, because `transcribe` claims only a
computation; the body question cannot see anything in an interface, because there is no body. Adopted
as two rules: r8 reads the name against the declaration, r9 reads the body against it. Both are inert
on data — 0.04 across nine shapes and schemas — so neither costs anything where it does not apply.

**What the ladder does not describe.** Both sit at rung 2 because that is where a declaration appears,
while r8 wants a callable and r9 wants a body — a distinction a rung does not draw, and does not need
to. On a shape with neither, both read 0.04, so they are inert rather than wrong and the floor carries
them. An axis for what kind of thing an artifact declares is deliberately not built.

---

## E38 — 2026-09-17 — the call at the other end of the delegation

Rule 7's delegation clause sends a claim from a field to the declaration of the type it is typed by.
That is sound because each artifact is judged on its own: the claim goes to the call that judges that
declaration. It is only sound if that call fires, and rule 7 asked about "a field or parameter", which
a type alias is neither. Second wording names a declared type as a third thing the question covers.

| Artifact, judged alone | as a field question | naming a type too | want |
|---|---|---|---|
| `type Sku = string`, `type PriceCents = number` | 0.770 | **0.950** | fire |
| the same branded, `string & Brand<"Sku">` | **0.587** | **0.927** | fire |
| the same refined, `Schema.NonEmptyString.pipe(brand)` | 0.113 | 0.107 | clear |
| falsifier: `type NoteBody = string`, `type NoteTitle = string` | 0.117 | 0.150 | clear |
| a record importing those aliases and typing its fields by them | 0.160 | 0.200 | clear |
| guard: the same record with the fields bare | 0.937 | 0.940 | fire |

**The handoff works, and one end of it was dropping the commoner case.** A record typed by imported
aliases reads 0.20 — delegation doing its job — and the aliases read 0.95 where they are declared. But
asked only about fields and parameters, the branded alias read 0.587, out of band: the declaration
that delegation routes to is the one shape the question did not cover, and `string & Brand<"Sku">` is
the form most real code takes. Naming a declared type raises the two faults 0.18 and 0.34 and moves no
clean side more than 0.04, the refined alias falling rather than rising.

**The falsifier holds.** Two aliases over `string` whose names claim nothing beyond text read 0.150.
The rule is reading the name against the definition, not firing on any alias it sees.

Adopted into rule 7's wording.

---

## E39 — 2026-09-17 — the nine rules on a codebase not built for them

Every rule to this point was tuned on isolating pairs written for it. This is the set pointed at
`dnd/packages`, 941 TypeScript files, of which 321 declare a shape and fit the token budget. One call
per file, nine questions, ranked on the worst applicable rule.

43 of 321 carry a rule in the violation band — r9 17, r4 12, r7 10, r2 7, r5 2, r6 2, r8 0, r1 0, r3 0.

Four were read against their source. They were picked for spread across rules rather than by rank,
because the top of the ranking is r9 throughout and a sample of five would have measured one rule.

| File | Rule | Reading | Verdict |
|---|---|---|---|
| `mcp/src/play-session-access.ts` | r9 | 0.92 | true positive |
| `mcp/src/saved-session-authorization/capacity.ts` | r7 | 0.80 | true positive |
| `battle-runtime/src/active-effect/source.ts` | r2 | 0.83 | true positive |
| `battle-runtime/src/battle-reducer/d20-test-natural-one-reroll.ts` | r4 | 0.83 | true positive |

**Two findings are corroborated by the file itself.** The d20 file declares `D20TestRollFacts` with
`naturalD20` beside `rolledD20s`, the selected die and the dice it was selected from, and carries the
constant `"D20 Test rolled d20 selection does not match the selected D20 Test result"` — a runtime
check for exactly the disagreement r4 says the shape admits. `active-effect/source.ts` is seventeen
lines whose docstring states the invariant in prose — unit effects carry both refs, companion effects
one, environmental effects neither — over a flat record with two independent optional fields and a
`kind` typed `string`, which admits every combination the sentence rules out.

**One file holds a fault and its repair together.** `play-session-access.ts` declares
`currentEpochMilliseconds()` reading `Date.now()` and `generatedGuestAccessGrant()` reading
`randomBytes`, and `playSessionIsExpired(tenure, nowMs)` taking the clock as a parameter. r9 fires on
the file and the repaired function is the shape its `false` side describes.

**The rules disagree about which fault a shape has, and the set still reports it.** On
`active-effect/source.ts` the bare `kind: string` reads r6 0.61 and r7 0.42, both under the band,
while r2 catches the real fault at 0.83. Ranking on the worst rule is what makes that file surface.

**A skip list matters more than the questions.** A first run over the repository root spent its whole
600-file budget on `.references` and `scripts` — vendored third-party code and build tooling — and
ranked 25 vendored files at the top. Dot-directories are now skipped.

**What this does not establish.** Only flagged files were read, so the false-positive rate rests on
four of 43 and the false-negative rate on nothing: no clean-reading file was audited for a fault the
set missed. 119 files were skipped as oversized, and the scale finding (E25) applies to what remains —
two of the four examined are over 400 lines, where a single fault dilutes.

---

## Open measurements

`src/e0.ts` runs the fixtures — the 2×2 in three notations, the quote pair, the invoice pair and one
real schema: `bun run e0`, `--with-inventory` to reproduce runs up to E4, `--ablate` for E10,
`--dump` to print the request without sending it. `src/scan.ts` is the worklist:
`bun run scan <dir> [--limit N]`. Both share `src/questions.ts`, so a rewording moves them together.
There are no unit tests: every question costs an API call, and the measurements are this log.

Which rules Jev answers, and from which rung:

| Rule | Floor | Isolating pair | bad / good |
|---|---|---|---|
| 1 — variants carry an explicit discriminant | 1 raw | greenhouse command | 0.763 / 0.030 |
| 2 — every combination is meaningful | 1 raw | mount command | 0.877 / 0.070 |
| 3 — correlated facts travel as one value | 2 typed | quote | 0.790 / 0.130 |
| 4 — one fact, one representation | 1 raw | invoice | 0.930 / 0.080 |
| 5 — unknown / absent / empty distinct | 2 typed | hive inspection | 0.717 / 0.357 |
| 6 — a thing of the domain has a type | 2 typed | library loan | 0.853 / 0.123 |
| 7 — a type admits only what its name claims | 2 typed | recommendation item | 0.897 / 0.170 |
| 8 — a name's resource is in the declaration | 2 typed | loan repository | 0.923 / 0.120 |
| 9 — a body reaches only what it declares | 2 typed | transcriber | 0.980 / 0.100 |

Open:

- **Rule 6's response-payload cut.** `PlayerName = string` in a response type reads 0.553 — out of
  band, where the same fault in a logic shape reads 0.85. Whether a request or response type is
  transport is not settled (E35).
- **Only one notation was tested for the unexpressible false side.** The finding is from SQL and
  proto against TypeScript (E35, E36). Whether r2's and r5's clean sides have the same defect on
  notations that cannot state their repairs is not measured.

- **r2 on flat records.** Clean flat records read 0.42–0.71 while tagged unions read 0.12–0.15
  (E30). Within a pair r2 separates cleanly; an absolute reading on a lone flat record is not a
  verdict about it, and most types in a real codebase are flat records.
- **r5's variant-bound floor.** A shape whose optionality is entirely explained by which case it is
  still reads 0.42 (E21), and its clean side on the hive pair is 0.357. Two fixes tried, both
  rejected on their own falsifiers (E21, E29).
- **Scale.** A whole file judged as one artifact loses the fault: 0.833 alone, 0.440 fourth of seven,
  0.397 last (E25). One declaration is the scale the rules were measured on.
- **Rules tuned on isolating pairs are untested on artifacts that break several at once**, beyond the
  overlaps already logged: r2 on the split quote (E28), r5 borrowing r1's evidence on flat records
  (E27), r4 reading 0.33 on the joined quote against 0.14 on the split one (E31 run).
- **Localization is out of scope**: no field names go in the request, so no run will say which field
  is at fault.
- **The bad declared type was written here**, and its optional markers are a judgement. A different
  transcription could move that whole column.
- **Notation moves the numbers** as much as design does on one rule: one shape written three ways
  spans 0.19–0.52 on r2's good side (E19).
- **A verdict covers only the source handed over.** A schema importing its parts is the common case,
  and what it imports is invisible (E8).
- **The bands are inherited, not fitted.** Order is the finding; nothing here is calibrated.
