# Jevs 0.1.0 npm release record: pending

The selected first public coordinates are `@jevs/jevs@0.1.0` and the `jevs`
command. No `review-tool` alias will ship. The existing Codex ownership marker,
consent, and native credential identity are retained for pilot migration. Jevs
is the product; Jev is its external backend. Ownership and publication rights
for `@jevs/jevs` can only be verified by the logged-in maintainer's host.

No public release has been published. This record does not yet claim registry
compatibility. The [host publishing guide](./npm-publishing.md) gives the
command and post-publication validation. **CI is not a release gate.** Local
build, native verification, archive audit, and digest match are the publish
preflight. On-platform tests of the published archive establish advertised
support; GitHub Actions can add supporting evidence without delaying publish.

| Field | Current state |
| --- | --- |
| Version | Selected `0.1.0`; public package `@jevs/jevs` |
| Reviewed release commit | Pending PR review and merge to `master` |
| Local candidate archive SHA-256 | `7f8acec0adc1c24aa57255207e499dd10ada7182666fe172d462ef96bb3de874` (105 files; seven pinned native artifacts; registry match pending) |
| Registry tarball SHA-256 and integrity | Pending publication and registry retrieval |
| npm publish identity | Pending maintainer-host publication; private source repo has no npm provenance attestation |
| Linux arm64 local candidate installation | Passed clean package conformance with production dependencies, controlled offline review, update/recovery, consent and independent hook preservation; scripts-disabled global user-prefix install under shell Node 22.22.2 selected packaged Node 24.20.0 and doctor reported ready |
| Linux arm64 published-artifact installation and native host run | Pending |
| macOS arm64 local candidate conformance | Pending renamed and scoped candidate rehearsal |
| macOS arm64 published-artifact installation and native host run | Pending |
| Exact Codex/OS/architecture/Node compatibility statement | Pending published-artifact evidence |
| Bounded live Jev review-and-repair run | Pending exact-artifact evidence on both platforms |
| Known-good rollback version | Pending first successful release |
| Pilot archive to local candidate migration | Passed isolated old `realtime-review-prototype@0.0.0` install to `@jevs/jevs@0.1.0` update preview/apply across separate prefixes; owner hook and versioned record updated, source egress remained unauthorized, native trust renewal required. Independent hook and live credential preservation remain untested for this exact pair |
| Pilot archive to published registry artifact migration | Pending registry release |

Earlier evidence for the superseded `realtime-review@0.1.0` candidate includes
Linux package conformance and [macOS package lifecycle on CI run
35926873063](https://github.com/dearlordylord/jevs/actions/runs/35926873063).
Its archive SHA-256 was
`e9596448723f4cd4eda61134d943d9c0ccdf5ece0a6016923fcb2fabd4c90216`.
This is supporting history only: it cannot establish the behavior or bytes of
the renamed `@jevs/jevs` registry release.

The current local `@jevs/jevs@0.1.0` archive passed a commit-bound audit at
`d491783487b7642e47c12267457a7ad2a1eb4aaf` and a second independent
conformance pack produced the same SHA-256. The offline suite had 426 passing,
one source-label assertion failure after adding registry provenance, and two
skips; the corrected four-test file passed. Build and native checks passed.
This source-only record update does not enter the npm archive. The final
reviewed commit still needs an audit before handoff.

An isolated pilot migration rehearsal installed an archive packed from the
current `master` prototype into a separate prefix and Codex home. The new
package's update preview identified the old `0.0.0` and new `0.1.0` paths;
matching-digest update replaced the owned hook and record while leaving source
egress unauthorized. The host executable was a version-only offline Codex
fixture, so this is migration contract evidence, not a native host run.

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
