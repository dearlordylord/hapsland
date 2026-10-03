# Installation, updates, and development workflows

**Purpose:** Explain Hapsland's stable, published candidate, personal development, and client update lanes for Claude Code, Codex CLI, and Pi.
**Status:** Maintained operational guidance. Commands are implemented; public distribution and host compatibility require their own evidence.
**Authority:** Maintained guidance implementing the user-approved four-lane scope on 2026-10-01. This document is not a release or platform support declaration.
**Expected use:** Choose a lane, register its exact package in a selected client profile, and verify observed review activity.
**Lifecycle:** Keep current with CLI onboarding, publishing, host profiles, and package layout. Review whenever any of those changes; replace superseded instructions in place.

## Stable installation and ordinary use

You can ask your coding agent to handle installation:

> Install Hapsland for my coding agent using https://github.com/dearlordylord/hapsland/blob/master/docs/installation-workflows.md. Let me review and approve the setup changes interactively. Ask me to enter any Jev key in the masked setup prompt, not in chat.

For manual installation after a stable release is published and verified:

```sh
npm install -g --ignore-scripts @hapsland/hapsland
hapsland setup
```

The short command uses npm's configured global prefix and assumes its `bin`
directory is on PATH. npm selects the stable `latest` tag and includes optional
dependencies by default. Keep those dependencies enabled: they supply Hapsland's
exact Node runtime. `--ignore-scripts` skips dependency installation scripts;
the package carries the required prebuilt assets.

Run setup from the Git repository you want reviewed. Select Claude Code, Codex CLI, and/or Pi with arrows and Space, then press Enter. Existing valid registrations are labeled `installed` and checked by default; unchecking a client leaves its hooks intact. Each selected client has its own change preview and confirmation. Escape cancels without writing registrations.

For a specific client, bypass the selector with:

```sh
hapsland setup claude
hapsland setup codex
hapsland setup pi
```

Setup previews the exact owned hooks, asks before installing them, offers masked credential entry when a saved key is missing, loads file settings, and reports offline readiness. It makes no Jev request. All three clients accept the version-1 JSON `--setup` interface; `--pilot --host=claude|codex|pi` invokes the same guided flow (bare `--pilot` opens the same client selector).

The selected profile is user-wide by default. File settings control eligible repositories and files; invoking setup from a repository does not restrict the installed hooks to that repository. Use [configuration](configuration.md) to bound review scope. `--claude-home=PATH`, `--codex-home=PATH`, or `--pi-home=PATH` and the corresponding `--claude-executable=PATH`, `--codex-executable=PATH`, or `--pi-executable=PATH` select the registration and compatibility probe. An alternate registration home alone does not configure the client process to use that home.

Finish current client work, restart the client normally, and complete its native repository/hook trust prompts. Make a supported edit and inspect [session activity](status.md). Installation and offline readiness do not prove a review or model repair happened. Diagnose without a JSON request:

```sh
hapsland doctor              # All registered clients, read-only
hapsland doctor claude       # One client
```

Use an absolute executable path if the prefix's `bin` directory is not on PATH. See the [Claude guide](claude-installation.md) , [Codex guide](codex-installation.md), and [Pi guide](pi-installation.md) for automation, ownership, credentials, and host-specific limits. Saved login uses the native credential store; hooks do not prompt.

Registry latest lookup returned HTTP 404 on 2026-10-01 before these changes. The commands above become usable after publication; this document does not claim an existing registry release. Pi installation targets exact 1.0.0 on Linux arm64; its installed native evidence and limitations are tracked separately in the [Pi guide](pi-installation.md). Current Claude/Codex adapter profiles are Claude 2.1.218 and Codex 0.155.1/0.156.0, with Node 24.20.0 on Linux/macOS arm64. See [installed-release compatibility](installed-release-compatibility.md): its pinned evidence predates current composed delivery and does not establish current interactive or registry-artifact support.

### User-owned prefix alternative

If your global npm prefix requires administrator permissions or `hapsland` is
not on PATH, install into a user-owned prefix and invoke it by its full path:

```sh
npm install --global --prefix "$HOME/.local" --ignore-scripts=true --include=optional @hapsland/hapsland@latest
"$HOME/.local/bin/hapsland" setup
```

