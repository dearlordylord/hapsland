# #134 rule and finding decisions

Status: implementation checkpoint, 2026-09-28. Issue: [#134](https://github.com/dearlordylord/hapsland/issues/134).

## Authority and compatibility

`Canonical.step` invokes `RulePolicy.bend` for pack/rule enablement, rule applicability, strict threshold findings, probability/rank/path/ID order, and count budget. The TypeScript rule adapter passes only booleans, bounded integers, and exact binary64 probability words. It does not retain source, rule text, secrets, or Jev responses in Bend state. Native code still parses rule packs, measures glob and built-in semantic matches, validates Jev answers, and executes source and host effects. The rule trace checker asserts unchanged canonical state after each decision sequence.

The direct path supplies the existing type-shape input contract and complete-unit fact before rule selection. The older file review path supplies its existing file contract. Schema-v1 rules do not select a function or unknown input contract. The direct frozen review input retains pack ID/version/digest, rule definition digest, effective threshold and message, rank, and input contract, so identity and stale-result checks remain meaningful. No v2 target capability is claimed; #138 owns the complete cross-file branch integration.

Resident host item/byte fitting was already a canonical collection decision. #134 keeps every qualifying finding available for bounded resident delivery, while routing direct finding rank, standalone direct handoff rank/count, and older per-file/event advice budgets through the new rule decision commands.

## Offline evidence

- `conformance/canonical-rules-v1.json` gives independent source-free expected outputs for disabled/incomplete/incompatible rules, exact and adjacent threshold values, ranking, and budget. `LAWS.bend` and `PROOF.bend` check representative safety claims.
- Direct and older path tests cover no request for a rule-empty input, clear versus finding, strict threshold edge, multiple findings, stable ranking, count budget, and stale rules or input contracts. `rules.test.ts` checks schema-v1 target isolation.
- `server.test.ts` injects a source effect, controlled Jev probabilities, fake clock, and collection response; at-threshold results remain clear and an adjacent-above-threshold result produces a bounded host response. Existing resident tests cover alternate callback completion orders and stale-result retirement.
- `scripts/check-rule-boundary.mjs` checks that the removed TypeScript threshold and compiler applicability owner do not return and that direct, older, and resident callers continue through the canonical adapter.
