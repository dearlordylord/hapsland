# Publish stable and candidate Hapsland releases


**Purpose:** Publish and verify an exact reviewed Hapsland archive through stable or candidate npm channels.
**Status:** Maintained publishing guidance; no release is declared by this document.
**Authority:** Maintained operational guidance for the user-approved stable/next lanes. Platform acceptance is governed by exact release evidence.
**Expected use:** Prepare release coordinates, publish from a logged-in host, and verify registry artifacts before advertising support.
**Lifecycle:** Update with release tooling, package layout, or registry policy; review for each release or change to supported host/platform cells.

The maintainer publishes `@hapsland/hapsland` from a clean, reviewed `master`
checkout. GitHub Actions is optional supporting evidence. The source repository
remains private; this flow provides no npm provenance attestation. The canonical
source URL, release commit, and SHA-256 in `scripts/npm-release-pin.json`
identify the reviewed archive.

## Prepare stable or candidate coordinates

Set the package version in `package.json` and record matching reviewed coordinates
in `scripts/npm-release-pin.json`:

- Stable: a version such as `0.2.0`, with `"tag": "latest"`.
- Candidate: a prerelease such as `0.3.0-next.1`, with `"tag": "next"`.

The publisher rejects stable/prerelease tag mismatches and arbitrary tags. `next`
publication passes `--tag=next` explicitly and never updates `latest`. Each release
has an immutable version; local development snapshots do not require publication.
Build, test, audit and review the exact candidate archive, then record its source
commit and SHA-256. Changing packaged files requires a new reviewed pin. The
retained 0.1.0 checksum predates the installation workflow changes and cannot be
used to publish the changed checkout. The script fails on a checksum mismatch.

For candidate-to-stable promotion, prepare a stable package version and reviewed
archive, then publish it through this flow. Moving a prerelease to `latest` is not
a supported shortcut. Before publishing a candidate, verify that its intended
registration and recovery paths pass offline; stable support advertising additionally
requires the registry and authenticated host evidence below.

## Host command

After the release commit is merged, the canonical source repository URL,
reviewed commit, and archive checksum are recorded in
`scripts/npm-release-pin.json`. On the host where you are
already logged in to npm, use a clean `master` checkout of this repository
and run:

```sh
git pull --ff-only origin master
mise exec node@24.20.0 -- npm run local-release
```

`local-release` is the repository's npm script for the host publish flow.
`mise exec` selects the certified Node runtime for npm and the release script,
as in Huly MCP's local release flow. Use it even if a different Node version is active.
Node 25 is fine for ordinary work; release
assembly is pinned to Node 24.20.0 so npm builds the reviewed archive under the
same toolchain used to calculate its checksum. It requires Linux arm64 or macOS
arm64, mise with Node 24.20.0 available, clean `master` equal to `origin/master`
and containing the pinned release commit, the expected GitHub origin, and an
active npm login. It builds and audits the local archive,
compares its SHA-256 with the reviewed archive, publishes that archive with
public access to the declared `latest` or `next` tag, then downloads the registry archive and confirms
its SHA-256 and dist-tag. If the exact version is already published, it
verifies the existing artifact instead of trying to publish it again. Stop on
any error; do not publish a different archive under the same version.

The release script also installs the locked development dependencies for the
host OS with Bun 1.3.14 through mise and scripts disabled. This repairs a
`node_modules` tree copied from Linux, including TypeScript's Darwin arm64
compiler package, before starting the build. The frozen install leaves the
lockfile unchanged.

The release script prints the npm account name, archive path, and checksums.
It does not print Jev credentials. npm may ask for an OTP or web login during
publication. Save the successful terminal output with the release record,
without any authentication token.

## Published-artifact evidence

On **each** advertised platform, with Node 24.20.0 selected and the matching
Codex CLI installed, run from the release checkout:

```sh
npm run conformance:package -- --registry-artifact --expected-sha256=ARCHIVE_SHA256 --real-codex --write-evidence
```

The runner downloads the exact package name/version in the release checkout manifest from npm, rejects a checksum mismatch,
installs it in a fresh prefix with lifecycle scripts disabled, and exercises
the package, setup, controlled offline review, update/recovery, and native
Codex host path. Record the resulting source-free evidence in the release
record. The existing Codex runner targets Linux arm64 / Codex CLI 0.155.1 and macOS arm64 / 0.156.0. It does not validate Claude; Claude needs its own exact installed-artifact lifecycle and authenticated native-host trial before a release support claim.
The `--real-codex` path needs authenticated Codex and may invoke it locally.
The checkout is the test harness; the installed code comes from the registry
archive.

A live Jev review-and-repair check uses the exact registry archive too. Run
the supervised synthetic demo on each platform with a dedicated Codex home,
after its offline preview and native trust review:

```sh
REVIEW_LIVE_CODEX_HOME=/absolute/path/to/dedicated-codex-home npm run conformance:first-review-live -- --live --registry-artifact --expected-sha256=ARCHIVE_SHA256 --supervised-trust --write-evidence
```

The demo declares a ceiling of two Jev requests, 4,096 source bytes, and
180 seconds. It requires separate consent and records sanitized stage and
timing evidence. This is a purposeful small release check; other bounded live
validation can use hundreds of Jev calls when the question warrants them.
Keep ordinary automated tests offline and deterministic.

Do not advertise a platform until its registry artifact and conclusive live
review-and-repair evidence pass. If a published version fails validation,
deprecate it, pause guidance, preserve user state, and release a verified patch
version. The current npm session must be used for the deprecation command;
capture the reason and recovery instructions in the release record.
