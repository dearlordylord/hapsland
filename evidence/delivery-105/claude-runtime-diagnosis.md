# Claude runtime failure diagnosis

This follow-up made two bounded minimal invocations of pinned Claude Code
2.1.218 on Linux, with no fixture source or custom Hapsland hooks installed.
Both exited 1 with a structured `is_error: true` result and empty stderr.

1. With user settings enabled, the 63-character result matched the words
   `limit` and `reset`. It did not match the diagnostic's authentication,
   network, permission, model or server-error categories.
2. With user, project and local settings all excluded, the invocation still
   failed in 1.646 seconds. Its result reported a reset clock of `3:50am`.
   The exact `you've hit your limit` pattern did not match.

This establishes that the failure reproduces independently of the Hapsland
probe configuration. The available evidence supports a native runtime error
with limit/reset information; it does **not** establish the quota class,
account condition, reset timezone, guaranteed recovery time, or deeper cause.
Raw responses and credentials are not retained.

No concrete fix was established within the harness/environment scope. No
production code or credentials were changed, and zero targeted product retries
were attempted. Claude completion during a native tool call and concurrent
background routing therefore remain unproven. Earlier successful Claude
background repair and collector-contention observations remain separate.

Evidence: `linux-claude-runtime-diagnostic.json`.
Reproduce the settings-excluded control with:

```sh
node evidence/delivery-105/diagnose-claude-runtime-linux.mjs
```

The diagnostic has a 15-second ceiling and retains only structured status,
fixed-pattern matches and the runtime's clock text. A later successful minimal
invocation would justify spending the two authorized targeted retries on the
missing product cases; the reported clock alone is insufficient evidence of
recovery.

## Later control

After the user reported reset, the settings-excluded control succeeded
(exit 0, `is_error: false`, 3.818 seconds). See `claude-reset-rerun-linux.md`
for the bounded product reruns and remaining gap. This later observation
does not establish the earlier error’s account or quota cause.
