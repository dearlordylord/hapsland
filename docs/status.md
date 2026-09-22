# Readiness doctor and session activity

Run the offline, read-only doctor with an explicit repository and selected Codex home:

```json
{
  "version": 1,
  "operation": "doctor",
  "cwd": "/worktree",
  "codexHome": "/home/user/.codex"
}
```

The equivalent command is `review-tool --doctor`. Doctor checks the packaged runtime,
parser and resident entry point, exact Codex version, selected configuration, the owned
feature/hook record, duplicates and local drift, resident reachability, credential
presence in the doctor process, and enablement for the canonical repository. The doctor
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

## Legacy receipts

The older whole-file review path records a small local receipt for a host session when the
incoming event supplies `sessionId` (Codex PostToolUse events provide this identity).
The same host session ID is reused when a host resumes, so resumed activity appears in
the same session view. A receipt is evidence of activity observed by the integration;
it is not evidence that every host edit was intercepted or that the host run succeeded.

Receipt state is stored below `REVIEW_RECEIPT_PATH` (or
`REVIEW_RECEIPTS_PATH`), defaulting to
`~/.local/state/realtime-review-tool/receipts`. Each session and event identity is
hashed. Each event has separate atomic start and completion markers, so concurrent
events and duplicate deliveries do not increment a count more than once. The default
retention bound is 256 events per session and 14 days; older markers are pruned. These
values are local implementation limits, not a durable audit-log guarantee.

Receipt markers contain only timestamps, bounded reviewed/skipped/unavailable counts,
bounded outcome category codes, and a bounded finding count. They never contain source,
paths, credentials, advice text, probabilities, provider responses, or provider error
details. A reviewed count means that a review operation completed; it does not claim a
clean result unless the status summary says `clean-reviewed`.

Use an explicit session ID with the status operation:

```json
{
  "version": 1,
  "operation": "status",
  "cwd": "/worktree",
  "sessionId": "host-session-123"
}
```

The JSON response keeps `readiness` (current configuration, consent, and credential
presence) separate from `activity`. `activitySource` identifies `resident-v1` or the
explicitly named `legacy-receipt-v1`; `evidence` exposes both views without claiming the
legacy receipt observes the resident path. Legacy activity is classified as
`no-observation`, `all-skipped`, `clean-reviewed`, `reviewed`, `unavailable`, `mixed`,
or `incomplete`. A missing receipt is `no-observation`, never successful review. An
observed start without a completion is `incomplete`; all-skipped activity reports its
category counts. Receipt/status reads do not make a paid request.

For a human-readable response, pass `"format": "human"` in the same operation or use
the `--status-human` flag. Corrupt, unreadable, or unwritable state is reported as a
`limited` activity/limitation rather than being presented as healthy review. Routine
review output remains advisory and continues when receipt persistence is unavailable;
the limitation means only that local observation could not be recorded.
