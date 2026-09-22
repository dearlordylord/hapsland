# Installed-product first-review evidence

This directory holds sanitized evidence from the explicitly selected paid demo milestone. The
runner requires an already packed and installed release, an actual Codex 0.155.1 profile with
normal native trust, and a credential available to the installed hook. It does not read or source
`.env` files.

Run `npm run conformance:first-review-live -- --live --write-evidence` only for an authorized
milestone after setting `REVIEW_LIVE_INSTALLED_CLI`, `REVIEW_LIVE_CODEX_HOME`, and the SHA-256 of
the packed artifact in `REVIEW_LIVE_ARTIFACT_SHA256`. The retained JSON contains bounded counts,
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
