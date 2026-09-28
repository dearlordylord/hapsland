# #136 bounded native review and repair run plan

Recorded before live execution on 2026-09-28. The purpose is to observe the
current Hapsland resident and checked Bend decisions in real Codex CLI and
Claude Code sessions with Jev credentials, through edit attribution, review
completion, advice submission, an agent repair, and a follow-up result. The
disposable repository contains only a small synthetic TypeScript payment-state
example. The agent instructions explicitly require acting on actionable
Hapsland findings and checking the repaired code.

| Runtime | Planned host path | Jev request ceiling | Automatic retries |
| --- | --- | ---: | ---: |
| Codex CLI | Native PostToolUse edit hook, source-run Hapsland CLI and resident | 8 | 0 |
| Claude Code | Native PostToolUse edit hook, source-run Hapsland CLI and resident | 8 | 0 |

The runner must count requests at the actual Jev HTTP boundary and refuse to
send a ninth request for that runtime. Run each runtime once; a failed or
inconclusive run stays recorded as such and is not silently retried. The host
session has a 240-second wall-clock limit. The source fixture stays below
4 KiB per TypeScript file. A result is a finding, clear, or unavailable only
when observed from Hapsland's checked contract; host output submission alone
does not prove agent visibility or repair.

Record only source-free event kinds, relative timing, status, request counts,
and independently checked outcome flags. Do not retain or print credentials,
raw agent messages, source-bearing Jev responses, raw hook input/output, or
temporary home directories. Keep deterministic fake-effect callback-race tests
as the primary race gate; the native runs are selected host observations, not
a race-exhaustiveness claim. Document version/profile limits and any missing
stage separately for each runtime.

## Declared Claude diagnostic extension, before execution

The first Claude run used only Edit/Write hook opportunities. It observed a
finding and later clear in resident activity but did not record advice
submission before the file changed, so it is retained as incomplete. A second,
separately declared Claude run adds a Bash hook after the initial Write, matching
the successful Codex opportunity. The prompt requires running the fixture's
typecheck before any repair and acting on advice only if delivered. This run
has another eight-request ceiling, no automatic retries, and the same
240-second session ceiling. The cumulative declared Claude limit is 16 Jev
requests, below issue #136's 40-request-per-runtime ceiling. Both outcomes
will appear separately in the evidence; the first will not be overwritten.

## Declared final Claude observation, before execution

The second Claude run encountered an external Jev HTTP 503. It made one Jev
request, produced an unavailable resident outcome, and did not receive advice;
that result remains in the evidence. A final independent native session will
repeat the same Write → Bash collection opportunity once, with an eight-request
cutoff and no automatic retry. This is a new declared observation after the
external failure, not a hidden retry of the second session. The cumulative
Claude ceiling is now 24 requests, still below the issue limit of 40. If Jev
is unavailable again or advice is not observed, #136 remains incomplete.

## Composed Claude path correction, before execution

The third session used the direct edit hook and a Bash hook. The actual
installed Claude integration admits the edit, then uses asynchronous
background collection and a Stop hook for later advice. The third observation
therefore cannot validate that path and remains separately recorded. One
selected run will use the same composed hook arrangement as the installer and
the repository-supported Claude Code 2.1.218 binary. Its eight-request
cutoff brings the cumulative declared Claude ceiling to 32 requests, still
below 40. No automatic retries are enabled. A missing delivery or downstream
repair will remain an incomplete #136 result.

## Stop-focused Claude observation, before execution

The composed-hook run observed the agent repair before its Stop hook, so it
cannot attribute the repair to Hapsland advice. One final selected session
keeps the supported composed hooks but instructs Claude to finish immediately
after the initial Write and to repair only if the Stop response supplies an
actionable finding. This gives Stop the first delivery opportunity before any
repair. It has an eight-request cutoff, no automatic retry, and a 240-second
session ceiling. Across all five Claude sessions the declared worst-case
request ceiling is 40, exactly the issue limit. No further live session is
planned; missing advice or repair leaves #136 incomplete.

## Configured Claude feedback observation, before execution

An older offline native Claude Code 2.1.218 fixture passed with the user
setting `claudeFeedbackMode: block-current-findings`; the prior live runner
omitted that setting. The fixture also used the now-retired repository consent
command, so its consent result does not describe the current #132 boundary.
Current source makes file settings the selection gate and returns `retired` for
the old enable command. One final selected session will use the supported
composed hooks and the explicit user feedback setting. No separate repository
grant will be created. This session has an eight-request Jev cutoff with no
automatic retry. The five prior Claude sessions actually
used eight requests, so the new cumulative actual maximum is 16, below the
issue's 40-request ceiling. This supersedes the prior no-further-session plan
because current code and the fixture identified a concrete feedback-setting difference.
If advice or repair still does not occur, stop live execution and keep #136
incomplete.

## Offline delivery diagnostic before any further Jev run

Use the same supported Claude composed hook arrangement and user feedback
setting with a controlled, source-free reviewer. The synthetic fixture asks for
one bare `OrderCount` type, then requires Claude to stop before any proactive
repair. A controlled r6 finding should be offered through background or Stop;
the subsequent edit and clear must occur after that offer. This diagnostic
makes no Jev request and does not alter the live request count. Retain only
sanitized event, timing, and outcome data. If the host fails to receive this
controlled advice, investigate the adapter/collection path offline before a
new paid run.

## Declared exact-fixture live observation, before execution

The controlled Claude Code 2.1.218 run now demonstrates draft attribution,
finding delivery at Stop, repair by the agent, and a clear follow-up using the
same composed hooks and user feedback setting. The initial diagnostic failed
because its `export` keyword did not match the controlled review fixture; that
failure remains recorded separately. One real Jev session will use the exact
bare `OrderCount` draft and the same Stop-first instruction. It has an
eight-request HTTP-boundary cutoff, no automatic retry, and a 240-second host
ceiling. The six prior live Claude sessions used ten requests, so the
cumulative actual maximum after this run is 18 of the issue's 40 requests.
The live backend may return a different decision; record that result as
observed rather than attributing a repair to undelivered advice.

## Declared second exact-fixture live observation, before execution

The first exact-fixture live session delivered a real finding and the agent
repaired the type. Its second Jev request failed, leaving the follow-up status
unavailable. Preserve that session as a separate record. One new independent
Claude session will use the same count fixture, installed-style composed hooks,
and feedback setting to observe the entire sequence including a checked
follow-up outcome. It has an eight-request HTTP-boundary cutoff, no automatic
retry, and a 240-second host ceiling. Twelve live Claude requests have been
used; this session brings the cumulative actual maximum to 20 of 40. A
failure or missing follow-up remains incomplete.
