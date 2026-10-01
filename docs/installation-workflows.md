# Installation, updates, and development workflows

**Purpose:** Explain Hapsland's stable, published candidate, personal development, and client update lanes for Claude Code and Codex CLI.
**Status:** Maintained operational guidance. Commands are implemented; public distribution and host compatibility require their own evidence.
**Authority:** Maintained guidance implementing the user-approved four-lane scope on 2026-10-01. This document is not a release or platform support declaration.
**Expected use:** Choose a lane, register its exact package in a selected client profile, and verify observed review activity.
**Lifecycle:** Keep current with CLI onboarding, publishing, host profiles, and package layout. Review whenever any of those changes; replace superseded instructions in place.

## Stable installation and ordinary use

After a stable release is published and verified, install into a user-owned prefix:

```sh
npm install --global --prefix "$HOME/.local" --ignore-scripts=true --include=optional @hapsland/hapsland@latest
"$HOME/.local/bin/hapsland-doctor"
```

Keep optional dependencies enabled: Hapsland supplies its exact Node runtime. In the Git repository to review, run one of:

```sh
"$HOME/.local/bin/hapsland" setup claude
"$HOME/.local/bin/hapsland" setup codex
```

Setup previews the exact owned hooks, asks before installing them, offers masked credential entry when a saved key is missing, loads file settings, and reports offline readiness. It makes no Jev request. Both clients also accept the version-1 JSON `--setup` interface; `--pilot --host=claude|codex` invokes the same guided flow (`--pilot` defaults to Codex).

The selected profile is user-wide by default. File settings control eligible repositories and files; invoking setup from a repository does not restrict the installed hooks to that repository. Use [configuration](configuration.md) to bound review scope. `--claude-home=PATH` / `--codex-home=PATH` and corresponding `--claude-executable=PATH` / `--codex-executable=PATH` select the registration and compatibility probe. An alternate registration home alone does not configure the client process to use that home.

Start the client normally and complete its native repository/hook trust prompts. Make a supported edit and inspect [session activity](status.md). Installation and offline readiness do not prove a review or model repair happened. Diagnose without a JSON request:

```sh
hapsland doctor claude
hapsland doctor codex
```

Use an absolute executable path if the prefix's `bin` directory is not on PATH. See the [Claude guide](claude-installation.md) and [Codex guide](codex-installation.md) for automation, ownership, credentials, and host-specific limits. Saved login uses the native credential store; hooks do not prompt.

Registry latest lookup returned HTTP 404 on 2026-10-01 before these changes. The commands above become usable after publication; this document does not claim an existing registry release. Current exact adapter profiles are Claude 2.1.218 and Codex 0.155.1/0.156.0, with Node 24.20.0 on Linux/macOS arm64. See [installed-release compatibility](installed-release-compatibility.md): its pinned evidence predates current composed delivery and does not establish current interactive or registry-artifact support.

## Client updates and published candidates

Updates stage a new package separately and retain the previous installation. They resolve a registry tag to an exact version, install without lifecycle scripts, run package doctor, show the target's hook preview, and ask before applying its digest:

```sh
hapsland update claude
hapsland update codex
hapsland update claude --channel=next
hapsland update codex --channel=next
```

The default channel is `latest` (stable). `next` requires a prerelease version; stable selection rejects prereleases. `--version=VERSION` selects an exact version within the selected lane. Candidate publication never updates `latest`. For first installation of a published candidate, install `@hapsland/hapsland@next` into a separate prefix with the same npm flags, then run that prefix's `hapsland setup CLIENT`.

Local packages use the same activation flow:

```sh
hapsland update claude --tarball=/absolute/candidate.tgz
hapsland update codex --target=/absolute/candidate-prefix/bin/hapsland
```

`--target` skips acquisition and runs the retained target's preview and update. The interactive updater needs a terminal; `--update-preview` and `--update` JSON remain the automation interface. Acquisition installs into a fresh directory under `~/.local/share/hapsland/candidates/`; `snapshot.json` records package/version or local archive/checksum identity. The command prints the exact target executable. No package fetch occurs in edit hooks.

Finish current work, restart the client, and review renewed native trust. Future updates can run from the original executable: each acquisition stages another separate target. Do not remove a prefix while registered hooks or active sessions depend on it. A failed acquisition leaves active registration unchanged; a failed activation prints the target's conflict or partial-recovery result. Retain that target and follow the exact recovery request rather than acquiring another snapshot mid-recovery.

To return to stable from `next`, run `hapsland update CLIENT --channel=latest`. To select a retained local package, use `--target` with that executable. Both paths remain subject to ownership and resident compatibility checks. Offline target-switch tests are not an authenticated downgrade or platform support claim.

## Personal development on your own clients

From the checkout with build prerequisites installed:

```sh
npm run typecheck
npm test
npm run dev-install -- --host=claude
# Or:
npm run dev-install -- --host=codex
```

`dev-install` builds, verifies native assets, packs a local archive, installs it into a fresh candidate prefix, records Git commit/dirty-tree/checksum identity, and launches that package's guided setup. It does not publish. For a profile that already has Hapsland, switch its registration with:

```sh
npm run dev-install -- --host=claude --update
npm run dev-install -- --host=codex --update
```

Pass the matching home/executable flags when using another profile. Each run takes a packed snapshot; rebuilding the checkout does not change installed code. Different snapshots may have the same package version and are identified by checksum, commit, and prefix. Retain the printed archive and previous installed package for diagnosis and recovery. `npm link` is unnecessary.

The explicit equivalent is `npm run pack:release`, followed by a production-only npm install of the tarball into a fresh prefix, package doctor, and that target's setup or update. Keep credentials in the native store or selected execution environment. Make a supported edit in a disposable repository, then inspect session activity. These instructions do not authorize a live check on arbitrary private source.

## Publishing

Use the [publishing runbook](npm-publishing.md). `scripts/npm-release-pin.json` owns the reviewed package version, source commit, archive SHA-256, and tag. Stable versions use `latest`; prereleases use `next`. `local-release` rejects mismatches, audits the archive, publishes that exact archive, and verifies the registry download and selected tag. The registry conformance runners select the exact version in the release checkout's manifest.

Changes to packaged code, metadata, or docs require a newly reviewed archive and pin. The retained 0.1.0 pin is historical input and will not match this changed checkout. No publication was performed as part of this implementation. Stable platform advertising still requires exact registry-artifact and authenticated host evidence; passing offline tests alone is insufficient.

## Disablement, removal, and recovery

Set user `excludes` to `["**/*"]` to stop future review dispatch. Requests already sent cannot be recalled. Use the selected host's uninstall preview and digest to remove owned hooks **before** uninstalling its active npm package. Unrelated hooks, settings, rules, credentials, and native trust remain owned by their existing authorities. `hapsland --logout` separately removes the saved key.

Remaining work outside this implementation: authenticated candidate-to-stable trials on each advertised client/platform, host upgrade cadence, project-level installation scope, coexistence trials with other hook tools, release account ownership, and how deprecation notices reach installed users. Ordinary tests remain offline; installation itself performs no paid review.
