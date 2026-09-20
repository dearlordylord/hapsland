# Input-contract comparison experiment

This is the credential-gated milestone for issue #16. It compares four versioned
renderers over the same human-authored TypeScript fixtures:

| Mode | Rendered context |
| --- | --- |
| `diff` | textual before/after diff and the repository-relative path |
| `whole-file` | exact post-edit file and the same path |
| `declaration-only` | the edited interface, type alias, or schema and the same path |
| `declaration-context` | that declaration plus bounded outbound referenced declarations, completeness, and omission metadata |

The fixture manifest is [`fixtures.ts`](./fixtures.ts). It contains 24 fixtures (six
interfaces, six type aliases, six Zod schemas, and six Effect Schema definitions),
human-authored Rule 2 expectations and rationales, stable content identities, and the
pre-registered category memberships. `manifest.ts` exposes the source-free identity
view for report tooling.

The declaration-context renderer reuses the parsing/artifact seam from the accepted
declaration-extraction experiment. It does not make extraction a production dependency;
this remains an experiment and has bounded declaration, depth, and source-character
caps. Missing required evidence is an explicit `incomplete-required` observation and is
never counted as a clear result.

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
ledger covering all 288 logical calls and the absolute 864-attempt retry maximum:

```sh
TYPESAFE_API_KEY=... npm run --silent experiment:input-contract -- \
  --live --authorized-remaining 864
```

Reports contain aggregate timing, usage, availability, request-size, coverage, gate,
and identity evidence only. They do not print source, credentials, or individual paid
probabilities. No live run is started by ordinary tests.
