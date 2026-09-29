# Configuration v1

This is the supported configuration and rule-pack format. The
[review contract compatibility assessment](./review-contract-compatibility.md) records
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
| `graphLimits` | object | Optional | — | Versioned bounded import graph limits; omitted values inherit. |
| `graphLimits.version` | fixed value 1 | Required | — | Import graph limits profile version. |
| `graphLimits.sourceBytes` | integer (1–262144) | Optional | 262144 | Maximum source bytes in each graph file. |
| `graphLimits.treeBytes` | integer (1–20480) | Optional | 20480 | Maximum accepted encoded evidence-tree bytes. |
| `graphLimits.files` | integer (1–8) | Optional | 8 | Maximum files read, including the root. |
| `graphLimits.readBytes` | integer (1–1572864) | Optional | 1572864 | Maximum total source bytes read; must be at least sourceBytes. |
| `graphLimits.outgoingEdges` | integer (1–16) | Optional | 16 | Maximum outgoing edges per accepted file. |
| `graphLimits.depth` | integer (1–4) | Optional | 4 | Maximum supporting-reference depth. |
| `graphLimits.work` | integer (1–128) | Optional | 128 | Maximum graph edge work steps. |
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

The optional `graphLimits` profile controls Bend import exploration for a review
unit. It has its own `version: 1`; omitted fields inherit their built-in values.
Project values may lower a user's graph limit, but may not raise it. A changed
profile applies when a new review unit captures configuration; an in-flight
unit retains its original limits. An invalid profile fails configuration
resolution before any new review egress. The total read cap must be at least
the per-file cap because Bend reserves a full allowed file before requesting a
read. The root's declared encoded contribution must fit `treeBytes`; Bend
rejects that root otherwise. Native capture must measure canonical encoded
contributions and enforce physical read bounds. These graph limits do not
bound the complete serialized Jev request; #140 owns that separate cap.

The graph profile is the model and dashboard input. Production cross-file
capture is tracked separately in #138; adding graph configuration does not
enable import resolution in the native review path.

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

Rule authors should state the available input explicitly. The supported resident path
reviews one named TypeScript `interface` or `type` declaration per unit, with bounded,
complete same-file named-type reference evidence and the repository-relative path.
Its Jev input does not contain the whole file, a before/after diff, task or
transcript context, or other files. Findings may describe pre-existing content.
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

The resident dispatches eligible semantic units after final source and policy
currentness checks. The old whole-file JSON review command and its `settings`
configuration were retired under issue #148. The configuration parser rejects
`settings`; request capacity and deadlines are resident policy, not JSONC controls.

Credentials are references only. The value is read from the named environment
variable at dispatch and is never persisted, printed, or included in diagnostics.
The configuration schema rejects retired `consent` and `enabled` fields. The
Jev destination is fixed for version 1 at
`https://api.typesafe.ai/v1/systemone`; endpoint routing cannot be configured.

The old version-1 whole-file JSON request/response process contract is retired.
Configuration capture and explanation use the same policy digest. Shared
fixture, configuration-case, scenario, observation, and comparison identities
are defined in [`src/evaluation/model.ts`](../src/evaluation/model.ts).

The semantic milestone command is documented separately in
[`evaluation.md`](./evaluation.md). It is an explicit maintainer operation and does not provide a production review route.
