# Write your first rule

**Purpose:** Walk through creating, selecting, and trying one custom project rule.
**Audience:** Rule authors using an installed Hapsland CLI.
**Status:** Active maintained tutorial.
**Authority:** Maintained user guidance; the accepted [rule and configuration contract](review-contract-compatibility.md) owns required behavior, and classifier observations establish only their tested examples.
**Expected use:** Follow one project-scoped example, inspect its actual results, and decide whether to keep or refine the rule.
**Lifecycle:** Update with the executable authoring example and rule commands; review when setup prerequisites, source selection, or check outcomes change.

## Before you start

Use an installed, runnable `hapsland` CLI; follow the current
[installation path](installation-workflows.md#choose-your-installation-path).
The commands below run from your project's Git working-tree root. They do not
require installed agent hooks or a Hapsland source-development toolchain.

Your [effective file settings](configuration.md#review-roots-related-code-and-privacy)
must permit the sample in `src/` and its related definitions. The creation,
editing, and explanation steps make no classifier requests. The final checks
send source to your configured classifier and may incur charges; configure its
[backend](review-providers.md) and [credentials](installation-workflows.md#credentials-and-login)
before that step.

## Walkthrough

Before writing another, inspect the rules you already have:

<!-- first-rule-inspection:start -->

```sh
hapsland rules list
hapsland rules show --id bare_domain_value
```

<!-- first-rule-inspection:end -->

<!-- authoring-default:start -->

Inspect [the editable defaults](rules.md#default-rules). The default `bare_domain_value` already addresses primitive domain values; inspect it before adding a custom variant. `no-primitive-obsession` below is a teaching example, not an additional recommended default.

<!-- authoring-default:end -->

[Refactoring.Guru describes primitive obsession](https://refactoring.guru/smells/primitive-obsession)
as using primitives or type codes where small objects should express domain
meaning.

**1. Choose one concern that the captured code can answer.** For example: “Do distinct
domain concepts use interchangeable primitive values?” State what counts
as a violation and what should stay clear. Avoid combining unrelated concerns or
asking about behavior that requires a task description, production data or a whole
repository. See [what leaves your repository](../README.md#what-leaves-my-repository).

**2. Create a starter, then keep it disabled while editing.**

<!-- authoring-create:start -->

```sh
hapsland rules create --id no-primitive-obsession --scope project
hapsland rules disable --id no-primitive-obsession --scope project
hapsland rules show --id no-primitive-obsession
```

<!-- authoring-create:end -->

`create` writes an enabled `.jsonc` starter with comments explaining type and function
inputs and evidence requirements; it does not open an editor. Rule files accept
comments with either a `.json` or `.jsonc` filename.
Interactive changes show a preview and ask for confirmation. Open the source path
shown by `show` in your editor. Project scope keeps the rule and configuration in the
repository. See [personal scope and connection alternatives](rules.md#create-connect-and-inspect) for other workflows.

**3. Replace the starter's generic concern with your own.** For this example,
save the following JSON in that created file, keeping the ID unchanged:

<!-- authoring-rule:start -->

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
      "languages": [
        "typescript"
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

<!-- authoring-rule:end -->

The question asks about one violation; `criteria.true` describes a finding and
`criteria.false` describes the acceptable case. `message` gives actionable feedback.
This rule needs the declaration and its related type definitions to distinguish
bare primitives from domain-specific types. If your concern needs different
evidence or function bodies, see [input kinds and required evidence](rules.md#rule-document-format);
missing required evidence prevents evaluation. File filters and language/threshold
overrides belong in configuration references, not the authored rule's path fields.

**4. Enable and inspect the effective selection.**

<!-- authoring-enable:start -->

```sh
hapsland rules enable --id no-primitive-obsession --scope project
hapsland rules show --id no-primitive-obsession
hapsland rules explain --id no-primitive-obsession --path src/primitive-obsession-examples.ts
```

<!-- authoring-enable:end -->

These commands make no classifier calls. `explain` checks configuration selection;
it does not parse the source or establish whether the necessary evidence exists.

<!-- authoring-source:start -->

**5. Test a violation and an acceptable case.** Create `src/primitive-obsession-examples.ts` with a loose domain type and a version using distinct ID types:

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

<!-- authoring-source:end -->

Then run:

<!-- authoring-check:start -->

```sh
hapsland rules check --path src/primitive-obsession-examples.ts --line 2 --id no-primitive-obsession
hapsland rules check --path src/primitive-obsession-examples.ts --line 10 --id no-primitive-obsession
```

<!-- authoring-check:end -->

<!-- authoring-check-result:start -->

The first type lets customer and order IDs be interchanged and should trigger; the second gives them distinct types and should stay clear. The primitive `value` inside each wrapper is its representation, not itself a violation. A plain alias such as `type CustomerId = string` would still be interchangeable; merely naming a primitive does not establish a distinct type. These are expectations to check, not guaranteed classifier outputs. Each command selects the enclosing declaration and related code, uses normal credential discovery and sends a real external classifier request that may incur charges. No agent session is needed. Add `--json` to inspect the actual source-bearing input and probabilities. A skipped/unavailable result is not a clear result, and exit 0 also includes findings. See [file/line check details](rules.md#try-a-rule-on-a-file-and-line).

<!-- authoring-check-result:end -->

**6. Refine against more examples before relying on it.** Try edge cases and
similar code that should not trigger. Inspect the captured input before changing
the question or evidence requirements; check effective settings for overrides.
A probability strictly above the threshold produces a finding, but adjusting the
threshold alone does not fix an unclear concern.

A skipped or unavailable check leaves the example untested; it is not a clear
result. One positive/negative pair does not establish accuracy. One-off checks
return their own results and do not appear in the inspection journal; the
[dashboard](status.md#opt-in-local-inspection) shows recorded ordinary agent reviews.

## Finish or keep tuning

Finish by checking that the rule is saved and deliberately enabled, reviewing its
selection, and inspecting both evaluated examples against the concern you wrote.
A finding is a result to inspect, not a failed command.

If the rule still needs tuning, disable it with
`hapsland rules disable --id no-primitive-obsession --scope project` and keep its
file for further work. Commit the rule and `.hapsland.jsonc` if you want to share
them. Delete the demonstration source unless you choose to keep it as an example.
Keep a referenced rule file: deleting it while settings still name it causes a
missing-source error.
