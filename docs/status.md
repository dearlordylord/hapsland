# Readiness doctor and session activity

**Purpose:** Explain offline readiness, session activity, optional analytics, and local inspection observations.
**Audience:** End users; contributors maintaining diagnostics and inspection.
**Status:** Active user guidance.
**Authority:** Maintained guidance describing implementation; accepted review contracts remain in their specification owners.
**Expected use:** Diagnose readiness and inspect recorded session work.
**Lifecycle:** Update with status, analytics, inspection, configuration, or retention changes; review when runtime instrumentation or storage behavior changes.

## Source languages

Hapsland reviews TypeScript interfaces, type aliases, and named functions, plus
Rust structs, enums, and type aliases, and Bend `type` datatypes. Rust type
context follows explicit local module bindings whose crate and module roles
are verified from Cargo metadata and `mod` declarations. External crates,
re-exports, inline modules, functions, macros, and conditional compilation are
unsupported. Bend supports transitive context through explicit relative
`.bend` imports with aliases. Bend functions, dependent types, laws/proofs, and
hub, bare, or absolute imports are unsupported; this profile also skips files
with string literals and requires single-line constructors indented with two spaces.
See the [language table](../README.md#languages-and-limits) for file
extensions and limitations. A file can still be skipped when its
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
parser and resident entry point, Codex lifecycle-hook capability, selected configuration, the owned
feature/hook record, duplicates and local drift, resident reachability, credential
presence in the doctor process, and effective file settings for the canonical repository. The doctor
names that inspected context; actual-hook and saved-credential accessibility remain
`unknown` until an independent, nonprompting probe verifies them. It
does not prompt, repair configuration, launch the resident, read source, or call Jev.
Host trust and saved-credential accessibility are `unknown` when no time-limited,
nonprompting query exists. Every non-ready stage includes one action in `nextSteps`.

The production hooks and resident record immutable, source-free activity
markers for each observed event. Session, child, repository, event, and semantic unit
identities are hashed before persistence. At most 256 events and 72 current semantic
markers per event are retained per session. Markers contain only stage,
timestamps, resident lifetime, counts, and hashed identities; they never contain
source, paths, credentials, advice, probabilities, or provider responses.
<!-- activity-retention:start -->

The shared activity store (including optional analytics) expires sessions after 30 days without a write and evicts the oldest sessions to stay within 20 MiB of allocated file and session-directory storage.

<!-- activity-retention:end -->

Cleanup runs on activity writes and status reads; it does
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
response instructions, and a synthetic finding. From a built source checkout with
workspace dependencies installed, use Node 24.20.0:

```sh
mise exec node@24.20.0 -- node --experimental-strip-types packages/cli-entry/src/cli.ts --feedback-preview
```

This command does not read stdin or project
source, resolve credentials, call a review backend, or persist activity. It is a
format preview, not a replay of your session or a positive review result.

The text is owned by [one runtime-neutral formatter](../packages/delivery-output/src/feedback/message.ts).
It names Hapsland, lists the file, declaration, and configured message for each
finding, and asks the agent to check the findings, fix valid issues and verify,
or explain disagreement. Rule IDs and classification probabilities remain
internal review metadata; they are not included in the agent-facing text. Notice-only messages do not request a repair.
Claude and Codex use this same text; their hook envelopes and optional blocking
authority differ. Operational notices remain distinct from rule findings.

For actual feedback, inspect the agent runtime's session transcript. Status
intentionally does not retain advice text. Submission records cannot prove
that the agent read, acknowledged, or applied a finding.

Virtual-round inspection associates admitted work with an opaque round ID and
pinned physical working root. Native receipts remain under each positively
discovered edited root, including `skipped-other-root` outcomes. Each root's
recording consent applies independently; a routing skip does not fabricate a
receipt under the pinned root. Skipped target paths are metadata and other-root
source is not captured. This preserves the bounded
[#246 contract](advicing-target-contract.md#advicee-identity-and-admission);
[complete multi-root review remains research #247](https://github.com/dearlordylord/hapsland/issues/247).

## Opt-in local inspection

Function preparation distinguishes edited overload groups (`function-overload`),
unsupported callable forms (`unsupported-callable`), unavailable extraction
(`function-analysis-unavailable`) and files with no supported function roots
(`no-supported-function-root`). These are preparation observations, not classifier
findings or clear results. The [callable profile](type-function-review-proposal.md#named-typescript-callables-254)
defines supported const-arrow and Effect forms and the retained limits.


| Use | Command | Page source |
| --- | --- | --- |
| Development | `npm run dev:inspection` from the repository root | Current checkout, with automatic browser reload |
| Bundled production | `hapsland dashboard` | Installed package; source edits require a new package update |

<!-- rule-check-dashboard:start -->

For **“Does my rule work?”**, use this debug dashboard to compare the declaration and related context captured for an ordinary agent edit with its classifier outcome and feedback. The opt-in setting is `sessionInspection`, not an analytics setting. Enable it as shown below before making the edit. For an immediate check without an agent edit, run `hapsland rules check --path FILE --line N` (and optionally `--id RULE`); see [file/line rule checks](configuration.md#try-a-rule-on-a-file-and-line). That command returns its own results and does not append them to this journal.

<!-- rule-check-dashboard:end -->

<!-- inspection-recording:start -->

**Both dashboards need recorded history.** Recording is disabled by default.
Merge this [generated configuration template](examples/session-inspection.jsonc) into the repository-root `.hapsland.jsonc`, preserving existing rules and scope:

```jsonc
{
  "version": 1,
  "sessionInspection": true
}
```

Then make a new edit through an installed Hapsland integration. The setting applies on the next edit; enabling it does not backfill earlier edits. A fresh journal stays empty until new events are recorded. Opening either dashboard does not enable recording. Existing retained history can still be shown after recording is disabled. This history contains captured source and review messages; source-free analytics does not enable it.
A user default can also enable recording, but an explicit project `sessionInspection: false` overrides it.

<!-- inspection-recording:end -->

`hapsland dashboard` runs the private loopback inspector in the foreground and
prints its launch URL. It does not enable recording or start a resident. Enable
recording through [configuration](configuration.md) to record new work;
recording continues independently of the dashboard process. Source-bearing
inspection history is separate from the source-free status and analytics below.

From a checkout, `npm run dev:inspection` runs the same private, read-only
inspector directly from source and prints its URL. Edits to
[`packages/administration/src/inspection/page.ts`](../packages/administration/src/inspection/page.ts) automatically reload the
visible browser page while keeping the server and capability URL alive. A page
syntax error returns HTTP 503 until the source is fixed; the browser then reloads
the repaired page. Server-side changes require restarting the command. Use
`npm run dev:inspection -- --port=4318` to choose a port. This workflow uses the
existing local journal and does not rebuild a package, invoke Tree-sitter,
update installed hooks, or start a resident.

Run `npm --prefix packages/agent-flow-viz run test:inspection-dev-browser` to
check automatic reload, a stable private URL, syntax-error recovery, and HTTP
route protection against the real page source.

The **To agent** view renders the general message saved by Hapsland
before the final socket handoff, with its intended recipient and original
finding/evaluation membership. Hooks and native extensions do not serialize
inspection output or send inspection writer reports. Capture-aged consent,
retention, and quota limits still apply.

<!-- inspection-message-limit:start -->

Messages exceeding 16 KiB UTF-8 are explicitly marked oversized.

<!-- inspection-message-limit:end -->

This records preparation, not native output,
agent receipt, model visibility, or repair. **Finding state changes** hides
repeated observations of the same finding state.

The header's recording indicator reflects current observations from reachable
residents. Unreachable residents have unknown recording state. Configuration
changes apply on the next edit; enabled capture does not guarantee that every
event was retained.

Filters are always visible. The default list shows edits with directly correlated,
retained transport-invocation facts, including failed attempts and attempts whose
payload bytes are unavailable. Model input alone does not establish a request
attempt. The existing filter reveals excluded, reused and other observations
without retained request evidence, with a count in each hidden span. Missing
retained evidence does not establish that no request occurred. Clear filters
restores that default.
Valid native candidates within the supported event bounds retain their original
position, operation and root-local path, plus any supplied move destination.
Known selection exclusions are recorded before source capture, with closed codes
and typed arguments. Unsupported `.mjs` candidates therefore remain visible in
the show-all view without capturing their source or invoking a classifier.
Unavailable policy or capture remains distinct from a known exclusion. Recording
is bounded and best effort; malformed events and undiscovered roots can remain
unobserved, and absent admission evidence remains unknown.

Finding counts distinguish returned findings from a completed clear review;
pending or failed reviews are not presented as zero findings. Debug contains
finding status changes labelled with their rule and declaration, plus raw events.

For edits with multiple classifier invocations, choose the captured request by
review unit and request identity. The JSON view uses that immutable selection. Original-evaluation links select the matching captured
request; missing transport evidence is explicit and is not replaced by another
unit's body.

Retained classifier totals follow the visible edit filters. Observed model
invocations and HTTP attempts are counted separately, with live, controlled and
unknown activity kept distinct. Joins, cache hits and existing advice add no new
calls. Replayed source/sequence identities count once; missing capture or history
can leave these totals incomplete.

Resumed live feeds send retained increments after each source's saved position.
The inspector merges these by immutable source/sequence identity and removes rows
no longer present in the retained view. A reset supplies a fresh snapshot.

Retained records may expire or be evicted by the journal quota. Missing records
are not evidence of a successful or inactive review. Payload reads return an
explicit missing result; the dashboard removes edits no longer retained while
keeping the selected edit open across ordinary live updates.

## Session status

For ordinary post-setup verification, use the [opt-in inspection dashboard](#opt-in-local-inspection): enable recording, make a new supported agent edit, run `hapsland dashboard`, and open the printed URL. It discovers retained sessions without requiring a raw session ID. Recording contains source; it is separate from the source-free status API below.

The advanced `--status` API requires the original runtime session ID. Claude and Codex adapters use the native hook payload's `session_id`; Pi uses `ctx.sessionManager.getSessionId()` in its extension context. These are runtime integration inputs, not the hashed session identifiers shown in Hapsland storage. Hapsland currently has no status session-list command. If you do not already have that raw ID from your runtime integration, use the dashboard instead of guessing it.

When you have the raw ID, save this request as `status-request.json`, replacing both placeholders. `cwd` must name the Git working copy whose activity you want:

```json
{
  "version": 1,
  "operation": "status",
  "cwd": "/absolute/path/to/repository",
  "sessionId": "<original-runtime-session-id>"
}
```

Then run:

```sh
hapsland --status < status-request.json
hapsland --status-human < status-request.json
```

Use the printed candidate executable path instead of `hapsland` for a local snapshot that is not on PATH. Status reads do not call a review backend. The response reports readiness and resident activity separately. Missing instrumentation is `no-observation`, never successful review; corrupt or unreadable activity state is reported as a limitation. Submission evidence does not establish model visibility or repair.

## Optional session analytics

<!-- analytics-recording:start -->

Analytics recording is **disabled by default**. Merge this field into the repository-root configuration, preserving existing settings:

```jsonc
{
  "version": 1,
  "sessionAnalytics": true
}
```

Project configuration overrides the user default in either direction. Set `sessionAnalytics: false` in a project to stop future recording there; omission inherits the user default. User defaults follow the [configuration lookup](configuration.md).

<!-- analytics-recording:end -->

Existing recorded
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
resident restarts while their session remains in storage. The shared activity retention limits above apply even when analytics is disabled.

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

Details contain timestamps, outcome kinds, finding counts, rule IDs with length limits, and hashed
event/child identities. They never include source, file paths, advice text, probabilities,
credentials, or provider responses. At most 64 rule IDs of 128 characters each are kept
per detail; IDs outside the safe printable identifier subset are omitted, and
`ruleIdsTruncated` reports omissions. These records show which rules fired, not their
full finding text or whether the agent acted. Use the native session transcript for that
additional evidence. The storage root can be relocated with `REVIEW_ACTIVITY_PATH`.

Activity is stored under `$XDG_STATE_HOME/hapsland/activity`, normally
`~/.local/state/hapsland/activity`. XDG bases must be absolute; absent, empty or
relative bases use their standard defaults. The explicit `REVIEW_ACTIVITY_PATH`
overrides that location.
