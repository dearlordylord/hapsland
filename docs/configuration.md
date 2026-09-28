# Configuration v1

This is the supported configuration and rule-pack format. The
[#96 compatibility assessment](./issue-96-contract-compatibility.md) records
the proposed v2 path for explicit type/function targets. Choice and Score
remain separate, undecided result-form work. Those declarations are unsupported
today; v1 files retain their present probability behavior.

File settings select reviewable files. With no file settings, all otherwise
eligible files are selected when Jev credentials are available. User exclusions
accumulate with project exclusions; a user `"**/*"` exclusion turns review off.

Project configuration is read once from the Git working-tree root. The supported
project names are `.review.jsonc` and `.realtime-review.jsonc`; finding both is an
error. User defaults are read from
`$REVIEW_USER_CONFIG_PATH`, or (when that variable is absent)
`~/.config/realtime-review-tool/config.jsonc`. There is no nested directory
inheritance and no automatic `.gitignore` loading.

Both documents are versioned JSONC and may contain `//` or `/* ... */` comments
and trailing commas. Unknown fields, duplicate object keys, unsupported versions,
malformed values, absolute/traversing patterns, and negated patterns are errors.
The editor-completion artifact is [`../schemas/review-config-v1.schema.json`](../schemas/review-config-v1.schema.json).
This phase does not publish a hosted schema URL: copy that file into an
editor-accessible installation/configuration directory and point `$schema` at the
copy. The schema assists editors with structural JSON; the runtime also parses
JSONC and applies semantic glob, rule-pack, and repository-policy checks.

<!-- configuration-guide:start -->

## Configuration example

```jsonc
{
  "version": 1,
  "includes": [
    "src/**"
  ]
}
```

## Configuration fields

| Field | Type and bounds | Presence | Default | Description |
|---|---|---|---|---|
| `version` | fixed value 1 | Required | — | Configuration wire-format version. |
| `$schema` | string | Optional | — | Optional editor schema location. It does not change runtime validation. |
| `includes` | array of non-empty string (may be empty) | Optional | — | Optional repository-relative file patterns. Omission inherits the lower-precedence list; an empty array selects no paths. |
| `includes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `excludes` | array of non-empty string (may be empty) | Optional | — | Additional repository-relative exclusions. Exclusions accumulate across configuration layers and always win. |
| `excludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `privacyExcludes` | array of non-empty string (may be empty) | Optional | — | Additional protected-path exclusions. These accumulate and cannot be overridden by lower-privacy layers. |
| `privacyExcludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `credentialEnvVar` | string matching a pattern | Optional | "TYPESAFE_API_KEY" | Name of the environment variable that supplies the review credential. Store the secret value outside configuration. |
| `claudeFeedbackMode` | string | Optional | "advisory" | Claude PostToolUse feedback. Blocking current findings requires an explicit user configuration opt-in; a project may only restrict it to advisory. |
| `settings` | object | Optional | — | Optional whole-file JSON request controls. Omitted layer values inherit; built-in values apply when no layer supplies a value. |
| `settings.deadlineMs` | integer (1–60000) | Optional | 1000 | Per-file deadline in milliseconds for whole-file JSON requests. |
| `settings.concurrency` | integer (1–32) | Optional | 4 | Maximum concurrently reviewed files for whole-file JSON requests. |
| `settings.adviceBudget` | integer (0–100) | Optional | 5 | Maximum findings delivered for a whole-file JSON request event. |
| `settings.transientRetries` | integer (0–5) | Optional | 2 | Additional retry attempts for transient backend failures in the whole-file JSON request path. |
| `packs` | array of non-empty string or object with `path` or object with `id` (may be empty) | Optional | — | Local rule-pack path declarations or references to packs inherited from lower-precedence layers. Bundled Noul loads independently. |
| `packs[]` | non-empty string or object with `path` or object with `id` | Array item (array may be empty) | — | A path declaration or an inherited pack identity; object forms contain exactly one locator. |
| `packs[].path` | non-empty string | Required (path form) | — | Local rule-pack path; relative paths resolve from the originating configuration file. |
| `packs[].enabled` | boolean | Optional | — | Optional enablement override. Omission inherits an existing pack's state and enables a newly declared pack. |
| `packs[].id` | non-empty string matching a pattern | Required (id form) | — | Identity of a rule pack declared in a lower-precedence configuration layer. |
| `ruleOverrides` | map of object (may be empty) | Optional | — | Map of qualified rule IDs to layer-specific overrides. Use pack-id/rule-id for local packs. |
| `ruleOverrides.<key>` | object | Map value (map may be empty) | — | Layer-specific activation, path filters, threshold, and advice message for one qualified rule ID. |
| `ruleOverrides.<key>.enabled` | boolean | Optional | — | Whether this rule is enabled in this configuration layer. |
| `ruleOverrides.<key>.includes` | array of non-empty string (may be empty) | Optional | — | Additional rule path filters; they intersect global file selection. |
| `ruleOverrides.<key>.includes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `ruleOverrides.<key>.excludes` | array of non-empty string (may be empty) | Optional | — | Rule-specific path exclusions; they cannot restore globally excluded paths. |
| `ruleOverrides.<key>.excludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `ruleOverrides.<key>.threshold` | number (0–1) | Optional | — | Probability threshold from 0 through 1. Omission inherits the rule-pack threshold. |
| `ruleOverrides.<key>.message` | non-empty string | Optional | — | Advice text to use for this rule; omission keeps the rule-pack message. |

<!-- configuration-guide:end -->

Policy layers are built-in, user, then project. A supplied include list replaces the
lower-precedence list; exclusions accumulate, and any exclusion wins. Thus a project
include cannot restore a user privacy exclusion. Runtime captures the resolved policy
and its digest at event preflight. `config explain` uses that same captured policy and
does not call the review backend:

```sh
printf '%s\n' '{"version":1,"operation":"explain","cwd":"/repo","path":"src/a.ts"}' \
  | node src/cli.ts --explain
```

Credential selection has a user-owned exception to this precedence: a
`credentialEnvVar` set in user configuration takes priority over a project value.
A project value takes effect when user configuration omits the field. If both omit
it, the built-in `TYPESAFE_API_KEY` reference applies.

Claude Code feedback defaults to `advisory`. In the candidate installed flow,
the synchronous `PostToolUse` hook may return a current finding within its
bounded deadline; background or Stop may offer eligible advice later. To opt
into stronger synchronous feedback after a successful edit, put
`"claudeFeedbackMode": "block-current-findings"` in the **user** configuration
file. A project configuration may set `"claudeFeedbackMode": "advisory"` to
restrict that repository. A project cannot enable block feedback; its attempt
is an invalid configuration. This setting governs synchronous edit feedback;
background and Stop follow the resident's shared delivery and round decisions.
The resident rechecks the current files before handing off a block response.
The hook runs after the edit and cannot undo it or guarantee that Claude will
repair the finding.

## Declarative rule packs

The bundled `noul` pack (nine binary Noul questions) is loaded through the same
schema/compiler boundary as local packs. It retains the historical assessment
keys (`r1_inferred_case` through `r9_body_reaches_undeclared`) and the built-in
source-rung applicability checks. Effective file settings and credentials govern
selected source dispatch to Jev.

Local packs use [`../schemas/review-rule-pack-v1.schema.json`](../schemas/review-rule-pack-v1.schema.json):

The pack file declares a schema version, stable ID, exact content version, and
binary rules. `question` and the `true`/`false` criteria are authored content;
configuration can change only activation, path filters, threshold, and advice
message. A rule's qualified ID is `pack-id/rule-id` (the legacy Noul keys remain
bare for version-1 process compatibility).

<!-- rule-pack-guide:start -->

### Rule-pack example

```jsonc
{
  "schemaVersion": 1,
  "id": "team",
  "contentVersion": "1.0.0",
  "rules": [
    {
      "id": "meaningful-combinations",
      "question": "Does the artifact make an invalid state representable?",
      "criteria": {
        "false": "Every representable state has a domain meaning.",
        "true": "The artifact admits a state with no domain meaning."
      },
      "message": "Review this declaration's representable states.",
      "applicability": {
        "includes": [
          "src/**"
        ]
      }
    }
  ]
}
```

### Rule-pack fields

| Field | Type and bounds | Presence | Default | Description |
|---|---|---|---|---|
| `schemaVersion` | fixed value 1 | Required | — | Rule-pack wire-format version. |
| `id` | non-empty string matching a pattern | Required | — | Stable pack identity; it cannot contain separators or whitespace. |
| `contentVersion` | non-empty string | Required | — | Authored content version, independent of the wire schema version. |
| `rules` | array of object (may be empty) | Required | — | Rules declared by this pack. Rule identities must be unique within the pack. |
| `rules[]` | object | Array item (array may be empty) | — | One declarative rule in a rule pack. |
| `rules[].id` | non-empty string matching a pattern | Required | — | Stable rule identity within this pack; it cannot contain separators or whitespace. |
| `rules[].question` | non-empty string | Required | — | Question evaluated against the available review input. |
| `rules[].criteria` | object | Required | — | String-valued evidence criteria for both probability outcomes. |
| `rules[].criteria.false` | non-empty string | Required | — | Text rendered when the evaluated criterion is false. |
| `rules[].criteria.true` | non-empty string | Required | — | Text rendered when the evaluated criterion is true. |
| `rules[].threshold` | number (0–1) | Optional | 0.7 | Probability threshold from 0 through 1. Omission uses the built-in rule threshold. |
| `rules[].message` | non-empty string | Required | — | Authored advice text attached to a qualifying result. |
| `rules[].applicability` | object | Optional | — | Rule-level path filters, intersected with global file selection. |
| `rules[].applicability.includes` | array of non-empty string (may be empty) | Optional | — | Optional repository-relative patterns a path must match for this rule to apply. |
| `rules[].applicability.includes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `rules[].applicability.excludes` | array of non-empty string (may be empty) | Optional | — | Optional repository-relative patterns that prevent this rule from applying. |
| `rules[].applicability.excludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |

<!-- rule-pack-guide:end -->

Each `packs` entry is either a path that declares a local pack or an inherited pack
`id`; an object must not provide both locators (or neither).

Project pack paths resolve from the project configuration and must remain inside
the Git working tree, including their real path after symlink resolution. User
pack paths resolve from the user configuration and may reference user-managed
local files. If a pack is inherited, its original configuration remains the
path-resolution base. Matching is always against the repository-relative path,
never the pack directory. Explicitly loaded packs are enabled by default;
disabling a pack vetoes every rule in it, including an enabled rule override.

Duplicate pack/rule identities, multiple content versions, rebinding an inherited
pack ID to another file, unknown overrides, malformed selected packs, and unknown
schema versions make the whole selected configuration unavailable before source
egress. A fork must use a distinct pack ID. Rule filters intersect global
eligibility: they can narrow a review, but cannot re-include a globally excluded
or protected path.

Rule authors should state the available input explicitly. The whole-file JSON
request path provides one completed post-edit file and its repository-relative
path. The supported direct-event path instead evaluates one named TypeScript
`interface` or `type` declaration per unit, with bounded, complete same-file
named-type reference evidence and the repository-relative path. Its Jev input
does not contain the whole file. Neither path provides a before/after diff, task
or transcript context, or other files; findings may describe pre-existing content.
Do not author a rule that promises to judge evidence its request cannot contain.
Advice is local authored text attached to the validated probability, rule ID,
path, and snapshot hash; no extra model call generates a message.

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

## Runtime behavior

The generated field table describes accepted settings and their bounds. The
whole-file JSON request path in `src/runtime/review.ts` consumes these configured
controls. The resident direct-event path uses a fixed 15,000 ms deadline and a
dispatch capacity of 2; it does not consume the configured runtime settings.

For whole-file JSON requests, each transient retry waits 50 ms after the preceding
failed attempt. The retry delay is fixed. A timeout interrupts the current attempt
or backoff, so an exhausted retry sequence cannot continue past the per-file
deadline. Retries repeat only the captured review request; they never replay or
undo the already-completed host edit.

The CLI process or its host wrapper also has a process timeout. When using the
whole-file JSON request path, configure that timeout above the selected
`deadlineMs` with room for process startup, snapshot reads, and response delivery;
a lower wrapper timeout can terminate the request first. The configured values
bound waiting, parallelism, findings, and attempted requests on the whole-file
path; they do not guarantee a monetary spend ceiling. A provider may count each
initial request and retry independently, and the review backend can apply its own
billing or rate limits.

For the whole-file path, resolved settings and file-selection policy are captured
once per event. Current file settings are checked immediately before dispatch, and the file is
reread before any finding is delivered. A changed file produces an unavailable
stale-snapshot result. Eligible questions for one file are sent as one logical
batch per attempt. Results from all files are combined, sorted by probability
(then path and rule ID), and only then truncated to the single event-wide advice
budget. Duplicate paths in an event and duplicate event/snapshot deliveries do
not duplicate advice.

Credentials are references only. The value is read from the named environment
variable at dispatch and is never persisted, printed, or included in diagnostics.
The configuration schema rejects retired `consent` and `enabled` fields. The
Jev destination is fixed for version 1 at
`https://api.typesafe.ai/v1/systemone`; endpoint routing cannot be configured.

The version-1 whole-file JSON request/response process contract is unchanged. A
selected configuration failure on that path returns the existing `unavailable` result with
`code: "invalid_configuration"` for each requested path; it never dispatches a
backend request and never changes the already-completed edit. Configuration capture
and explanation use the same policy digest. Shared fixture, configuration-case,
scenario, observation, and comparison identities are defined in
[`src/evaluation/model.ts`](../src/evaluation/model.ts), so later semantic slices can
refer to these configuration cases without changing the process contract.

The semantic milestone command is documented separately in
[`evaluation.md`](./evaluation.md). It is an explicit maintainer operation and does
not alter this version-1 review request/response protocol.
