# Rules

**Purpose:** Explain editable rules, their input requirements, management commands, and direct rule checks.
**Audience:** End users inspecting and managing rules; rule authors.
**Status:** Active maintained rule reference.
**Authority:** Maintained user guidance for the accepted [rule and configuration contract](review-contract-compatibility.md) and [direct-review contract](type-function-review-proposal.md); generated tables describe current schemas and commands.
**Expected use:** Inspect or manage a rule, look up its format and evidence requirements, and interpret a file/line check.
**Lifecycle:** Update with rule schema, CLI, defaults, or evidence-admission changes; review whenever rule activation, source sharing, or result interpretation changes.

For a guided project-scoped example, use [Write your first rule](write-first-rule.md).
[Configuration](configuration.md#rule-selection-and-overrides) owns activation,
inheritance, and file/language overrides. The commands below edit that selection.

## Editable rule files

<!-- shipped-rules:start -->

When no loaded configuration layer declares a `rules` field, authorized initial setup materializes 7 editable default rule files normally under `~/.config/hapsland/rules/defaults/`.

<!-- shipped-rules:end -->

[Explicit configuration selections](configuration.md#rule-selection-and-overrides)
control whether setup provisions defaults.

<!-- rule-file-identity:start -->

For example, `meaningless_combinations.json` retains the stable rule ID `meaningless_combinations`.

<!-- rule-file-identity:end -->

The selected file is authoritative: editing it changes the rule;
disabling it changes effective review. Deleting its file
reports a missing-source error, rather than restoring a hidden default. Repeated
setup preserves authored files. An unreferenced file is inactive in every directory.

## Default rules

New setup provisions seven defaults: `meaningless_combinations`,
`split_correlations`, `absence_confusion`, `bare_domain_value`,
`name_wider_than_type`, `name_claims_resource`, and `body_reaches_undeclared`.
Repeated setup preserves existing selections and user-edited files.
Use `hapsland rules disable --id <authored-id> --scope personal` to disable a rule.

The [historical nine-rule comparison](./abide-contextual-review-study.md) and
[larger-declaration comparison](./abide-large-declaration-study.md) summarize
classifier observations for their original rule definitions and inputs.

## Rule document format

Each rule document has `version: 1`, a stable `id`, optional `title`, `question`,
`criteria`, `message`, optional `threshold`, and a nonempty `inputs` list.

<!-- rule-threshold:start -->

The default threshold is 0.7; a finding requires a probability strictly greater than its threshold.

<!-- rule-threshold:end -->
An ID may use a namespace such as `namespace/no-primitive-obsession`.

Each `inputs` entry names a nonempty `languages` list, a `kind`, and required evidence
in `requires`. Entries describe accepted combinations, not independent dimensions:
TypeScript, Rust, and Bend support `type`; only TypeScript supports `function`.
`requires` may be empty, meaning no additional listed evidence requirements beyond
an extracted root; it does not promise complete dependency evidence.
Type evidence capabilities are `root-declaration`, `resolved-outbound-types`, and
`selected-source-type-closure`; function capabilities are `signature`, `body`,
`resolved-local-calls`, and `resolved-outbound-types`. Duplicate combinations are errors. Enabled inputs selected by configured languages
must have accepted combinations and evidence requirements; unsupported selected
inputs fail configuration before source capture.

Runtime validation schemas such as Zod and Effect Schema are a distinct future input
form with a schema dialect; they are not TypeScript type declarations. A disabled rule may retain a schema input declaration for future use, but enabling
that input is rejected explicitly. A multi-input rule may run its eligible inputs
when configuration languages exclude every unsupported combination. Concrete values
are not supported review roots. The schema used to validate a rule's JSON is unrelated to reviewing a
runtime schema. No user code is executed to load a rule or discover its inputs.

Question/criteria edits belong in the rule file. Configuration may change activation,
path/language selection, threshold, and feedback message. A configured language must
belong to an authored input; an extra language is an actionable configuration error,
not a request to extend intrinsic support. The provider receives one changed declaration and related code,
not a whole file, raw diff, task, or transcript. Missing required evidence prevents
that rule's evaluation. Findings may concern pre-existing code within the changed root.

## Create, connect, and inspect

Write a project rule under `<Git root>/.hapsland/rules/custom/`, or a personal rule
under `~/.config/hapsland/rules/custom/`. Add it using the
[generated command reference](#rule-commands) below. Its examples come from the
same definitions as terminal help, rather than a separate maintained command list.

`hapsland rules create --id no-primitive-obsession --scope project` creates a starting rule
**and enables it**. Its preview states the activation, scope, and concrete files
before interactive writes. Edit the created JSON to define the actual concern.
Creation preserves an existing authored file. Interactive create/connect offers
named Project and Personal choices, with Project selected by default; unattended changes specify scope. Scope selection alone authorizes no write. Interactive mutation previews the owner plan and requires full-line approval bound to that plan; a changed plan requires a new preview and approval.
Neither operation opens an editor or calls the review backend.

Inventory includes disabled rules, source paths, definition-derived display text,
and configuration origins. Zero enabled rules is an explicit warning. Setup shows
one inventory for the current repository per invocation, including when several
agent runtimes are selected. Enabled counts are not coverage claims.

Rule explanation distinguishes activation, global root selection, per-rule paths,
language selection, and declared inputs. Path/language inspection does
not parse source or establish available evidence: it must say when artifact kind,
attribution, and evidence remain unexamined. Rule explanation makes no backend request.

For loaded configuration layers and global path policy, use
[configuration explanation](configuration.md#rule-selection-and-overrides).

Rule JSON editor validation uses
[`review-rule-v1.schema.json`](../schemas/review-rule-v1.schema.json); structural
validity does not establish classifier judgment quality.

For an existing JSONC rule, `hapsland rules connect --path FILE --scope project`
validates and connects it. A newly connected rule is enabled. Personal scope uses
`--scope personal`; interactive changes offer the same named scope choices.

<!-- authoring-connect:start -->

```sh
hapsland rules connect --path .hapsland/rules/custom/no-primitive-obsession.jsonc --scope project
```

<!-- authoring-connect:end -->

## Try a rule on a file and line

<!-- rule-check-example:start -->

`no-primitive-obsession` is the example custom rule created in the [walkthrough](write-first-rule.md), not a shipped default. Substitute an enabled ID from `hapsland rules list`.

```sh
hapsland rules check --path src/primitive-obsession-examples.ts --line 2 --id no-primitive-obsession
hapsland rules check --path src/primitive-obsession-examples.ts --line 2 --json
```

<!-- rule-check-example:end -->

`--path` is relative to the current directory, inside its Git working tree;
`--line` is a positive one-based line inside a type or function. The command
selects that entire type declaration or TypeScript function signature and body,
then resolves its related code using the same capture, parser, graph,
evidence admission and classifier path as ordinary review. It does not pick a
fixed number of surrounding lines or send the entire file. Blank lines outside
roots and lines shared by multiple roots do not authorize a request.

Only eligible **enabled rules** run. `--id` selects one; omit it to run
all eligible rules for that declaration. Normal root/context selection, privacy
exclusions, ignored-file checks and resource limits still apply. Missing required
evidence, no eligible rule, or a denied file produces an explained skip and no
classifier request. The command uses the configured backend and its normal
credential discovery (environment, eligible project and user key files, native
saved key). Explicit credential references use the named key from the environment
or configured credential-file locations, without native-store fallback. See
[credential lookup](installation-workflows.md#credentials-and-login). It requires no agent session, and does not modify source, rules or settings.

This command explicitly sends the selected code and rule questions to the external
classifier and may incur charges. Human output names the selected declaration,
related source files, probabilities, thresholds and findings. `--json` includes
the actual source-bearing classifier input, selection diagnostics and results;
keep that output private when it contains private code. Source changes during
review invalidate the result.

<!-- rule-check-exits:start -->

Exit 0 means evaluated, **even with a finding**; exit 6 means skipped/unavailable or a local operation failure. Invalid command arguments are rejected before review.

<!-- rule-check-exits:end -->

A clear result means no probability exceeded
its configured threshold; it is not proof that the code or rule is correct.

Try representative positive and negative examples, including edge cases where
similar code should not trigger. <!-- rule-check-dashboard:start -->

The [inspection dashboard](status.md#opt-in-local-inspection) provides another view of actual agent reviews after enabling `sessionInspection`; its journal does not include this one-off command.

<!-- rule-check-dashboard:end -->

<!-- rule-guide:start -->

## Rule commands

The command definitions generate this reference and terminal help. `hapsland rules` defaults to `list`; use `hapsland rules <command> --help` for command-specific flags and examples.

| Command | Purpose |
|---|---|
| `list` | List rules, activation and source files |
| `show` | View a rule and its effective settings |
| `explain` | Explain activation and file/language selection |
| `check` | Review the declaration at a file and line with the classifier |
| `create` | Create an editable rule |
| `connect` | Add an existing local JSON rule |
| `enable` | Enable a rule in the selected scope |
| `disable` | Disable a rule in the selected scope |

```sh
hapsland rules list
hapsland rules show --id meaningless_combinations
hapsland rules explain --id meaningless_combinations --path src/example.ts
hapsland rules check --path src/example.ts --line 12 --id meaningless_combinations
hapsland rules create --id no-primitive-obsession --scope project
hapsland rules connect --path .hapsland/rules/custom/no-primitive-obsession.jsonc --scope project
hapsland rules enable --id no-primitive-obsession --scope project
hapsland rules disable --id no-primitive-obsession --scope project
```

## Rule example

```jsonc
{
  "version": 1,
  "id": "namespace/meaningful-combinations",
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
        "bend",
        "go"
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

## Rule fields

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
| `inputs[].languages` | array of "typescript" or "rust" or "bend" or "go" (at least 1 item) | Required (object form) | — | — |
| `inputs[].languages[]` | "typescript" or "rust" or "bend" or "go" | Array item (array may be empty) | — | — |
| `inputs[].kind` | "type" or "function" or fixed value "schema" | Required (object form) | — | — |
| `inputs[].requires` | array of non-empty string (may be empty) | Required (object form) | — | — |
| `inputs[].requires[]` | non-empty string | Array item (array may be empty) | — | — |
| `inputs[].dialect` | non-empty string | Optional | — | — |

Inputs pair each declared language with a kind and required capabilities. Type inputs support TypeScript, Rust and Bend; function inputs currently support TypeScript.
Schema inputs remain distinct declarations and produce an explicit unsupported-input diagnostic when selected. Concrete values are not review inputs.
Hapsland dispatches only when the selected language/kind pair and required evidence match. File and language restrictions belong in configuration rule references.

<!-- rule-guide:end -->
