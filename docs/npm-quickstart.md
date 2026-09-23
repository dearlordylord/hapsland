# Install Jevs for Codex

This guide applies after `@jevs/jevs@0.1.0` is published and the exact registry
artifact passes the [release record](https://github.com/dearlordylord/jevs/blob/master/docs/npm-release-record.md).
Jevs is the product; Jev is its external review backend. Installing the package
does not authorize source transmission.

The first supported profiles are Codex CLI 0.155.1 on Linux arm64 and Codex CLI
0.156.0 on macOS arm64. The package selects its own Node 24.20.0 runtime. Keep
optional dependencies enabled, even with lifecycle scripts disabled. Other
profiles are untested. Overlapping invisible writes in a shared root remain
unattributed.

1. Compare the registry tarball SHA-256 with the value in the release record:

   ```sh
   npm view @jevs/jevs@0.1.0 dist.tarball
   curl -fsSL "$(npm view @jevs/jevs@0.1.0 dist.tarball)" | shasum -a 256
   ```

   The registry digest must match the recorded release artifact. The record also
   identifies the reviewed source commit and platform evidence.

2. Install the exact version into a user-writable prefix, without install scripts:

   ```sh
   npm install --global --prefix "$HOME/.local" --ignore-scripts=true --include=optional @jevs/jevs@0.1.0
   "$HOME/.local/bin/jevs-doctor"
   ```

   Add `~/.local/bin` to `PATH` if you want to omit the full executable path.
   Doctor is offline and reports missing runtime, parser, helper, or platform
   requirements without reading project source.

3. In the Git repository you want reviewed, run
   `"$HOME/.local/bin/jevs" --pilot` in your terminal. Jevs previews the exact
   Codex changes, accepts a Jev key through masked terminal entry, and asks
   separately for the canonical repository and eligible-source consent. You can
   stop and resume without enabling review.

4. Start Codex normally and complete its repository and exact-hook trust prompts.
   Make a supported TypeScript edit, then inspect readiness and observed review
   activity with the [status guide](./status.md). An installed package or saved
   key alone does not prove that review ran.

The [installation guide](./codex-installation.md) has the JSON setup, explicit
update, disable, logout, and scoped uninstall operations. A separate, opt-in
synthetic demo can show a live Jev finding and Codex repair after its own source
consent; it has request, source, and time limits.

## Move from the pilot archive

The old archive installed `realtime-review-prototype` and exposed `review-tool`.
The public package exposes only `jevs` and `jevs-*` commands. Keep the pilot
package in place while installing `@jevs/jevs@0.1.0`; their command names do not
collide. Use the new `jevs` executable to preview and explicitly apply the update
from the pilot hook. The preview identifies both package versions, the owned hook
change, and any Codex trust or restart step. Jevs keeps the existing ownership
record, repository grants, and saved native credential identity. Recheck doctor
and an observed review before removing the pilot package. If update is partial,
use its reported recovery command while the pilot package is still installed.

## Recovery

Disable review for the affected repository to stop future dispatch if a release
fails. Keep the installed package and user state while diagnosing it. For the
first public version, there is no older registry release: the maintainer will
deprecate the affected version, pause installation guidance, and publish a
verified patch such as `0.1.1`. Use explicit update to move to that version;
logout and scoped uninstall remain separate operations. Already sent Jev
requests cannot be recalled.
