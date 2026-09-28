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
