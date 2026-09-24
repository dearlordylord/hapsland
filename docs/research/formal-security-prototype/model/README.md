# Bounded Hapsland authorization model

This is a throwaway model of the proposed draft contract in
[`FORMAL-SECURITY-VERIFICATION-CONTRACT.md`](../../FORMAL-SECURITY-VERIFICATION-CONTRACT.md),
not evidence that the Hapsland implementation conforms. It models the Codex direct-event
resident route at the authorization level. The single atomic `dispatchAttempt` action is
the authority read and provider handoff; a completed `configureStrict` or `revoke` action
before it must be respected. It does not claim cancellation of changes racing after that
point.

## Finite domain

- Repositories: IDs 0 and 1. Consent is per repository.
- Jobs: IDs 0 and 1. One can be queued while the other is active.
- Paths: 0 initially eligible and 1 excluded in each repository. Revision 1 excludes
  both. Physical containment and aliases are concrete fixture obligations.
- Fragments: 0 root, 1 reachable reference, 2 unrelated. A supported prepared job
  authorizes exactly `{0, 1}`. Parser, graph closure, and exact bytes are concrete
  fixture obligations.
- Destination: 0 approved Jev endpoint, 1 wrong endpoint.
- Credential: present or removed. Consent: granted or revoked per repository.
- Effect journal: finite set of `SourceRead`, `ProviderSend`, and `MetadataWrite`
  records. Each records the identity and authority snapshot used at that effect.
  The phase bounds each job to one send per cycle; restart discards queued jobs.

`secRead`, `secFragments`, `secFailClosed`, `secWire`, `secAuthority`, and `secSinks`
inspect the journal. `security` conjoins them. SEC-INGRESS and SEC-GATE are not model
invariants: they require host-admission and verification-runner observations. The model
also omits payload serialization, local output byte schemas, error text, OS capture,
file replacement, redirects, parser behavior, and arbitrary external config races.
These need the production harness and independent fixtures in the verification contract.

## Reproduce

Quint CLI `0.32.0` was used. From the repository root:

```sh
quint typecheck docs/research/formal-security-prototype/model/security_test.qnt
quint test docs/research/formal-security-prototype/model/security_test.qnt --main security_test --match '.*Test' --seed 424242
quint run docs/research/formal-security-prototype/model/security.qnt --main security --invariants secRead secFragments secFailClosed secWire secAuthority secSinks --witnesses sentWitness deniedWitness --max-steps 20 --max-samples 200 --seed 424242 --verbosity 1
quint run docs/research/formal-security-prototype/model/security.qnt --main security --step replayStep --invariant security --witnesses sentWitness deniedWitness --max-steps 12 --max-samples 200 --seed 424242 --mbt --n-traces 200 --out-itf /tmp/hapsland-security-replay-{seq}.itf.json --verbosity 1
```

On 2026-09-24, typecheck passed and all eight explicit tests passed. The 200 seeded,
20-step sampled traces found no invariant violation. `deniedWitness` appeared in 13
traces and `sentWitness` in 0; `successfulDispatchTest` supplies a deterministic positive
send witness. Sampling is not exhaustive finite-state checking or an inductive proof.
The default simulation rarely reaches grant → observe → prepare → enqueue → dispatch
within 20 random steps. A separate `replayStep` run uses only named zero-argument
actions and reached `sentWitness` in 16 of 200 traces and `deniedWitness` in 45 of
200 traces. ITF trace 10 showed `grantRepo0 → observeAllowedRepo0Job0 → prepareJob0
→ enqueueJob0 → dispatchJob0`, and trace 5 showed `... → configureStrict →
dispatchJob0` with a denied job. Both were among the 200 traces checked without
an invariant violation. This run used non-default `--step replayStep` and is still
sampled exploration. `--mbt` ITF metadata was also inspected: named zero-argument
wrappers such as `prepareJob0` appear in `mbt::actionTaken`, while parameterized
actions expose their bare names and empty `mbt::nondetPicks`. A connector must reject
unmapped actions and cannot infer arguments from `actionTaken` alone.

For a single positive replay trace, use `--step replayStep --max-steps 12
--max-samples 1 --seed 13 --mbt --n-traces 1`: `sentWitness` was reached in
1/1 trace, and the ITF actions included `observeAllowedRepo0Job0`,
`prepareJob0`, `grantRepo0`, `enqueueJob0`, and `dispatchJob0` before the
subsequent restrictive update. This uses the non-default `replayStep` action.

## Isolated model mutation

To check invariant sensitivity, a copy of `security.qnt` at
`/tmp/hapsland-security-model-mutation/security.qnt` had only the
`eligible(st.policyRev, j.path)` conjunct removed from `canDispatch`. The
repository model was unchanged. The copy typechecked. Running:

```sh
quint run /tmp/hapsland-security-model-mutation/security.qnt --main security --step replayStep --invariant secAuthority --max-steps 12 --max-samples 200 --seed 424242 --verbosity 2
```

exited 1 with an invariant violation. Its counterexample prepared path 0 at
policy revision 0, queued it, completed revision 1, then recorded a
`ProviderSend` at revision 1. This shows the model invariant catches omission
of the dispatch-time policy guard within this finite abstraction. It does not
test whether the production harness catches an equivalent TypeScript change.
