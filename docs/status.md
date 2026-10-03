# Readiness doctor and session activity

**Purpose:** Explain offline readiness, session activity, and optional analytics.
**Status:** Active user guidance.
**Authority:** Maintained guidance describing implementation; accepted review contracts remain in their specification owners.
**Expected use:** Diagnose readiness and inspect recorded session work.
**Lifecycle:** Update with status, analytics, configuration, or retention changes; review when runtime instrumentation or storage behavior changes.

## Supported source languages

Hapsland reviews TypeScript interfaces, type aliases, and named functions, plus
Rust structs, enums, and type aliases, and Bend `type` datatypes. Rust type
context follows explicit local module bindings whose crate and module roles
are verified from Cargo metadata and `mod` declarations. External crates,
re-exports, inline modules, functions, macros, and conditional compilation are
unsupported. Bend supports bounded transitive context through explicit relative
`.bend` imports with aliases. Bend functions, dependent types, laws/proofs, and
hub, bare, or absolute imports are unsupported; this profile also skips files
with string literals and requires single-line constructors indented with two spaces.
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

The production hooks and resident record bounded, immutable, source-free activity
markers for each observed event. Session, child, repository, event, and semantic unit
identities are hashed before persistence. At most 256 events and 72 current semantic
markers per event are retained per session. Markers contain only stage,
timestamps, resident lifetime, bounded counts, and hashed identities; they never contain
source, paths, credentials, advice, probabilities, or provider responses.
The shared activity store (including optional analytics) expires sessions after 30 days
without a write and evicts the oldest sessions to stay within 20 MiB of allocated file
and session-directory storage. Cleanup runs on activity writes and status reads; it does
not run a background timer. Limits are best effort during concurrent writes and filesystem
errors. Expiry and eviction remove whole sessions, including their totals. Unrelated
directories and symlink targets are not followed or deleted.

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

## Preview the message sent to the agent

Run `hapsland --feedback-preview` to display the shared feedback heading,
response instructions, and a synthetic finding. From a source checkout, run
`node src/cli.ts --feedback-preview`. This command does not read stdin or project
source, resolve credentials, call a review backend, or persist activity. It is a
format preview, not a replay of your session or a positive review result.

The text is owned by [one runtime-neutral formatter](../src/feedback/message.ts).
It names Hapsland, lists the file, declaration, and configured message for each
finding, and asks the agent to check the findings, fix valid issues and verify,
or explain disagreement. Rule IDs and classification probabilities remain
internal review metadata; they are not included in the agent-facing text. Notice-only messages do not request a repair.
Claude and Codex use this same text; their hook envelopes and optional blocking
authority differ. Operational notices remain distinct from rule findings.

For actual feedback, inspect the agent runtime's session transcript. Status
intentionally does not retain advice text. Submission records cannot prove
that the agent read, acknowledged, or applied a finding.

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

## Optional session analytics

Analytics recording is **disabled by default**. Enable it in the user configuration
at `~/.config/realtime-review-tool/config.jsonc` (merge this field into an existing
version-one document):

```jsonc
{
  "version": 1,
  "sessionAnalytics": true
}
```

Only user configuration may set this field. Project configuration cannot enable or
disable it. Set it to `false` or remove it to stop future recording. Existing recorded
analytics remain readable until expiry or eviction; enablement never reconstructs earlier
work. Each work item captures the recording setting, which is refreshed before provider
dispatch; already-started work can still finish recording after the setting changes.
Ordinary operational activity markers remain enabled independently.

The same `status` operation above returns an `analytics` object in JSON and a session
summary with recent details in human format. It does not make a Jev request. The current
recording setting is reported separately from historical evidence. Missing evidence is
`no-observation`, not a successful review; corrupt summaries are `unavailable`.

Analytics retain compact totals per session, repository, and resident lifetime, plus
at most 256 recent detail entries per lifetime. The report combines lifetimes, presents
at most 256 details, and reports `detailsDropped`. Totals survive detail pruning and
resident restarts while their session remains in storage. The shared 30-day / 20 MiB
retention above applies even when analytics is disabled.

| Counter | Meaning |
|---|---|
| `requestsStarted` | Canonically authorized calls started at the Jev provider dispatch boundary; not a count of HTTP 200 responses. |
| `requestsSucceeded` | Calls yielding validated evaluations, whether clear or with findings. |
| `requestsFailed` | Backend errors or malformed evaluations; excludes separately counted timeouts and interruptions. |
| `requestsTimedOut`, `requestsInterrupted` | Observed terminal request outcomes. |
| `requestsNeverSent` | Issued permits settled without starting a provider call. |
| `clearReviews`, `reviewsWithFindings`, `findings` | Fresh successful evaluations and their finding count. A clear review does not prove an earlier finding was repaired. |
| `cacheHits`, `joinedReviews` | Successful-cache and pending/existing-advice reuse routes; do not add requests or fresh findings. |
| `skippedCandidates`, `incompleteCandidates` | Candidate preparations yielding no reviewable units, distinguished by completeness. |
| `capacityRejections`, `preparationFailures`, `unavailableReviews` | Observed refused work or failures before a provider result; these are work counters, not disjoint event counts. |
| `discardedWork` | Uncompleted ingress or review jobs discarded by resident cleanup. |
| `submissions`, `submittedFindings` | Finding-bearing host submissions acknowledged back to the resident. Notice-only submissions are excluded. An acknowledgement does not prove model visibility or action. |

`unsettledRequests` is the number of recorded starts without a recorded terminal outcome.
It can represent still-running work, lost work on a crash, or missing persistence evidence;
status does not claim which. `coverage` is `observed-while-enabled`: recording is best
effort, and disabled periods, expired sessions, evicted history, and failed writes cannot
be counted retrospectively. Analytics do not count every native tool call or successful edit.
Controlled test-provider activity is separated in `controlledTotals` and marked
`controlled` in details; it never contributes to Jev totals.

Details contain timestamps, outcome kinds, finding counts, bounded rule IDs, and hashed
event/child identities. They never include source, file paths, advice text, probabilities,
credentials, or provider responses. At most 64 rule IDs of 128 characters each are kept
per detail; IDs outside the safe printable identifier subset are omitted, and
`ruleIdsTruncated` reports omissions. These records show which rules fired, not their
full finding text or whether the agent acted. Use the native session transcript for that
additional evidence. The storage root can be relocated with `REVIEW_ACTIVITY_PATH`.
