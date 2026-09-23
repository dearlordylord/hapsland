# Direct-event v1 supported production profile

This document describes the product's implemented support boundary. Jev is the external
review backend. The supported adapter profile is **Codex CLI 0.155.1 / Linux arm64 /
headless command hooks / controlled writer**. Node `v24.20.0` and Git `2.39.5` are the
recorded conformance environment, not broader runtime guarantees. The installed package
profile is narrower and exact: Node `v24.20.0`, Linux arm64, Git on `PATH`, and procfs mounted
at `/proc`, and Node `v24.20.0` on macOS arm64 with Git, `/dev/fd`, and the packaged
`openat` capture helper. The macOS controlled installed-package path is tested. The real
Codex-host path is verified on macOS arm64 with Codex CLI 0.156.0 and a controlled offline
backend, including native interactive trust review. This does not establish a real-host run
for Codex CLI 0.155.1 or other platform profiles. Package metadata and `jevs-doctor`
reject undeclared versions and other platform profiles rather than inferring support.

The machine-checked authoritative mapping is
[`conformance/direct-event-v1.json`](../conformance/direct-event-v1.json). Its validator
requires all twelve groups, resolves every check to an existing test title, and rejects
secret- or source-bearing fields in the new evidence records.

## Acceptance matrix

| # | Product or focused external boundary | Exact policy demonstrated | Passing evidence |
| --- | --- | --- | --- |
| 1 | Codex native adapter and delivery-only hook | Successful native Add; Update only by a unique nonempty trimmed added line in the root declaration; 1–16 candidates; command at most 64 KiB; Delete/move/metadata-only and malformed input quiet; Bash collects only | 3 obligations |
| 2 | Git-aware named-path selection | Named paths only; nested `.gitignore`; tracked-file semantics; no info/global excludes; highest include replaces; exclusions accumulate; hard floor before reads; ordinary build/generated/vendor/target names allowed | 3 obligations |
| 3 | Stable capture and containment | Regular nonsymlink in-root files; two agreeing bounded reads; 32 KiB inclusive; UTF-8/BOM accepted; mutation, recreation, malformed UTF-8, NUL, cancellation contained; independent path outcomes | 3 obligations |
| 4 | TypeScript analyzer and `DecisionModel` | `.ts/.tsx/.mts/.cts` applicability; unique interface/type roots; 64 declarations inclusive; exactly 16 referenced names excluding root; finite same-file evidence; imports, merging, schema-only and unresolved shapes unsupported; one request per unit | 3 obligations |
| 5 | Join and reuse identity | Complete partition/path/evidence/rules/contract input; event ID excluded; pending join independent of cache; success-only 8-entry/128 KiB LRU reuse; failure/malformed non-reuse; A→B→A restoration | 3 obligations |
| 6 | Revalidation and publication authority | Relevant root/reference/rule/contract changes stale; unrelated comments/siblings remain current; no whole-file fallback; late/superseded work and uncertain writer attribution do not publish | 3 obligations |
| 7 | Resident dispatch and collection | Prompt lone dispatch; finite cycles; concurrency 2; completion or 50 ms collection; deterministic 5-finding/2 KiB response; overflow retained; expiry at 600,000 ms equality | 4 obligations |
| 8 | Logical capacity and transport | Global 64 items/8 MiB; recipient/root 16 items/2 MiB; accounting through work/cache/outcomes/advice; bounded 256 KiB IPC before decode; explicit rejection and terminal cleanup; no RSS claim | 4 obligations |
| 9 | Operational notices | First capacity/backend failure eligible; same kind/partition suppressed before 60,000 ms and eligible at equality; no timer-only notice; 64 bounded keys; restart reset; no recursive notice or finding displacement | 3 obligations |
| 10 | Singleton lifecycle | 10 s readiness; 1.5 s client deadline; 100 starters/eight processes converge; timeout/disconnect does not cancel accepted work; kill/restart loses memory; old lifetime rejected; cleanup only idle; worktree roots distinct | 4 obligations |
| 11 | Consent boundary | User preview plus matching digest confirmation; fixed repository/backend/destination authority; project config cannot grant; disable/revocation prevents future dispatch and is rechecked immediately before provider use | 3 obligations |
| 12 | Jev request/evidence boundary | One provider-neutral `DecisionModel` request per unit; 15-second deadline; zero automatic retries; source-free live outcome classification; admission is not a provider-call counter | 3 obligations |

All 39 obligations and 93 unique mapped checks pass through product boundaries or narrowly focused external
boundaries. Ordinary `npm test` and `npm run conformance:direct-event` are deterministic
and offline. The live Jev script is separate and explicit.

## Installed package evidence

The locally packed release contains compiled JavaScript entry points for the CLI, parser,
resident, and package doctor. `npm run conformance:package` installs that tarball into a fresh
temporary prefix with production dependencies only and runs from outside the development
checkout. It verifies parser loading, resident launch, consent, one controlled offline backend
submission, advice collection, and actionable missing-command diagnosis. No package acquisition
occurs during hook edits.

