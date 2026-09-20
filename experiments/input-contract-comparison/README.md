# Input-contract comparison experiment

This is the credential-gated milestone for issue #16. It compares four versioned
renderers over the same human-authored TypeScript fixtures:

| Mode | Rendered context |
| --- | --- |
| `diff` | focused unified hunk around the changed member and the repository-relative path |
| `whole-file` | exact post-edit file and the same path |
| `declaration-only` | the edited interface, type alias, or schema and the same path |
| `declaration-context` | that declaration plus bounded outbound referenced declarations, completeness, and omission metadata |

The fixture manifest is [`fixtures.ts`](./fixtures.ts). It contains 24 fixtures (six
interfaces, six type aliases, six Zod schemas, and six Effect Schema definitions),
human-authored Rule 2 expectations and rationales, stable content identities, and the
pre-registered category memberships. Every fixture has a real member-level before/after
edit; the diff renderer includes only a bounded unified hunk around that edit, rather
than repeating the whole post-edit declaration. `manifest.ts` exposes the source-free
identity view for report tooling.

The declaration-context renderer reuses the parsing/artifact seam from the accepted
declaration-extraction experiment. It does not make extraction a production dependency;
this remains an experiment and has bounded declaration, depth, and source-character
caps. Missing required evidence is an explicit `incomplete-required` observation and is
never counted as a clear result. A renderer that structurally cannot carry a fixture's
required reference is recorded as `not-applicable`; it is excluded from semantic
denominators rather than treated as a provider failure or semantic negative. The
focused diff and declaration-only arms are therefore not baselines for context-required
fixtures, while whole-file and declaration-context remain applicable.

## Deterministic checks

```sh
npm run --silent test:input-contract
```

The test suite uses the same `ReviewBackend` and Effect `DecisionModel` seam with a
controlled offline model. It does not read credentials or make network calls.

## Live milestone

The pre-run contract is recorded in [`PLAN.md`](./PLAN.md). A command without `--live`
only prints the sanitized plan and an `inconclusive` outcome:

```sh
npm run --silent experiment:input-contract
```

The live command requires explicit opt-in, `TYPESAFE_API_KEY`, and an authorization
ledger covering all 288 logical slots and the selected retry maximum:

```sh
TYPESAFE_API_KEY=... npm run --silent experiment:input-contract -- \
  --live --authorized-remaining 748 --maximum-retries 1
```

The retry flag is part of the pre-run ledger. It may be lowered for a corrected
rerun when earlier observations have already consumed part of the project budget;
the semantic matrix and three repetitions remain unchanged.

Reports contain aggregate timing, usage, availability, request-size, coverage, gate,
and identity evidence only. They do not print source, credentials, or individual paid
probabilities. No live run is started by ordinary tests.