Use that full executable path for later commands too, or add `$HOME/.local/bin`
to PATH. The prefix changes where the package is installed; setup still registers
hooks in the selected client profile.

## Client updates and published candidates

Updates stage a package separately and retain the previous installation. An identical immutable registry version or local archive checksum reuses its verified retained package, so an unchanged release does not rewrite hooks or request another restart. They resolve a registry tag to an exact version, install without lifecycle scripts, run package doctor, show the target's hook preview, and ask before applying its digest:

```sh
hapsland update
hapsland update --channel=next
# For a specific client:
hapsland update claude
hapsland update codex
```

With no client argument, update discovers Hapsland registrations in the selected/default Claude and Codex homes. It acquires one target for all registered clients, previews each separately, and asks once before applying all applicable proposals. It does not install integrations for clients without Hapsland. If none are registered, it directs you to setup without downloading anything. Already-current clients need no apply. A conflict or partial result is reported for its client, other applicable updates continue, and the command exits unsuccessfully if any client failed. Results are summarized per client.

The default channel is `latest` (stable). `next` requires a prerelease version; stable selection rejects prereleases. `--version=VERSION` selects an exact version within the selected lane. Candidate publication never updates `latest`. For first installation of a published candidate, install `@hapsland/hapsland@next` into a separate prefix using the [user-owned prefix flags](#user-owned-prefix-alternative), then select it explicitly with `hapsland setup CLIENT --target=/absolute/candidate-prefix/bin/hapsland`. An explicit target takes precedence over the active administrative package.

Local packages use the same activation flow:

```sh
hapsland update claude --tarball=/absolute/candidate.tgz
hapsland update codex --target=/absolute/candidate-prefix/bin/hapsland
```

`--target` skips acquisition and runs the retained target's preview and update. The interactive updater needs a terminal; `--update-preview` and `--update` JSON remain the automation interface. Acquisition reuses a healthy identical snapshot or installs into a fresh directory under `~/.local/share/hapsland/candidates/`; `snapshot.json` records package/version or local archive/checksum identity. The command prints the exact target executable. No package fetch occurs in edit hooks.

Finish current work, restart the client, and review renewed native trust. After a successful switch, `~/.local/share/hapsland/active.json` records the active package. The original public executable routes setup, update, doctor, repair, reinstall, and uninstall to that package; a repeated setup does not silently switch hooks back to the original version. Hook processes and JSON automation remain pinned to their selected package. Use `--target` to choose another package explicitly for update, setup, repair, or reinstall. Do not remove a prefix while registered hooks or active sessions depend on it. A failed acquisition leaves active registration unchanged; a failed activation prints the target's conflict or partial-recovery result. After an approved partial update, the administrative command follows the selected retained package so it can diagnose and resume that target while existing hooks remain as recorded. Run `hapsland repair CLIENT` to preview and resume its interrupted operation. If the journal conflicts with later user edits, use `hapsland reinstall CLIENT` to rebuild from current settings after approval; it backs up the replaced Codex journal. Malformed host JSON/TOML must be corrected before any mutation.

To return to stable from `next`, run `hapsland update --channel=latest` (all installed clients) or `hapsland update CLIENT --channel=latest`. To select a retained local package, use `--target` with that executable. Both paths remain subject to ownership and resident compatibility checks. Offline target-switch tests are not an authenticated downgrade or platform support claim.

## Personal development on your own clients

From the checkout with build prerequisites installed:

```sh
npm run dev-install -- --host=claude
# Or:
npm run dev-install -- --host=codex
```

`dev-install` builds, verifies native assets, packs a local archive, installs it into a fresh candidate prefix, records Git commit/dirty-tree/checksum identity, and launches that package's guided setup. It does not publish. For a profile that already has Hapsland, switch its registration with:

```sh
npm run dev-install -- --host=claude --update
npm run dev-install -- --host=codex --update
```

Before submitting a code change, run the contributor checks separately:

```sh
npm run typecheck
npm test
npm run conformance:client-lifecycle
```

`conformance:client-lifecycle` uses isolated profiles and a local registry fixture to check ordinary update twice, active command routing, repair, reinstall, missing-package fallback, and removal. It performs no Jev or authenticated client work. Package conformance separately checks the production archive.

Pass the matching home/executable flags when using another profile. The script explicitly selects the packed target, bypassing any previously active administrative package. Each run takes a packed snapshot; rebuilding the checkout does not change installed code. Different snapshots may have the same package version and are identified by checksum, commit, and prefix. Retain the printed archive and previous installed package for diagnosis and recovery. `npm link` is unnecessary.

The explicit equivalent is `npm run pack:release`, followed by a production-only npm install of the tarball into a fresh prefix, package doctor, and that target's setup or update. Keep credentials in the native store or selected execution environment. Make a supported edit in a disposable repository, then inspect session activity. These instructions do not authorize a live check on arbitrary private source.

## Publishing

Use the [publishing runbook](npm-publishing.md). `scripts/npm-release-pin.json` owns the reviewed package version, source commit, archive SHA-256, and tag. Stable versions use `latest`; prereleases use `next`. `local-release` rejects mismatches, audits the archive, publishes that exact archive, and verifies the registry download and selected tag. The registry conformance runners select the exact version in the release checkout's manifest.

Changes to packaged code, metadata, or docs require a newly reviewed archive and pin. The retained 0.1.0 pin is historical input and will not match this changed checkout. No publication was performed as part of this implementation. Stable platform advertising still requires exact registry-artifact and authenticated host evidence; passing offline tests alone is insufficient.

## Disablement, removal, and recovery

All bare lifecycle commands have the same scope: installed Claude/Codex profiles in their default or selected homes. Setup offers a selector; doctor checks those profiles; update, repair, reinstall and uninstall act on registered profiles. A client argument limits the operation to that client. Both `--host claude` and `--host=claude` are accepted. Unknown, empty, conflicting and repeated options are rejected before acquisition or mutation.

```sh
hapsland doctor                 # Diagnose without writing
hapsland repair                 # Restore missing hooks in installed profiles
hapsland repair claude          # Restore or resume one integration
hapsland reinstall              # Rebuild marked Hapsland handlers
hapsland uninstall              # Preview and remove installed integrations
hapsland uninstall codex        # Remove one integration
```

Doctor distinguishes no registration from damaged ownership/configuration. Deleting an event, a main/background handler, or Codex's owned hooks-feature entry leaves a damaged integration. Update and repair restore missing entries after a full preview and confirmation. Changed commands or duplicate marked entries remain conflicts under ordinary repair/update. Reinstall replaces marked Hapsland handlers while preserving unmarked handlers, client settings, review configuration, rule packs, saved credentials and native trust. If ownership metadata is damaged, explicit reinstall can replace it. For an interrupted operation from a separately invoked retained package, select that package explicitly with `hapsland repair CLIENT --target=/absolute/retained-prefix/bin/hapsland`. It never guesses how to repair malformed host JSON/TOML and never reconstructs unmarked hooks whose ownership cannot be established.

A supported interrupted Codex operation resumes its journal after approval. Explicit reinstall can replace an unusable journal, keeping a private backup next to it and building from current user files rather than restoring an old whole-file snapshot. The approval binds the current journal as well as configuration changes; later edits require another preview. If the active package is missing or its administrative record is damaged, reinstall falls back to the runnable package in PATH, reports that choice, and reestablishes the active record. Use `hapsland reinstall CLIENT --target=/absolute/healthy-prefix/bin/hapsland` to select another healthy package.

Uninstall previews removal of Hapsland-owned hooks and its owned feature entry. Remove hooks **before** uninstalling any npm package they reference. An already missing owned hook is safe to remove; locally modified entries require explicit reinstall or manual reconciliation first. User settings, credentials, independent hooks and native trust are preserved. Unchecking a client in setup only skips that profile and does not uninstall it.

Set user `excludes` to `["**/*"]` to stop future review dispatch without uninstalling. Requests already sent cannot be recalled. `hapsland --logout` separately removes the saved key.

Remaining work outside this implementation: authenticated candidate-to-stable trials on each advertised client/platform, host upgrade cadence, project-level installation scope, coexistence trials with other hook tools, release account ownership, and how deprecation notices reach installed users. Ordinary tests remain offline; installation itself performs no paid review.
