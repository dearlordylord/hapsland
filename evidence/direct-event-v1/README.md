# Direct-event v1 conformance evidence

This directory retains sanitized release evidence for the initial supported profile:
**Codex CLI 0.155.1 / Linux arm64 / headless command hooks / controlled writer**.
It does not extend support to another host, version, platform, or mode.

- `host-codex-0.155.1-linux-arm64.json` is a fresh isolated host run through the
  production command and resident path with a controlled `DecisionModel`. It records
  hook entry, adapter acceptance, one backend submission, attempted/unacknowledged host
  submission, and separately observed model visibility. The observation is evidence for
  that run, not a reliable-visibility guarantee.
- `live-jev-milestone.json` is the passing final bounded live run. Its declaration was
  emitted before credential lookup or provider-capable execution: one call maximum, one
  synthetic fixture of at most 256 bytes (inside the 32 KiB/file profile), 15-second
  deadline, and zero automatic retries.
- `live-jev-issue-52-execution.json` accounts for both paid calls made while landing this
  ticket. The first emitted no finding, but the initial runner lacked a
  source-free completion observation and therefore classified it inconclusive. The second
  used resident completion/cache counters and established reviewed-clear. Neither record
  contains source, raw advice, probabilities, provider usage, credentials, or raw
  provider responses.

Run `npm run conformance:direct-event` to validate the authoritative twelve-group
manifest and every retained JSON record against the sanitization policy. The host and
live runners use disposable Git repositories and state directories. `conformance:live`
refuses to run without `--execute-paid`; it is paid and must only be run at a separately
declared milestone (`npm run conformance:live -- --execute-paid --write-evidence`).

Update and multi-file support is not claimed from the fresh Add host run. It is supported
by the pinned native payload fixtures under `evidence/codex/0.155.1` plus deterministic
production-pipeline checks named in the host record. Real child-specific delivery remains
unvalidated; only deterministic identity preservation and partition isolation are tested.
