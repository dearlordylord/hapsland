# Issue #94 real-host acceptance plan — 2026-09-24

**Status:** offline installer checks passed; authenticated host acceptance is pending.
This record supplements the [host probes](issue-94-host-probes.md), [host research](issue-94-host-research.md), and [#97 delivery baseline](issue-97-delivery.md). It does not declare either host supported.

## Envelope and evidence rules

The installed binaries report Claude Code `2.1.218` and OpenCode `1.14.44` on Linux aarch64. The only proposed initial modes are Claude headless `-p` with native `Read`/`Edit`/`Write` and OpenCode headless `run` with its v1 `tool.execute.after` plugin. Interactive sessions, `--pure`, shell writes, external writes, existing-file OpenCode `write`, and later versions remain unsupported or untested as specified in the host research and adapter documentation.

Every host test uses a disposable Git repository with the synthetic `OrderCount` type, a separate Hapsland consent state, and `REVIEW_CONTROL_JSON` to make review decisions offline. The host itself uses its normal logged-in provider and default model; it must not use a scripted local provider for acceptance. Hapsland's controlled backend does not contact Jev. Each command runs **one host session**, with a 90-second process ceiling, 2 MB stdout capture ceiling, one direct synthetic edit request, and a 4.4-second inner hook command ceiling. Run at most four scenarios per host in one acceptance pass: eight sessions total, at most eight host calls, and no Jev calls. Stop after a timeout, abnormal auth prompt, or output ceiling. Do not run alongside #95 paired sessions.

Only the JSON summary printed by the scripts may be retained. Native hook input, host JSONL, model text, source text, credentials, and controlled backend response bodies remain in memory or temporary directories that the script removes. A successful Hapsland hook or plugin output is **host submission**. A subsequent model-originated native edit after that submission, with the expected repair on disk, is evidence of **model reaction**. A final model statement alone, a hook return, or a file state caused by the harness is not reaction evidence. The runner's `observed-follow-up-edit` result is a candidate: inspect the in-memory host event sequence before elevating it to a compatibility claim, because two hook calls alone do not identify the second call's tool name. Do not store that sequence.

## Current read-only auth and offline results

At preparation time, `claude auth status --json` reported `loggedIn: false`; `opencode auth list` reported zero credentials. No authenticated host session was launched. Run `node evidence/host-94/validation/auth-preflight.mjs` after the user's logins to repeat these read-only checks without printing or copying credentials. A successful login must be checked under the same profile that will run the host; `--version` alone is insufficient.

Run `node evidence/host-94/validation/installation.mjs claude` and the corresponding `opencode` command from the repository root. Both passed on 2026-09-24; sanitized records are [Claude](../evidence/host-94/validation/claude-installation.json) and [OpenCode](../evidence/host-94/validation/opencode-installation.json). The fixture checks preview, exact version, install, doctor ownership, update, unrelated hook/plugin coexistence, uninstall, and preservation of unrelated configuration. The scripts use separate temporary host homes and never modify the user's host settings. They do not test normal host trust, plugin loading in a model session, source egress consent, or advice visibility.

## Authenticated execution sequence

After logins are confirmed and #95's paired runs are idle, run one scenario at a time. The runner does not print raw host output:

```sh
node evidence/host-94/validation/host-session.mjs claude finding --auth-confirmed
node evidence/host-94/validation/host-session.mjs opencode finding --auth-confirmed
node evidence/host-94/validation/host-session.mjs claude stale --auth-confirmed
node evidence/host-94/validation/host-session.mjs opencode stale --auth-confirmed
node evidence/host-94/validation/host-session.mjs claude timeout --auth-confirmed
node evidence/host-94/validation/host-session.mjs opencode timeout --auth-confirmed
node evidence/host-94/validation/host-session.mjs claude failure --auth-confirmed
node evidence/host-94/validation/host-session.mjs opencode failure --auth-confirmed
```

First confirm `finding`: a native direct edit completed, exactly one initial review was submitted, the model made a later native repair, and the final synthetic file has `string`. Record edit-to-submission from the bridge's hook duration and edit-to-visible-reaction from a host event timeline if the host provides a safe in-memory timestamp. The bridge duration begins after host hook dispatch; it is not full native edit-to-submission latency. If the model repairs without a submission, reaction is unproven. If the host fails to load project hook/plugin, log a host failure rather than attributing it to Hapsland policy.

`stale` deliberately changes the synthetic file externally while the controlled decision is delayed. Its accepted result is a completed original host edit, the external mutation observed, and **zero stale advice submissions**. This is a race probe: if the mutation misses the review window, mark the case inconclusive and rerun within the eight-session ceiling only if another case can be dropped. The external mutation is test machinery, not a supported catch-up path. `timeout` delays the controlled backend by ten seconds and expects the completed edit to survive with no non-actionable model-visible error; the hook must return within its five-second native deadline. `failure` injects a backend-unavailable outcome and expects the same quiet preservation. Capture elapsed time and whether the host itself completed. A nonzero host exit, timeout, or failed edit is a host failure cell, not a clean review outcome.

The `finding` run naturally tests the **no later event** case when the model finishes immediately after the first edit: synchronous output must be available at that edit's feedback point or the pending finding remains undelivered. Do not infer later-turn visibility from this headless session. A restart test remains manual: close a first headless session with pending delayed work, terminate its disposable resident process, then start a fresh session with a new recipient. Require no old advice in the new session. The current one-session runner does not automate that two-session authority check; leave restart **unverified** until a bounded two-session fixture and source-free correlation evidence exist. The same applies to a true host-process crash mid-hook; a controlled backend failure is not a host crash.

## Acceptance ledger

| Check | Claude 2.1.218 | OpenCode 1.14.44 | Pass criterion |
| --- | --- | --- | --- |
| Exact binary and proposed headless mode | Local probe verified | Local probe verified | Pin version and mode in retained record. |
| Installer lifecycle and coexistence | Offline passed | Offline passed | Owned files removed; unrelated config untouched. |
| Normal host provider login | Pending | Pending | Auth available for the profile used by the run. |
| Direct edit and host submission | Scripted-provider probe only | Scripted-provider probe only | Native successful edit and current-result submission. |
| Real model reaction | Pending | Pending | Later native repair attributable to submitted finding. |
| Stale snapshot / recipient | Pending | Pending | No accepted stale finding reaches model context. |
| No later event | Pending | Pending | Record submitted/visible/pending separately. |
| Review timeout / backend unavailable | Pending | Pending | Edit remains; bounded and quiet response. |
| Host failure / restart | Pending | Pending | No stale replay or destructive edit behavior. |
| Native trust / plugin loading | Pending | Pending | Observe normal host behavior separately from Hapsland consent. |

The remaining pending cells block a support declaration. Treat a hook's success, test-only controlled decision, and doctor readiness as separate evidence classes.
