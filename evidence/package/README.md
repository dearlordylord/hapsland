# Installed package evidence

`clean-linux-node-24.20.0-arm64.json` is the sanitized result of
`npm run conformance:package -- --secret-service --real-codex --write-evidence`. The runner packs the release,
installs production dependencies into a temporary prefix, runs outside the checkout, and creates
temporary product state, resident state, Codex home, and Git repository. It invokes the installed
CLI from real Codex 0.155.1 while using the controlled offline `DecisionModel`.
The fixture uses the packaged public preview and install operations in a custom quoted Codex
home, repeats installation to prove idempotence, and retains an independent hook before, during,
and after scoped uninstall. It enables a canonical repository with matching-digest consent,
verifies disable prevents a later controlled provider dispatch, and re-enables it for the native
host run. Installation itself records no source-egress grant.
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

Issue 64 adds `clean-darwin-node-24.20.0-arm64.json` from the branch-scoped macOS 14 runner.
It passed the installed CLI, parser, descriptor-anchored capture, portable resident dispatch,
controlled offline submission, and advice-return path. The repository had no Actions secret for
isolated Codex authentication, so the real-host macOS cell remains unverified and must not be
inferred from the controlled package path.
