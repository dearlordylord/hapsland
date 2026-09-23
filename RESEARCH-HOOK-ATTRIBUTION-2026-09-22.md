# Hook attribution and overlapping writers — focused recheck

**Date:** 2026-09-22. **Status:** advisory evidence for the onboarding decision;
not a new product requirement. User-requested read-only recheck, with a subagent
assigned Abide and the primary agent checking Codex/current product contracts.
No new host run, paid request, installation or production-code change occurred.

## Conclusion and correction

Codex hooks identify the originating session, turn, tool invocation and, when
applicable, child agent. The product already preserves those fields. It would be
incorrect to justify a blanket no-parallel-agent restriction by claiming attribution
is absent from hooks.

What is not established is that complete source read from disk after an event still
belongs to that event under an intervening overwrite. Event identity, reviewed input
origin, currentness at delivery and actual recipient visibility are separate claims.
The present controlled-writer restriction is a boundary of the selected complete-
declaration capture design and its current normative specification.

## Evidence ledger

| ID | Proposition | Source class / verification | Source and limit |
| --- | --- | --- | --- |
| H1 | Codex PostToolUse contains session_id, turn_id, tool_use_id and optional agent_id/agent_type, together with tool input/response | SRC / SOURCE-INSPECTED | Pinned [schema](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/hooks/src/schema.rs#L320-L342); identity is not an atomic filesystem snapshot |
| H2 | Two concurrent sessions had different session IDs; a real child patch carried parent session ID plus child agent_id | RUN / prior RUNTIME-TESTED | [Retained Codex 0.155.1 Linux arm64 probe](https://github.com/dearlordylord/jevs/blob/532a155a84a14ec53516d030a11e06a5bbf8e821/experiments/change-attribution/VERDICT.md), evidence A2/A4; fake hook, not paid child-delivery validation |
| H3 | Codex supplies apply_patch input as command text; its tool response is the output text, not a structured complete resulting-file identity contract | SRC / SOURCE-INSPECTED | [Patch hook adapter](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/core/src/tools/handlers/apply_patch.rs#L478-L495), [output representation](https://github.com/openai/codex/blob/be2951ea34f0d295ed0becf97079f92fa5f6950e/codex-rs/core/src/tools/context.rs#L283-L315); Add may carry complete new-file text, Update usually carries partial hunks |
| H4 | Product adapter preserves agent/session/turn/tool identity; capture subsequently reads disk; Add selects declarations, Update maps unique added lines | SRC / SOURCE-INSPECTED | [adapter](./src/direct-event/adapter.ts), [pipeline](./src/direct-event/pipeline.ts), [capture](./src/direct-event/capture.ts); stable reads and matching lines do not prove ownership of all context |
| H5 | Current normative direct-event spec explicitly requires controlled-writer conditions for exact semantic-input association and excludes invisible overwrites | DOC / DOCUMENTED | [Direct-event review specification](https://github.com/dearlordylord/jevs/issues/42), Selection/capture/attribution; current [supported profile](./docs/direct-event-v1-supported-profile.md) |
| A1 | Abide Codex direct review parses hook patch text, with null original/after full-file content | SRC / SOURCE-INSPECTED | [diff.ts](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/diff.ts#L150-L166); intervening disk writes cannot change this captured patch input |
| A2 | Abide emits direct feedback after evaluation without a final file-freshness comparison | SRC / SOURCE-INSPECTED; stale-output consequence INFERRED | [postToolUse.ts](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/postToolUse.ts#L162-L170); event-owned input is not necessarily current at delivery |
| A3 | Abide Stop compares a baseline with current root state rather than a per-writer history | SRC / SOURCE-INSPECTED | [stop.ts](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/hooks/stop.ts#L72-L94); unrelated writers' changes can enter candidates |
| A4 | Abide state is keyed by session and prompt/turn, and its hook schema does not preserve agent_id | SRC / SOURCE-INSPECTED | [schema](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/schema/src/hooks.ts), [session](https://github.com/coldteadotai/abide/blob/f2683828965ced03da07abae811e78af0383040c/packages/cli/src/lib/session.ts); no proof of independent child tenancy |
| A5 | Prior offline X/Y fixture listed both writers' files in each distinct Abide session's Stop candidates | RUN / prior RUNTIME-TESTED | [Retained research](https://github.com/dearlordylord/jevs/blob/5e365f6/PRODUCT-RESEARCH-ADVISORY-2026-09-21-ABIDE-ATTRIBUTION-TENANCY.md), section 8; no API key, paid verdict, or actual agent feedback delivery in that fixture |

The official [Codex common hook fields](https://learn.chatgpt.com/docs/hooks#common-input-fields)
also document parent-session identity for child hooks (DOC/DOCUMENTED, accessed
2026-09-22). The retained live probe, not documentation alone, establishes the
observed child agent field at the selected host version.

## Concrete distinction

Suppose X changes one field in a declaration. Before capture, Y changes another
field in the same declaration. The X hook still identifies X and contains X's patch.
But a later complete-declaration read includes Y's contribution. A judgment about
the combined declaration cannot automatically be described as a judgment of X's
exact resulting version. Two stable reads only establish that this combined version
was stable while read.

Abide reviews X's hook patch instead, avoiding that substitution for direct Codex
patch review. It accepts a different limitation: the patch can already be obsolete
when advice returns. Its root-wide Stop review has the separate candidate-mixing
problem. These are different trade-offs, not evidence that Abide solved concurrent
complete-file ownership.

The product revalidates relevant input before publication, suppressing changed or
superseded work it can observe. That does not retrospectively identify a writer who
changed the file before initial capture. Child identity preservation also does not
establish model-visible delivery to a live or completed child; that remains a
separate conformance gap.

## Implication for the onboarding map

- **BORROW:** Abide's use of event-owned patch evidence where that input is sufficient.
  For this product, switching from complete declaration/context to patch-only review
  changes the review-input contract; it is not a drop-in installer fix.
- **BORROW:** Codex's session/child/tool identity at the adapter boundary, as already
  implemented. Parallel agents alone do not imply missing recipient identity.
- **REJECT:** root membership as authorship, session-only child identity, or lack of
  a freshness check as proof of current advice.
- **DEPEND ON:** no new component is proposed by this check.

Keep checkpoint reconciliation outside onboarding. Do not reopen the broad question
of whether Codex provides agent identity: it is answered. The remaining narrow
question is whether onboarding retains the current same-artifact-overwrite limit,
or whether a separately specified event-content association improvement is needed.
No blanket ban on subagents is established by these findings, and no runtime
restriction has been removed by this report.

The user has accepted interactive and headless Codex on Linux and macOS. The
[onboarding draft](./PRODUCT-ONBOARDING-SPEC-DRAFT.md) records that scope and leaves
the controlled-writer onboarding condition explicitly unresolved.
