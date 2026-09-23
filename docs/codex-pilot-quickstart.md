# Codex pilot quickstart

`review-tool` is the provisional command for this named, opt-in pilot. The product has no public
name yet; Jev is the external review backend. Keeping the existing command avoids changing the
installed hook and ownership fingerprints during this small pilot. A later public name can be
chosen with an explicit migration.

Use a declared profile: Codex CLI 0.155.1 on Linux arm64 or Codex CLI 0.156.0 on macOS arm64.
The installed command selects its own Node 24.20.0 runtime; the shell's Node version does not
select the review runtime. Keep npm optional dependencies enabled so the platform runtime is
installed, even when lifecycle scripts are disabled. See [exact compatibility](./installed-release-compatibility.md)
for the pinned installed-release gate and its limits. The later [macOS real-Jev pilot result](../evidence/codex-pilot/macos-arm64-independent-positive-demo-2026-09-23.json)
is recorded separately. Obtain the pilot package archive and its SHA-256 checksum through the pilot
distribution channel, and verify that checksum before installation. The retained macOS pilot archive
built from commit `97ea38f` has SHA-256
`b08536b98540a5e0890324afc516b9321bc81a2e67ac2205e4f9fe1dfecded69`; a different archive
needs its own verified checksum. This repository does not publish one to a registry.
The archive carries native helpers and parser bindings for the declared profiles. Installation does not compile code
or run a package lifecycle script. Building the release archive requires platform build hosts.

1. Check the archive against its supplied SHA-256 checksum (`shasum -a 256` on macOS,
   `sha256sum` on Linux). Install the verified archive for your user with a user-writable npm global
   prefix, then enter the Git repository you want to review:

   ```sh
   npm install --global --ignore-scripts=true ./realtime-review-prototype-0.0.0.tgz
   cd /path/to/your/repository
   review-tool --pilot
   ```

2. The guide checks Codex and Node, shows the exact owned Codex configuration changes, and asks
   before installation. It then asks for a Jev key with terminal echo off if a saved key is
   missing. Key storage makes no Jev call and does not mean review is ready. The guide shows
   the canonical repository root, destination, and eligible-source scope and asks separately
   before enabling source transmission. Decline either approval to stop; rerun `--pilot` to
   resume. No repository is enabled by package installation alone.

3. Start Codex normally in that repository. Complete Codex sign-in and its native repository and
   exact hook trust prompts. The guide's offline doctor check reports what it can observe and
   leaves native trust unknown until observed in Codex. After trust, make an ordinary supported
   TypeScript edit and inspect review activity using the [status guide](./status.md). A saved key
   or successful install is not evidence that a review ran.

The guide uses the default Codex profile and user state; no `CODEX_HOME`, `REVIEW_*`, or `PATH`
exports are needed. For an alternate profile, pass `--codex-home=/absolute/path` or
`--codex-executable=/absolute/path` to `--pilot`. Headless callers use the versioned JSON
[`--setup` operation](./codex-installation.md#primary-setup-flow) and explicit credential stdin.
`review-tool --login --json` keeps machine output even at a terminal.

To stop future dispatch in this repository, run its explicit disable operation:

```sh
printf '%s\n' "{\"version\":1,\"operation\":\"disable\",\"cwd\":\"$PWD\"}" | review-tool --disable
```

`review-tool --logout` deletes only the saved key and preserves repository grants. An active
environment credential still takes precedence. To remove the installed hook, use the scoped
uninstall preview and digest confirmation in the [lifecycle guide](./codex-installation.md).
Disabling, logging out, and uninstalling are separate actions. Requests already sent cannot be
recalled.
