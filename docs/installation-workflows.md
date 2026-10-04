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
directory is on PATH. npm selects the stable `latest` tag. Hapsland includes
Bun 1.3.14 in its standalone executables. `--ignore-scripts` skips dependency installation scripts;
the package carries the required prebuilt assets.

Run setup from the Git repository you want reviewed. Select Claude Code, Codex CLI, and/or Pi with arrows and Space, then press Enter. Existing valid registrations are labeled `installed` and checked by default; unchecking a client leaves its hooks intact. Each selected client has its own change preview and confirmation. Escape cancels without writing registrations.

For a specific client, bypass the selector with:

```sh
hapsland setup claude
hapsland setup codex
hapsland setup pi
```

Setup rechecks credentials on every run: a nonempty `TYPESAFE_API_KEY` takes precedence over saved login; an explicitly configured `credentialEnvVar` selects environment-only authentication. An available key is reused. A missing saved key triggers masked input in an interactive terminal after installation approval. An unavailable or locked store is reported separately with recovery instructions; setup does not validate the key against Jev. Package installation alone does not ask for a key.

Use `hapsland setup codex --new-key` (also supported for Claude and Pi) to skip the existing-key lookup and request a replacement. This requires a terminal and an accessible native store. It does not override environment credential precedence: unset the environment key to use saved login. With an explicit `credentialEnvVar`, set that variable instead. Automation may set `newKey: true` in its version-1 `--setup` JSON request.

Setup previews the exact owned hooks, asks before installing them, offers masked credential entry when a saved key is missing, loads file settings, and reports offline readiness. It makes no Jev request. All three clients accept the version-1 JSON `--setup` interface; `--pilot --host=claude|codex|pi` invokes the same guided flow (bare `--pilot` opens the same client selector).

The selected profile is user-wide by default. File settings control eligible repositories and files; invoking setup from a repository does not restrict the installed hooks to that repository. Use [configuration](configuration.md) to bound review scope. `--claude-home=PATH`, `--codex-home=PATH`, or `--pi-home=PATH` and the corresponding `--claude-executable=PATH`, `--codex-executable=PATH`, or `--pi-executable=PATH` select the registration and compatibility probe. An alternate registration home alone does not configure the client process to use that home.

Finish current client work, restart the client normally, and complete its native repository/hook trust prompts. Make a supported edit and inspect [session activity](status.md). Installation and offline readiness do not prove a review or model repair happened. Diagnose without a JSON request:

```sh
hapsland doctor              # All registered clients, read-only
hapsland doctor claude       # One client
```

Use an absolute executable path if the prefix's `bin` directory is not on PATH. See the [Claude guide](claude-installation.md) , [Codex guide](codex-installation.md), and [Pi guide](pi-installation.md) for automation, ownership, credentials, and host-specific limits. Saved login uses the native credential store; hooks do not prompt.

