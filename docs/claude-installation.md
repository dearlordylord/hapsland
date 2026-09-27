# Claude Code installation lifecycle

Use the versioned install, update, and uninstall operations below for the composed
candidate targeting Claude Code `2.1.218`. Preview the owned settings changes and
apply the returned digest. Repository consent and Claude Code's native trust remain
separate setup steps.

This is a candidate installation guide. Its exact-profile trials and support limits
are recorded in [Claude host evidence](../evidence/host-94/decision-and-evidence.md) and the
[Linux evidence index](../evidence/advicing-linux/README.md). The
[installed release declaration](installed-release-compatibility.md) does not include
this Claude candidate.

The versioned JSON operations use `host: "claude"`, `claudeHome` (default `~/.claude`), and optionally `claudeExecutable` (default `claude`). Preview is read-only and returns `proposal.digest`. Apply that digest to install or update. The first uninstall call is also a preview; pass its digest to remove the owned entry.

```sh
printf '%s\n' '{"version":1,"operation":"install-preview","host":"claude"}' | hapsland --install-preview
printf '%s\n' '{"version":1,"operation":"install","host":"claude","proposalDigest":"<digest>"}' | hapsland --install
printf '%s\n' '{"version":1,"operation":"update-preview","host":"claude"}' | hapsland --update-preview
printf '%s\n' '{"version":1,"operation":"update","host":"claude","proposalDigest":"<digest>"}' | hapsland --update
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude"}' | hapsland --uninstall
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude","proposalDigest":"<digest>"}' | hapsland --uninstall
```

The installer checks the selected executable's exact host version, Node `v24.20.0`, and the packaged CLI entrypoint. The composed candidate inserts a marked `PostToolUse` `Edit|Write` group with synchronous edit admission and an async background collector, plus owned `PreToolUse`, `Stop`, `SubagentStop`, and `UserPromptSubmit` groups, into `settings.json`. It records their fingerprints under `~/.claude/.realtime-review-tool/`. Existing settings and unrelated hooks remain in order. A missing, duplicated, or modified owned entry is a conflict, so removal cannot delete somebody else's hook. A digest mismatch requires a fresh preview.

The edit and Stop hooks have five-second host timeouts; the prompt marker has four seconds and the async background collector has 25 seconds, with shorter internal budgets. The preview discloses the command and timeout. Claude Code owns workspace trust and native hook approval. Hapsland's separate repository consent is required before source can be sent to Jev. The installer changes neither trust nor repository consent. `doctor` is read-only and reports native trust and repository egress consent as separate states. Headless Claude Code trust behavior can differ from interactive use, so do not treat a headless run as consent or native trust evidence.
