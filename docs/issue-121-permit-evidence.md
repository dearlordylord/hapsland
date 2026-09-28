# #121 permit and round admission evidence

**Purpose:** Record the implementation boundary and validation evidence for #121.
**Status:** Integrated #121 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #121 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #121 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

## Runtime boundary

The resident preserves the native `tool_use_id` string from `PreToolUse` through
`PostToolUse` and the IPC request. It maps `(advicee group, tool_use_id)` to a
positive numeric tool ID only at the canonical boundary. A retry uses the same
mapping. The native monotonic clock supplies start, current, deadline, and
closure times; `Canonical.step` decides whether to issue, consume, release,
expire, or close a permit. Its `Admission.AdmissionState` is part of the same
canonical state as the capacity ledger. The resident retains only the native
identity and deadline lookup needed to correlate callbacks and retire tokens.
Stop continuation and output selection still use the older Round policy until
their later migration slices. They cannot issue or consume edit permits.
Canonical admission supplies the installed pre-edit round and closure fence;
Stop cutoff releases pending permits through canonical transitions before
removing their native correlation entries. A rejected pre-edit IPC response
includes a source-free reason derived from the canonical refusal and the
measured native clock and identity facts.

The installed hook requires the matching pre-edit permit. The non-installed
fixture path creates and consumes a synthetic permit through the same canonical
transition. Callback reordering, duplicate post-edit, wrong advicee, wrong
lifetime, expiry, closure, and the next round have fixed source-free expectations
in `conformance/canonical-permits-v1.json`. The independent runner is
`packages/agent-flow-bend/scripts/check-canonical.mjs`.

Resident tests pass explicit numeric times as a fake monotonic clock, use
temporary Git files as source fixtures, feed controlled offline probability
answers in place of Jev, and submit synthetic host and IPC events. These
exercise pre/post order, retries, child/parent attribution, and duplicate
post-edit callbacks without retaining source in the canonical fixture.

## Child identity assessment

| Source | Class | Verification state | Finding |
| --- | --- | --- | --- |
| [Claude hooks reference](https://code.claude.com/docs/en/hooks) | Host documentation | Project claim, current page checked 2026-09-28 | Child tool hooks carry `agent_id` and `agent_type`; `SubagentStop` carries `agent_id`. |
| [Codex hooks reference](https://learn.chatgpt.com/docs/hooks) | Host documentation | Project claim, current page checked 2026-09-28 | `SubagentStop` carries `agent_id`. The published per-tool schema does not establish whether child tool hooks always carry it. |
| `evidence/host-94/claude-2.1.218-local-probe.json` | Local runtime probe | Observed main-thread Edit/Write only | Main-thread edit callbacks omitted `agent_id`; this is expected and cannot identify a child. |
| Adapter regression cases | Offline simulation | Executed | A missing `agent_id` alongside `agent_type` or `agent_transcript_path` is rejected. Missing `agent_id` on `SubagentStop` is rejected. |

No retained local probe exercised a child edit and its Stop callback on the
supported host versions. An event with `agent_id`, `agent_type`, and
`agent_transcript_path` all absent is indistinguishable from a main-thread event
using the installed payload alone. Hapsland cannot safely attribute such an
event to a child without another host-owned identity signal. The current
adapter therefore rejects identifiable ambiguity and documents the remaining
host contract dependency; it does not infer a child from a shared session ID.
This conservative rule can also suppress a main-thread event from a Claude
session launched with `--agent`, where the host documents `agent_type` without
`agent_id`.

## Review boundary

The resident no longer calls the old direct `bendAdmission*` exports.
They remain in the pinned legacy policy artifact for compatibility with the
other policy functions until that artifact is retired. The structural guard
prevents those calls from returning to product TypeScript. Capacity and permit calls share the same checked canonical
adapter instance in the resident. Source-bearing host callbacks and live Jev
responses are absent from the fixture and this report.
