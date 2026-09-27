# Hapsland 0.1.0 npm preflight record — 2026-09-24

**Historical preflight snapshot.** Pending states, release instructions, and decisions
below are retained as recorded on 2026-09-24. The [publishing guide](../../docs/npm-publishing.md)
is the operational reference; this record does not establish present publication state.

## Public registry observation — 2026-09-26

A read-only lookup, `npm view @hapsland/hapsland@0.1.0 version --json --registry=https://registry.npmjs.org`,
returned `E404` in this workspace. The requested version was unavailable through that
public-registry lookup. This observation does not establish whether a private package exists.

## Frozen preflight snapshot

The selected first public coordinates are `@hapsland/hapsland@0.1.0` and the
`hapsland` command. No `review-tool` alias will ship. The existing Codex
ownership marker, consent, and native credential identity are retained for pilot
migration. Hapsland is the product; Jev is its external backend. Ownership and
publication rights for `@hapsland/hapsland` must be verified by the logged-in
maintainer's host.

No Hapsland release has been published. This record does not yet claim registry
compatibility. The [host publishing guide](../../docs/npm-publishing.md) gives the
command and post-publication validation. **CI is not a release gate.** Local
build, native verification, archive audit, and digest match are the publish
preflight. On-platform tests of the published archive establish advertised
support; GitHub Actions can add supporting evidence without delaying publish.

| Field | Current Hapsland state |
| --- | --- |
| Version | Selected `0.1.0`; public package `@hapsland/hapsland` |
| Reviewed release commit | Candidate packaged source `a5939c97c4029ab5b9b0cd336cb04ba7dbcd9856`; archive audited; publication pending |
| Local candidate archive SHA-256 | `88475afb074e61dfd04098d87344e6bed72218fef87763be99358b04d07a8965`; clean-worktree archive audit passed |
| Registry tarball SHA-256 and integrity | Pending publication and registry retrieval |
| npm publish identity | Pending maintainer-host login and package ownership verification; this workspace's `npm whoami` returned E401 |
| Linux arm64 published-artifact installation and native host run | Pending |
| macOS arm64 published-artifact installation and native host run | Pending |
| Exact Codex/OS/architecture/Node compatibility statement | Pending published-artifact evidence |
| Bounded live Jev review-and-repair run | Pending exact-artifact evidence on both platforms |
| Known-good rollback version | Pending first successful Hapsland release |
| Pilot archive to Hapsland candidate migration | Pending renamed-package rehearsal |
| Hapsland candidate to published registry artifact migration | Pending registry release |

The candidate source commit and archive checksum are recorded in
[`scripts/npm-release-pin.json`](../../scripts/npm-release-pin.json). The pin can be used for
publication from clean `master` equal to `origin/master` after the branch is merged
with its commit ancestry intact and the host release script reproduces the archive digest.

The 2026-09-24 local preflight used Linux arm64 and Node 24.20.0. Typecheck, build,
native-artifact verification, setup-package conformance, and local package conformance
passed. The full offline suite first had one installation-recovery failure; that test
passed alone and with its full file, and the complete suite then passed (450 passed,
2 skipped). This intermittent result is retained for review rather than treated as
proof that the failure cannot recur. The clean-worktree archive audit accepted 111 files, including
seven pinned native artifacts. These checks do not establish registry or real-host
compatibility.

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
