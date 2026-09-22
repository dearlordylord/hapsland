# Installed package evidence

`clean-linux-node-24.20.0-arm64.json` is the sanitized result of
`npm run conformance:package -- --real-codex --write-evidence`. The runner packs the release,
installs production dependencies into a temporary prefix, runs outside the checkout, and creates
temporary product state, resident state, Codex home, and Git repository. It invokes the installed
CLI from real Codex 0.155.1 while using the controlled offline `DecisionModel`.
The fixture starts without seeded repository trust and drives Codex's native repository and hook
review flow; it does not use the hook-trust bypass flag. The PTY reconstructs Codex's rendered
terminal screen and waits for each native trust state instead of searching raw cursor-addressed
output or relying on fixed startup timing. The acceptance run passed twice consecutively with a
fresh Codex home and repository. The retained second run observes one controlled provider
submission separately from one terminal `completed-findings` outcome.

The record retains package and host versions, source-free stage outcomes, and bounded counts. It
does not retain fixture source, advice, prompts, host output, credentials, or backend responses.
The fixture removes provider credentials from the hook environment, makes no paid Jev request,
does not edit the user's real Codex home, and removes all temporary material after completion.

The ordinary command omits the real Codex arm and does not rewrite evidence. Package installation
can resolve or compile production dependencies; individual hook invocations perform no transient
package download.
