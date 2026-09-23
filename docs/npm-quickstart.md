# Codex registry release 0.1.0

**Draft notice:** The package and commands below describe a superseded local
candidate. The selected release coordinates are `@jevs/jevs@0.1.0` and `jevs`;
this guide will be revised when that artifact exists. No npm release is published.

This guide applies only after `realtime-review@0.1.0` is published and its exact
registry tarball passes the release record. Jevs is the review integration;
Jev is its external review backend. Installation alone does not enable source
transmission.

Supported profiles are Codex CLI 0.155.1 on Linux arm64 and Codex CLI 0.156.0 on
macOS arm64. The package selects Node 24.20.0 through its required platform
optional dependency. Keep optional dependencies enabled, including when npm
lifecycle scripts are disabled. Other Codex, OS, and architecture combinations
are untested. Shared-root overlapping invisible writes remain unattributed.

1. Set a user-writable npm prefix and install the exact version:

   ```sh
   npm config set prefix "$HOME/.local"
   npm install --global --ignore-scripts=true --include=optional realtime-review@0.1.0
   "$HOME/.local/bin/realtime-review" --help
   ```

   Ensure `~/.local/bin` is on `PATH` if you want to omit the full command path.
   Check the registry tarball SHA-256 against the [release record](https://github.com/dearlordylord/jevs/blob/master/docs/npm-release-record.md)
   before using it. A matching version string alone is insufficient provenance.

2. Enter the Git repository you want reviewed and run `realtime-review --pilot`
   in your terminal. The guide previews the exact Codex changes, asks for the
   Jev key with terminal echo off, and separately asks for repository scope and
   source-transmission consent. Stop at any prompt and rerun to resume.

3. Start Codex normally. Complete Codex sign-in and native trust prompts, make
   a supported TypeScript edit, and inspect `realtime-review --doctor` and
   [review activity](./status.md). The offline doctor makes no Jev request;
   installed, trusted, enabled, and observed review are distinct states.

The JSON setup, update, disable, and scoped uninstall operations are documented
in the [installation guide](./codex-installation.md). `review-tool` remains an
alias in this release. Existing pilot hooks keep their ownership marker,
installation record, consent grants, and saved native credential identity.

## Moving from a pilot archive

Keep the pilot package installed while installing `realtime-review@0.1.0` into
a **different user-writable npm prefix**; both packages expose the `review-tool`
alias, so installing them into one prefix can collide. Use the new prefix's
`realtime-review` executable to preview and perform the explicit update from
the pilot installation. The preview must identify the old and new packaged
runtime, owned hook changes, and any Codex trust or restart step. Recheck
offline doctor and an observed offline review before removing the old pilot
package from its prefix. Do not delete or replace the Codex ownership record,
consent directory, or native credential item. If update is partial, use its
reported recovery command while keeping the old package available.

If a released version fails, disable review for the affected repository and
keep the installed package and user state for recovery. Install the known-good
version into a separate prefix, preview and explicitly update to it, then
recheck trust and offline review. Deprecation or distribution changes are
recorded in the [release record](https://github.com/dearlordylord/jevs/blob/master/docs/npm-release-record.md).
