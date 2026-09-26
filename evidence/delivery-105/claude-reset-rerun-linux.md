# Claude Linux rerun after runtime recovery

Pinned Claude Code 2.1.218; production candidate
`2b2a70c3eafb6e0b9f8071a1ee317340b3a1989e`; controlled Effect reviewer.
No production code changed. Raw responses, fixture source and credentials
remain outside retained evidence.

The settings-excluded minimal control succeeded in 3.818 seconds with exit 0
and `is_error: false`. The earlier runtime failure is no longer reproduced by
this control; its account/quota cause is still not established.

## Results

| Target | Result |
| --- | --- |
| Two concurrent Claude worktrees, background advice, shared resident | **Passed on attempt 1.** Two distinct native sessions in separate physical Git worktrees each received only its own background finding and own Stop reoffer. Zero foreign finding deliveries, no hook failures, both native exits 0. |
| Actionable review completion inside a native tool window | **Still unproven after three attempts.** All attempts submitted advice and produced a native repair, but no successful run completed the actionable review inside an observed foreground tool call. |

The isolation result establishes hook-output routing. It does not establish
invisible model consumption or simultaneous backend evaluation.

## Retained tool attempts

All use a ten-second controlled review delay.

| Attempt | Observation | Native outcome |
| --- | --- | --- |
| 1 | Finding completed at 19.237 s; background submitted at 19.325 s; repair followed. Claude invoked ToolSearch but no Bash tool. | Exit 0 in 34.676 s. Follow-up did not clear before cleanup. |
| 2 | Finding completed at 17.354 s, before the first Bash call. That call explicitly requested background execution (29.657–30.120 s). The repair's **clear** review completed at 59.020 s inside a later foreground Bash window (54.205–94.536 s). | Nonpassing timeout: SIGTERM initiated at the 100-second ceiling; process/pipe closure returned at 106.201 s. Repair and clear were observed, but this is not a passing native run. |
| 3 | Finding completed at 18.168 s; background submitted at 18.267 s; Stop reoffered at 20.950 s; repair followed. No Bash call occurred. | Exit 0 in 33.186 s. Follow-up did not clear before cleanup. |

Attempt 1 used the existing available tool set and permission flags. Attempt 2
explicitly exposed Bash using `--tools` and requested foreground execution.
Attempt 3 additionally used low effort, requested the initial Write and Bash
in one tool-use message, and set the pinned runtime's
`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` switch. Actual events, rather than
these requests, determine the results above. The attempt limit is exhausted;
no fourth tool attempt was run.

The timeout overrun exposed a probe lifecycle limitation. Future runs now
start a process group and send SIGKILL to that group at the ceiling, closing
its output pipes. The extracted helper passed a deterministic shortened
100-ms `/bin/sleep` check: SIGKILL, timed out, returned in 103 ms. This change
was made after the retained native attempts; those records are unchanged.

## Records

- `linux-claude-reset-control.json`
- `linux-native-isolation-claude-background-worktrees.json`
- `linux-claude-tool-reset-attempt-1.json`
- `linux-claude-tool-reset-attempt-2.json`
- `linux-claude-tool-reset-attempt-3.json`

This follow-up used one minimal control, one isolation pair, and three tool
attempts. Earlier nonpassing evidence remains retained. Other #105 gates,
including Codex child identity support and direct model-request timing, are
outside this follow-up and are not resolved by these results.
