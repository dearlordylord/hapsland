# Configuration v1

Project configuration is read once from the Git working-tree root. The supported
project names are `.review.jsonc` and `.realtime-review.jsonc`; finding both is an
error. User defaults are read from
`$REVIEW_USER_CONFIG_PATH`, or (when that variable is absent)
`~/.config/realtime-review-tool/config.jsonc`. There is no nested directory
inheritance and no automatic `.gitignore` loading.

Both documents have `{"version": 1}` and may contain `//` or `/* ... */` comments
and trailing commas. Unknown fields, duplicate object keys, unsupported versions,
malformed values, absolute/traversing patterns, and negated patterns are errors.
The editor-completion artifact is [`../schemas/review-config-v1.schema.json`](../schemas/review-config-v1.schema.json).
This phase does not publish a hosted schema URL: copy that file into an
editor-accessible installation/configuration directory and point `$schema` at the
copy (the example below assumes a source checkout with `schemas/` at the project
root).

```jsonc
{
  "$schema": "./schemas/review-config-v1.schema.json",
  "version": 1,
  "includes": ["src/**"],       // omitted means inherit; [] means select none
  "excludes": ["**/*.secret.ts"],
  "privacyExcludes": ["private/**"],
  "credentialEnvVar": "TYPESAFE_API_KEY",
  "settings": {
    "deadlineMs": 1000,
    "concurrency": 4,
    "adviceBudget": 5,
    "transientRetries": 2
  },
}
```

Policy layers are built-in, user, then project. A supplied include list replaces the
lower-precedence list; exclusions accumulate, and any exclusion wins. Thus a project
include cannot restore a user privacy exclusion. Runtime captures the resolved policy
and its digest at event preflight. `config explain` uses that same captured policy and
does not call the review backend:

```sh
printf '%s\n' '{"version":1,"operation":"explain","cwd":"/repo","path":"src/a.ts"}' \
  | node src/cli.ts --explain
```

Patterns are repository-relative and use `/` separators. Matching is case-sensitive;
`*` and `?` do not cross `/`, while `**` may cross directories. Dot-files are matched
only by a pattern segment beginning with `.`. Bracket classes (`[ab]`) and simple
brace alternatives (`{ts,tsx}`) are supported. To keep matching bounded, a pattern is
limited to 1,024 characters, eight brace groups, eight choices per group, and 256
total brace expansions. `!` is not negation and never re-includes a path. Ordinary
patterns are still subject to protected gates: repository
boundary, sensitive names (`.env`, credentials, secret/key/certificate files),
generated/lock and vendor/build directories, configured source extensions, regular
files, symlink containment, and the 256 KiB snapshot limit.

## Runtime limits

Runtime settings are finite integers with these inclusive bounds and defaults:

| Setting | Bounds | Default | Meaning |
|---|---:|---:|---|
| `deadlineMs` | 1–60,000 ms | 1,000 ms | Per-file backend deadline, including retries and retry backoff |
| `concurrency` | 1–32 files | 4 | Maximum concurrently reviewed files in one event |
| `adviceBudget` | 0–100 items | 5 | Maximum findings delivered for the complete edit event |
| `transientRetries` | 0–5 retries | 2 | Additional transient backend attempts after the initial attempt |

The retry algorithm is fixed: each retry waits 50 ms after the preceding failed
attempt. It is intentionally not configurable. A timeout interrupts the current
attempt or backoff, so an exhausted retry sequence cannot continue past the
per-file deadline. Retries repeat only the captured review request; they never
replay or undo the already-completed host edit.

The product deadline is per file, while the host hook also has its own process
timeout. Configure the host timeout above the selected `deadlineMs` with room for
process startup, snapshot reads, and response delivery; a host timeout lower than
the product deadline can terminate the hook first. These limits bound waiting,
parallelism, findings, and attempted requests; they do not guarantee a monetary
spend ceiling. A provider may count each initial request and retry independently,
and the review backend can apply its own billing or rate limits.

For each event, the resolved settings and file-selection policy are captured once.
Consent is checked immediately before dispatch, and the file is reread before any
finding is delivered. A changed file produces an unavailable stale-snapshot result.
Eligible questions for one file are sent as one logical batch per attempt. Results
from all files are combined, sorted by probability (then path and rule ID), and
only then truncated to the single event-wide advice budget. Duplicate paths in an
event and duplicate event/snapshot deliveries do not duplicate advice.

Credentials are references only. The value is read from the named environment
variable at dispatch and is never persisted, printed, or included in diagnostics.
Consent remains a separate user-owned grant; `consent` and `enabled` fields are
accepted for compatibility but cannot authorize source transmission.

The version-1 review request/response process contract is unchanged. A selected
configuration failure returns the existing `unavailable` result with
`code: "invalid_configuration"` for each requested path; it never dispatches a
backend request and never changes the already-completed edit. Configuration capture
and explanation use the same policy digest. Shared fixture, configuration-case,
scenario, observation, and comparison identities are defined in
[`src/evaluation/model.ts`](../src/evaluation/model.ts), so later semantic slices can
refer to these configuration cases without changing the process contract.
