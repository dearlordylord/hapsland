# Publish stable and candidate Hapsland releases


**Purpose:** Publish and verify an exact reviewed Hapsland archive through stable or candidate npm channels.
**Audience:** Build and release maintainers.
**Status:** Maintained publishing guidance; no release is declared by this document.
**Authority:** Maintained operational guidance for the user-approved stable/next lanes. Platform acceptance is governed by exact release evidence.
**Expected use:** Prepare release coordinates, publish from a logged-in host, and verify registry artifacts before advertising support.
**Lifecycle:** Update with release tooling, package layout, or registry policy; review for each release or change to release host/platform combinations.

The maintainer prepares an audited archive from a clean committed checkout and
publishes that exact archive from a clean checkout matching the prepared source.
Clean `master` equal to `origin/master` is recommended; branch or remote-head
differences emit a warning while source and archive admission remain mandatory. GitHub
Actions is optional supporting evidence. The source repository remains private;
this flow provides no npm provenance attestation.

## Prepare stable or candidate coordinates

Commit matching package versions in `package.json` and target coordinates in
`scripts/npm-release-pin.json`:

- Stable: a version such as `0.2.0`, with `"tag": "latest"`.
- Candidate: a prerelease such as `0.3.0-next.1`, with `"tag": "next"`.

The version and channel are inputs to preparation. Each published version is
immutable. Do not reuse a published version for different bytes or move a
prerelease to `latest` as a release shortcut.

Prepare the candidate on Linux/macOS arm64 with Node 24.20.0, mise, and the exact
Bun 1.3.14 compiler available:

