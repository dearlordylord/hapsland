# Issue #94: bounded Claude block host trial proposal

**Status, 2026-09-24:** Prepared for review. No authenticated Claude session is authorized by this document or has been run for this trial. OpenCode remains postponed. The previous two-session advisory allocation is exhausted.

## Purpose and exact scope

Test whether Hapsland's user-opted-in production `PostToolUse` block response makes Claude Code `2.1.218` repair one current synthetic Noul finding. A block is feedback after the initial edit; it does not undo the edit. The offline production delivery fixture proves that the envelope reaches a scripted provider loop, but does not prove authenticated model reaction.

The runner uses a temporary Git repository, controlled local review backend, a source-free synthetic `order-count.ts`, and an isolated **user** configuration file with `claudeFeedbackMode: block-current-findings`. That user opt-in is set for **both** the no-finding control and the finding arm. It is never taken from the project layer. Hapsland uses its controlled backend; no Jev request is made. The host uses its ordinary authenticated provider/model profile, verified with the same exact executable's `auth status --json` before the first ledger claim. The exact cached executable is `/home/node/.local/share/claude/versions/2.1.218`, and the runner checks its version. It requires a fresh production build before host/version/auth checks and a newly initialized durable pass ledger.

At most two sessions run sequentially, with control first and finding only after the control passes. Each session has a 90-second wall ceiling and a 2 MB combined stdout/stderr ceiling. The ledger prevents rerunning a consumed or failed stage. Both sessions use native `Edit`/`Write` hook delivery, with a 5-second hook, 4.4-second bridge, and production CLI. The runner retains only source-free counts, booleans, relative times, and status; host JSONL, native payloads, source, hook output, prompts, and profile credentials remain in memory or a deleted temporary fixture. No raw host output is printed or committed.

## Acceptance gates

1. **Control:** Claude makes exactly one attributed native initial edit with `type OrderCount = number` as the complete one-line content. The matching hook succeeds. Hapsland admits and completes a clear review. The host gets no advice, no block, and no operational notice; the final file still has exactly that initial line.
2. **Finding:** Under the same user block mode, Claude makes the same exact initial native edit and its matching hook succeeds. Hapsland admits and completes one current controlled `r6_bare_domain_value` finding. The initial hook submits exactly one classified **top-level** `{ "decision": "block", "reason": "..." }` response containing that rule marker; an advisory `additionalContext` response cannot satisfy this gate. No unknown or unclassified host submission is allowed.
3. **Repair:** After that block submission, a distinct model-originated native edit repairs `number` to `string`, with a successful matching repair hook. The final file is exactly `type OrderCount = string` on one line. A changed final file alone does not pass. Any missing, mismatched, late, timed-out, or unknown event fails the trial and prevents a further session.

The scripted offline tests must pass first, including the negative case where an advisory finding is delivered and a scripted repair occurs: that case must still fail the block gate. The host trial cannot establish stale and failure-path authority by itself, and success would not declare general Claude support without the remaining host validation gates.

## Review and decision

The runner's trial invocation adds `--claude-block-trial` to `host-session.mjs` and `--auth-confirmed`; the ledger path must point to a fresh initialized directory. The offline path uses `--offline-scripted` and never touches host auth. Run commands and sanitized results are to be recorded only after separate user approval of this concrete trial. Approval of the offline implementation does **not** approve authenticated sessions.

If the bounded authenticated block trial fails the repair gate, **scratch the experiment from product code and tests**: do not merge this experiment branch into master, or remove its product implementation and tests if already merged. Keep only sanitized trial evidence and a conclusion that Claude block mode did not demonstrate repair in this trial. Do not retry the failed allocation or run OpenCode under it.
