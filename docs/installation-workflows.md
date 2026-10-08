# Installation, updates, and development workflows

**Purpose:** Explain Hapsland's stable, published candidate, personal development, and client update lanes for Claude Code, Codex CLI, and Pi.
**Status:** Maintained operational guidance. Commands are implemented; public distribution and host compatibility require their own evidence.
**Authority:** Maintained guidance implementing the user-approved four-lane scope on 2026-10-01. This document is not a release or platform support declaration.
**Expected use:** Choose a lane, register its exact package in a selected client profile, and verify observed review activity.
**Lifecycle:** Keep current with CLI onboarding, publishing, host profiles, and package layout. Review whenever any of those changes; replace superseded instructions in place.

See the [generated command reference](#command-reference) for help and examples.

## Choose your installation path

The public npm package returned **404 on 2026-10-06** when checked with
`npm view @hapsland/hapsland version`. The published commands below require a
release; they are not currently a working first-install path.

| What you have | Start here |
| --- | --- |
| A source checkout, before publication | [Build and install a local snapshot](#install-before-publication) |
| A published stable package | [Stable installation](#stable-installation-and-ordinary-use) |
| An installed Hapsland integration | [Update it](#client-updates-and-published-candidates) |
| A failure during setup or review | [Troubleshooting](#setup-troubleshooting) |

### Before setup

You need Git, your coding agent installed and runnable, and a Git repository for
checking review readiness. Installed Hapsland executables include their runtime
and need neither Node nor Bun on PATH. Building from source requires the development tools listed below.

| Agent | Setup choice | Compatibility requirement |
| --- | --- | --- |
| Claude Code | `claude` | Claude Code 2.1.218 |
| Codex CLI | `codex` | Lifecycle-hook capability; setup probes your executable |
| Pi | `pi` | Pi 1.0.0 on Linux arm64 |
| OpenCode | Unavailable | [Current integration limitation](opencode-installation.md) |

Standalone build targets are macOS arm64 and Linux arm64. Builds and offline
checks do not establish current native client support; see the
[compatibility evidence](installed-release-compatibility.md).

Setup installs hooks for a **user profile across repositories**. Running it in a
repository does not limit installation to that repository. Before your first
agent edit, choose what source can leave your machine. For example, create or
merge this into `.hapsland.jsonc` at the repository root:

```jsonc
{
  "version": 1,
  "includes": ["src/**"]
}
```

Preserve existing settings. This selects files in this repository, not other
repositories. To turn review off across repositories, use user exclusions as
explained in [file selection](configuration.md). With credentials and no file
settings, all otherwise eligible files are selected.

A Jev key comes from [TypeSafe](https://console.typesafe.ai/keys), separately from
your coding agent subscription. Enter it only in the masked terminal prompt.
Without a key you can install hooks, but Jev review cannot run. The optional key
check may use paid credits and sends a built-in greeting, not project code.
[Cloudflare setup](review-providers.md) uses different credentials.

### Install before publication

For a local source build, install Git, Node.js 24.20.0, npm, mise, the Bend
toolchain and a C compiler first. Select Node 24.20.0 for the commands below;
this development prerequisite does not apply to installed Hapsland executables.
macOS needs Xcode Command Line Tools; Linux additionally needs `pkg-config` and libsecret development
files. Turbo compiles the Bend producer from authored sources with the
manifest-pinned Bend and Lean tools. On Linux, `node scripts/install-bend-toolchain.mjs` installs the
repository's pinned toolchain; follow its printed PATH instructions. That
installer has no macOS target, so macOS currently requires an independently
installed Bend compiler. `npm run docs:install` skips Bend installation outside
GitHub Actions; it does not satisfy this prerequisite locally.

If you do not already have the checkout:

```sh
git clone https://github.com/dearlordylord/hapsland.git
cd hapsland
```

From the checkout root:

```sh
mise install node@24.20.0 bun@1.3.14
mise exec node@24.20.0 bun@1.3.14 -- bun install
mise exec node@24.20.0 bun@1.3.14 -- npm run dev-install -- --host=codex
# Choose --host=claude or --host=pi instead for those agents.
```

The last command builds, packs and stages a local snapshot, prints its exact
executable path, then opens guided setup. Keep that path: a local candidate is
not a global `hapsland` installation. Use the printed executable for doctor,
updates and removal if `hapsland` is not on PATH. Run it from the repository you
want reviewed when checking readiness. The hooks retain that packaged executable
and do not need the checkout on PATH.

Rerun `dev-install` after source changes to activate a new snapshot. See
[personal development](#personal-development-on-your-own-clients) for cache,
credential and update details.

## Stable installation and ordinary use

You can ask your coding agent to handle installation:

<!-- agent-setup-instruction:start -->

> Install Hapsland for my coding agent using https://github.com/dearlordylord/hapsland/blob/master/docs/installation-workflows.md. Let me review and approve the setup changes interactively. Ask me to enter any Jev key in the masked setup prompt, not in chat.

<!-- agent-setup-instruction:end -->

For manual installation after a stable release is published and verified:

```sh
npm install -g --ignore-scripts @hapsland/hapsland
hapsland setup
```

The short command uses npm's configured global prefix and assumes its `bin`
directory is on PATH. npm selects the stable `latest` tag. Hapsland includes
Bun 1.3.14 in its standalone executables. `--ignore-scripts` skips dependency installation scripts;
the package carries the required prebuilt assets.

Run setup from the Git repository you want reviewed. The first dialog focuses Continue. Use arrows to move and Space to toggle Claude Code, Codex CLI, Pi or Select All; Enter submits the focused action. Continue with an empty selection shows a warning and stays in the dialog. Existing valid registrations are labeled `installed` and checked by default; unchecking a client leaves its hooks intact. Each selected client has its own change preview and confirmation, and default-rule changes require separate approval.

Escape exits the initial selection dialog and means Back on menus offering Back. Returning to selection preserves the selected agents. Back and Exit do not undo completed or partial changes; durable results explain what happened. Hidden-input cancellation exits the conversation rather than navigating Back. Write confirmation requires a complete affirmative line and defaults to declining; changing a preview requires fresh approval. See the [interaction inventory and replay diagrams](cli-interactions/README.md) for each workflow.

For a specific client, bypass the selector with:

```sh
hapsland setup claude
hapsland setup codex
hapsland setup pi
```

Setup rechecks credentials on every run: environment and file credentials take precedence over saved login; an explicitly configured `credentialEnvVar` selects environment-only authentication. An available key is reused. A missing saved key triggers masked input in an interactive terminal after installation approval. An unavailable or locked store is reported separately with recovery instructions; local setup checks do not validate the key against Jev. Guided terminal setup then offers a separate optional live key check. Package installation alone does not ask for a key.

Use `hapsland setup codex --new-key` (also available for Claude and Pi) to skip the existing-key lookup and request a replacement. This requires a terminal and a validated selected destination. It does not change environment/file/native lookup precedence. Automation may set `newKey: true` in its version-1 `--setup` JSON request.

Setup previews the exact owned hooks, asks before installing them, offers masked credential entry when a saved key is missing, loads file settings, and reports offline readiness. Its installation and local checks make no Jev request; the optional key check runs only after separate confirmation. All three clients accept the version-1 JSON `--setup` interface; `--pilot --host=claude|codex|pi` invokes the same guided flow (bare `--pilot` opens the same client selector).

The terminal explains that the key must come from TypeSafe, links to [the key dashboard](https://console.typesafe.ai/keys), and explains hidden input and the reviewed storage destination. It shows the selected environment variable, credential file path, or native store, with instructions to replace that source. `--new-key` selects a reviewed file/native save destination; setup reports the effective source independently.

After credential setup and before the final agent-start instructions, Jev users may approve one sample request to `https://api.typesafe.ai/v1/systemone`. The check sends only a built-in greeting and one Noul question through the Effect Decision integration, may use paid credits, has no retries, and stops after 15 seconds. It reports successful authorization, rejected key, denied access, rate limiting, or an incomplete check without displaying the key or raw provider response. Declining leaves key validity unverified. The key is saved before verification; network, timeout, rate-limit, balance or service failures keep it available for later reviews and only emit a warning, without a setup-restart instruction. Definite authorization rejection offers immediate masked replacement for saved login, or an immediate recheck after the user edits the selected credential file. Each additional request requires confirmation, with at most three checks in one guided flow. Environment keys must be changed in the agent launch environment. Cloudflare users are told that the Jev check does not apply. JSON `--setup`, `doctor`, and login remain offline. A successful key check does not establish that agent hooks executed or reviewed a project edit.

### Unattended setup

`hapsland setup --help` generates the accepted options and values from the command
definition. `--no-input` suppresses prompts and previews; `--apply` separately
authorizes the validated changes. Without a terminal, explicit client, review and
credential choices are required, and no selection, confirmation or credential
prompt is attempted.

<!-- unattended-setup-commands:start -->

```sh
hapsland setup codex --no-input --review enabled --credential environment --json
hapsland setup codex --no-input --review enabled --credential environment --apply --json
hapsland setup codex --no-input --review enabled --credential saved --save-plan setup-plan.json --json
hapsland setup --no-input --apply-plan setup-plan.json --json
```

<!-- unattended-setup-commands:end -->

Preview leaves hooks, rule files and configuration unchanged. `--save-plan` writes
only the explicitly requested plan file, preserving an existing plan. A saved plan
binds client choices and current installation/default-rule digests; its application
revalidates them and rejects stale plans before selected writes. This frontend uses
the same version-one structured `--setup` engine. Its `rulesProposalDigest`
authorizes creation and activation of editable defaults separately from
`installProposalDigest`; prompt suppression grants neither authorization.

Environment and saved credential resolution use the existing sources. There is
no API-key argument, replacement-key prompt or paid verification in unattended
setup. Conflicts and partial installation remain explicit, and unrelated hooks
are preserved. Results are JSON with version, status, stages, actions and
zero provider calls. Exit codes are 0 for completed selected setup, 3 unsupported,
4 conflict or stale plan, 5 partial, and 6 missing inputs or remaining user action.
An installed integration still needs native trust and an ordinary observed review;
unknown trust/readiness can therefore return 6 after installation succeeds.

Setup shows the effective rule inventory once per guided invocation, including
when several clients are selected. See [editable and custom rules](configuration.md#declarative-rules)
for their paths, eligibility and management commands.

<!-- shipped-rules:start -->

Authorized initial setup enables 7 individual editable default files only when no configuration layer declares `rules`.

<!-- shipped-rules:end -->

An explicit selection, including `rules: []`, is preserved; setup
does not enable unselected defaults. Repeat setup preserves authored content. A missing rule file is reported rather than silently recreated.
Creating a custom rule also enables it, and its preview states that activation
before interactive writes. Merely saving a rule file does not activate it.

The selected profile is user-wide by default. File settings control repositories and files; invoking setup from a repository does not restrict the installed hooks to that repository. Use [configuration](configuration.md) to bound review scope. `--claude-home=PATH`, `--codex-home=PATH`, or `--pi-home=PATH` and the corresponding `--claude-executable=PATH`, `--codex-executable=PATH`, or `--pi-executable=PATH` select the registration and compatibility probe. An alternate registration home alone does not configure the client process to use that home.

Finish current client work, restart the client normally, and complete its native repository/hook trust prompts. Enable [inspection recording](status.md#opt-in-local-inspection), make a new supported
agent edit, then run `hapsland dashboard` and open its printed URL. Installation and offline readiness do not prove a review or model repair happened. Diagnose without a JSON request:

```sh
hapsland doctor              # All registered clients, read-only
hapsland doctor claude       # One client
```

### Reading doctor and installer results

Successful agent and packaged-component probes are silent in guided setup. Installation refusal reports the concrete missing executable, lifecycle-hook capability, or damaged/mismatched Hapsland package component. Hapsland supplies its packaged runtime; these probes do not ask users to install a separate runtime.

User-facing doctor and lifecycle output uses plain ASCII markers: `[OK]` for the
stated successful check or change, `[WARN]` for partial or unknown readiness,
`[FAIL]` for failure, and `[INFO]` for information or a skipped operation. The
labels work without terminal colors or Unicode. An installed hook is not evidence
of a real review: setup keeps restart, native trust and first-review actions visible.

`hapsland-doctor` prints a readable package report by default, including when its
output is redirected. Use `hapsland-doctor --json` for the existing version-1
machine report; internal package installers and conformance checks pass this flag
explicitly. Package doctor checks the packaged runtime and local dependencies;
it does not establish agent setup, credential validity or real-review success.
`hapsland doctor CLIENT` checks the installed integration and reports any unknown
native trust separately. Versioned JSON requests such as `hapsland --doctor`,
`--setup` and `--status` retain their JSON contracts; hooks and IPC do not receive
human markers. Human status output remains available with `--status-human`.

A successful package report starts with:

```text
[OK] Package doctor: package checks passed.
```

An installed integration can still end setup with:

```text
[OK] Installation: the owned Codex integration was installed.
[WARN] Setup: offline readiness: unknown.
[INFO] Next: restart Codex, complete native repository and hook trust, then make an ordinary supported edit and inspect review activity. A real review was not verified by setup.
```

Use an absolute executable path if the prefix's `bin` directory is not on PATH. See the [Claude guide](claude-installation.md) , [Codex guide](codex-installation.md), and [Pi guide](pi-installation.md) for automation, ownership, credentials, and host-specific limits. Guided saving defaults to the user credential file; hooks do not prompt.

Registry lookup returned HTTP 404 on 2026-10-06; no public package was available at that check. The commands above become usable after publication; this document does not claim an existing registry release. Pi installation targets exact 1.0.0 on Linux arm64; its installed native evidence and limitations are tracked separately in the [Pi guide](pi-installation.md). Claude targets 2.1.218. Codex installation checks lifecycle-hook capability rather than a fixed version allowlist; 0.155.1/0.156.0 are historical tested profiles. Hapsland commands contain Bun 1.3.14; agent runtimes remain separate. The standalone build targets Linux/macOS arm64, with execution validation recorded separately. See [installed-release compatibility](installed-release-compatibility.md): its pinned evidence predates current composed delivery and does not establish current interactive or registry-artifact support.

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

## Setup troubleshooting

| What you see | What to do |
| --- | --- |
| npm reports `E404` | Use the [local checkout path](#install-before-publication) until publication. |
| A source `npm pack` archive is stale or missing executables | Check `npm config get ignore-scripts`. Run `npm run pack:release` to build explicitly; plain `npm pack` skips its build when that setting is true. Installed packages still use `--ignore-scripts`. |
| npm reports a permissions error, or `hapsland` is missing | Use a [user-owned prefix](#user-owned-prefix-alternative); for a local candidate, use its printed executable path. |
| Setup requires a terminal | Run guided setup in your own terminal. For automation, use [explicit unattended choices](#unattended-setup); suppressing prompts alone does not authorize installation. |
| Agent executable missing or unsupported | Install the agent, check its version and PATH, or pass the matching `--CLIENT-executable=/absolute/path` option. Check the compatibility table above. |
| Credential store locked or unavailable | Unlock the login keyring/Keychain, or use an ignored, owner-only credential file as described in [credential lookup](#personal-development-on-your-own-clients). |
| A new saved key is not active | Environment and file keys take precedence. Replace the source shown by setup; `--new-key` changes saved login only. |
| Hooks installed, readiness still `unknown` | Finish current work, restart the agent, complete native trust prompts, make a supported edit, then use the [opt-in inspection dashboard](status.md#opt-in-local-inspection). |
| No feedback after an edit | Run `hapsland doctor CLIENT` from that repository; check credentials, file scope, rules and supported syntax. Silence does not mean a review passed. |
| Changed hooks or an interrupted install | Run doctor, then [repair or reinstall](#disablement-removal-and-recovery) after reviewing the proposed changes. |

Use the full candidate executable path in place of `hapsland` for a local install.
`hapsland-doctor` checks the package; `hapsland doctor CLIENT` checks agent setup.
Neither proves a review ran. Do not remove an installed prefix before removing
its registered hooks.

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

### Iterating on the inspection page

Run `npm run dev:inspection` from the repository root for the inspection dashboard
served from the current checkout. Browser pages reload when
`packages/administration/src/inspection/page.ts` changes; this workflow reads the existing local journal
and requires no package rebuild or hook update. See the
[inspection guide](status.md#opt-in-local-inspection) for port selection and limits.

<!-- inspection-recording:start -->

Recording is off by default: add `"sessionInspection": true` into your project's `.hapsland.jsonc` using the [configuration template](examples/session-inspection.jsonc), then make a new edit. Neither dashboard enables recording or backfills old edits; retained history can remain visible after recording is turned off.

<!-- inspection-recording:end -->

For bundled production, run `hapsland dashboard`: its page comes from the
installed package. Use the fixed-snapshot workflow below when you want to update
that bundled page or test changed runtime and hook behavior.

### Installing a fixed checkout snapshot

The current `dev-install` command installs a **fixed packaged snapshot**. It is
useful for testing an installation candidate; it does not run hooks from the
changing checkout. Code changes require an ordinary build, freshly packed archive and activation. Every preparation invokes the ordinary build and fresh validation; Turbo may reuse individual build tasks. Identical archive bytes may reuse a verified installed snapshot.
Do not present this command as a workflow that immediately picks up source edits.

Source development uses Node 24.20.0 and exact Bun 1.3.14. With mise installed,
select both explicitly:

```sh
mise install node@24.20.0 bun@1.3.14
mise exec node@24.20.0 bun@1.3.14 -- npm run dev-install -- --host=claude
# Or:
mise exec node@24.20.0 bun@1.3.14 -- npm run dev-install -- --host=codex
```

The standalone builder also discovers an already installed mise Bun 1.3.14
when it is absent from PATH. `HAPSLAND_BUILD_BUN=/absolute/path/to/bun` selects
an executable explicitly; its version must still be exactly 1.3.14. Installed
standalone packages embed Bun and do not require users to install it separately.

`dev-install` invokes the ordinary build, validates the selected native profile, and packs an archive on every run. Turbo owns build-task reuse and output restoration. Completed archives are retained by SHA-256 under the shared Git artifact store; retained bytes never skip build, validation or packing. Preparation holds the checkout build lease through packing and rejects changed source, dependency or runtime-output evidence. Native outputs generated on this host belong to their declared producers; retained foreign binaries and parser bindings remain inputs. Development builds select the current platform; release preparation explicitly builds and validates both supported profiles. Setup still runs every time, including `--new-key`. The script stages a verified installed candidate, records Git commit/dirty-tree/checksum identity, and launches the package's guided setup. It does not publish. Use the same command for first installation and subsequent source updates: guided setup previews and replaces healthy owned hooks with the newly built target, preserving unrelated hooks. `--update` selects the dedicated update flow instead of guided setup. To choose that flow explicitly:

```sh
mise exec node@24.20.0 bun@1.3.14 -- npm run dev-install -- --host=claude --update
mise exec node@24.20.0 bun@1.3.14 -- npm run dev-install -- --host=codex --update
```

To request a replacement key during development installation:

```sh
mise exec node@24.20.0 bun@1.3.14 -- npm run dev-install -- --host=codex --new-key
```

<!-- credential-policy:start -->

Guided login, setup and `--new-key` use these reviewed save destinations:

- **Every project on this machine — default:** $XDG_CONFIG_HOME/hapsland/.env (normally ~/.config/hapsland/.env). Local plaintext file; user scope.
- **This project only:** repository-root .env.local. Local plaintext file; project scope.
- **Native credential store:** macOS Keychain or Linux Secret Service. Platform credential store; user scope.

The exact validated target and current selected source are shown before hidden key entry. Saving requires a separate full-line `y` confirmation with a declining default. Back discards entered key material; cancellation preserves the previous credential before saving. A changed proposal requires fresh entry and approval. Project saving requires an untracked, Git-ignored `.env.local`; Hapsland does not change ignore rules. Files are written with owner-only permissions using atomic replacement, preserving unrelated dotenv entries. Stored and effective credential sources are reported separately.

Lookup order: environment variable `TYPESAFE_API_KEY` → repository-root .env.local → repository-root .env → $XDG_CONFIG_HOME/hapsland/.env (normally ~/.config/hapsland/.env) → macOS Keychain or Linux Secret Service. An explicitly present environment value, including an empty one, stops lookup. Missing/empty file fields continue; unreadable, symlinked, nonregular or oversized files stop with a safe diagnostic. Explicit configured references allow environment/files and prohibit native fallback, including when they name the built-in variable. Callers without repository scope retain environment/native-only lookup. Captured hook inputs remain authoritative. Saving never changes lookup precedence and grants no paid-verification consent.

`hapsland --login --credential-stdin` retains its explicit direct native-save automation contract without dialogs. `hapsland --logout` removes only the native saved item; it does not delete file credentials. Keys never enter models, traces, diagnostics or review configuration. Development setup uses the same flow against the reviewed repository and configured user directory; rebuild/update/activation preserves credentials and never copies them into snapshots, caches, archives or worktrees.

<!-- credential-policy:end -->

`--new-key` cannot be combined with `--update`, which does not run guided credential entry.

Before submitting a code change, run the contributor checks separately:

```sh
npm run typecheck
npm test
npm run conformance:client-lifecycle
```

`conformance:client-lifecycle` uses isolated profiles and a local registry fixture to check ordinary update twice, active command routing, repair, reinstall, missing-package fallback, and removal. It performs no Jev or authenticated client work. Package conformance separately checks the production archive.

Pass the matching home/executable flags when using another profile. The script explicitly selects the packed target, bypassing any previously active administrative package. Each run takes a packed snapshot; rebuilding the checkout does not change installed code. Different snapshots may have the same package version and are identified by checksum, commit, and prefix. Retain the printed archive and previous installed package for diagnosis and recovery. `npm link` is unnecessary.

The explicit equivalent is `npm run pack:release`, followed by a production-only npm install of the tarball into a fresh prefix, package doctor, and that target's setup or update. Keep credentials in the native store or selected execution environment. Edit a type or function in a disposable repository, then inspect session activity. These instructions do not authorize a live check on arbitrary private source.

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

Doctor distinguishes no registration from damaged ownership/configuration. Deleting an event, a main/background handler, Codex's owned hooks-feature entry, or Pi's owned extension leaves a damaged integration. Update and repair restore missing entries after a full preview and confirmation. Changed commands or duplicate marked entries remain conflicts under ordinary repair/update. Reinstall replaces marked Hapsland handlers while preserving unmarked handlers, client settings, review configuration, rule files, saved credentials and native trust. If ownership metadata is damaged, explicit reinstall can replace it. For an interrupted operation from a separately invoked retained package, select that package explicitly with `hapsland repair CLIENT --target=/absolute/retained-prefix/bin/hapsland`. It never guesses how to repair malformed host JSON/TOML and never reconstructs unmarked hooks whose ownership cannot be established.

An interrupted Codex operation with a resumable journal resumes after approval. Explicit reinstall can replace an unusable journal, keeping a private backup next to it and building from current user files rather than restoring an old whole-file snapshot. The approval binds the current journal as well as configuration changes; later edits require another preview. If the active package is missing or its administrative record is damaged, reinstall falls back to the runnable package in PATH, reports that choice, and reestablishes the active record. Use `hapsland reinstall CLIENT --target=/absolute/healthy-prefix/bin/hapsland` to select another healthy package.

Uninstall previews removal of Hapsland-owned hooks and its owned feature entry. Remove hooks **before** uninstalling any npm package they reference. An already missing owned hook is safe to remove; locally modified entries require explicit reinstall or manual reconciliation first. User settings, credentials, independent hooks and native trust are preserved. Unchecking a client in setup only skips that profile and does not uninstall it.

To disable review without uninstalling, set user `excludes` to `["**/*"]`; see
[edit-owned settings](review-contract-compatibility.md#edit-owned-settings) for
when saved settings take effect. Requests already sent cannot be recalled. `hapsland --logout`
separately removes the saved key.

Remaining work outside this implementation: authenticated candidate-to-stable trials on each advertised client/platform, host upgrade cadence, project-level installation scope, coexistence trials with other hook tools, release account ownership, and how deprecation notices reach installed users. Ordinary tests remain offline; installation itself performs no paid review.

Configuration and state use the XDG `hapsland` directories. Host ownership files
use `.hapsland` inside the selected agent home.


<!-- cli-reference:start -->

## Command reference

This reference is generated from the command and flag definitions that supply terminal help. Use `hapsland COMMAND --help` for flags, client choices and examples.

Run `hapsland --version` alone to identify the invoked package version. This does not read stdin or start a workflow. Lifecycle commands may route to a retained active package; the version is not a freshness or compatibility check.

### Human commands

| Command | Purpose |
|---|---|
| `dashboard` | Serve the local inspection dashboard in the foreground |
| `setup` | Set up review integrations interactively or with an explicit unattended plan |
| `update` | Preview and confirm updates to registered integrations |
| `doctor` | Inspect installed integrations offline (read-only) |
| `repair` | Restore missing owned Hapsland hooks |
| `reinstall` | Replace marked Hapsland hooks, preserving user settings |
| `uninstall` | Remove owned Hapsland hooks from registered integrations |
| `rules` | Inspect, manage and test local JSON rules. Only check sends code to the classifier; other actions make no classifier calls. Defaults to list. Edit rule JSON files in your editor. |

#### hapsland dashboard

Serve retained local inspection at a private URL printed to stdout. Runs in the foreground until interrupted; does not enable recording. Use a loopback address. See docs/status.md for recording and dashboard controls.

```sh
hapsland dashboard --host 127.0.0.1 --port 0
```

#### hapsland setup

Without CLIENT, a terminal opens the client selector; an explicit client selects one profile. Guided setup previews changes and asks before installing. Unattended setup requires explicit client, review and credential choices (unless applying a saved plan); --no-input suppresses prompts, while --apply separately authorizes changes. Local setup is offline; guided setup may offer a separately confirmed paid key check.

```sh
hapsland setup
hapsland setup claude
hapsland setup codex
hapsland setup pi
hapsland setup codex --no-input --review enabled --credential environment --json
hapsland setup codex --no-input --review enabled --credential environment --apply --json
hapsland setup codex --no-input --review enabled --credential saved --save-plan setup-plan.json --json
hapsland setup --no-input --apply-plan setup-plan.json --json
```

#### hapsland update

Without CLIENT, updates registered profiles. Requires a terminal and confirmation. The registry channel defaults to latest; --version selects a release within a channel. --target and --tarball cannot be combined with other release selectors. For automation, use version-one --update-preview / --update JSON requests instead of this interactive command.

```sh
hapsland update
hapsland update claude --channel latest
hapsland update codex --channel latest
hapsland update pi --channel latest
```

#### hapsland doctor

Without CLIENT, checks registered profiles. Reports local configuration, credentials and installation readiness; native trust and actual review execution remain unverified. Human output does not require a terminal. For structured output, use a version-one --doctor JSON request. Package prerequisites are checked separately by hapsland-doctor.

```sh
hapsland doctor
hapsland doctor claude
hapsland doctor codex
hapsland doctor pi
```

#### hapsland repair

Without CLIENT, repairs registered profiles. Requires a terminal; previews and asks before applying. Changed or conflicting entries are not replaced by repair; use reinstall for marked Hapsland entries. Keeps unrelated hooks. For unattended workflows, use the documented version-one installation requests.

```sh
hapsland repair claude
hapsland repair codex
hapsland repair pi
```

#### hapsland reinstall

Without CLIENT, reinstalls registered profiles. Requires a terminal; previews and asks before applying. Replaces only marked Hapsland entries and preserves unrelated hooks and user settings. For unattended workflows, use the documented version-one installation requests with reinstall enabled.

```sh
hapsland reinstall claude
hapsland reinstall codex
hapsland reinstall pi
```

#### hapsland uninstall

Without CLIENT, uninstalls registered profiles. Requires a terminal; previews and asks before removal. Preserves unrelated hooks and leaves the package installed. For automation, use a version-one --uninstall JSON request.

```sh
hapsland uninstall claude
hapsland uninstall codex
hapsland uninstall pi
```

#### hapsland rules

Inspect, manage and test local JSON rules. Only check sends code to the classifier; other actions make no classifier calls. Defaults to list. Edit rule JSON files in your editor.

```sh
hapsland rules list
hapsland rules show --id meaningless_combinations
hapsland rules explain --id meaningless_combinations --path src/example.ts
hapsland rules check --path src/example.ts --line 12 --id meaningless_combinations
hapsland rules create --id no-primitive-obsession --scope project
hapsland rules connect --path .hapsland/rules/custom/no-primitive-obsession.jsonc --scope project
hapsland rules enable --id no-primitive-obsession --scope project
hapsland rules disable --id no-primitive-obsession --scope project
```

### Flag-based operations

These retain their version-one input/output contracts. Operations described as JSON requests read one request from stdin; a subcommand is not required. `--json` selects credential login/logout output, while JSON-stdin operations already return structured output. `--human` applies to status. Check exit status before parsing results.

| Operation | Aliases | Input and behavior |
|---|---|---|
| `--feedback-preview` | — | Print synthetic agent feedback; no stdin, writes or review request |
| `--inspect-credentials` | `--credentials` | Read version-one credentials JSON from stdin; report credential sources without secrets; no Jev call |
| `--status` | `--inspect-consent` | Read version-one status JSON from stdin; report session activity as JSON (or --human); no review request |
| `--explain` | `--config-explain` | Read version-one explain JSON from stdin; report effective path/configuration policy as JSON; no review request |
| `--doctor` | — | Read version-one doctor JSON from stdin; inspect an installed integration offline and return JSON |
| `--install-preview` | — | Read version-one installation JSON from stdin; preview owned hook changes without applying them; return JSON |
| `--install` | — | Read version-one installation JSON from stdin; apply changes authorized by proposalDigest; return JSON |
| `--update-preview` | — | Read version-one update JSON from stdin; preview installed hook changes without applying them; return JSON |
| `--update` | — | Read version-one update JSON from stdin; apply changes authorized by proposalDigest; return JSON |
| `--uninstall` | — | Read version-one uninstall JSON from stdin; remove owned hooks under the request's authorization; return JSON |
| `--evaluation-plan` | — | Read version-one evaluation plan JSON from stdin; describe the evaluation without live calls; return JSON |
| `--evaluation-run` | — | Read version-one evaluation run JSON from stdin; run the requested evaluation; live calls require --evaluation-live and explicit live authorization |
| `--evaluation-report` | — | Read version-one evaluation report JSON from stdin; format the supplied evidence as JSON |
| `--setup` | — | Read version-one setup JSON from stdin; preview/apply only the request's authorized stages; interactive requests may prompt for credentials; return JSON |
| `--demo` | — | Read version-one demo JSON from stdin; preview/cancel a first review or execute its explicitly authorized live selection |
| `--login` | — | Save a Jev key in native storage using a masked terminal prompt; --json selects structured output; no Jev call |
| `--logout` | — | Remove native saved login; environment/file credentials remain separate; --json selects structured output; no Jev call |
| `--pilot` | — | Guided terminal setup; optional CLIENT or --host selects one runtime, otherwise opens the client selector |

```sh
hapsland setup
hapsland --status < request.json
hapsland --explain < request.json
hapsland --install-preview < request.json
hapsland --login
hapsland --version
```

### Package and worker entry points

#### hapsland-hook

Native hook RPC client. Uses read-only runtime inputs and the resident transport; unrelated arguments return quietly.

Usage: `hapsland-hook [native hook flags]`. Use `--help`/`-h` or `--version` alone for information before any stdin or state handling.

#### hapsland-doctor

Inspect local package prerequisites; no Jev request. Human output is the default, including when redirected. Use --json for the version-one report. For installed agent checks, use hapsland doctor CLIENT.

Usage: `hapsland-doctor [--json]`. Use `--help`/`-h` or `--version` alone for information before any stdin or state handling.

#### hapsland-parser

Internal source-analysis worker. Read one JSON object with string path and source fields from stdin and write the analysis as JSON. No review request. --demo-validate validates the existing demo in the current directory without reading stdin.

Usage: `hapsland-parser < request.json`. Use `--help`/`-h` or `--version` alone for information before any stdin or state handling.

#### hapsland-resident

Internal review worker, normally started by Hapsland hooks. RUNTIME_DIRECTORY is required; normal startup creates private state and listens on its socket until idle shutdown or a signal. This is not the inspection dashboard. Use hapsland dashboard for inspection.

Usage: `hapsland-resident RUNTIME_DIRECTORY`. Use `--help`/`-h` or `--version` alone for information before any stdin or state handling.

<!-- cli-reference:end -->
