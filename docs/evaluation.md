# Semantic evaluation commands

Semantic evaluation is a maintainer milestone operation, separate from ordinary
tests and review hooks. It uses the bundled production rule pack, the production
compiler, and the same `ReviewBackend`/Effect `DecisionModel` path as a review.
The default command is controlled and offline:

```sh
printf '%s\n' '{"version":1,"operation":"plan"}' \
  | node src/cli.ts --evaluation-plan
printf '%s\n' '{"version":1,"operation":"run"}' \
  | node src/cli.ts --evaluation-run
```

`plan` reports logical requests and the worst-case attempt count (initial request
plus the declared retry ceiling) before execution. `run` returns only a sanitized
aggregate report: deterministic conformance, transport availability, semantic
expectations, cross-batch comparisons, unchecked/ambiguous cases, budget, and
combination coverage. Its predeclared release gate requires transport, conformance,
semantic-band acceptance, and no unchecked labels; the controlled default is useful
for exercising the protocol but is not a semantic-quality release result. It does not
return fixture source, raw provider responses, individual probabilities, credentials,
or advice text. `report` verifies a previously
captured sanitized report and its digest without making a provider call:

```sh
printf '%s\n' '{"version":1,"operation":"report","report":{...}}' \
  | node src/cli.ts --evaluation-report
```

The evaluation protocol is versioned independently from the unchanged version-1
review request/response protocol. Unknown fields are rejected. Human expectations
are authored fixture data: positive, negative, and superficially similar negative
controls carry rationales; ambiguous and missing labels remain explicit and are never
inferred from model output.

Live execution is not part of ordinary tests and is not enabled by `run` alone. A
maintainer must provide all of the following before a provider layer can be acquired:

1. `liveOptIn: true` in the command payload;
2. `--evaluation-live` on the process command;
3. a non-empty credential environment variable (default `TYPESAFE_API_KEY`); and
4. `authorizedRemainingCalls`, no greater than the remaining cumulative 1,000-call
   project authorization and no lower than the planned worst-case attempts.

The command accounts for every retry in its preflight plan. No paid run was performed
for this milestone. If a live milestone is later approved, publish only sanitized
aggregate contract/quality/timing evidence and retain the plan, input-contract, and
renderer/adapter digests needed to reproduce its identity.
