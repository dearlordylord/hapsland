# #136 native review and repair evidence

**Status: incomplete (2026-09-28).** A second exact-fixture native Claude
session establishes finding delivery, subsequent agent repair, and a checked
further finding after repair. The Codex session still lacks an explicit
follow-up ticket outcome.
Issue: [#136](https://github.com/dearlordylord/hapsland/issues/136). The
[pre-execution plan](issue-136-native-run-plan.md) declares every run and
request ceiling. The source-free records are under
[`evidence/native-136`](../evidence/native-136/).

| Runtime and selected sessions | Jev requests observed | Result |
| --- | ---: | --- |
| Codex CLI 0.157.1, one session | 2 | A real finding was submitted by a native hook; a later edit changed the source after that submission. A second Jev HTTP 200 and no later finding were observed. The runner did not capture an explicit `clear` ticket status for that second review. |
| Claude Code 2.1.281, three sessions | 5 | One run saw a resident finding and later clear but no submitted advice; another received Jev HTTP 503 and recorded unavailable; the Bash collection diagnostic again saw finding and clear without submitted advice. Changes after an undisclosed finding cannot establish model visibility. |
| Claude Code 2.1.218, three composed-hook sessions | 5 | The first saw finding and clear, but the agent changed the file before Stop, so attribution to advice was unproven. The Stop-focused run's Jev request failed. The session with explicit `block-current-findings` feedback received HTTP 503 on the draft and a later clear after an unprompted edit; an operational notice was submitted, but no actionable finding. |
| Claude Code 2.1.218, controlled offline count session | 0 | After correcting the fixture to match the controlled review snapshot, a real native Stop hook delivered the controlled r6 finding. Claude then changed the type; the follow-up recorded clear, and independent TypeScript checks rejected a raw number. An earlier offline attempt with `export` in the draft failed closed as an unknown snapshot and remains recorded. This validates the delivery path without claiming live Jev behavior. |
| Claude Code 2.1.218, real Jev count session | 2 | Jev HTTP 200 produced a current finding; the native Stop hook blocked and Claude then changed the type. The replacement compiled and independent invalid-assignment check passed. The follow-up Jev request failed and the resident recorded incomplete/unavailable, not clear. |
| Claude Code 2.1.218, second real Jev count session | 2 | Jev HTTP 200 produced a current finding delivered through Stop. Claude edited the type, and independent TypeScript checks rejected raw-number assignment. A second Jev HTTP 200 produced a further resident finding after the edit, satisfying the specified follow-up outcome alternative. This does not claim the rule was cleared. |

The eight live Claude sessions used **14 Jev requests total**, below the issue's
40-request limit. Each
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
  finding-bearing submitted stage or hook output**. A changed file therefore
  cannot be credited to Hapsland advice. The Jev HTTP 503 responses and request
  failure were recorded as unavailable/incomplete, never as clear for those
  reviews. The configured final run submitted a zero-finding operational notice;
  its later clear belongs to a separate review after the file changed. The
  2.1.218 sessions used the installer's PreToolUse, direct edit, asynchronous
  background, UserPromptSubmit, and Stop hook arrangement; the earlier 2.1.281
  runs were direct-hook diagnostics, not an installed-profile claim. The final
  2.1.218 run used the user-level `block-current-findings` setting without a
  separate repository grant, consistent with #132.
- The exact count fixture separates the earlier delivery problem from backend
  availability. The controlled native run saw finding submission, repair, and
  clear. The first live count run saw the finding and repair but its second
  request failed. The second live count run saw the finding and repair followed
  by a further finding. It proves a checked follow-up outcome, not a clean
  outcome; the rule's persistence is outside this native delivery observation.
- The resident server and terminal-collection fake-effect tests passed:
  **91/91**. They remain the callback-race gate. These selected native sessions
  do not establish race completeness or population reliability.

Raw agent streams, hook input/output, credentials, source-bearing Jev
responses, and temporary homes were discarded. Evidence retains only event
kinds, relative timing, request/status counts, fixed synthetic source hashes
and byte counts, contract stages, and outcome flags. A hook write or
acknowledgement alone is not treated as proof the model saw advice.

## Remaining gate

Keep #136 and #116 open. Capture an explicit Codex follow-up ticket outcome;
the earlier Codex record only showed a second HTTP 200 and no later finding.
#137's final authority validation and
crosswalk-retirement decision follow only after that evidence is assembled.
