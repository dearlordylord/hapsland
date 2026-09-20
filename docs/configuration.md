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
The editor schema is [`../schemas/review-config-v1.schema.json`](../schemas/review-config-v1.schema.json).

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
  "rules": {
    "r2_meaningless_combinations": {
      "threshold": 0.8,
      "message": "Check whether these fields form a valid domain state."
    }
  }
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
brace alternatives (`{ts,tsx}`) are supported. `!` is not negation and never
re-includes a path. Ordinary patterns are still subject to protected gates: repository
boundary, sensitive names (`.env`, credentials, secret/key/certificate files),
generated/lock and vendor/build directories, configured source extensions, regular
files, symlink containment, and the 256 KiB snapshot limit.

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
