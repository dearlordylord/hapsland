# Install Hapsland for Codex

**Audience:** End users consulting historical installation guidance; build and release maintainers.

This guide applies after `@hapsland/hapsland@0.1.0` is published and the exact registry
artifact is verified against a release record. The [local preflight](./npm-0.1.0-preflight.md)
does not establish that registry verification.
Hapsland is the product; Jev is its external review backend. Installing the package
does not authorize source transmission.

The first supported profiles are Codex CLI 0.155.1 on Linux arm64 and Codex CLI
0.156.0 on macOS arm64. The package selects its own Node 24.20.0 runtime. Keep
optional dependencies enabled, even with lifecycle scripts disabled. Other
profiles are untested. Overlapping invisible writes in a shared root remain
unattributed.

1. Compare the registry tarball SHA-256 with the value in the release record:

   ```sh
   npm view @hapsland/hapsland@0.1.0 dist.tarball
   curl -fsSL "$(npm view @hapsland/hapsland@0.1.0 dist.tarball)" | shasum -a 256
   ```

   The registry digest must match the recorded release artifact. The record also
   identifies the reviewed source commit and platform evidence.

2. Install the exact version into a user-writable prefix, without install scripts:

   ```sh
   npm install --global --prefix "$HOME/.local" --ignore-scripts=true --include=optional @hapsland/hapsland@0.1.0
   "$HOME/.local/bin/hapsland-doctor"
   ```

   Add `~/.local/bin` to `PATH` if you want to omit the full executable path.
   Doctor is offline and reports missing runtime, parser, helper, or platform
   requirements without reading project source.

3. In the Git repository you want reviewed, run
   `"$HOME/.local/bin/hapsland" --pilot` in your terminal. Hapsland previews the exact
   Codex changes and accepts a Jev key through masked terminal entry. Effective
   file settings select otherwise eligible files by default. You can stop and resume setup.

4. Start Codex normally and complete its repository and exact-hook trust prompts.
   Make a supported TypeScript edit, then inspect readiness and observed review
   activity with the [status guide](../../docs/status.md). An installed package or saved
   key alone does not prove that review ran.

The [installation guide](../../docs/codex-installation.md) has the JSON setup, explicit
update, file-selection disablement, logout, and scoped uninstall operations. A
separate, opt-in synthetic demo has request, source, and time limits.

## Move from the pilot archive

The old archive installed `realtime-review-prototype` and exposed `review-tool`.
The public package exposes only `hapsland` and `hapsland-*` commands. Keep the pilot
package in place while installing `@hapsland/hapsland@0.1.0`; their command names do not
collide. Use the new `hapsland` executable to preview and explicitly apply the update
from the pilot hook. The preview identifies both package versions, the owned hook
change, and any Codex trust or restart step. Hapsland keeps the existing ownership
record, old grant files, and saved native credential identity. Recheck doctor
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
