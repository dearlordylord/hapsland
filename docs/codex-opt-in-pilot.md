# Single-repository Codex pilot

This is a local, opt-in pilot for one owner-selected Git test repository. It sends no invitations,
does not enable the product in the development checkout, and does not publish a package. Record the
selected repository path privately; do not put it in issue comments or retained evidence.

The exact starting profiles are Node 24.20.0 with Codex CLI 0.155.1 on Linux arm64, and Node
24.20.0 with Codex CLI 0.156.0 on macOS arm64. The macOS authenticated-host check used a
controlled offline backend. The Linux real-Jev first-review check used an externally sandboxed
test host with an explicit Codex sandbox bypass; neither result establishes a broader host or
sandbox configuration. Run `review-tool-doctor` and inspect the exact package's install preview
before enabling a repository.

Use a locally packed tarball from a reviewed commit. The 2026-09-23 first-review record binds a
tarball with SHA-256 `159027010f3dca1aacda2c5f056a366dbf651219888135aae1e1c197d180c80a`.
If a later pack has a different checksum, record it as a new pilot artifact; do not present it as
the first-review artifact. Complete native repository and exact hook trust without a hook-trust
bypass. Prefer the normal Codex workspace-write sandbox on a host that supports it; record any
test-only sandbox change explicitly.

Before any source-bearing edit, complete the installation preview and apply its digest, choose an
explicit credential source, and preview repository enablement. Confirm the enablement digest only
for the selected test repository. Start with a synthetic TypeScript file scoped by `.review.jsonc`
`includes`, `concurrency: 1`, `transientRetries: 0`, and a 15-second review deadline. Make one
controlled edit, inspect status/activity for a submitted and completed review, and stop or disable
the repository if the result is unavailable or unexpected. Repository consent is distinct from
installation and can be revoked without uninstalling the hook.

Retain only Node/Codex/platform versions, local package checksum, source-free stage outcomes,
provider-call/source-byte counts when independently available, review latency, and cleanup
outcomes. Do not retain source, provider responses, credentials, transcripts, or private paths.
After the first repository completes a successful controlled edit, decide separately whether to
extend the pilot to the second verified Codex profile. Other hosts and public distribution remain
outside this pilot.
