# Session status and receipts

The review integration records a small local receipt for a host session when the
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
presence) separate from `activity` (the local receipt). Activity is classified as
`no-observation`, `all-skipped`, `clean-reviewed`, `reviewed`, `unavailable`, `mixed`,
or `incomplete`. A missing receipt is `no-observation`, never successful review. An
observed start without a completion is `incomplete`; all-skipped activity reports its
category counts. Receipt/status reads do not make a paid request.

For a human-readable response, pass `"format": "human"` in the same operation or use
the `--status-human` flag. Corrupt, unreadable, or unwritable state is reported as a
`limited` activity/limitation rather than being presented as healthy review. Routine
review output remains advisory and continues when receipt persistence is unavailable;
the limitation means only that local observation could not be recorded.
