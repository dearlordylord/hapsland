# Hapsland 0.1.0 npm release record: pending

The selected first public coordinates are `@hapsland/hapsland@0.1.0` and the
`hapsland` command. No `review-tool` alias will ship. The existing Codex
ownership marker, consent, and native credential identity are retained for pilot
migration. Hapsland is the product; Jev is its external backend. Ownership and
publication rights for `@hapsland/hapsland` must be verified by the logged-in
maintainer's host.

No Hapsland release has been published. This record does not yet claim registry
compatibility. The [host publishing guide](./npm-publishing.md) gives the
command and post-publication validation. **CI is not a release gate.** Local
build, native verification, archive audit, and digest match are the publish
preflight. On-platform tests of the published archive establish advertised
support; GitHub Actions can add supporting evidence without delaying publish.

| Field | Current Hapsland state |
| --- | --- |
| Version | Selected `0.1.0`; public package `@hapsland/hapsland` |
| Reviewed release commit | Pending Hapsland archive review |
| Local candidate archive SHA-256 | Pending Hapsland archive build and audit |
| Registry tarball SHA-256 and integrity | Pending publication and registry retrieval |
| npm publish identity | Pending maintainer-host publication and package ownership verification |
| Linux arm64 published-artifact installation and native host run | Pending |
| macOS arm64 published-artifact installation and native host run | Pending |
| Exact Codex/OS/architecture/Node compatibility statement | Pending published-artifact evidence |
| Bounded live Jev review-and-repair run | Pending exact-artifact evidence on both platforms |
| Known-good rollback version | Pending first successful Hapsland release |
| Pilot archive to Hapsland candidate migration | Pending renamed-package rehearsal |
| Hapsland candidate to published registry artifact migration | Pending registry release |

The release pin remains incomplete until a reviewed source commit and new archive
checksum are recorded for the renamed repository.

Release assembly starts from clean, reviewed `master` equal to `origin/master`.
The host command builds, verifies pinned native bytes, packs with scripts
disabled, audits the exact archive, compares it with the reviewed SHA-256,
publishes to npm `latest`, and downloads the registry artifact to confirm its
SHA-256 and tag. The tarball must contain runtime entry points and no
credentials, private paths, pilot outputs, development fixtures, or
conformance runners.

After publication, install from the registry in clean homes on **each**
advertised platform using a user-writable prefix, lifecycle scripts disabled,
optional dependencies enabled, and a shell Node version different from the
packaged 24.20.0 runtime. Exercise offline doctor, guided setup, native trust,
consent, observed offline review, explicit update, disable, logout, and scoped
uninstall, preserving an unrelated hook and configuration. Only then update
the supported profiles and quickstart with the artifact checksum and exact
evidence. A real Jev review-and-repair statement requires a supervised run of
the published artifact with explicit request, source, and time limits and
sanitized evidence. These limits prevent unbounded validation; useful runs
involving hundreds of requests are acceptable when they answer a release
question. Do not retain credentials or source-bearing responses.

If validation fails after publication, stop directing users to the affected
version, deprecate it if registry access is available, and identify a verified
known-good version. Preserve local grants, credentials, and unrelated hooks;
use the explicit update/recovery flow. Record the failure and corrective
version here without source or secret data.
