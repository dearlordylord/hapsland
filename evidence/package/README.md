# Installed package evidence

`clean-linux-node-24.20.0-arm64.json` is the sanitized result of
`npm run conformance:package -- --real-codex --write-evidence`. The runner packs the release,
installs production dependencies into a temporary prefix, runs outside the checkout, and creates
temporary product state, resident state, Codex home, and Git repository. It invokes the installed
CLI from real Codex 0.155.1 while using the controlled offline `DecisionModel`.
The fixture persists the exact hook-definition hash through Codex's native interactive review
flow; it does not use the hook-trust bypass flag. Provider submission and the terminal
`completed-findings` resident outcome are asserted and recorded separately. The terminal record
is correlated to the native host event using its source-free Codex recipient identity.

The record retains package and host versions, source-free stage outcomes, and bounded counts. It
does not retain fixture source, advice, prompts, host output, credentials, or backend responses.
The fixture removes provider credentials from the hook environment, makes no paid Jev request,
does not edit the user's real Codex home, and removes all temporary material after completion.

The ordinary command omits the real Codex arm and does not rewrite evidence. Package installation
can resolve or compile production dependencies; individual hook invocations perform no transient
package download.
