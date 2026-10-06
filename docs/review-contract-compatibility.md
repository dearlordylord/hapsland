# Review contract compatibility

**Purpose:** Record how direct-edit type and function review fits configuration, rules, identity, and delivery.
**Status:** Maintained; amended by the 2026-09-29 and 2026-10-05 owner decisions.
**Authority:** Accepted product contract for the named compatibility decisions. Tests and conformance records supply implementation evidence.
**Expected use:** Check changes to configuration, rule definitions, review input, and review result reuse.
**Lifecycle:** Review when any of those boundaries or the #93 type/function contract changes.

The owner approved bounded cross-file source use for direct-edit type and
function review on 2026-09-29. The earlier one-file named-type input is retired
as a production route. A later comparison of advice quality is a separate task;
this decision does not claim measured live Jev quality. The [#93 contract](type-function-review-proposal.md)
owns the source, completeness, and input requirements.

## Configuration and individual rules

The 2026-10-05 user authorization adopts individual rule documents and separates
intrinsic input requirements from configured application policy. It supersedes the
pack, content-version, authored-path and source-rung decisions in #220 and its
#221–224 implementation tasks. Those historical issues retain their chronology;
this contract and the amended [Phase F contract](../PRODUCT-PHASE-F-SPEC.md) own
current behavior. Formats remain version 1 during this pre-release change.

Built-in, user, and project settings retain their order. Includes and language
lists use the highest supplied list; exclusions accumulate. Omission inherits,
and an empty include/language list selects nothing. Rule settings resolve by stable
rule identity and intersect global root selection and intrinsic input support.
There is no separate repository grant. Invalid selected configuration fails before
source capture, without falling back to other rules.

Global `includes`/`excludes` select edited roots. `contextIncludes`/`contextExcludes`
select supporting source; omitted context selection follows the effective root
file policy. Explicit context settings may allow related files outside root scope
without making them review roots. `privacyExcludes`, containment, protected paths,
Git-ignore, file kind, and capture bounds apply before every root or supporting
read. No include can restore a privacy-denied file. Freshness checks retain each
file's root or context role.

Each version-one JSONC rule document declares a stable ID, optional display title,
question, criteria, message, threshold, and `inputs`. Each input declares supported
`languages`, `kind` (`type` or `function`), and required evidence in `requires`.
The compiler maps supported combinations to the exact direct-review contract;
authors do not supply transport contract identifiers. TypeScript, Rust, and Bend
types and TypeScript functions are supported within their bounded analyzer profiles.
Unknown fields or versions fail validation. Enabled input combinations selected by
configured languages must be supported, including their evidence requirements.
A disabled rule may retain an unsupported schema input for future use; enabling it
fails. Configured languages must be a subset of authored languages, or configuration
fails. A supported subset of a multi-input rule may be selected explicitly. Runtime
schemas have no execution support, and concrete values are unsupported roots; a
schema is not implicitly a type declaration or a higher evidence rung.

One file defines one rule. Files become active only through explicit configuration
`rules` references. New rule references enable their rule unless disabled. References
use either a local path or an inherited rule ID, with optional activation,
languages, paths, threshold, and message settings. Paths belong to configuration.
A duplicate identity or rebinding to a different file is an error. Rule content and
effective settings have content digests; there are no pack identities or content
version labels. Existing default rule IDs (`r1_inferred_case` and the other `rN_*`
IDs) remain stable. Initial setup provisions nine editable defaults only when no configuration layer
declares `rules`. Any explicit selection, including `rules: []`, is authoritative:
repeat setup preserves it and authored files, without enabling unselected defaults.
Missing rule files fail validation instead of being recreated.

The default body rule requires the exact function signature and body, not complete
call/type closure. Missing references are explicit omissions and are not findings.
Other inputs retain their declared evidence requirements. Every shipped and custom
rule uses the same validation, compilation, and evidence-admission boundary.
Choice and Score result forms remain separate decisions.

## Smoke test the rule

`hapsland rules check --path FILE --line N` sends the enclosing declaration and
bounded related code to the classifier, without an agent session or resident.
Add `--id` to select one enabled rule. Results include probabilities and findings;
`--json` includes code. Unsupported, ambiguous or stale selections cannot yield a
valid result. See [usage and limits](configuration.md#try-a-rule-on-a-file-and-line).

## Review input and result identity

The active input contracts are direct-event/type-shape/v1 and
direct-event/function/v1. Each request carries one changed root and its
bounded evidence tree with marked omissions. Supporting declarations can come from other
selected files through supported local imports. They do not become separate
edited roots. Omitted reference sites may contain opaque expression text, such
as an anonymous callback or dynamic call, rather than a named binding. This
text remains a bounded JSON string with its omission reason; it neither adds
a resolved node nor makes the graph complete. Resolved edges retain their
named-reference grammar, and the aggregate evidence-size limit still applies.
The request contains neither a whole file nor an edit diff,
agent transcript, absolute path, or unrelated source.

Hapsland selects each rule only when its declared evidence needs are met. A
rule may run with a marked omission that is irrelevant to it. If no rule applies,
Hapsland sends no request. A review input's identity includes the exact input contract,
renderer, root, evidence tree, selected rule definitions, and effective
policy. Source-file fingerprints support freshness checks but do not by
themselves change semantic identity when an unrelated comment moves. Before
dispatch, Hapsland requires the captured files to match exactly. Before
advice, it rereads contributing files and rebuilds the unit using the edit-owned
configuration and compiled rules snapshot; changed source input, attribution, or
working root retires the result. Saved configuration and rule changes apply only
to subsequently captured edit snapshots, with the five-second cache behavior in
[configuration](configuration.md#runtime-behavior). The snapshot stays with the
edit through advice and delivery, including later collect or Stop requests.
Only a still-current matching unit may reuse a successful review-backend result.
The prepared identity includes the selected provider, model selector, and full
destination; a change to any of these invalidates reuse. See the
[provider boundary](review-providers.md) for transport validation and declared limits.

Update attribution currently requires an exact verified post-edit span. Codex
`apply_patch` hunks, Claude `Edit`/`Write` native content evidence, and Pi 1.0.0
native `edit` unified-result patches can supply one. Codex and Pi share post-edit
patch verification with explicit placement rules: Codex requires a unique text
match; Pi verifies native line coordinates against bounded current source without
a text-search fallback or a separate pre-edit image. Pi derives ranges from the
successful result patch independently of how `oldText`/`newText` replacements are
grouped, including replacements spanning omitted context across hunks. Claude
derives spans directly from its native content evidence.

Attribution compares one-based UTF-16 code-unit columns from the pinned
Node parser binding and verified edit spans. Unicode comments and strings do
not prevent Add or verified Update selection. Missing or uncertain spans still
produce no Update review unit; OpenCode Update currently supplies no verified
span, while its Add path selects eligible declarations. Runtime-specific limits
still apply: the [Pi profile](pi-installation.md) currently requires ASCII input
and source. Native Pi `write`, nested/child mutations, shell mutations, and custom
tools are unsupported/incomplete rather than inferred Add or Update observations.

The previous compatibility assessment for the one-file input remains in Git
history. Its old prospective gates do not govern the 2026-09-29 decision.
