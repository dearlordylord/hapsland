# #136 native review and repair evidence

**Status: incomplete (2026-09-28).** This selected native validation does not
establish that Claude Code received Hapsland advice and repaired because of it.
Issue: [#136](https://github.com/dearlordylord/hapsland/issues/136). The
[pre-execution plan](issue-136-native-run-plan.md) declares every run and
request ceiling. The source-free records are under
[`evidence/native-136`](../evidence/native-136/).

| Runtime and selected sessions | Jev requests observed | Result |
| --- | ---: | --- |
| Codex CLI 0.157.1, one session | 2 | A real finding was submitted by a native hook; a later edit changed the source after that submission. A second Jev HTTP 200 and no later finding were observed. The runner did not capture an explicit `clear` ticket status for that second review. |
| Claude Code 2.1.281, three sessions | 5 | One run saw a resident finding and later clear but no submitted advice; another received Jev HTTP 503 and recorded unavailable; the Bash collection diagnostic again saw finding and clear without submitted advice. Changes after an undisclosed finding cannot establish model visibility. |
| Claude Code 2.1.218, two composed-hook sessions | 3 | The first saw finding and clear, but the agent changed the file before Stop, so attribution to advice was unproven. The Stop-focused run's Jev request failed; Hapsland recorded incomplete/unavailable, and no repair was observed. |

The five Claude sessions used **8 Jev requests total**, below the declared
worst-case cumulative ceiling of 40 and the issue's 40-request limit. Each
session had its own eight-request HTTP-boundary cutoff and 240-second host
ceiling; there were no automatic retries. The Codex session used 2 requests
under its six-request cutoff. All repositories and host state were disposable.
Credentials were read into child process environments without printing or
shell-sourcing the primary checkout's ignored `.env` file.

## Observed stages and limits

- Codex: the native `apply_patch` hook attributed the draft edit; Jev returned
  HTTP 200; a later Bash hook submitted a finding; a later `apply_patch`
  changed the file; Jev returned HTTP 200 for follow-up. The repaired code
  compiled and independent invalid-state type checks were rejected. Submission
  plus changed source and the agent's review acknowledgement support a repair
  observation, but the record does not contain an explicit follow-up clear
  contract status.
- Claude: the native Write hook attributed the draft. Selected sessions
  recorded resident `findings` and later `clear` stages, but **no
  `submitted` stage or finding-bearing hook output**. A changed file therefore
  cannot be credited to Hapsland advice. The Jev HTTP 503 and later request
  failure were recorded as unavailable/incomplete, never as clear. The 2.1.218
  sessions used the installer's PreToolUse, direct edit, asynchronous
  background, UserPromptSubmit, and Stop hook arrangement; the earlier 2.1.281
  runs were direct-hook diagnostics, not an installed-profile claim.
- The resident server and terminal-collection fake-effect tests passed:
  **91/91**. They remain the callback-race gate. These selected native sessions
  do not establish race completeness or population reliability.

Raw agent streams, hook input/output, credentials, source-bearing Jev
responses, and temporary homes were discarded. Evidence retains only event
kinds, relative timing, request/status counts, fixed synthetic source hashes
and byte counts, contract stages, and outcome flags. A hook write or
acknowledgement alone is not treated as proof the model saw advice.

## Remaining gate

Keep #136 and #116 open. Diagnose why the supported Claude composed path did
not submit a completed finding before supersession or Stop closure, using
deterministic effects first. A future separately declared native run must
directly observe Claude advice submission, subsequent model repair, and an
explicit follow-up clear or further finding. Capture an explicit Codex
follow-up ticket outcome as well. #137's final authority validation and
crosswalk-retirement decision follow only after that evidence is assembled.
