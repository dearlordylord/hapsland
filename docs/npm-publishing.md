# Publish Hapsland 0.1.0 from a logged-in host

The maintainer publishes `@hapsland/hapsland@0.1.0` directly to npm `latest` from a
clean, reviewed `master` checkout. GitHub Actions is optional supporting
evidence, not a publication gate. The source repository remains private.
There is no npm provenance attestation for this private repository; the
canonical source repository URL, release commit, and SHA-256 pin in
`scripts/npm-release-pin.json` identify the archive.

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
public access to `latest`, then downloads the registry archive and confirms
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

The runner downloads `@hapsland/hapsland@0.1.0` from npm, rejects a checksum mismatch,
installs it in a fresh prefix with lifecycle scripts disabled, and exercises
the package, setup, controlled offline review, update/recovery, and native
Codex host path. Record the resulting source-free evidence in the release
record. Linux arm64 targets Codex CLI 0.155.1; macOS arm64 targets 0.156.0.
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
