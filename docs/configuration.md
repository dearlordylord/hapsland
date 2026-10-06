# Configuration and rules

**Purpose:** Explain rule authoring, explicit activation, and source-selection settings.
**Status:** Active maintained guidance for the 2026-10-05 owner-approved rule design.
**Authority:** The accepted rule and configuration contracts in [Phase F](../PRODUCT-PHASE-F-SPEC.md), [direct review](type-function-review-proposal.md), and [compatibility](review-contract-compatibility.md) own behavior; generated field tables describe the current schema.
**Expected use:** Author a rule, choose where it applies, and explain effective review settings.
**Lifecycle:** Update with rule/configuration schema, CLI, or source-selection changes; review whenever supported inputs or source-reading boundaries change.

Each rule lives in its own version-one JSONC document. It states a binary question,
criteria, feedback, and the languages, input forms, and evidence it understands.
Configuration decides whether the rule is active and where it applies. The review
backend returns a probability; Choice and Score are separate unsupported result forms.

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
| User | `REVIEW_USER_CONFIG_PATH`, otherwise `$XDG_CONFIG_HOME/hapsland/config.jsonc` (normally `~/.config/hapsland/config.jsonc`) | Personal settings across repositories; owns review destination and shared resident resources. |
| Project | `.hapsland.jsonc` at the canonical Git working-tree root | Overrides ordinary settings for this repository. There are no nested configuration layers. |
| Rule documents | Explicit `rules` references in configuration | Definitions, not another configuration layer. Paths resolve from the declaring configuration. |

<!-- project-location:end -->

An absent, empty, or relative XDG base uses `~/.config`. An explicitly empty
`REVIEW_USER_CONFIG_PATH` is an error; only an absent override selects the default.
Invocation from a subdirectory does not change the configuration root or pattern base.

Omitted fields inherit. Include lists and language selections use the highest
explicitly supplied list; an empty list selects nothing. Exclusions accumulate
across layers and win over includes. Each rule's configured fields resolve
independently by its stable identity. Individual path and language settings further
narrow global root selection and the rule's declared input support.

User privacy exclusions cannot be removed by project settings. Review destination,
shared resident limits, and stronger Claude blocking have user-owned restrictions;
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
roots. `languages` optionally narrows their supported source languages. With these
settings omitted, all otherwise eligible supported roots are selected.

`contextIncludes` and `contextExcludes` select files that may supply related code.
When context settings are omitted, context follows the effective root file policy;
choosing `src/**` does not silently permit reading outside `src`. An explicit
context selection can additionally permit `shared/**` without selecting changed
roots there. Every captured file still passes containment, protected-path, Git-ignore,
regular-file and size checks. `privacyExcludes` prohibits both root and context reads
regardless of any include. Root-language and per-rule filters do not broaden the
analyzer's supported dependency resolution.

For example, this project reviews TypeScript and Rust roots in `src`, while allowing
related declarations from `shared`. A referenced `shared/private` file remains unread:

```jsonc
{
  "version": 1,
  "includes": ["src/**"],
  "languages": ["typescript", "rust"],
  "contextIncludes": ["src/**", "shared/**"],
  "privacyExcludes": ["shared/private/**"],
  "rules": [
    {
      "path": ".hapsland/rules/custom/no-primitive-obsession.json",
      "languages": ["typescript"],
      "includes": ["src/api/**"]
    }
  ]
}
```

Path settings belong to configuration, never to the authored rule. A TypeScript
rule restricted to `tests/**` cannot select anything when the global root scope is
`src/**`. Required context denied by privacy or context selection is missing evidence,
not a clear review result. Rules that do not need the omitted evidence may still run.

