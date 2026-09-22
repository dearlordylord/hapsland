# Installed-product first-review evidence

This directory holds sanitized evidence from the explicitly selected paid demo milestone. The
runner packs the current built release, computes that tarball's SHA-256, installs it into its own
temporary prefix, verifies that the invoked CLI resolves inside that installation, and queries the
actual Codex version. The selected Codex profile must provide normal native trust and make a
credential available to the installed hook. The runner does not read or source `.env` files.

Run `npm run conformance:first-review-live -- --live --write-evidence` only for an authorized
milestone after setting `REVIEW_LIVE_CODEX_HOME`. The retained JSON contains bounded counts,
versions, timestamps, stage outcomes and timing. It excludes the disposable path, consent
digests, synthetic source, provider response, prompts and credentials.

An `inconclusive` result is retained as such. The runner never changes thresholds or substitutes
a controlled backend to make the live milestone pass.

The single 2026-09-22 milestone attempt is retained in
`live-installed-codex-0.155.1.json`. The packed release started the actual host with normal trust,
but host completion was incomplete before any review dispatch. The sanitized observation records
zero provider calls and zero source bytes; submission, model reaction, repair validation and
follow-up review were therefore unavailable. Raw host output was intentionally not retained, so
the specific unmet host prerequisite is an evidence gap rather than an attributed cause. The
attempt was not retried.
