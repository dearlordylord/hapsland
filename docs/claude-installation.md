# Claude Code installation lifecycle

This adapter targets the exact Claude Code `2.1.218` profile. Installation alone does not establish host compatibility or advice reaction; the #94 real-host run must prove those separately before Hapsland declares Claude Code support.

The versioned JSON operations use `host: "claude"`, `claudeHome` (default `~/.claude`), and optionally `claudeExecutable` (default `claude`). Preview is read-only and returns `proposal.digest`. Apply that digest to install or update. The first uninstall call is also a preview; pass its digest to remove the owned entry.

```sh
printf '%s\n' '{"version":1,"operation":"install-preview","host":"claude"}' | hapsland --install-preview
printf '%s\n' '{"version":1,"operation":"install","host":"claude","proposalDigest":"<digest>"}' | hapsland --install
printf '%s\n' '{"version":1,"operation":"update-preview","host":"claude"}' | hapsland --update-preview
printf '%s\n' '{"version":1,"operation":"update","host":"claude","proposalDigest":"<digest>"}' | hapsland --update
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude"}' | hapsland --uninstall
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude","proposalDigest":"<digest>"}' | hapsland --uninstall
```

The installer checks the selected executable's exact host version, Node `v24.20.0`, and the packaged CLI entrypoint. It inserts one marked `PostToolUse` `Edit|Write` command group into `settings.json` and records its fingerprint under `~/.claude/.realtime-review-tool/`. Existing settings and unrelated hooks remain in order. A missing, duplicated, or modified owned entry is a conflict, so removal cannot delete somebody else's hook. A digest mismatch requires a fresh preview.

The hook has a five-second host timeout; the handler's resident collection bound is shorter. The preview discloses the command and timeout. Claude Code owns workspace trust and native hook approval. Hapsland's separate repository consent is required before source can be sent to Jev. The installer changes neither trust nor repository consent. `doctor` is read-only and reports native trust and repository egress consent as separate states. Headless Claude Code trust behavior can differ from interactive use, so do not treat a headless run as consent or native trust evidence.