Patterns are repository-relative and use `/` separators. Matching is case-sensitive;
`*` and `?` do not cross `/`, while `**` may cross directories. Dot-files require a
pattern segment beginning with `.`. Bracket classes and simple brace alternatives
are supported. Patterns are bounded to 1,024 characters, eight brace groups, eight
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
| `languages` | array of "typescript" or "rust" or "bend" (may be empty) | Optional | — | Changed-root analyzer languages. Omission inherits; an empty array selects no roots. |
| `languages[]` | "typescript" or "rust" or "bend" | Array item (array may be empty) | — | — |
| `contextIncludes` | array of non-empty string (may be empty) | Optional | — | Supporting-context patterns. Omission inherits effective root includes; an empty array selects no supporting paths. |
| `contextIncludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `contextExcludes` | array of non-empty string (may be empty) | Optional | — | Supporting-context exclusions accumulate across layers. Omission inherits effective root exclusions. |
| `contextExcludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `privacyExcludes` | array of non-empty string (may be empty) | Optional | — | Additional protected-path exclusions. These accumulate and cannot be overridden by lower-privacy layers. |
| `privacyExcludes[]` | non-empty string | Array item (array may be empty) | — | A non-empty repository-relative glob pattern using forward slashes. |
| `reviewBackend` | object with `provider` or object with `provider` and `model` and `accountId` | Optional | — | User-owned review destination. Jev is the default; Cloudflare requires a model and account ID. Projects cannot set this field. |
| `reviewBackend.provider` | fixed value "jev" or fixed value "cloudflare" | Required (provider = "jev" or provider = "cloudflare") | — | Review backend provider. |
| `reviewBackend.model` | "clef" or "clef-flash" | Required (provider = "cloudflare") | — | Cloudflare model selector. |
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
| `graphLimits` | object | Optional | — | Versioned bounded import graph limits; omitted values inherit. |
| `graphLimits.version` | fixed value 1 | Required | — | Import graph limits profile version. |
| `graphLimits.sourceBytes` | integer (1–262144) | Optional | 262144 | Maximum source bytes in each graph file. |
| `graphLimits.treeBytes` | integer (1–20480) | Optional | 20480 | Maximum accepted encoded evidence-tree bytes. |
| `graphLimits.files` | integer (1–8) | Optional | 8 | Maximum files read, including the root. |
| `graphLimits.readBytes` | integer (1–1572864) | Optional | 1572864 | Maximum total source bytes read; must be at least sourceBytes. |
| `graphLimits.outgoingEdges` | integer (1–16) | Optional | 16 | Maximum outgoing edges per accepted file. |
| `graphLimits.depth` | integer (1–4) | Optional | 4 | Maximum supporting-reference depth. |
| `graphLimits.work` | integer (1–128) | Optional | 128 | Maximum graph edge work steps. |
| `rules` | array of non-empty string or object with `path` or object with `id` (may be empty) | Optional | — | — |
| `rules[]` | non-empty string or object with `path` or object with `id` | Array item (array may be empty) | — | A local rule path or inherited rule ID, with optional selection settings. |
| `rules[].path` | non-empty string | Required (path form) | — | — |
| `rules[].enabled` | boolean | Optional | — | — |
| `rules[].languages` | array of "typescript" or "rust" or "bend" (may be empty) | Optional | — | — |
| `rules[].languages[]` | "typescript" or "rust" or "bend" | Array item (array may be empty) | — | — |
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
bounded cross-file evidence within their supported analysis profiles. Rust and Bend
functions are not supported. See the [input contract](type-function-review-proposal.md#branch-contracts).

The optional version-one `graphLimits` profile bounds source bytes, tree size,
files, reads, edges, depth, and work. Projects may lower user ceilings. An in-flight
unit retains its captured profile; an invalid profile fails configuration before
egress. The total read cap must be at least the per-file cap. Provider request
limits independently constrain the HTTP request; see [review providers](review-providers.md).

Credential environment-variable selection has a user-owned exception: a user
`credentialEnvVar` wins over a project value; otherwise a project value may supply it.
<!-- credential-reference:start -->

The built-in credential reference is `TYPESAFE_API_KEY`. Inspection reports its name and presence, never its value. See [credential lookup](installation-workflows.md#personal-development-on-your-own-clients).

<!-- credential-reference:end -->

<!-- analytics-enablement:start -->

Session analytics are disabled by default. Set `sessionAnalytics: true` to retain source-free session totals and bounded rule-ID history, subject to the limits in [status and analytics](status.md#optional-session-analytics).

<!-- analytics-enablement:end -->

Claude feedback defaults to `advisory`. Only user configuration may enable
`claudeFeedbackMode: "block-current-findings"`; a project may restrict it to
`advisory`. The post-edit hook cannot undo the edit or guarantee a repair. Background
and Stop behavior follows the shared delivery contract.

## Declarative rules

<!-- shipped-rules:start -->

When no loaded configuration layer declares a `rules` field, authorized initial setup materializes 9 editable default rule files under `~/.config/hapsland/rules/defaults/`, respecting XDG conventions, and explicitly connects them.

<!-- shipped-rules:end -->

Any explicit `rules` field, including `rules: []`, is authoritative:
setup does not add or reconnect defaults alongside that selection. For example, `r1_inferred_case.json` retains the stable rule ID
`r1_inferred_case`. The selected file is authoritative: editing it changes the rule;
disabling or disconnecting it changes effective review. Deleting a connected file
reports a missing-source error, rather than restoring a hidden default. Repeated
setup preserves authored files. An unreferenced file is inactive in every directory.

Each rule document has `version: 1`, a stable `id`, optional `title`, `question`,
`criteria`, `message`, optional `threshold`, and a nonempty `inputs` list.

<!-- rule-threshold:start -->

The default threshold is 0.7; a finding requires a probability strictly greater than its threshold.

<!-- rule-threshold:end -->
An ID may use a namespace such as `team/no-primitive-obsession`; it is not a filesystem path.
There are no packs, content-version labels, authored path filters, or source-evidence
rungs. Content digests identify actual definition changes.

Each `inputs` entry names a nonempty `languages` list, a `kind`, and required evidence
in `requires`. Entries describe supported combinations, not independent dimensions:
TypeScript, Rust, and Bend support `type`; only TypeScript supports `function`.
`requires` may be empty, meaning no additional listed evidence requirements beyond
a supported extracted root; it does not promise complete dependency evidence.
Type evidence capabilities are `root-declaration`, `resolved-outbound-types`, and
`selected-source-type-closure`; function capabilities are `signature`, `body`,
`resolved-local-calls`, and `resolved-outbound-types`. Duplicate combinations are errors. Enabled inputs selected by configured languages
must have supported combinations and evidence requirements; unsupported selected
inputs fail configuration before source capture.

Runtime validation schemas such as Zod and Effect Schema are a distinct future input
form with a schema dialect; they are not TypeScript type declarations. A disabled rule may retain a schema input declaration for future use, but enabling
that input is rejected explicitly. A multi-input rule may run its supported inputs
when configuration languages exclude every unsupported combination. Concrete values
are not supported review roots. The schema used to validate a rule's JSON is unrelated to reviewing a
runtime schema. No user code is executed to load a rule or discover its inputs.

Question/criteria edits belong in the rule file. Configuration may change activation,
path/language selection, threshold, and feedback message. A configured language must
belong to an authored input; an extra language is an actionable configuration error,
not a request to extend intrinsic support. The provider receives one changed declaration and bounded related code,
not a whole file, raw diff, task, or transcript. Missing required evidence prevents
that rule's evaluation. Findings may concern pre-existing code within the changed root.

### Author, connect, and inspect

Write a project rule under `<Git root>/.hapsland/rules/custom/`, or a personal rule
under `~/.config/hapsland/rules/custom/`. Connect it explicitly using the
[generated command reference](#rule-commands) below. Its examples come from the
same definitions as terminal help, rather than a separate maintained command list.

`hapsland rules create --id no-primitive-obsession --scope project` creates a starting rule
**and connects it**. Its preview states the activation, scope, and concrete files
before interactive writes. Edit the created JSON to define the actual concern.
Creation preserves an existing authored file. Interactive create/connect offers
personal scope with project selected by default; unattended changes specify scope.
Neither operation opens an editor or calls the review backend.

A `rules` entry contains either `path` to declare a rule or `id` to configure a rule
inherited from a lower layer, plus optional `enabled`, `languages`, `includes`,
`excludes`, `threshold`, and `message`. A new connection enables its rule unless
explicitly disabled. Relative paths resolve from the declaring configuration.
Project references must remain inside the Git worktree, including after symlink
resolution; personal references may name user-managed files. Duplicate identities,
unknown inherited identities, and rebinding an inherited identity to another source
are errors. Fork a definition under a distinct ID.

Inventory includes disabled rules, source paths, definition-derived display text,
and configuration origins. Zero enabled rules is an explicit warning. Setup shows
one inventory for the current repository per invocation, including when several
agent runtimes are selected. Enabled counts are not coverage claims.

Rule explanation distinguishes activation, global root selection, per-rule paths,
language selection, and intrinsic supported inputs. Path/language inspection does
not parse source or establish available evidence: it must say when artifact kind,
attribution, and evidence remain unexamined. Configuration explanation uses the same
resolved policy as review and makes no backend request:

```sh
printf '%s\n' '{"version":1,"operation":"explain","cwd":"/absolute/project","path":"src/example.ts"}' | hapsland --explain
```

`configuration.layers` lists loaded sources from built-in through user to project.
Missing optional files are not loaded layers. Native agent hook/trust settings are
separate from Hapsland policy. Rule JSON editor validation uses
[`review-rule-v1.schema.json`](../schemas/review-rule-v1.schema.json); structural
validity does not establish classifier judgment quality.

### Write your first rule

Run these commands from the root of your project's Git working tree.

<!-- first-rule-defaults:start -->

Hapsland ships **9 editable default rules**.

<!-- first-rule-defaults:end -->

Before writing another, inspect the rules you already have:

```sh
hapsland rules list
hapsland rules show --id r1_inferred_case
```

See the [default concerns](../TYPE-DESIGN-RULES.md). The default
`r6_bare_domain_value` already addresses primitive domain values; inspect it before
adding a custom variant. `no-primitive-obsession` below teaches custom authoring,
not an additional default you must enable alongside it.

[Refactoring.Guru describes primitive obsession](https://refactoring.guru/smells/primitive-obsession)
as using primitives or type codes where small objects should express domain
meaning. This walkthrough checks the domain-value part visible in type
declarations; it is not a ban on primitives or a check of every symptom in that
article.

**1. Choose one concern that the captured code can answer.** For example: “Do distinct
domain concepts use interchangeable primitive values?” State what counts
as a violation and what should stay clear. Avoid combining unrelated concerns or
asking about behavior that requires a task description, production data or a whole
repository. See [what the checker can see](../README.md#what-can-the-checker-see).

**2. Create a connected starter, then keep it disabled while editing.**

```sh
hapsland rules create --id no-primitive-obsession --scope project
hapsland rules disable --id no-primitive-obsession --scope project
hapsland rules show --id no-primitive-obsession
```

`create` writes a starter and connects it enabled; it does not open an editor.
Interactive changes show a preview and ask for confirmation. Open the source path
shown by `show` in your editor. Project scope keeps the rule and connection in the
repository; choose `--scope personal` for your user configuration instead.

**3. Replace the starter's generic concern with your own.** For this example,
save the following JSON in that created file, keeping the ID unchanged:

```json
{
  "version": 1,
  "id": "no-primitive-obsession",
  "title": "No primitive obsession",
  "question": "Does the supplied domain type use bare primitives or primitive type codes where a small domain-specific type should express identity, units, allowed values or constraints?",
  "criteria": {
    "false": "Distinct domain concepts have distinct types. Free text and primitives in storage or wire formats alone are not violations.",
    "true": "A domain identity, quantity, constrained value or category uses an unconstrained primitive or opaque type code, losing a meaningful domain distinction."
  },
  "message": "Give distinct domain concepts distinct types so their values cannot be accidentally interchanged.",
  "threshold": 0.7,
  "inputs": [
    {
      "languages": ["typescript"],
      "kind": "type",
      "requires": ["root-declaration", "resolved-outbound-types", "selected-source-type-closure"]
    }
  ]
}
```

The question asks about one violation; `criteria.true` describes a finding and
`criteria.false` describes the acceptable case. `message` gives actionable feedback.
This rule needs the declaration and its related type definitions to distinguish
bare primitives from domain-specific types. If your concern needs different
evidence or function bodies, declare the appropriate [input kind and required evidence](#declarative-rules);
missing required evidence prevents evaluation. File filters and language/threshold
overrides belong in configuration references, not the authored rule's path fields.

If you prefer writing the JSON yourself, save one rule per file and connect it:

```sh
hapsland rules connect --path .hapsland/rules/custom/no-primitive-obsession.json --scope project
```

This is an alternative to `create`, not an extra step for an already connected
rule. `connect` validates the file and enables a new connection. You can also
[declare its path directly in configuration](#author-connect-and-inspect).

**4. Enable and inspect the effective selection.**

```sh
hapsland rules enable --id no-primitive-obsession --scope project
hapsland rules show --id no-primitive-obsession
hapsland rules explain --id no-primitive-obsession --path src/primitive-obsession-examples.ts
```

These commands make no classifier calls. `explain` checks configuration selection;
it does not parse the source or establish whether the necessary evidence exists.

**5. Test a violation and an acceptable case.** Create
`src/primitive-obsession-examples.ts` with a loose domain type and a version using
distinct ID types:

```ts
export type LooseOrder = {
  customerId: string
  orderId: string
}

export type CustomerId = { readonly kind: "customer-id"; readonly value: string }
export type OrderId = { readonly kind: "order-id"; readonly value: string }

export type Order = {
  customerId: CustomerId
  orderId: OrderId
}
```

Then run:

```sh
hapsland rules check --path src/primitive-obsession-examples.ts --line 2 --id no-primitive-obsession
hapsland rules check --path src/primitive-obsession-examples.ts --line 10 --id no-primitive-obsession
```

The first type lets customer and order IDs be interchanged and should trigger;
the second gives them distinct types and should stay clear. The primitive `value`
inside each wrapper is its representation, not itself a violation. A plain alias
such as `type CustomerId = string` would still be interchangeable; merely naming
a primitive does not establish a distinct type. These are expectations to check,
not guaranteed classifier outputs. Each command selects the enclosing
declaration and bounded related code, uses normal credential discovery and sends
a real external classifier request that may incur charges. No resident or agent
session is needed. Add `--json` to inspect the actual source-bearing input and
probabilities. A skipped/unavailable result is not a clear result, and exit 0 also
includes findings. See [file/line check details](#try-a-rule-on-a-file-and-line).

**6. Refine against more examples before relying on it.** Try edge cases and
similar code that should not trigger. Inspect the captured input before changing
the question or evidence requirements; check effective settings for overrides.
A probability strictly above the threshold produces a finding, but adjusting the
threshold alone does not fix an unclear concern. Once satisfied, use ordinary
agent edits and the [opt-in inspection dashboard](status.md#opt-in-local-inspection)
to inspect reviews and feedback. Disable the rule if you are still tuning it.
Commit the project rule and configuration when you want to share them; keep or
remove the example source according to your project's conventions.

### Try a rule on a file and line

`no-primitive-obsession` is the example custom rule created in the walkthrough,
not a shipped default. Substitute an enabled ID from `hapsland rules list`.

```sh
hapsland rules check --path src/example.ts --line 12 --id no-primitive-obsession
hapsland rules check --path src/example.ts --line 12 --json
```

`--path` is relative to the current directory, inside its Git working tree;
`--line` is a positive one-based line inside a supported declaration. The command
selects that entire type declaration or TypeScript function signature and body,
then resolves its bounded related code using the same capture, parser, graph,
evidence admission and classifier path as ordinary review. It does not pick a
fixed number of surrounding lines or send the entire file. Blank lines outside
roots and lines shared by multiple roots do not authorize a request.

Only eligible **enabled connected rules** run. `--id` selects one; omit it to run
all eligible rules for that declaration. Normal root/context selection, privacy
exclusions, ignored-file checks and resource limits still apply. Missing required
evidence, no eligible rule, or a denied file produces an explained skip and no
classifier request. The command uses the configured backend and its normal
credential discovery (environment, eligible project and user key files, native
saved key). Explicit credential references use the named key from the environment
or supported key files, without native-store fallback. See
[credential lookup](installation-workflows.md#personal-development-on-your-own-clients). It starts no resident,
requires no agent session, and does not modify source, rules or settings.

This command explicitly sends the selected code and rule questions to the external
classifier and may incur charges. Human output names the selected declaration,
related source files, probabilities, thresholds and findings. `--json` includes
the actual source-bearing classifier input, selection diagnostics and results;
keep that output private when it contains private code. Source changes during
review invalidate the result. Exit 0 means evaluated, **even with a finding**;
exit 6 means skipped/unavailable or a local operation failure. Invalid command
arguments are rejected before review. A clear result means no probability exceeded
its configured threshold; it is not proof that the code or rule is correct.

Try representative positive and negative examples, including edge cases where
similar code should not trigger. The [inspection dashboard](status.md#opt-in-local-inspection)
provides another view of actual agent reviews after enabling `sessionInspection`;
its journal does not include this one-off command.

<!-- rule-guide:start -->

### Rule commands

The command definitions generate this reference and terminal help. `hapsland rules` defaults to `list`; use `hapsland rules <command> --help` for command-specific flags and examples.

| Command | Purpose |
|---|---|
| `list` | List connected rules, activation and source files |
| `show` | View a connected rule and its effective settings |
| `explain` | Explain activation and file/language selection |
| `check` | Review the declaration at a file and line with the classifier |
| `create` | Create and connect an editable rule |
| `connect` | Connect an existing local JSON rule |
| `enable` | Enable a connected rule in the selected scope |
| `disable` | Disable a connected rule in the selected scope |

```sh
hapsland rules list
hapsland rules show --id r1_inferred_case
hapsland rules explain --id r1_inferred_case --path src/example.ts
hapsland rules check --path src/example.ts --line 12 --id r1_inferred_case
hapsland rules create --id no-primitive-obsession --scope project
hapsland rules connect --path .hapsland/rules/custom/no-primitive-obsession.json --scope project
hapsland rules enable --id no-primitive-obsession --scope project
hapsland rules disable --id no-primitive-obsession --scope project
```

### Rule example

```jsonc
{
  "version": 1,
  "id": "team/meaningful-combinations",
  "question": "Does the artifact make an invalid state representable?",
  "criteria": {
    "false": "Every representable state has a domain meaning.",
    "true": "The artifact admits a state with no domain meaning."
  },
  "message": "Review this declaration's representable states.",
  "inputs": [
    {
      "languages": [
        "typescript",
        "rust",
        "bend"
      ],
      "kind": "type",
      "requires": [
        "root-declaration",
        "resolved-outbound-types",
        "selected-source-type-closure"
      ]
    }
  ]
}
```

### Rule fields

| Field | Type and bounds | Presence | Default | Description |
|---|---|---|---|---|
| `version` | fixed value 1 | Required | — | — |
| `id` | string matching a pattern | Required | — | — |
| `title` | non-empty string | Optional | — | — |
| `question` | non-empty string | Required | — | — |
| `criteria` | object | Required | — | — |
| `criteria.false` | non-empty string | Required | — | — |
| `criteria.true` | non-empty string | Required | — | — |
| `message` | non-empty string | Required | — | — |
| `threshold` | number (0–1) | Optional | — | — |
| `inputs` | array of object with `languages` and `kind` and `requires` (at least 1 item) | Required | — | — |
| `inputs[]` | object with `languages` and `kind` and `requires` | Array item (array may be empty) | — | — |
| `inputs[].languages` | array of "typescript" or "rust" or "bend" (at least 1 item) | Required (object form) | — | — |
| `inputs[].languages[]` | "typescript" or "rust" or "bend" | Array item (array may be empty) | — | — |
| `inputs[].kind` | "type" or "function" or fixed value "schema" | Required (object form) | — | — |
| `inputs[].requires` | array of non-empty string (may be empty) | Required (object form) | — | — |
| `inputs[].requires[]` | non-empty string | Array item (array may be empty) | — | — |
| `inputs[].dialect` | non-empty string | Optional | — | — |

Inputs pair each declared language with a kind and required capabilities. Type inputs support TypeScript, Rust and Bend; function inputs currently support TypeScript.
Schema inputs remain distinct declarations and produce an explicit unsupported-input diagnostic when selected. Concrete values are not review inputs.
Hapsland dispatches only when the selected language/kind pair and required evidence match. File and language restrictions belong in configuration rule references.

<!-- rule-guide:end -->

## Runtime behavior

<!-- settings-cache:start -->

The resident loads configuration and rule documents together, validates them and compiles the rules into an immutable edit settings snapshot. A resident-owned Effect cache retains successful snapshots for 5 seconds after loading finishes; hits do not extend that interval, and concurrent requests for the same project and configuration paths share a load. The cache holds at most 128 sources. A failed load is not cached and does not silently reuse an expired snapshot.

<!-- settings-cache:end -->

An edit captures its snapshot at pre-edit registration, or at observation admission
when no registration exists. Duplicate pending registration preserves the original
snapshot. Preparation, review, advice and delivery retain that same snapshot,
including provider selection, file policy and Claude feedback mode. Later collect
and Stop requests do not reload settings for existing advice. Saved changes apply
to new edits when the cache next reloads; expiry does not change an active edit.
Source freshness, credentials, round authority and expiry checks still run. The
resident derives environment-only authentication from the snapshot; the hook
passes the selected credential reference/value and generation, without a separate
configuration-derived authentication flag.

The resident dispatches eligible semantic units after final source currentness
checks under the edit settings snapshot. The old whole-file JSON review command and its `settings`
configuration were retired under issue #148. The configuration parser rejects
`settings`; review request capacity and deadlines are resident policy, not JSONC controls.
`editPermitLimits` controls only simultaneously pending pre-edit permits and belongs in
the user configuration because the resident is shared across projects.

Credentials are references only. The selected key is read at dispatch from the named environment variable, then
repository `.env.local`, repository `.env`, then the user Hapsland `.env` file.
An explicit environment value, including empty, masks file values. Without a
selected key, the built-in reference can use native saved login; explicit
`credentialEnvVar` settings select environment/file authentication only. File
credentials are not copied or persisted by Hapsland, and values are never printed
or included in diagnostics. See [credential lookup](installation-workflows.md#personal-development-on-your-own-clients) for file requirements.
The configuration schema rejects retired `consent` and `enabled` fields.
User-only `reviewBackend` settings select Jev or Cloudflare Clef/Clef-flash.
Each selection determines a fixed provider origin and model route; arbitrary
endpoint routing cannot be configured. See [provider selection](review-providers.md#selection-and-credentials).

The old version-1 whole-file JSON request/response process contract is retired.
Configuration capture and explanation use the same policy digest. Shared
fixture, configuration-case, scenario, observation, and comparison identities
are defined in [`src/evaluation/model.ts`](../src/evaluation/model.ts).

The semantic milestone command is documented separately in
[`evaluation.md`](./evaluation.md). It is an explicit maintainer operation and does not provide a production review route.