Prepare the foreign [native inputs](#native-build-inputs) before this command.

```sh
mise exec node@24.20.0 -- npm run release:prepare
```

This command installs frozen host dependencies with lifecycle scripts disabled,
initializes the pinned Bun launcher from the verified installed binary without
running dependency postinstall scripts, builds both platform targets, validates
native artifacts, packs with npm, and
runs the archive audit while the same checkout build lease is held. The audit
checks every standalone and host-module receipt, published bytes and modes,
default rules against their committed sources, parser bindings against pinned
npm dependencies, foreign C assets against source-bound input bundles, and
host-compiled native assets against fresh compiler receipts. It also checks the archive inventory and private-content markers.
It does not make authenticated agent or Jev requests.

Each platform ships one embedded Bun runtime in the CLI executable. The other
commands have separately checked JavaScript bundles and launchers using that
runtime, with no runtime download or dependency on Node/Bun on PATH. Command
source and native-loader boundaries remain independently checked.
Preparation and publication reject archives above the local 64 MiB size budget
before npm authentication. This leaves room for npm's base64 JSON attachment;
the budget is a repository policy, not a documented npm registry limit.

Host-compiled native files are generated outputs, not required to equal binaries
from another compiler/SDK. Their sources and declared compiler inputs still
participate in build validation. Generated files remain ignored after auditing;
the verified bytes also remain in the retained archive. No cross-host or cross-SDK bit-for-bit reproducibility is claimed.

Only after successful build and audit does preparation atomically write the
version-one pin. It records source commit, source-tree SHA-256, build platform,
archive SHA-256 and audit SHA-256. The source-tree identity covers all committed
inputs except the pin itself. Changing application code, build scripts,
lockfiles, documentation or native producer sources invalidates the candidate. A pin-only follow-up commit
preserves its identity.

The archive is retained under the Git common directory's
`hapsland-artifacts/archives`, and its content-addressed audit under
`hapsland-artifacts/release-audits`. These are shared by this repository's local
worktrees. Keep them until publication and release validation are complete.
Preparation does not publish or automatically commit the pin. Commit and review
the resulting pin, merge it to `master`, and push it before publication. A new
host must receive the exact archive and audit in the same content-addressed
layout or prepare and review a new candidate; missing artifacts never trigger
an implicit rebuild.

Archive preparation has a shared thirty-minute deadline. Compilation retains
its five-minute deadline; standalone assembly has twenty-one minutes for ten
producers at concurrency two, with each producer limited to four minutes. A
measured CLI producer on macOS arm64 took 165.6 seconds, exceeding the former
two-minute producer limit. An inherited process-group deadline prints its cause
before stopping the group, so the initiating failure remains visible. On
interruption or timeout, owned process groups stop before their build lease is
released. Incomplete or failed audits never produce a prepared pin.

## Publish the prepared candidate

On the npm-authenticated host with the retained archive and audit, prefer clean
`master` equal to `origin/master`. A clean candidate worktree with the same
prepared source can also publish; its branch warning does not stop publication:

```sh
git pull --ff-only origin master
mise exec node@24.20.0 -- npm run local-release
```

`local-release` performs source and artifact admission before npm authentication.
An unprepared/stale pin, missing archive/audit, or corrupt archive/audit fails
immediately with an instruction to run `release:prepare`. It never installs
dependencies, compiles, assembles or packs. Source admission allows the pin-only
commit; it does not require an unchanged Git commit SHA or an arbitrary ancestor
with different source contents. Publication does not depend on current compiler
outputs, temporary build receipts, or the installed Bun compiler.

The publisher checks the manifest against the pinned target, confirms the audit
and archive identities, publishes that exact archive with public access under
`latest` or `next`, and verifies registry bytes and the selected tag. It rechecks
source and archive admission immediately before upload. If the exact version is
already published, it verifies the existing archive instead of publishing again;
different registry bytes are a failure. The source URL, commit, source-tree hash,
archive hash and audit hash identify the prepared candidate.

The script prints the npm account name, archive path and checksums. npm may ask
for an OTP or web login. Save successful terminal output with the release record
without authentication tokens. Archive preparation and an audited pin establish
packaging evidence; they do not establish installed behavior or platform support.
Before publishing a candidate, verify its intended registration and recovery
paths offline. Stable platform advertising requires the exact registry and
native-host evidence below.

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
timing evidence. This is a purposeful small release check; other live checks within request budgets
validation can use hundreds of Jev calls when the question warrants them.
Keep ordinary automated tests offline and deterministic.

Do not advertise a platform until its registry artifact and conclusive live
review-and-repair evidence pass. If a published version fails validation,
deprecate it, pause guidance, preserve user state, and release a verified patch
version. The current npm session must be used for the deprecation command;
capture the reason and recovery instructions in the release record.

## Native build inputs

Generated native files under `native/prebuilt/` are ignored by Git and are still
included in the npm archive through the explicit `package.json` files list.
Parser bindings come from the exact installed npm dependency versions. Linux arm64
parser bindings are built from those sources on Debian bookworm: the TypeScript
0.23.2 upstream arm64 prebuild contains x86-64 code, and the runtime prebuild
requires a newer libstdc++ than that baseline. The source-bound bundle includes
the three rebuilt bindings; its recipe binds the lockfile, package sources and
Node addon headers. Our C
helpers compile on their target host; externally produced files use a source-bound
bundle in ignored `.test-runs/native-inputs/`, checked against current C sources,
producer declarations, Node version, tooling, file modes and SHA-256 digests.
A missing or stale bundle fails native preparation before compilation starts.

Run `npm run native:inputs -- build darwin-arm64` on macOS arm64 or
`npm run native:inputs -- build linux-arm64` on Linux arm64. The command prints
the bundle directory. Transfer that directory, then run
`npm run native:inputs -- import <profile> <bundle-directory>` on the release host.
Alternatively, run `npm run native:inputs -- fetch <profile>` to download a
matching master artifact produced by the Native inputs GitHub workflow (`gh`
authentication is required). CI produces both profiles on their own hosts before
importing the needed profiles. These commands do not publish npm packages.

Source snapshot archives are excluded from the current Git tree; historical
snapshots remain in Git history. Images remain tracked product and documentation
resources. Removing an ignored generated file requires regeneration or importing
its matching native inputs; it never requires committing a binary.
