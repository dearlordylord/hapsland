# First opt-in Codex pilot

The owner authorized one new, local Git test repository containing only a synthetic TypeScript
session-state fixture. The repository itself stays outside this product checkout and has no remote.
Its path, source, Codex transcript, credential, provider response, and consent digests are not in
the retained JSON. The local fixture has a baseline commit and a later reviewed-repair commit.

The Linux arm64 run installed the exact tarball SHA-256 from the conclusive first-review milestone
into an isolated Codex profile. Package doctor reported ready; installation and repository consent
were previewed and confirmed separately; native repository and exact hook trust persisted. The
project config selected only one TypeScript file, one concurrent review, no transient retry, and an
explicit environment credential. This container required a labeled Codex host sandbox bypass;
native hook trust was not bypassed.

For the one live edit, `scripts/pilot-provider-guard.mjs` was loaded into Node hook processes via
`NODE_OPTIONS`. It counted requests to the fixed Jev endpoint before dispatch and rejected any
request after the second. The fixture file was checked below 4,096 bytes before host execution,
and the host had a 180-second deadline. The retained result records two HTTP 200 responses,
one submitted finding, a passing independent state validator, and a completed host run. The pilot
repo remains enabled, but later Linux Codex runs need an explicitly supplied credential; no key was
stored in that repository.

The separate macOS arm64 / Codex CLI 0.156.0 owner-host pilot used an isolated profile, saved
Keychain credential, confirmed repository and exact-hook trust, and the user-authorized Codex
sandbox bypass. One ordinary edit added a valid optional property to the already repaired
synthetic file. Resident activity completed clear with zero findings; the independent validator
passed. The retained [sanitized Mac record](./macos-arm64-codex-0.156.0-2026-09-23.json) reports
that provider-call and source-byte counts were not independently measured. It establishes the
observed clear-review path under those conditions, not Mac finding delivery or an independently
metered Jev request. No second Mac edit or paid attempt was made.
