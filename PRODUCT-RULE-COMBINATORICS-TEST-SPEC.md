# Rule combinatorics: executable specification for Phase F

Status: required test design, not an implemented test suite. This accompanies
[the configuration specification](./PRODUCT-CONFIGURATION-SPEC-DRAFT.md).
The user explicitly requires tests that describe the combinations of rules and settings.
Implementation is tracked by [Phase F issue #3](https://github.com/dearlordylord/jevs/issues/3).

## What the suite proves

Given built-in defaults, user/project configuration, local packs, consent, file paths,
and controlled backend answers, the suite specifies which rules are requested, which
files leave the machine, which findings are emitted, and why. Backend judgment quality
is a separate question; fake probabilities cannot prove that a Noul question captures
its intended concept.

Use a small independent table/oracle for expected public behavior, not a copy of the
implementation's resolver. Each fixture has a descriptive name, input layers, event,
expected rule IDs/request count, expected selection and provenance, and expected result.
Failures show a minimal counterexample and reproducible seed without secrets or paid
responses. Store generated regressions as named fixtures when they expose a domain edge.

## Exhaustive small-domain selection matrix

Exhaust every combination of these seven Boolean conditions for one candidate file/rule:

1. Consent matches the repository/backend/destination.
2. The file matches effective global inclusion.
3. A global exclusion matches the file.
4. The pack is enabled.
5. The rule is enabled.
6. The rule's include patterns match the file.
7. The rule's exclusion patterns match the file.

The rule is requested exactly when consent and both inclusion checks hold, neither
exclusion matches, and both activation checks hold. This is 128 explicit combinations,
not a claim to enumerate every possible configuration. Independently test built-in
applicability and filesystem eligibility as additional gates. Configuration validity
is checked before any backend request, including when some valid rules could run.

| Scenario | Required observable outcome |
|---|---|
| Enabled rule in disabled pack | No request for that rule |
| Rule includes a globally excluded file | No source egress |
| User includes `src/**`; project includes `lib/**` | Only effective `lib/**` selection remains |
| User excludes `**/*.secret.ts`; project supplies exclude `[]` | User exclusion still applies |
| Missing include vs include `[]` | Inherit vs select no files |
| One valid pack plus an invalid selected pack | Configuration unavailable; zero backend requests |
| Duplicate identities | Configuration error with both origins |
| Same local rule ID in two distinct packs | Distinct qualified identities, no collision |
| Every rule disabled/inapplicable | Skipped, zero backend requests |
| Local pack relocated, same source patterns | File matching still uses repository root |

## Configuration and provenance properties

Generate bounded valid configurations directly; test invalid configurations through
separate generators instead of filtering away most generated input.

1. **Exclusion monotonicity:** adding an exclusion at any layer cannot increase eligible
   files. No higher-layer selection can weaken an inherited exclusion.
2. **Include replacement:** once a higher-precedence include list is supplied, changing
   lower-precedence include lists cannot alter effective selection. Exclusions remain
   independently active.
3. **Identity and locality:** adding an empty configuration layer changes no behavior;
   changing one rule's threshold/message cannot change another rule's configuration.
4. **Stable meaning:** reordering object keys or deduplicating identical exclusion
   patterns changes neither effective selection nor requested rules. Do not claim
   general layer commutativity: layer precedence is deliberately significant.
5. **Provenance agreement:** `config explain` and the runtime select the same effective
   policy. Every effective value has an origin; overridden includes are never reported
   as active. Reordering equivalent exclusions may change display order only.
6. **Roundtrip:** decoding a canonical serialized configuration preserves resolved
   meaning. JSONC comments need not survive serialization. Unsupported fields/versions
   must fail explicitly rather than disappear during decoding.
7. **Scope intersection:** per-rule selection can narrow but never expand the globally
   eligible file set.
8. **Root independence:** invoking from a working-tree subdirectory does not change
   selection relative to the same discovered root. Similar path prefixes, traversal,
   symlinks, and separator boundaries must not bypass exclusion or repository limits.

## Assessment, threshold, and reporting combinations

Use exact controlled probabilities, including 0, 1, exactly the threshold, and immediately
adjacent representable values. Include thresholds 0 and 1. The existing strict comparison
`probability > threshold` must remain explicit: equality produces no finding.

Test multi-rule outcomes before and after the global findings budget. A rule produces a
candidate finding only from its own validated probability; adding unrelated rules cannot
change that candidate finding, although budget competition may change final delivery.
Test deterministic ties, more candidates than budget, multiple files, and message overrides.
Increasing the budget extends the same sorted candidate list rather than reordering it.

Requested assessment keys must be exact at the product backend boundary. Cover missing,
extra, wrong-kind, non-finite, negative, and greater-than-one answers. Distinguish provider
normalization from product validation: if DecisionModel discards an extra raw provider key,
test exact-key rejection at the product boundary where extra keys are observable.
One clean reviewed result with no findings is distinct from skipped and unavailable.

Exercise zero, one, and multiple selected rules across zero, one, and multiple files:

- All selected rules for a file use one logical `decide` operation per attempt.
- Transient retries can add transport attempts but never repeat the host mutation.
- Duplicate paths do not produce duplicate evaluations within one event.
- Permuting file input or backend completion order preserves combined result ordering.
- Duplicate event/snapshot delivery suppresses repeat advice; a new snapshot is distinct.
- A file changed during review produces no current advice for the stale snapshot.

## Lifecycle and headless receipt scenarios

Use controlled clocks and barriers for timeout, retries, and concurrency, not real sleeps.
Test limits around the deadline, including exhaustion during retry backoff; concurrency
never exceeds the effective bound. Deliberately reorder completions to test aggregation.
The already-completed edit remains unchanged for every operational failure.

Exercise notification sequences: healthy → problem → same problem → changed problem →
recovery; repeated warnings are suppressed according to session/problem identity, but
all outcome records remain accurate. Cover multiple files reporting the same outage
concurrently and independent repository/backend/session identities.

Receipts count observed activity, not inferred host success. Cover missing receipts,
all-skipped events, reviewed files with no findings, mixed reviewed/unavailable results,
started-but-incomplete events, and concurrent receipt updates. A status read makes no
paid call and never treats missing observation as success. Corrupt/unwritable state
must produce an explicit limitation rather than a fabricated healthy receipt.

## Test layers and acceptance gates

- Pure rule/configuration tests: exhaustive small matrices and property-based laws.
- Deterministic Effect tests: the same DecisionModel authority as live use, controlled
  clock, service failures, and concurrent completion orders.
- Real subprocess fixtures: configure temporary project/user state and local packs;
  assert protocol output, selected rules, preserved file content, explanation origins,
  receipt output, and no secret/source-bearing diagnostic leakage.
- Host evidence: a targeted synthetic pinned-Codex TUI diagnostic probe; retain the
  known headless delivery limitation rather than relying on a model to echo warnings.
- Live rule-quality validation: explicit milestone only, within the user's authorized
  call budget, with synthetic source and sanitized aggregate evidence. Exact paid
  probabilities are not deterministic golden values and are not ordinary test output.

The passing existing suite is baseline coverage; it does not by itself satisfy this
Phase F contract. Require every named combination and law above to have an executable
test before Phase F is called complete. Generated tests must support seed replay and
counterexample shrinking. Do not substitute a coverage percentage for these behaviors.

Accepted semantic-test scope: specify positive/negative synthetic rule fixtures and
isolated-versus-batched evaluation in addition to deterministic composition tests.
[PRODUCT-RULE-EVALUATION-MODEL.md](./PRODUCT-RULE-EVALUATION-MODEL.md) defines the shared
fixture, expectation, scenario, observation, comparison, and run model. Keep local-pack
evaluations explicit and paid runs milestone-gated. Quint and `quint-connect-ts` are
future validation work, not current implementation or Phase F completion requirements.
