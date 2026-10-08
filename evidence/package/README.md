# Installed package evidence

**Audience:** Build and release maintainers; contributors investigating installed-package behavior.

The [installed release acceptance record](installed-release-acceptance.md) retains the historical outcome narrative extracted from the support declaration.

`clean-linux-node-24.20.0-arm64.json` is the sanitized result of
`npm run conformance:package -- --secret-service --real-codex --write-evidence`. The runner packs the release,
installs production dependencies into a temporary prefix, runs outside the checkout, and creates
temporary product state, resident state, Codex home, and Git repository. It invokes the installed
CLI from real Codex 0.155.1 while using the controlled offline `DecisionModel`.
The fixture uses the packaged public preview and install operations in a custom quoted Codex
home, repeats installation to prove idempotence, and retains an independent hook before, during,
and after scoped uninstall. It enables a canonical repository with matching-digest consent,
verifies disable prevents a later controlled provider dispatch, and re-enables it for the native
host run. The installed CLI also reports submitted activity with model reaction unavailable,
then a separately gated installed-hook event transitions from `pending` to `restarted/lost`
after its resident is terminated. Installation itself records no source-egress grant.
The fixture starts without seeded repository trust and drives Codex's native repository and hook
review flow; it does not use the hook-trust bypass flag. The PTY reconstructs Codex's rendered
terminal screen and waits for each native trust state instead of searching raw cursor-addressed
output or relying on fixed startup timing. The acceptance run passed twice consecutively with a
fresh Codex home and repository. The retained second run observes one controlled provider
submission separately from one terminal `completed-findings` outcome.
The same real-host run observes the independent hook twice. Scoped uninstall preserves that hook,
the user setting needed by it, native trust state, rules, credentials, and repository grants.

The record retains package and host versions, source-free stage outcomes, and bounded counts. It
does not retain fixture source, advice, prompts, host output, credentials, or backend responses.
The fixture removes provider credentials from the hook environment, makes no paid Jev request,
does not edit the user's real Codex home, and removes all temporary material after completion.

The ordinary command omits the real Codex arm and does not rewrite evidence. Package installation
can resolve or compile production dependencies; individual hook invocations perform no transient
package download.

`clean-darwin-node-24.20.0-arm64.json` is the sanitized result of GitHub Actions run
35790230309 at commit `627169235725661bf603ec9163298de5d21f25f9` on macOS 14 arm64. In addition to the installed CLI, parser,
descriptor-anchored capture, portable resident dispatch, controlled offline submission, and
advice-return path, the runner used an isolated default Keychain plus a second Keychain containing
the same service/account. It proved that lookup, replacement, and logout affected only the selected
default Keychain. It stored and resolved the generic password in a separate process, waited for the
old resident process and owner lifetime to end, then required a replacement PID and lifetime before
the second controlled submission. It reached the production resolver/provider boundary twice,
preserved the credential through the local package update, and blocked a future provider dispatch
after logout. A native ACL-restricted lookup
returned `timed-out` after the 750 ms helper deadline (`980 ms` including CLI startup and
shutdown), proving bounded helper termination with no credential value retained. A timeout alone
does not establish whether macOS attempted or presented interaction. The exact result is recorded
rather than relabelled as a locked Keychain.

`clean-darwin-node-24.20.0-arm64-real-codex-0.156.0.json` records the local authenticated
Codex CLI 0.156.0 run on macOS arm64. It completed the native repository and exact hook trust
review without a bypass, observed the independent hook twice, captured and analyzed the native
absolute-path Add event, made one controlled offline submission, and correlated one completed
finding to the host session. Credential lifecycle was skipped in this run; the separate
macOS installed-package evidence above records the isolated Keychain lifecycle. No paid Jev call
was made, and the retained host record contains no source, advice, prompts, credentials, or
backend responses.

The cross-platform release declaration is maintained separately in
[`../../docs/installed-release-compatibility.md`](../../docs/installed-release-compatibility.md)
and machine-readable
[`../../conformance/installed-release-v1.json`](../../conformance/installed-release-v1.json).
Those files checksum the retained lifecycle and authenticated-host evidence separately. The
legacy inconclusive Linux installed first-review result was followed by the conclusive
record described in the [pinned acceptance record](installed-release-acceptance.md).
