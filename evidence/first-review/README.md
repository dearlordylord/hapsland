# Installed-product first-review evidence

This directory holds sanitized evidence from the explicitly selected paid demo milestone. The
runner packs the current built release, computes that tarball's SHA-256, installs it into its own
temporary prefix, verifies that the invoked CLI resolves inside that installation, and queries the
actual Codex version. `REVIEW_LIVE_CODEX_HOME` must select a dedicated clean milestone profile
that provides normal native trust and makes a credential available to the installed hook. It must
not contain a pre-existing owned product installation: the runner stops before mutation when an
installation is already present, and removes only the installation it created. The runner does
not read or source `.env` files.

Run `npm run conformance:first-review-live -- --live --write-evidence --supervised-trust` only for an authorized
milestone after setting `REVIEW_LIVE_CODEX_HOME`. Supervised mode pauses after the offline preview
so the exact disposable repository and installed hook can receive native Codex trust before the live
selection. The optional `--test-sandbox-bypass` flag is for externally sandboxed test hosts where
Codex's workspace-write sandbox cannot start; records label that condition and do not establish
normal workspace-write compatibility. The retained JSON contains bounded counts,
versions, timestamps, stage outcomes and timing. It excludes the disposable path, consent
digests, synthetic source, provider response, prompts and credentials.

Future runner records retain the sanitized correlation result as
`stages.modelReactionSource: "correlated-finding-reaction"` and
`stages.deliveredFindingCorrelation: true` only when the observed model action is tied to a
delivered finding. These fields contain no prompt, source, response, path, or finding text. Older
records are not rewritten to add correlation they did not observe.

For future records, `package.source: "runner-packed-release-installation"` means this hardened
runner created and hashed the tarball itself. Only those records may set
`cliResolvedInsideInstalledArtifact: true`. The legacy value
`package.source: "packed-release-installation"` does not establish either property: its artifact
SHA and CLI path were supplied externally and were not independently verified by that runner.

An `inconclusive` result is retained as such. The runner never changes thresholds or substitutes
a controlled backend to make the live milestone pass.

The single 2026-09-22 milestone attempt is retained in
`live-installed-codex-0.155.1.json`. That attempt reported an externally selected packed release
and artifact SHA, but its runner did not compute the SHA or verify that the invoked CLI resolved
inside that artifact. The actual host ran with normal trust, but host completion was incomplete
before any review dispatch. The sanitized observation records zero provider calls and zero source
bytes; submission, model reaction, repair validation and follow-up review were therefore
unavailable. Raw host output was intentionally not retained, so the specific unmet host
prerequisite remains an evidence gap in that historical record.

The four supervised 2026-09-23 setup/host attempts are retained separately. Attempt 1 stopped
before a provider call when this container could not start Codex's workspace-write sandbox.
Attempts 2–4 observed zero provider calls and zero source bytes because the demo's Codex subprocess
kept stdin open and waited for an end-of-input marker. A focused regression test now closes stdin
before awaiting Codex. The subsequent supervised record in
`live-installed-codex-0.155.1-supervised.json` passed: two real Jev calls and 704 source bytes
stayed within the declared caps, a finding reached the host, the host reacted to that finding,
the repair rejected the invalid states, and a follow-up review completed. The Linux container
used the explicitly labeled test sandbox bypass while preserving native repository and exact
hook trust; this is not evidence for the default workspace-write sandbox.
