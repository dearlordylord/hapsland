# Issue #94: proposed authenticated Claude follow-up

**Status, 2026-09-24:** The Claude hook integration and explicit repair wording are implemented. The offline exact-binary check passed delivery validation; the earlier authenticated finding session tested the prior wording and observed no repair. The repair-hook acceptance guard is now implemented and its focused offline gates passed. A host run still needs separate approval. This is an acceptance-evidence decision, not a decision whether to implement Claude.

## What the two sessions would answer

Run one all-clear control, then one current-finding case with Claude Code `2.1.218` and Hapsland's new repair advice. The finding case passes only if a classified finding is followed by a distinct model-originated native repair, a successful repair hook, and the expected final file. The loopback fixture already established that the production finding and explicit instruction reach Claude's next provider request; only a normal authenticated model run can establish whether the model performs that repair.

The [offline delivery diagnosis](issue-94-delivery-diagnosis.md) records the exact `2.1.218` loopback result. The [feedback options](issue-94-claude-feedback-options.md) record the implementation state and options.

## Offline preparation and runner gate

The revised advice is compatible with the finding classifier, and the runner can recognize a later native repair only after its matching hook succeeds:

- [`handoff-classification.mjs`](../evidence/host-94/validation/handoff-classification.mjs) classifies the unchanged production `r6_bare_domain_value` finding line. It does not depend on the first-line heading, so the new “Please repair each finding” wording does not invalidate finding classification. Operational notices remain separately classified.
- [`reaction-events.mjs`](../evidence/host-94/validation/reaction-events.mjs) now requires the distinct later Claude `Edit` or `Write` to change the synthetic `OrderCount` value to `string`, followed by a matching repair-hook finish with `ok === true`. The regression rejects failed, missing-status, mismatched, wrong-tool, or premature repair hooks. This closes the identified acceptance gap.
- [`host-session.mjs`](../evidence/host-94/validation/host-session.mjs) pins the default Claude executable to `/home/node/.local/share/claude/versions/2.1.218`, checks its version and authentication, rejects stale/missing compiled CLI or resident artifacts, and records each start in the durable pass ledger.

At the completed Option A checkpoint, the full offline suite reported **483 passed, 2 skipped** and the exact-binary loopback result passed **4/4** delivery arms. The repair-hook guard then passed its focused offline checks: reaction-events **5/5**, host-session **3/3**, and the four targeted integration fixture cases **4/4**. The broader host-session integration run reported **27 passed, 2 skipped, 1 timing failure** at the 4.4-second boundary; the corresponding isolated case passed. This shows timing variability, so do not describe the full integration run as green. The repair-success gate is satisfied by the focused guard regression; the remaining question for an approved finding session is real-model reaction. A two-session outcome is one selected result, not a reaction rate or, by itself, a general Claude support claim.

## Proposed run contract

Run only after separate approval, in this order:

1. **Control:** zero-probability rules. Require exactly one matched model-originated native edit, a successful initial hook, completed `clear`, zero finding/notice/unknown submissions, and no unsolicited repair. If this case fails or is incomplete, stop; do not start the finding session.
2. **Finding:** one matched native edit that produces one current `r6_bare_domain_value` finding. Require a successful initial hook and `completed-findings`, exactly one classified rule-finding submission, zero notices and unknown submissions, then a distinct later model-originated native repair to `string`, a successful matching repair hook, and the expected final file. If any part fails or is incomplete, stop with that result; do not retry.

Both sessions use the exact cached Claude binary at `/home/node/.local/share/claude/versions/2.1.218`, Claude's normal authenticated provider/model, one synthetic native edit request, Hapsland's controlled local backend, one disposable repository and isolated state per session, a **90-second per-session ceiling**, and a **2 MB combined stdout/stderr ceiling**. Make no Jev calls. OpenCode remains postponed.

Before launching either session:

- Verify `--version` reports exactly `2.1.218` from the cached executable. Check `auth status --json` with that same executable and the profile that will run the session; require `loggedIn: true`. Any mismatch stops the pass before launch.
- Run `npm run build` immediately beforehand. The runner must accept the compiled CLI and resident artifacts as fresh.
- Initialize a new, empty durable ledger directory exactly once and set `HAPSLAND_94_PASS_LEDGER` to it. Do not reuse the consumed Stage A ledger, reset a ledger, or retry a failed/incomplete start. Keep the two starts sequential and preserve the source-free ledger entries.

Retain only the source-free control and finding summaries and ledger entries: classified outcome counts, call-match booleans, final synthetic state, relative timings, and ceiling/exit status. Retain no prompts, source, raw host JSONL, model replies, hook payloads, credentials, or provider request bodies.

## Approval decision

**Decision requested:** approve exactly two authenticated sessions now, or defer the follow-up. Approval authorizes one control followed by one finding session, with no retries or additional cases. It does not authorize Jev calls, OpenCode work, Stage B, or a Claude support declaration. If deferred, the implemented Claude integration remains in place and its authenticated repair behavior remains unproven.

## Deferred work

Stage B real-host stale and admission-triggered host-failure cases remain gated: the production admission marker is global and unkeyed, so it cannot attribute acceptance to the exact initiating native call. Add and verify exact-call admission correlation before proposing those host cases. **OpenCode remains postponed.**