The issue-63 fixture additionally uses an isolated real Codex 0.155.1 home and temporary Git
repository. It neither seeds repository trust nor bypasses hook trust, and drives both decisions
through Codex's native interactive flow. The bounded PTY reconstructs Codex's rendered terminal
screen, waits for the repository and hook-review states, and confirms the native selections only
after each state is visible. Two consecutive fresh isolated runs passed during issue acceptance.
The retained second run separately observed one provider submission and one terminal
`completed-findings` resident outcome correlated by source-free native event identity.
`OPENAI_API_KEY` and `TYPESAFE_API_KEY` were absent from the hook environment; no Jev call was
possible. The sanitized record is
[`evidence/package/clean-linux-node-24.20.0-arm64.json`](../evidence/package/clean-linux-node-24.20.0-arm64.json).
It establishes the clean installed-package and real-host seam in the recorded Linux arm64
environment. It does not broaden the adapter, platform, mode, or review-semantics profile.

The macOS runner record is
[`evidence/package/clean-darwin-node-24.20.0-arm64.json`](../evidence/package/clean-darwin-node-24.20.0-arm64.json).
It establishes the clean packaged CLI, parser, descriptor-anchored capture, portable resident,
controlled offline submission, advice-return path, and native Keychain credential lifecycle on
macOS 14 arm64. The Keychain cell includes separate-process persistence, fresh-resident reuse,
production resolver/provider-boundary access, logout dispatch blocking, and a bounded
noninteractive ACL-restricted lookup. The repository had no isolated Codex authentication secret
during validation, so it does not establish real Codex host execution on macOS; that cell remains
unverified rather than inferred from the packaged hook run.

## Supported limits

| Limit | Value |
| --- | --- |
| Native patch command / named candidates | 64 KiB / 1–16 |
| Source capture / declarations / referenced names | 32 KiB per file / 64 / 16 excluding the root |
| Logical capacity | 64 items and 8 MiB global; 16 items and 2 MiB per recipient/root |
| Successful cache | 8 entries and 128 KiB, charged to capacity |
| Backend concurrency | 2 |
| Combined host handoff | 5 findings/notices and 2 KiB |
| Readiness / client request | 10 seconds / 1.5 seconds |
| Jev request / retries | 15 seconds / zero automatic retries |
| Collection / relevance / notice | 50 ms / 600,000 ms (expired at equality) / 60,000 ms per kind/partition |
| IPC | 256 KiB frame, 32 connections |

These are supported profile boundaries, not latency or process-memory service levels.
Configuration may narrow paths and select applicable rules; it cannot broaden host,
platform, extraction, attribution, or safety boundaries.

## Consent and asynchronous delivery

Enablement first previews the canonical Git root, fixed Jev backend/destination, and
repository-wide eligible-source scope. Only confirmation of that exact digest grants
egress. Project configuration cannot grant consent. Disablement and dispatch-time
revocation stop future calls; they do not recall a request already sent. Hooks never
prompt and missing consent or credentials never starts a Jev call.

The Add hook admits work to the resident reviewer and normally returns before evaluation.
A later mapped hook may collect current advice. Exclusions, unsupported operations, no
analyzer, parser containment, and clear evaluations are quiet. Capacity rejection or Jev
unavailability may produce a bounded rate-limited operational notice. Excess current
findings remain for a later reply. A host write is **attempted/unacknowledged**; it is not
proof that the model saw the text. Actual reviewer restart, process kill, or accepted idle
cleanup loses in-memory work, successful reuse, notices, and pending advice. There is no
guaranteed final drain or durable replay.

The external stages are kept separate:

1. **Hook entry:** Codex invoked the configured `PostToolUse` command.
2. **Adaptation:** the production adapter accepted the bounded native event and identity.
3. **Backend submission:** the resident invoked the controlled or live `DecisionModel`.
4. **Host submission:** the product wrote a bounded hook response; this remains
   attempted/unacknowledged.
5. **Model visibility:** only an independent host observation for that run, never inferred
   from response writing.

The corrected fresh pinned run observed all five for one Add with a controlled backend;
model visibility required exact repetition of a randomized hook-only value absent from the
prompt. That single observation does not establish reliable model visibility. Update and multi-file support
is separately grounded in native `0.155.1` payload captures plus deterministic production
pipeline gates; it was not rerun live in this final Add conformance. Real child-specific
delivery is unvalidated, although child identity preservation and partition isolation are
deterministically checked.

## Bounded live Jev evidence and gaps

Issue #52 made two live-capable executions, both under declarations of one intended
provider call maximum, a 256-byte synthetic fixture bound, the 32 KiB profile ceiling,
15 seconds, and zero retries. The runner did not count at the actual provider boundary,
so exact provider attempts are unknown and admission is not used as a proxy. The first
execution was conservatively inconclusive because reviewed-clear was not yet
distinguishable from incomplete using retained source-free data. The corrected run used
resident completion/cache plus separate pending-finding/pending-notice counters and passed as `completed-clear-no-advice` in
7,424 ms (`5s-to-under-15s`). No raw advice, source, individual probability, provider
usage, credential, or source-bearing backend output was retained.

No evidence here supports interactive/headful Codex, another host, another Codex version,
another platform, reliable model-visible delivery, real child-specific delivery, or a
guaranteed final drain. The historical `vendor/distilled` evidence remains preserved: one
clear live fixture plus the production vertical slice does not yet establish equivalent
replacement fixtures sufficient to satisfy the migration condition.

Checkpoint reconciliation, shell/Stop discovery, repository scanning, filesystem
traversal, delete/move review, schema/cross-file/language-server extraction, arbitrary
hunk mapping, exact writer attribution under invisible overwrites, source-bearing
persistence, durable replay, and otherwise-unaccounted changes are outside this profile.
