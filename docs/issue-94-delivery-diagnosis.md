# Issue #94: Claude finding delivery diagnosis — 2026-09-24

The authenticated Stage A finding run [completed Hapsland review and submitted a classified rule finding](issue-94-host-validation.md), but no later native repair was observed. The offline evidence on this page tests whether feedback reaches a subsequent provider request in the exact cached Claude Code `2.1.218` host. It does not repeat authenticated acceptance or establish that Claude chose to repair.

## Current production offline check

Run `npm run build`, then `node --test evidence/host-94/validation/claude-delivery-fixture.test.mjs` from the repository root. The fixture requires `/home/node/.local/share/claude/versions/2.1.218` and fails if its version differs. Each arm creates a disposable Git repository and isolated Claude profile, writes a temporary user configuration with `claudeFeedbackMode: "block-current-findings"`, enables Hapsland through the compiled CLI, and asks the exact host to perform one native `Write`. The compiled Hapsland CLI, resident, and native hook use the controlled local backend. Provider traffic goes only to the scripted loopback server; there is no authenticated provider or Jev request.

The test runs three independent arms with block opt-in active:

| Arm | Production hook result | Parsed next provider POST | Source-free evidence |
| --- | --- | --- | --- |
| Finding | Hapsland emitted its top-level `decision: "block"` envelope with one current `r6_bare_domain_value` reference and the repair request. The captured CLI stdout and copied buffer passed to host stdout compared equal at 278 bytes. | The user message contained the production rule reference and repair request. | [block](../evidence/host-94/validation/claude-production-block-20260924.json) |
| Clear | Hapsland returned the quiet `{}` response (3 bytes). | No rule reference or repair request appeared. | [clear](../evidence/host-94/validation/claude-production-clear-20260924.json) |
| Notice | A controlled backend failure produced a 217-byte notice-only advisory response. It did not block or ask for repair. | The user message contained the operational notice and no rule reference or repair request. | [notice](../evidence/host-94/validation/claude-production-notice-20260924.json) |

All three arms completed the native edit, ran two provider requests, kept the first request free of the Hapsland rule reference and repair request, and stayed under the 90-second session and 2 MB combined host-output caps. The production line stayed within the 2,048-byte limit. Retained evidence contains only booleans, counts, timing, byte totals, and status. Request bodies, hook output, prompts, synthetic source, and credentials are removed with the temporary directory. The test passed all three arms.

**Inference:** In this controlled loop, Claude Code `2.1.218` placed the production block reason in the next provider request after a successful edit and completed review. The quiet-clear and notice-only controls show that active block opt-in did not block those cases. The loopback provider's canned final response is not a model reaction; no repair was attempted or observed. This evidence says nothing about whether an authenticated Claude session will repair.

## Historical advisory and wrapper-authored controls

The following evidence came from the earlier version of the offline fixture. Those JSON records are retained for historical diagnosis; the current fixture and its test no longer generate the `context`, `plain`, or wrapper-authored `block` variants. In that earlier run, the context wrapper appended a fresh marker to the production advisory context, the plain wrapper emitted only the marker, and the block wrapper replaced the production context with a fixture-authored source-free reason. The clear arm required quiet output.

| Historical arm | Earlier observation | Evidence |
| --- | --- | --- |
| Advisory context | The later user message included the production finding and the earlier “Please repair each finding” wording, plus the fixture marker. | [context](../evidence/host-94/validation/claude-delivery-context.json) |
| Plain stdout | The marker was absent from the next request despite a successful hook exit. | [plain control](../evidence/host-94/validation/claude-delivery-plain.json) |
| Wrapper-authored block | The marker and fixture-authored rule reference appeared, but the production finding text and repair instruction did not. The wrapper, not Hapsland, authored this block object. | [historical block envelope](../evidence/host-94/validation/claude-delivery-block.json) |
| Clear | The production quiet hook result added no advice to the next request. | [historical clear control](../evidence/host-94/validation/claude-delivery-clear.json) |

Those historical controls helped distinguish structured hook output from plain stdout and showed that advisory context reached a provider request in the synthetic loop. The old block arm did **not** test Hapsland's production block mode; use the current production evidence above for that delivery claim.

## Product decision boundary

Claude documents that `PostToolUse` block reasons prompt Claude, while `additionalContext` adds context after tool execution. This is `DOC` / `DOCUMENTED` evidence from the [Claude hooks reference](https://code.claude.com/docs/en/hooks#posttooluse-decision-control), accessed 2026-09-24. Mutable documentation does not establish the pinned `2.1.218` runtime contract or authenticated model behavior.

Hapsland's production block reason and repair request reached the next loopback provider POST. Clear was quiet, and a notice remained advisory with block opt-in active. This is `RUN` / `RUNTIME-TESTED` evidence from the controlled fixture above. It establishes provider-request inclusion, not model interpretation or repair. The acting-finding versus notice distinction is a Hapsland feedback choice; [its contract and evidence status](issue-94-claude-block-proposal.md) record that decision.
