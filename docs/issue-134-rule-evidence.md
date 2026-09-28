# #134 rule and finding decisions

**Purpose:** Record the implementation boundary and validation evidence for #134.
**Status:** Integrated #134 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #134 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #134 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

Status: implementation checkpoint, 2026-09-28. Issue: [#134](https://github.com/dearlordylord/hapsland/issues/134).

## Authority and compatibility

`Canonical.step` invokes `RulePolicy.bend` for pack/rule enablement, rule applicability, strict threshold findings, probability/rank/path/ID order, and count budget. The TypeScript rule adapter passes only booleans, bounded integers, and exact binary64 probability words. It rejects nonfinite, negative, and above-one word pairs; Bend also treats invalid words as omitted findings or equal rank. It does not retain source, rule text, secrets, or Jev responses in Bend state. Native code still parses rule packs, measures glob and built-in semantic matches, validates Jev answers, and executes source and host effects. The rule trace checker asserts unchanged canonical state after each decision sequence.

The direct path supplies the existing type-shape input contract and complete-unit fact before rule selection. The older file review path supplies its existing file contract. Schema-v1 rules do not select a function or unknown input contract. The direct frozen review input retains pack ID/version/digest, rule definition digest, effective threshold and message, rank, and input contract, so identity and stale-result checks remain meaningful. No v2 target capability is claimed; #138 owns the complete cross-file branch integration.

Resident host item/byte fitting was already a canonical collection decision. #134 keeps every qualifying finding available for bounded resident delivery, routes direct finding rank through the new rule decision commands, and preserves standalone direct handoff of all revalidated findings. Older per-file/event advice budgets use the new rule decision commands.

## Offline evidence

- `conformance/canonical-rules-v1.json` gives independent source-free expected outputs for disabled/incomplete/incompatible rules, exact and adjacent threshold values, ranking, and budget. `LAWS.bend` and `PROOF.bend` check representative safety claims.
- Direct and older path tests cover no request for a rule-empty input, clear versus finding, strict threshold edge, multiple findings, stable ranking, count budget, and stale rules or input contracts. `rules.test.ts` checks schema-v1 target isolation.
- `server.test.ts` injects a source effect, controlled Jev probabilities, fake clock, collection response, and host write/ack/finalize transitions; at-threshold results remain clear and an adjacent-above-threshold result produces a bounded host response. Existing resident tests cover alternate callback completion orders and stale-result retirement.
- `scripts/check-rule-boundary.mjs` checks that the removed TypeScript threshold and compiler applicability owner do not return and that direct, older, and resident callers continue through the canonical adapter.
