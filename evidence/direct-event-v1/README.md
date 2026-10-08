# Direct-event v1 conformance evidence

**Audience:** Contributors, including coding agents validating runtime behavior; Build and release maintainers; Product and specification owners.

The [acceptance narrative](acceptance-record.md) retains the historical outcome narrative extracted from the support declaration.

This directory retains sanitized release evidence for the initial supported profile:
**Codex CLI 0.155.1 / Linux arm64 / headless command hooks / controlled writer**.
It does not extend support to another host, version, platform, or mode.

- `host-codex-0.155.1-linux-arm64.json` is a fresh isolated host run through the
  installed package command and resident path with a controlled `DecisionModel`. Codex
  invokes the installed hook directly; a separate temporary observer imports no checkout
  code. The record includes the packed artifact digest, installed-hook provenance,
  hook entry, adapter acceptance, one controlled-backend submission,
  attempted/unacknowledged host submission, resident status, and unavailable model-reaction
  instrumentation. The installed product recorded submission, but the independent host
  response did not repeat the fresh hook-only value, so the record remains explicitly
  `inconclusive` for model visibility and makes no model-reaction claim.
- `live-jev-milestone.json` is the passing final bounded live run. Its declaration was
  emitted before credential lookup or provider-capable execution: one intended provider
  call maximum, one synthetic fixture of at most 256 bytes (inside the 32 KiB/file
  profile), 15-second deadline, and zero automatic retries. The runner had no actual
  provider-boundary counter, so provider attempts are recorded as unknown, never inferred
  from admission.
- `live-jev-issue-52-execution.json` accounts for both paid-capable executions while landing this
  ticket. The first emitted no finding, but the initial runner lacked a
  source-free completion observation and therefore classified it inconclusive. The second
  used resident completion/cache counters and established reviewed-clear. Exact provider
  call count remains unknown. Neither record
  contains source, raw advice, probabilities, provider usage, credentials, or raw
  provider responses.

Run `npm run conformance:direct-event` to validate the authoritative twelve-group
manifest and every retained JSON record against the sanitization policy. The host and
live runners use disposable Git repositories and state directories. Reproduce and retain
the installed-package real-host record with
`npm run conformance:host -- --write-evidence`. `conformance:live`
refuses to run without `--execute-paid`; it is paid and must only be run at a separately
declared milestone (`npm run conformance:live -- --execute-paid --write-evidence`).

Update and multi-file support is not claimed from the fresh Add host run. It is supported
by the pinned native payload fixtures under `evidence/codex/0.155.1` plus deterministic
production-pipeline checks named in the host record. Real child-specific delivery remains
unvalidated; only deterministic identity preservation and partition isolation are tested.

The subsequent [full MVP experience demonstration](./MVP-EXPERIENCE.md) combined
real headless Codex and live Jev in one run: an initial draft received a finding,
Codex repaired the type, independent invalid-state checks passed, and the repaired
type's review completed without further findings. This separately authorized paid
runner is `node scripts/run-mvp-experience.mjs --execute-paid`; it is not part of
ordinary tests.
