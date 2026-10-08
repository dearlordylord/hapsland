# Direct-event v1 acceptance narrative

**Audience:** Contributors, including coding agents validating runtime behavior; Build and release maintainers; Product and specification owners.

**Historical acceptance record.** Extracted from the direct-event v1 profile.
The observations below describe the retained acceptance runs and do not establish
current checkout or installed-release status. The [profile](../../docs/direct-event-v1-supported-profile.md)
retains the declared boundaries; the [evidence index](README.md) identifies the records.

## Offline acceptance outcome

All 39 obligations and 93 unique mapped checks pass through product boundaries or narrowly focused external
boundaries. Ordinary `npm test` and `npm run conformance:direct-event` are deterministic
and offline. The live Jev script is separate and explicit.

## Installed package evidence

The locally packed release contains compiled JavaScript entry points for the CLI, parser,
resident, and package doctor. `npm run conformance:package` installs that tarball into a fresh
temporary prefix with production dependencies only and runs from outside the development
checkout. It verifies parser loading, resident launch, consent, one controlled offline backend
submission, advice collection, and actionable missing-command diagnosis. No package acquisition
occurs during hook edits.

The issue-63 fixture additionally uses an isolated real Codex 0.155.1 home and temporary Git
repository. It neither seeds repository trust nor bypasses hook trust, and drives both decisions
through Codex's native interactive flow. The bounded PTY reconstructs Codex's rendered terminal
screen, waits for the repository and hook-review states, and confirms the native selections only
after each state is visible. Two consecutive fresh isolated runs passed during issue acceptance.
The retained second run separately observed one provider submission and one terminal
`completed-findings` resident outcome correlated by source-free native event identity.
`OPENAI_API_KEY` and `TYPESAFE_API_KEY` were absent from the hook environment; no Jev call was
possible. The sanitized record is
[`evidence/package/clean-linux-node-24.20.0-arm64.json`](../../docs/../evidence/package/clean-linux-node-24.20.0-arm64.json).
It establishes the clean installed-package and real-host seam in the recorded Linux arm64
environment. It does not broaden the adapter, platform, mode, or review-semantics profile.

The macOS runner record is
[`evidence/package/clean-darwin-node-24.20.0-arm64.json`](../../docs/../evidence/package/clean-darwin-node-24.20.0-arm64.json).
It establishes the clean packaged CLI, parser, descriptor-anchored capture, portable resident,
controlled offline submission, advice-return path, and native Keychain credential lifecycle on
macOS 14 arm64. The Keychain cell includes separate-process persistence, fresh-resident reuse,
production resolver/provider-boundary access, logout dispatch blocking, and a bounded
noninteractive ACL-restricted lookup. The repository had no isolated Codex authentication secret
during validation, so it does not establish real Codex host execution on macOS; that cell remains
unverified rather than inferred from the packaged hook run.

The corrected fresh pinned run observed all five for one Add with a controlled backend;
model visibility required exact repetition of a randomized hook-only value absent from the
prompt. That single observation does not establish reliable model visibility. Update and multi-file support
is separately grounded in native `0.155.1` payload captures plus deterministic production
pipeline gates; it was not rerun live in this final Add conformance. Real child-specific
delivery is unvalidated, although child identity preservation and partition isolation are
deterministically checked.

## Bounded live Jev evidence and gaps

Issue #52 made two live-capable executions, both under declarations of one intended
provider call maximum, a 256-byte synthetic fixture bound, the 32 KiB profile ceiling,
15 seconds, and zero retries. The runner did not count at the actual provider boundary,
so exact provider attempts are unknown and admission is not used as a proxy. The first
execution was conservatively inconclusive because reviewed-clear was not yet
distinguishable from incomplete using retained source-free data. The corrected run used
resident completion/cache plus separate pending-finding/pending-notice counters and passed as `completed-clear-no-advice` in
7,424 ms (`5s-to-under-15s`). No raw advice, source, individual probability, provider
usage, credential, or source-bearing backend output was retained.
