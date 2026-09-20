# Phase F configuration specification — interview draft

Status: interview decision record, consolidated into
[Phase F issue #3](https://github.com/dearlordylord/jevs/issues/3) and its
[local specification](./PRODUCT-PHASE-F-SPEC.md). Decisions below combine explicit
interview answers with design choices delegated by the user after Q24. Publishing the
specification does not implement Phase F. CONTEXT.md has not been changed.

## Accepted decisions

### Repository activation

Review requires explicit user opt-in for the repository before source is sent to a
review backend. Installing the hook or adding project configuration does not itself
grant that consent. The motivation is control over disclosure of source, including
proprietary code; no particular backend data-handling practice is assumed here.

### Configuration authority

Authority is split by concern. Project configuration supplies shared rule selection,
thresholds, and messages. The user retains control over source-egress consent,
credentials, cost limits, and stricter privacy exclusions. Project configuration
cannot grant consent or weaken the user's privacy restrictions.

For review policy, settings inherit in this order: built-in defaults, user defaults,
then project settings. Missing fields inherit; rule overrides merge individual fields by
rule ID. Consent and user privacy restrictions are separate constraints, not values that
project precedence can override. Include/exclude list semantics are specified below;
other list-merging semantics remain open.

### File selection

The highest-precedence supplied include list replaces inherited selection. Exclusions
accumulate across built-in, user, and project layers, and any exclusion wins. An empty
include list selects nothing; omitted includes inherit. An empty project exclusion list
cannot clear inherited exclusions. Patterns are relative to the Git working-tree root,
including patterns supplied in user configuration. Negated re-inclusion is outside
Phase F. Built-in exclusions should be narrow; their exact list and glob dialect remain
to be specified.

An exclusion must be removed at the layer that supplied it. These are accepted product
semantics informed by
[the file-filter research](./PRODUCT-CONFIG-FILE-FILTER-RESEARCH-2026-09-19.md), not a
claim that a universal configuration standard prescribes this behavior.

### Configuration explanation

The product must provide a command that shows effective inclusions/exclusions and their
origins. This command is included in Phase F. The minimal behavior is to explain a supplied
repository-relative path: matching includes, matching exclusions,
the layer/file/field supplying each, and the resulting selection decision. Show replaced
include lists as overridden rather than active. Preserve provenance while resolving
configuration so this explanation does not reconstruct a different policy. The command
does not call a backend. Exact command names and output schema remain open.

### Declarative rule packs

Phase F supports versioned declarative rule packs containing questions, criteria,
applicability, thresholds, and messages. Executable plugins are outside this scope.
Phase F loads bundled and local JSONC packs only. Project-local packs can be committed
alongside configuration. Remote fetching, package registries, and automatic updates are
outside Phase F. Local path resolution, pack identity, and schema compatibility are
defined below. The user explicitly requested no scope expansion.

Delegated decisions for Q22–Q24:

- Packs declare stable IDs and exact version strings; rules have IDs within a pack.
  Configuration uses qualified `pack-id/rule-id` references. Duplicate pack/rule
  identities are errors, not last-loaded-wins overrides. Load at most one version of
  a pack in one effective configuration.
- Explicitly loading a local pack enables its rules by default. A pack or individual
  rule can be disabled. A disabled pack remains disabled even if one rule has an
  enabled override. The bundled `noul` pack is enabled by default after consent.
- Custom rules select files through repository-relative include/exclude patterns,
  always within global file eligibility. They cannot re-include globally excluded
  files. Built-in applicability checks remain in effect for bundled Noul rules.
- Rule-pack relative paths resolve against the configuration file that introduced
  the reference. Project pack paths must remain inside the project working tree;
  user pack paths may reference user-managed local files. Paths used to match source
  files always resolve against the repository root, not the rule-pack directory.
- Packs are keyed by ID in configuration. Omitted entries inherit; entries merge
  their fields, including an explicit `enabled` override. A reference's originating
  file remains its path-resolution base when inherited. Changing the file for an
  already-bound pack ID is a configuration error; choose a different ID for a fork.
- Config, pack, and receipt schemas have integer schema version 1. A pack's content
  version is distinct from its schema version. Unknown schema versions, fields, pack
  IDs in overrides, or rule IDs in overrides are errors before source egress.
- Configuration overrides rule activation, file selection, threshold, and message.
  Questions and binary criteria belong to pack definitions; changing their meaning
  requires editing/versioning the local pack, not an opaque project override.
- Rule IDs inside the bundled pack retain their existing names. Qualifying IDs at
  the configuration boundary must not silently invalidate existing version-1 process
  clients; implementation must provide an explicit contract migration if emitted
  assessment/advice keys change.

### Advice text

Rule authors supply default advice text in rule packs; project configuration may
override that text. Jev supplies probabilities. Local policy chooses whether to report
the rule's message and attaches the path, probability, and reviewed snapshot identity.
The host adapter formats the resulting advice for delivery. No separate model call
generates the advice text.

### Configuration format

Use JSONC (JSON with comments) for project settings and user defaults, with schema
validation and editor completion. Phase F has one project configuration at the root of
each Git working tree. Monorepos can apply rules by path within that file. Nested
configuration and directory-level inheritance are outside Phase F. File names, user
configuration location, and behavior outside Git repositories remain open.

### Enable and disable flow

An explicit enable command identifies the repository, review backend, destination, and
source-egress scope, obtains user consent, and remembers it. A disable command revokes
that approval. Hooks never prompt interactively. Missing consent causes review to be
skipped with a diagnostic directing the user to the enable command, subject to the
notification policy below. Exact command names remain open.

### Invalid configuration

An invalid configuration stops review for that invocation. Preserve the completed host
edit, send no source, and report the configuration error with the offending file and field.
Do not silently substitute defaults or execute only a valid portion of an invalid policy.

### Credentials

Configuration contains an environment-variable reference, not the credential value.
Jev defaults to `TYPESAFE_API_KEY`. The environment supplies the secret. Inspection
commands report whether the referenced variable is present and never print its value.
Do not store credential values in JSONC. Automatic environment-file loading is not an
accepted requirement.

### Runtime limits

Expose the existing runtime limits as configurable values with these defaults:

- Per-file review deadline: 1,000 ms, including retries.
- Concurrent file reviews: four.
- Advice items per edit: five.
- Transient retries: at most two beyond the initial attempt.

Keep the retry-backoff algorithm fixed rather than configurable. Preserve advisory
behavior: exceeding a deadline or exhausting retries produces review unavailability,
not rejection or reversal of the completed host edit. Exact numeric validation bounds
and the relationship to any user cost limits remain to be specified.

### Operational notifications

Missing repository consent, backend outages, credential failures, and configuration
errors must be visible to the user through a shared diagnostic mechanism. Agent context
alone is insufficient to establish that the user saw the warning.

Notify once per session for each distinct problem, again when the problem changes, and
once on recovery. Each affected review still retains an explicit skipped/unavailable
outcome independently of notification suppression. Define problem identity, session
boundaries, and recovery evidence before implementation. User-visible delivery through
the host remains an evidence question; no runtime visibility claim is made yet.

Delivery candidate: Codex's `systemMessage` output for user-facing diagnostics and
`hookSpecificOutput.additionalContext` for agent-facing review context. Official
[hook documentation](https://developers.openai.com/codex/hooks#common-output-fields),
read 2026-09-19, documents `systemMessage` as a UI/event-stream warning supported by
`PostToolUse` (DOC / DOCUMENTED). Verify the pinned CLI's rendering and delivery with a
runtime acceptance test; the existing advice-delivery probe does not prove this channel.
The documented channel renders warnings, so neutral recovery wording must be checked
for usability as well. No blocking decision or failed edit is introduced.

Pinned source inspection adds an important mode limitation (SRC / SOURCE-INSPECTED):
the interactive TUI renders Warning entries and retains them on successful hook
completion; headless human output prints hook status without the message entries, and
headless JSON output drops hook start/completion events. Thus `systemMessage` alone
cannot guarantee headless user visibility. No runtime verification was performed in
this investigation.

Accepted headless baseline: provide a status command with human-readable and JSON output;
defer wrappers or additional automatic host delivery mechanisms. The user additionally
requires a way to determine whether a particular headless run performed reviews. This is
an execution-observation requirement distinct from interactive warning delivery and from
checking whether the current configuration is valid.

Accepted: maintain a small local receipt per host session with observed
edit-event and reviewed/skipped/unavailable counts, times, and bounded diagnostic codes.
Read it through the status command for an explicit session ID. No source text, paid
assessments, advice text, credentials, or source-bearing provider errors are retained.
Absence of a receipt means no review activity was observed, not successful review.
An observed start without a recorded completion must be shown as incomplete, not success.
All-skipped activity must report its reason categories rather than appearing as successful
backend review. The status command reads local evidence; it does not make a paid test call.
Reviewed counts demonstrate completed review operations; they do not prove every host
edit was intercepted or that the overall Codex run succeeded. Exact fields, retention,
session correlation, and write-failure behavior remain open.

Source provenance: Codex `rust-v0.155.1` annotated tag object
`4e21628f9ec9ee656650cd2b62ef92225725b5ac` resolves to commit
`be2951ea34f0d295ed0becf97079f92fa5f6950e`.

- [PostToolUse parser](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/events/post_tool_use.rs#L194)
- [TUI warning rendering](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/tui/src/history_cell/hook_cell.rs#L270)
- [Headless human output](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/exec/src/event_processor_with_human_output.rs#L277)
- [Headless JSON output](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L467)

PostToolUse includes `session_id`, suitable for product-managed notification suppression
alongside repository/backend/problem identity. Session-resume semantics remain unverified.
The product must omit repeated messages itself; `suppressOutput: true` is unsupported for
this event. A successful hook's stderr is not a substitute for user-visible notifications.

## Consent granularity — accepted

Phase F remembers repository-wide grants for each repository + review backend/destination
in user-owned state. Previously approved combinations reuse their stored approval.
Here, backend is the review service receiving source, not the agent host's model provider.
Approval covers the repository's eligible files, subject to configured privacy exclusions;
changing project file selection within that scope does not itself require fresh approval.

Directory-specific consent is deferred to
[issue #2](https://github.com/dearlordylord/jevs/issues/2). It is not required for Phase F.
This choice prioritizes simple configuration and avoids repeated prompts while preserving
repository opt-in and separately remembered backend approvals. Exact repository and
destination identities and storage format remain to be specified.

### Bounded research result — advisory rationale

Investigated on 2026-09-19 whether an existing minimal structure maps review backend,
repository/source scope, and remembered consent without a policy engine or repeated
prompts. The baseline is a simple repository-scoped backend-to-approval map. Relevant
scenarios are initial opt-in, switching backends, and expanding reviewed paths.

| Candidate and intended use | Source / verification | Classification |
|---|---|---|
| W3C Permissions permission-store entries: descriptor, scope key, state; replacement and removal | DOC / DOCUMENTED | BORROW the record structure |
| Deno directory-scoped filesystem and host-scoped network permissions | DOC / DOCUMENTED | BORROW resource scoping; REJECT independent allowlists as a complete source-to-destination mapping |
| Cedar principal/action/resource/context authorization | DOC / DOCUMENTED | REJECT a policy-engine dependency for this bounded task |

Primary sources:

- https://www.w3.org/TR/permissions/#permission-store
- https://docs.deno.com/runtime/fundamentals/security/
- https://docs.cedarpolicy.com/auth/authorization.html

The proposed adaptation is a user-owned grant containing repository identity, review
backend, destination, and either repository-wide source scope or allowed directories.
These proposed product semantics are an inference, not behavior provided by those sources.
Separate filesystem and network permissions do not capture which source can go to which
backend; the relationship must be part of one grant.

Adopted scope: remember repository/backend/destination grants with repository-wide
approval. Deferred optional directory scopes can use canonical path
containment checked per outgoing file. Arbitrary glob-subset comparison is unnecessary.
An approved directory includes future files underneath it, still subject to exclusions.

The structure is small but does not solve identity, symlink/path matching, endpoint
changes, or consent UX. Defer directory scopes if those requirements create nuisance or
significant implementation work. No dependency, runtime compatibility, or ecosystem
completeness is claimed. The bounded pass stopped after three primary-source examples;
no runtime experiments were performed. This research only informs the pending consent
specification decision recorded above.

## Implementation handoff

The consolidated Phase F task resolves repository identity, configuration sampling,
consent dispatch checkpoints, and test acceptance. It delegates routine field/command
names, storage layout, matcher selection, numeric validation bounds, and retention
details within the agreed behavioral constraints. Statements above recording an item as
open describe its interview status; use the consolidated task for the final handoff.
No further product interview is required for those routine choices.

Related roadmap: PRODUCT-IMPLEMENTATION-PLAN.md, Phase F.

## Required rules test specification

A sturdy suite describing rule combinatorics is an explicit user requirement, not an
optional coverage improvement. The executable contract is specified in
[PRODUCT-RULE-COMBINATORICS-TEST-SPEC.md](./PRODUCT-RULE-COMBINATORICS-TEST-SPEC.md).
Use readable example matrices plus generated property tests for pure composition and
selection logic, deterministic Effect tests for lifecycle/concurrency, and subprocess
tests for observable results. Ordinary tests remain offline.

Accepted Q25: semantic positive/negative source fixtures and isolated/batched rule
evaluations are required alongside deterministic composition tests. Their shared model
is [PRODUCT-RULE-EVALUATION-MODEL.md](./PRODUCT-RULE-EVALUATION-MODEL.md). Backend judgment
quality, configuration correctness, and observed transport availability are evaluated
separately. Live experiments remain explicit milestones; no live run is authorized by
this specification work itself. Formal checking with Quint and `quint-connect-ts` is
recorded as later work. One of the final three interview questions has been used; two
remain available if a material scope decision cannot reasonably be resolved by delegation.
