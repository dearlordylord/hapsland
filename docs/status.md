# Readiness doctor and session activity

## Supported source languages

Hapsland reviews TypeScript interfaces, type aliases, and named functions, plus
Rust structs, enums, and type aliases, and Bend `type` datatypes. Rust
context is limited to the same file. Bend supports bounded transitive context
through explicit relative `.bend` imports with aliases. Rust functions, modules, macros, and
conditional compilation are unsupported. Bend functions, dependent types,
laws/proofs, and hub, bare, or absolute imports are unsupported; this first profile also
skips files with string literals and requires single-line constructors indented
with two spaces.
See the [supported-language table](../README.md#supported-languages) for file
extensions and limitations. An eligible file can still be skipped when its
syntax or supporting evidence is unsupported; a skipped edit is not a clean
review result.

Run the offline, read-only doctor with an explicit repository and selected Codex home:

```json
{
  "version": 1,
  "operation": "doctor",
  "cwd": "/worktree",
  "codexHome": "/home/user/.codex"
}
```

The equivalent command is `hapsland --doctor`. Doctor checks the packaged runtime,
parser and resident entry point, exact Codex version, selected configuration, the owned
feature/hook record, duplicates and local drift, resident reachability, credential
presence in the doctor process, and effective file settings for the canonical repository. The doctor
names that inspected context; actual-hook and saved-credential accessibility remain
`unknown` until an independent, nonprompting probe verifies them. It
does not prompt, repair configuration, launch the resident, read source, or call Jev.
Host trust and saved-credential accessibility are `unknown` when no bounded,
nonprompting query exists. Every non-ready stage includes one action in `nextSteps`.

The production Codex hook and resident record bounded, immutable, source-free activity
markers for each observed event. Session, child, repository, event, and semantic unit
identities are hashed before persistence. At most 256 events and 72 current semantic
markers per event are retained per session. Markers contain only stage,
timestamps, resident lifetime, bounded counts, and hashed identities; they never contain
source, paths, credentials, advice, probabilities, or provider responses.

Resident activity distinguishes `no-observation`, `skipped`, `pending`, `clear`,
`findings`, `submitted`, `unavailable`, `incomplete`, and `restarted/lost`. Pending work
becomes `restarted/lost` when the responsible resident lifetime disappears or changes.
`submitted` means the hook wrote controlled host output; `submission.findings` reports how
many findings that output carried. Submission evidence is separate from evaluation
completion, so newly admitted pending work and work lost across restart remain visible.
Per-unit terminal markers aggregate findings across distinct units while repeated markers
for the same hashed unit remain idempotent. Submission does not prove that the model saw or acted on it.
`modelReaction` remains `unavailable` until separate host evidence
exists. Missing instrumentation and silence are never reported as `clear`.

## Session status

Use an explicit session ID with the status operation:

```json
{
  "version": 1,
  "operation": "status",
  "cwd": "/worktree",
  "sessionId": "host-session-123"
}
```

The JSON response reports readiness and resident activity separately. Missing
instrumentation is `no-observation`, never successful review. Status reads do
not call Jev.

For a human-readable response, pass `"format": "human"` in the same operation or use
the `--status-human` flag. Corrupt or unreadable activity state is reported as a limitation rather than
being presented as healthy review.
