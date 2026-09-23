# npm release record: pending

The proposed first public coordinates are `realtime-review@0.1.0` and the
`realtime-review` command. `review-tool` remains an alias for pilot migration;
the existing Codex ownership marker and native credential identity remain
unchanged. These coordinates name the integration, not Jev, its external
backend. Registry availability was observed before release preparation, but
ownership and publication rights have not been verified.

No public release has been published. This document is a gate and a record
template, not a compatibility claim for a registry artifact. Do not fill in
success from the earlier private archive or the assembled installed-product
gate; those are supporting evidence for different artifacts.

| Field | Current state |
| --- | --- |
| Version | Proposed `0.1.0` |
| Release commit | Pending clean, reviewed commit |
| Registry tarball SHA-256 and integrity | Pending |
| npm publish identity and provenance | Pending |
| Linux arm64 published-artifact installation and native host run | Pending |
| macOS arm64 published-artifact installation and native host run | Pending |
| Exact Codex/OS/architecture/Node compatibility statement | Pending published-artifact evidence |
| Separately budgeted real Jev first-value run | Pending exact-artifact authorization and evidence |
| Known-good rollback version | Pending first successful release |

Release assembly must start from a clean, reviewed commit. Build native helpers
and tree-sitter bindings on their target platforms, pin their bytes in that
commit, run `npm run build`, `npm run verify:release-native`, then
`npm pack --ignore-scripts=true`. Run
`node scripts/audit-release-tarball.mjs ARCHIVE.tgz RELEASE_COMMIT_SHA` on the
exact tarball intended for publication. Record its checksum and inspect its
manifest and file list. The audit rejects unexpected files and verifies that
packaged native bytes match the pinned commit. The tarball must contain the
runtime entry points and must contain no credentials, private paths, pilot
outputs, development fixtures, or conformance runners.

After an explicit release decision, publish that exact archive with public
access and capture the registry integrity and provenance. Install from the
registry in clean homes on **each** advertised platform using a user-writable
prefix, lifecycle scripts disabled, optional dependencies enabled, and a shell
Node version different from the packaged 24.20.0 runtime. Exercise offline
doctor, guided setup, native trust, consent, observed offline review, explicit
update, disable, logout, and scoped uninstall, preserving an unrelated hook
and configuration. Only then update the supported profiles and quickstart with
the artifact checksum and exact evidence. A real Jev first-value statement
requires a separately authorized, budgeted, sanitized run of the published
artifact. Do not retain credentials or source-bearing responses.

If validation fails after publication, stop directing users to the affected
version, deprecate it if registry access is available, and identify a verified
known-good version. Preserve local grants, credentials, and unrelated hooks;
use the explicit update/recovery flow. Record the failure and corrective
version here without source or secret data.