Registry latest lookup returned HTTP 404 on 2026-10-01 before these changes. The commands above become usable after publication; this document does not claim an existing registry release. Pi installation targets exact 1.0.0 on Linux arm64; its installed native evidence and limitations are tracked separately in the [Pi guide](pi-installation.md). Claude targets 2.1.218. Codex installation checks lifecycle-hook capability rather than a fixed version allowlist; 0.155.1/0.156.0 are historical tested profiles. Hapsland commands now contain Bun 1.3.14; agent runtimes remain separate. The standalone build targets Linux/macOS arm64, with execution validation recorded separately. See [installed-release compatibility](installed-release-compatibility.md): its pinned evidence predates current composed delivery and does not establish current interactive or registry-artifact support.

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
hapsland update pi
```

With no client argument, update discovers Hapsland registrations in the selected/default Claude, Codex, and Pi homes. It acquires one target for all registered clients, previews each separately, and asks once before applying all applicable proposals. It does not install integrations for clients without Hapsland. If none are registered, it directs you to setup without downloading anything. Already-current clients need no apply. A conflict or partial result is reported for its client, other applicable updates continue, and the command exits unsuccessfully if any client failed. Results are summarized per client.

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

### Installing a fixed checkout snapshot

The current `dev-install` command installs a **fixed packaged snapshot**. It is
useful for testing an installation candidate; it does not run hooks from the
changing checkout. Code changes require a new build, archive and activation; unchanged inputs reuse the previous development archive and verified installed snapshot.
Do not present this command as a workflow that immediately picks up source edits.

Builds require exact Bun 1.3.14. With mise installed, select it explicitly:

```sh
mise install bun@1.3.14
mise exec bun@1.3.14 -- npm run dev-install -- --host=claude
# Or:
mise exec bun@1.3.14 -- npm run dev-install -- --host=codex
```

The standalone builder also discovers an already installed mise Bun 1.3.14
when it is absent from PATH. `HAPSLAND_BUILD_BUN=/absolute/path/to/bun` selects
an executable explicitly; its version must still be exactly 1.3.14. Installed
standalone packages embed Bun and do not require users to install it separately.

`dev-install` caches the development archive under `$XDG_CACHE_HOME/hapsland/dev-install` (default `~/.cache/hapsland/dev-install`), separately for each checkout. It compares build owners, shipped files, dependency lockfiles, installed dependency metadata (including linked packages), and the selected toolchain/profile. On a miss it builds the current platform, verifies native assets, packs a local archive and stages a verified candidate. On a hit it skips build and pack and reuses the verified installed candidate; a missing candidate is reinstalled from the cached archive. Missing or corrupt archives rebuild. Cache reuse does not depend on `dist` remaining in the checkout. Setup still runs every time, including `--new-key`. Unshipped documentation, tests, project configuration and Quint files do not invalidate it. Simultaneous dev-installs in one checkout are serialized by an exclusive build lock; changed inputs during assembly abort instead of caching mixed sources. Development archives contain standalone commands for the current platform; ordinary `npm run build` still builds Linux and macOS. The script records Git commit/dirty-tree/checksum identity and launches the package's guided setup. It does not publish. Use the same command for first installation and subsequent source updates: guided setup previews and replaces healthy owned hooks with the newly built target, preserving unrelated hooks. `--update` is optional: it selects the dedicated update flow instead of guided setup, rather than making repeated installation possible. To choose that flow explicitly:

```sh
mise exec bun@1.3.14 -- npm run dev-install -- --host=claude --update
mise exec bun@1.3.14 -- npm run dev-install -- --host=codex --update
```

To request a replacement key during development installation:

```sh
mise exec bun@1.3.14 -- npm run dev-install -- --host=codex --new-key
```

`--new-key` cannot be combined with `--update`, which does not run guided credential entry. If native storage is unavailable, set `TYPESAFE_API_KEY` securely in the terminal before normal setup, then start the agent from that same environment. Hapsland does not save this environment key.

Before submitting a code change, run the contributor checks separately:

```sh
npm run typecheck
npm test
npm run conformance:client-lifecycle
```

`conformance:client-lifecycle` uses isolated profiles and a local registry fixture to check ordinary update twice, active command routing, repair, reinstall, missing-package fallback, and removal. It performs no Jev or authenticated client work. Package conformance separately checks the production archive.

Pass the matching home/executable flags when using another profile. The script explicitly selects the packed target, bypassing any previously active administrative package. Each run takes a packed snapshot; rebuilding the checkout does not change installed code. Different snapshots may have the same package version and are identified by checksum, commit, and prefix. Retain the printed archive and previous installed package for diagnosis and recovery. `npm link` is unnecessary.

The explicit equivalent is `npm run pack:release`, followed by a production-only npm install of the tarball into a fresh prefix, package doctor, and that target's setup or update. Keep credentials in the native store or selected execution environment. Make a supported edit in a disposable repository, then inspect session activity. These instructions do not authorize a live check on arbitrary private source.

### Source changes and repeated installation

The accepted personal development workflow uses compiled snapshots. After
changing source, rerun the same `dev-install` command above and approve its
preview, then finish current agent work and restart the agent as directed.
The script performs the build, packing and activation; no manual tarball
handling or npm publication is required. Repeated setup preserves unrelated
hooks and replaces the owned registration rather than appending duplicates.
Modified owned hooks or malformed configuration can still require repair;
repeatability does not authorize overwriting user changes.

Hooks execute the installed snapshot until the next successful activation.
Direct source execution or a watch-mode resident is not required for this
workflow and is not offered by the current installer.

## Publishing

Use the [publishing runbook](npm-publishing.md). `scripts/npm-release-pin.json` owns the reviewed package version, source commit, archive SHA-256, and tag. Stable versions use `latest`; prereleases use `next`. `local-release` rejects mismatches, audits the archive, publishes that exact archive, and verifies the registry download and selected tag. The registry conformance runners select the exact version in the release checkout's manifest.

Changes to packaged code, metadata, or docs require a newly reviewed archive and pin. The retained 0.1.0 pin is historical input and will not match this changed checkout. No publication was performed as part of this implementation. Stable platform advertising still requires exact registry-artifact and authenticated host evidence; passing offline tests alone is insufficient.

## Disablement, removal, and recovery

All bare lifecycle commands have the same scope: installed Claude Code, Codex CLI, and Pi profiles in their default or selected homes. Setup offers a selector; doctor checks those profiles; update, repair, reinstall and uninstall act on registered profiles. A client argument limits the operation to that client. Both `--host claude` and `--host=claude` are accepted. Unknown, empty, conflicting and repeated options are rejected before acquisition or mutation.

```sh
hapsland doctor                 # Diagnose without writing
hapsland repair                 # Restore missing hooks in installed profiles
hapsland repair claude          # Restore or resume one integration
hapsland reinstall              # Rebuild marked Hapsland handlers
hapsland uninstall              # Preview and remove installed integrations
hapsland uninstall codex        # Remove one integration
```

Doctor distinguishes no registration from damaged ownership/configuration. Deleting an event, a main/background handler, Codex's owned hooks-feature entry, or Pi's owned extension leaves a damaged integration. Update and repair restore missing entries after a full preview and confirmation. Changed commands or duplicate marked entries remain conflicts under ordinary repair/update. Reinstall replaces marked Hapsland handlers while preserving unmarked handlers, client settings, review configuration, rule packs, saved credentials and native trust. If ownership metadata is damaged, explicit reinstall can replace it. For an interrupted operation from a separately invoked retained package, select that package explicitly with `hapsland repair CLIENT --target=/absolute/retained-prefix/bin/hapsland`. It never guesses how to repair malformed host JSON/TOML and never reconstructs unmarked hooks whose ownership cannot be established.

A supported interrupted Codex operation resumes its journal after approval. Explicit reinstall can replace an unusable journal, keeping a private backup next to it and building from current user files rather than restoring an old whole-file snapshot. The approval binds the current journal as well as configuration changes; later edits require another preview. If the active package is missing or its administrative record is damaged, reinstall falls back to the runnable package in PATH, reports that choice, and reestablishes the active record. Use `hapsland reinstall CLIENT --target=/absolute/healthy-prefix/bin/hapsland` to select another healthy package.

Uninstall previews removal of Hapsland-owned hooks and its owned feature entry. Remove hooks **before** uninstalling any npm package they reference. An already missing owned hook is safe to remove; locally modified entries require explicit reinstall or manual reconciliation first. User settings, credentials, independent hooks and native trust are preserved. Unchecking a client in setup only skips that profile and does not uninstall it.

Set user `excludes` to `["**/*"]` to stop future review dispatch without uninstalling. Requests already sent cannot be recalled. `hapsland --logout` separately removes the saved key.

Remaining work outside this implementation: authenticated candidate-to-stable trials on each advertised client/platform, host upgrade cadence, project-level installation scope, coexistence trials with other hook tools, release account ownership, and how deprecation notices reach installed users. Ordinary tests remain offline; installation itself performs no paid review.

Pre-release path rename: review configuration/state now use the XDG `hapsland`
directories, and host ownership files use `.hapsland` inside the selected agent
home. Old paths are not fallback configuration sources. If an older pre-release
is already registered, uninstall it using its retained executable before installing
the new build; this avoids leaving hooks whose old ownership record is outside the
new namespace. Move any desired user configuration explicitly. Native credential
store service/account identity remains unchanged, so the directory rename does
not rename the stored secret itself.
