# Configuration

**Purpose:** Explain configuration composition, source access, and rule application settings.
**Audience:** End users; Rule authors; Contributors, including coding agents.
**Status:** Active maintained guidance for the 2026-10-05 owner-approved rule design.
**Authority:** Maintained guidance for the accepted [rule and configuration contract](review-contract-compatibility.md) and [direct-review contract](type-function-review-proposal.md); generated field tables describe the current schema.
**Expected use:** Select reviewed and supporting files, configure rule activation and overrides, and inspect effective settings.
**Lifecycle:** Update with rule/configuration schema, CLI, or source-selection changes; review whenever rule inputs or source-reading boundaries change.

Configuration controls which files Hapsland may review or read for related code,
and which rules apply. Each [rule file](rules.md#rule-document-format) defines a
concern and the input evidence it understands. To create one, follow
[Write your first rule](write-first-rule.md).

## Configuration composition

The [accepted compatibility contract](review-contract-compatibility.md#configuration-and-individual-rules)
owns layering, rule identity and configuration explanation guarantees.

## Configuration locations and precedence

For source-bearing inspection history, merge the
[inspection configuration template](examples/session-inspection.jsonc) into the
project configuration. Inspection recording defaults to off; dev and bundled
dashboards only display recorded events and do not enable capture. See the
[inspection guide](status.md#opt-in-local-inspection) for enabling new capture and
the distinction between current recording and retained history.

<!-- project-location:start -->

| Layer | Location | Behavior |
| --- | --- | --- |
| Built-in | Non-rule settings defaults | Supplies omitted settings. |
| User | `REVIEW_USER_CONFIG_PATH`, otherwise `$XDG_CONFIG_HOME/hapsland/config.jsonc` (normally `~/.config/hapsland/config.jsonc`) | Personal settings across repositories; owns review destination and shared review resources. |
| Project | `.hapsland.jsonc` at the canonical Git working-tree root | Overrides ordinary settings for this repository. There are no nested configuration layers. |
| Rule documents | Explicit `rules` references in configuration | Definitions, not another configuration layer. Paths resolve from the declaring configuration. |

<!-- project-location:end -->

An absent, empty, or relative XDG base uses `~/.config`. An explicitly empty
`REVIEW_USER_CONFIG_PATH` is an error; only an absent override selects the default.
Invocation from a subdirectory does not change the configuration root or pattern base.
For native edits, [recipient admission](advicing-target-contract.md#advicee-identity-and-admission)
owns physical-root selection independently of caller cwd, and the
[edit-owned settings contract](review-contract-compatibility.md#edit-owned-settings)
owns when settings are captured and when saved changes take effect.

User privacy exclusions cannot be removed by project settings. Review destination,
shared review limits, and stronger Claude blocking have user-owned restrictions;
ordinary project precedence does not override those restrictions. User graph limits
are ceilings that projects may lower. Session analytics use ordinary precedence,
including an explicit project `false`.

Configuration and rule documents support JSONC comments and trailing commas.
Unknown fields, duplicate keys, unsupported versions, malformed values and patterns,
and duplicate rule identities fail validation. Configuration is validated before
source capture. Editor completion uses
[`review-config-v1.schema.json`](../schemas/review-config-v1.schema.json); copy the
schema into an editor-accessible location when a local `$schema` reference is needed.
There is no hosted schema URL. Runtime validation additionally checks semantic
constraints, references, and repository containment.

## Review roots, related code, and privacy

`includes` and `excludes` select files whose changed declarations may become review
roots. `languages` optionally narrows their source languages. With these
settings omitted, all otherwise eligible roots are selected.

`contextIncludes` and `contextExcludes` select files that may supply related code.
When context settings are omitted, context follows the effective root file policy;
choosing `src/**` does not silently permit reading outside `src`. An explicit
context selection can additionally permit `shared/**` without selecting changed
roots there. Every captured file still passes containment, protected-path, Git-ignore,
regular-file and size checks. `privacyExcludes` prohibits both root and context reads
regardless of any include. Root-language and per-rule filters do not broaden the
analyzer's dependency resolution.

For example, this project reviews TypeScript and Rust roots in `src`, while allowing
related declarations from `shared`. A referenced `shared/private` file remains unread:

<!-- rule-selection-example:start -->

```jsonc
{
  "version": 1,
  "includes": [
    "src/**"
  ],
  "languages": [
    "typescript",
    "rust"
  ],
  "contextIncludes": [
    "src/**",
    "shared/**"
  ],
  "privacyExcludes": [
    "shared/private/**"
  ],
  "rules": [
    {
      "path": ".hapsland/rules/custom/no-primitive-obsession.jsonc",
      "languages": [
        "typescript"
      ],
      "includes": [
        "src/api/**"
      ]
    }
  ]
}
```

<!-- rule-selection-example:end -->

Path settings belong to configuration, never to the authored rule. A TypeScript
rule restricted to `tests/**` cannot select anything when the global root scope is
`src/**`. Required context denied by privacy or context selection is missing evidence,
not a clear review result. Rules that do not need the omitted evidence may still run.

### Selecting `src/` across Git worktrees

To review files under `src/`, put this in `.hapsland.jsonc` at the Git working-tree
root, or set `includes` in an existing configuration:

```jsonc
{
  "version": 1,
  "includes": ["src/**"]
}
```

Use `src/**`, rather than the directory name `src/`, to include files at every
depth. The pattern is relative to the edited file's Git working-tree root, so it
selects `src/payment.ts` in both the main checkout and linked worktrees, regardless
of their absolute locations. Running the agent from a subdirectory does not change
that base. Absolute checkout paths are unnecessary and invalid as include patterns.

Commit `.hapsland.jsonc` so worktrees created from that commit receive the same
configuration. Existing worktrees need the configuration commit merged or
cherry-picked; uncommitted edits in another worktree are not shared. Each worktree
reads its own project configuration, while the user configuration is shared.
This include list replaces an inherited include list; exclusions, protected paths,
repository `.gitignore`, and enabled languages still apply. Switching worktrees
during a virtual round does not change its pinned root; see
[recipient admission](advicing-target-contract.md#advicee-identity-and-admission).

### Pattern syntax

Patterns are repository-relative and use `/` separators. Matching is case-sensitive;
`*` and `?` do not cross `/`, while `**` may cross directories. Dot-files require a
pattern segment beginning with `.`. Bracket classes and simple brace alternatives
are allowed. Patterns permit at most 1,024 characters, eight brace groups, eight
choices per group, and 256 expansions. Absolute paths, traversal, and negated
re-inclusion are invalid. Moving a rule document never changes the pattern base.

The built-in root include is `**/*`; installation inherits this scope rather than
writing a narrower project list. Wildcards omit hidden files and directories, so
this is not a literal all-paths selection. To review a hidden source directory,
keep the ordinary scope and add its explicit pattern, for example
`"includes": ["**/*", ".scratch/**"]`. Protected paths, repository `.gitignore`,
and enabled languages still apply. Use `hapsland explain` to inspect a path's
resolved selection before expecting a review result.


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
| `includes` | array of non-empty string (may be empty) | Optional | — | Changed-root repository-relative patterns. Omission inherits the lower-precedence list; an empty array selects no roots. |
| `includes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `excludes` | array of non-empty string (may be empty) | Optional | — | Changed-root repository-relative exclusions. Exclusions accumulate across configuration layers and always win for roots. |
| `excludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `languages` | array of "typescript" or "rust" or "bend" or "python" or "go" (may be empty) | Optional | — | Changed-root analyzer languages. Omission inherits; an empty array selects no roots. |
| `languages[]` | "typescript" or "rust" or "bend" or "python" or "go" | Array item (array may be empty) | — | — |
| `contextIncludes` | array of non-empty string (may be empty) | Optional | — | Supporting-context patterns. Omission inherits effective root includes; an empty array selects no supporting paths. |
| `contextIncludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `contextExcludes` | array of non-empty string (may be empty) | Optional | — | Supporting-context exclusions accumulate across layers. Omission inherits effective root exclusions. |
| `contextExcludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `privacyExcludes` | array of non-empty string (may be empty) | Optional | — | Additional protected-path exclusions. These accumulate and cannot be overridden by lower-privacy layers. |
| `privacyExcludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `reviewBackend` | object with `provider` or object with `provider` and `model` and `accountId` or object with `provider` and `model` | Optional | — | User-owned review destination and provider-specific model/account selection. Projects cannot set this field. |
| `reviewBackend.provider` | fixed value "jev" or fixed value "cloudflare" or fixed value "openai" | Required (provider = "jev" or provider = "cloudflare" or provider = "openai") | — | Review backend provider. |
| `reviewBackend.model` | "clef" or "clef-flash" or fixed value "gpt-6-luna" | Required (provider = "cloudflare" or provider = "openai") | — | Cloudflare model selector. |
| `reviewBackend.accountId` | string matching a pattern | Required (provider = "cloudflare") | — | Cloudflare account ID, 32 hexadecimal characters. |
| `credentialEnvVar` | string matching a pattern | Optional | "TYPESAFE_API_KEY" | Name of the environment variable that supplies the review credential. Store the secret value outside configuration. |
| `sessionAnalytics` | boolean | Optional | false | Opt-in source-free session analytics. Project configuration overrides the user default; disabled by default; subject to the shared activity storage limits. |
| `sessionInspection` | boolean | Optional | false | Opt-in source-bearing local inspection history. Project configuration overrides the user default in either direction; independent of source-free analytics and disabled by default. Opening the dashboard never enables recording. |
| `inspectionRetentionDays` | integer (1–3650) | Optional | 7 | User-owned capture-aged inspection retention in days, shared across residents and projects. |
| `inspectionStorageBytes` | integer (1–9007199254740991) | Optional | 134217728 | User-owned shared allocated inspection-storage cap, including records, indices, payloads and temporary allocations. Unavailable quota drops capture; review continues. |
| `claudeFeedbackMode` | "advisory" or "block-current-findings" | Optional | "advisory" | Claude PostToolUse feedback. Blocking current findings requires an explicit user configuration opt-in; a project may only restrict it to advisory. |
| `editPermitLimits` | object | Optional | — | User-owned shared resident admission limits. Omitted values use built-in defaults. |
| `editPermitLimits.perAdvicee` | integer (1–65536) | Optional | 32 | Maximum simultaneously pending edit permits for one advicee in the shared resident. |
| `editPermitLimits.resident` | integer (1–65536) | Optional | 4096 | Maximum simultaneously pending edit permits across the shared resident. |
| `virtualRoundQuietMs` | integer (10000–3600000) | Optional | 300000 | Continuous fully quiet time before an open virtual round closes without Stop, in milliseconds. User configuration only; captured when the round opens. |
| `analysis` | object | Optional | — | — |
| `analysis.go` | object | Optional | — | — |
| `analysis.go.goos` | "aix" or "android" or "darwin" or "dragonfly" or "freebsd" or "hurd" or "illumos" or "ios" or "js" or "linux" or "netbsd" or "openbsd" or "plan9" or "solaris" or "wasip1" or "windows" | Required | — | — |
| `analysis.go.goarch` | "386" or "amd64" or "arm" or "arm64" or "loong64" or "mips" or "mipsle" or "mips64" or "mips64le" or "ppc64" or "ppc64le" or "riscv64" or "s390x" or "wasm" | Required | — | — |
| `analysis.go.tags` | array of string matching a pattern (at most 64 items) | Required | — | — |
| `analysis.go.tags[]` | string matching a pattern | Array item (array may be empty) | — | — |
| `graphLimits` | object | Optional | — | Import graph limits; omitted values inherit. |
| `graphLimits.version` | fixed value 1 | Required | — | Import graph limits profile version. |
| `graphLimits.sourceBytes` | integer (1–2097152) | Optional | 2097152 | Maximum source bytes in each graph file. |
| `graphLimits.treeBytes` | integer (1–20480) | Optional | 20480 | Maximum accepted encoded evidence-tree bytes. |
| `graphLimits.files` | integer (1–8) | Optional | 8 | Maximum files read, including the root. |
| `graphLimits.readBytes` | integer (1–12582912) | Optional | 12582912 | Maximum total source bytes read; must be at least sourceBytes. |
| `graphLimits.outgoingEdges` | integer (1–16) | Optional | 16 | Maximum outgoing edges per accepted file. |
| `graphLimits.depth` | integer (1–4) | Optional | 4 | Maximum supporting-reference depth. |
| `graphLimits.work` | integer (1–128) | Optional | 128 | Maximum graph edge work steps. |
| `rules` | array of non-empty string or object with `path` or object with `id` (may be empty) | Optional | — | — |
| `rules[]` | non-empty string or object with `path` or object with `id` | Array item (array may be empty) | — | A local rule path or inherited rule ID, with optional selection settings. |
| `rules[].path` | non-empty string | Required (path form) | — | — |
| `rules[].enabled` | boolean | Optional | — | — |
| `rules[].languages` | array of "typescript" or "rust" or "bend" or "python" or "go" (may be empty) | Optional | — | — |
| `rules[].languages[]` | "typescript" or "rust" or "bend" or "python" or "go" | Array item (array may be empty) | — | — |
| `rules[].includes` | array of non-empty string (may be empty) | Optional | — | — |
| `rules[].includes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `rules[].excludes` | array of non-empty string (may be empty) | Optional | — | — |
| `rules[].excludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `rules[].threshold` | number (0–1) | Optional | — | — |
| `rules[].message` | non-empty string | Optional | — | — |
| `rules[].id` | string matching a pattern | Required (id form) | — | — |

<!-- configuration-guide:end -->

The graph profile bounds the active direct-edit type and function path. Each
supporting file must pass the context policy before reading. TypeScript local
imports, verified Rust Cargo modules, and explicit relative Bend imports can supply
cross-file evidence within their analysis profiles. Rust and Bend
functions are not supported. See the [input contract](type-function-review-proposal.md#branch-contracts).

The optional version-one `graphLimits` profile bounds source bytes, tree size,
files, reads, edges, depth, and work. Projects may lower user ceilings. An in-flight
unit retains its captured profile; an invalid profile fails configuration before
egress. The total read cap must be at least the per-file cap. Provider request
limits independently constrain the HTTP request; see [review providers](review-providers.md).

Credential environment-variable selection has a user-owned exception: a user
`credentialEnvVar` wins over a project value; otherwise a project value may supply it.
<!-- credential-reference:start -->

The built-in credential reference is `TYPESAFE_API_KEY`. Inspection reports its name and presence, never its value. See [credential lookup](installation-workflows.md#credentials-and-login).

<!-- credential-reference:end -->

<!-- analytics-enablement:start -->

Session analytics are disabled by default. Set `sessionAnalytics: true` to retain source-free session totals and rule-ID history, subject to the limits in [status and analytics](status.md#optional-session-analytics).

<!-- analytics-enablement:end -->

Claude feedback defaults to `advisory`. Only user configuration may enable
`claudeFeedbackMode: "block-current-findings"`; a project may restrict it to
`advisory`. The post-edit hook cannot undo the edit or guarantee a repair. Background
and Stop behavior follows the shared delivery contract.

## Rule selection and overrides

Rule files define their concern and intrinsic inputs. Configuration selects where
those definitions apply. See the [rule format and commands](rules.md), or follow
[the first-rule walkthrough](write-first-rule.md).

A `rules` entry contains either `path` to declare a rule or `id` to configure a rule
inherited from a lower layer, plus optional `enabled`, `languages`, `includes`,
`excludes`, `threshold`, and `message`. A new rule reference enables its rule unless
explicitly disabled. Relative paths resolve from the declaring configuration.
Project references must remain inside the Git worktree, including after symlink
resolution; personal references may name user-managed files. Duplicate identities,
unknown inherited identities, and rebinding an inherited identity to another source
are errors. Fork a definition under a distinct ID.

Any explicit `rules` field, including `rules: []`, is authoritative: setup does
not add or enable defaults alongside that selection. See [editable defaults](rules.md#default-rules).

Rule settings narrow global root scope and the rule's authored inputs; they cannot
broaden either. Use configuration explanation to inspect the resolved policy:

```sh
printf '%s\n' '{"version":1,"operation":"explain","cwd":"/absolute/project","path":"src/example.ts"}' | hapsland --explain
```

`configuration.layers` lists loaded sources from built-in through user to project.
Missing optional files are not loaded layers. Native agent hook/trust settings are separate from Hapsland policy.

## Runtime behavior

<!-- settings-cache:start -->

The resident loads configuration and rule documents together, validates them and compiles the rules into an immutable edit settings snapshot. A resident-owned Effect cache retains successful snapshots for 5 seconds after loading finishes; hits do not extend that interval, and concurrent requests for the same project and configuration paths share a load. The cache holds at most 128 sources. A failed load is not cached and does not silently reuse an expired snapshot.

<!-- settings-cache:end -->

The [edit-owned settings contract](review-contract-compatibility.md#edit-owned-settings)
defines snapshot lifetime across cache reloads and later collection. The resident
derives native credential fallback eligibility from the snapshot; the hook
passes the selected credential reference/value and generation, without a separate
configuration-derived authentication flag.

Review request capacity and deadlines are resident policy, not JSONC controls.
`editPermitLimits` controls only simultaneously pending pre-edit permits and belongs in
the user configuration because the resident is shared across projects.

Credentials are references only. The selected key is read at dispatch from the named environment variable, then
repository `.env.local`, repository `.env`, then the user Hapsland `.env` file.
An explicit environment value, including empty, masks file values. Without a
selected key, the built-in reference can use native saved login; explicit
`credentialEnvVar` settings select environment/file authentication only. Credential files are never copied into snapshots, caches, archives or worktrees, and values are never printed
or included in diagnostics. See [credential lookup](installation-workflows.md#credentials-and-login) for file requirements.
User-only `reviewBackend` settings select Jev, Cloudflare Clef/Clef-flash, or OpenAI Decisions (`gpt-6-luna`).
Each selection determines a fixed provider origin and model route; arbitrary
endpoint routing cannot be configured. See [provider selection](review-providers.md#selection-and-credentials).

Configuration capture and explanation use the same policy digest.
