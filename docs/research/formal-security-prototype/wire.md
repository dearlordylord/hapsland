# Offline wire observation prototype

Status: bounded prototype evidence, 2026-09-24. This tests the direct-event TypeScript preparation and the installed TypeSafe provider at an injected offline HTTP transport. It is not a product-wide security proof.

## Fixture and observed boundary

The hand-authored [manifest](../fixtures/security-wire-manifest.json) declares one selected interface, a reachable same-file reference with a cycle, unrelated leading/reference comments and sibling source, an excluded file, and an unresolved reference. The [test](../../../src/direct-event/security-wire-prototype.test.ts) calls production `adaptCodexAdd` → `prepareObservation` → `evaluatePrepared` and supplies the real `TypeSafeDecisionModel` and `TypeSafeClient` with a recording `HttpClient`. No live request is made. The provider uses `DEFAULT_API_BASE`; the observed destination must equal the approved `DEFAULT_DESTINATION`, `https://api.typesafe.ai/v1/systemone`.

The positive case requires one POST request, the authentication and JSON headers, and exact decoded `{model,state,questions}` equality against the independently authored expected declaration/reference/rule values. It also rejects absolute paths, the credential in the body, and unrelated source markers. The excluded case requires zero `sourceRead` hook calls and zero provider requests. The unresolved case requires zero provider requests; stable capture invokes its source-read hook twice for the allowed file.

On Linux aarch64 with Node v24.20.0, Vitest 5.0.1, and the pinned Effect/TypeSafe RC.116 cohort:

```sh
npx vitest run --maxWorkers=1 src/direct-event/security-wire-prototype.test.ts
npm run typecheck
```

Observed: three tests passed; typecheck exited 0. The prototype test and fixture were untracked files at the source baseline `b4af0533ba3fdf2689fdc15b2b745134e16c9caf`; these results apply to that code plus those two files.

## Compiling mutation sensitivity check

The following was run in a detached temporary worktree. Its purpose was to check that the complete body oracle detects an extra source-bearing state field. The temporary path was removed afterward.

```sh
git worktree add --detach /tmp/hapsland-security-wire-mutation-20260924 HEAD
cp src/direct-event/security-wire-prototype.test.ts /tmp/hapsland-security-wire-mutation-20260924/src/direct-event/security-wire-prototype.test.ts
mkdir -p /tmp/hapsland-security-wire-mutation-20260924/docs/research/fixtures
cp docs/research/fixtures/security-wire-manifest.json /tmp/hapsland-security-wire-mutation-20260924/docs/research/fixtures/security-wire-manifest.json
ln -s /workspace/typescript/jev/node_modules /tmp/hapsland-security-wire-mutation-20260924/node_modules
```

At execution, `HEAD` resolved to `b4af0533ba3fdf2689fdc15b2b745134e16c9caf`. For replay after the branch advances, substitute that full hash for `HEAD`. Baseline in the temporary worktree: the targeted Vitest command above passed all three tests. The following exact patch was then applied only to the temporary `src/direct-event/pipeline.ts`, inside `preparedProviderInput`:

```diff
   evidence: prepared.input.unit.root.references,
+  unrelatedSource: "OUTSIDE_SIBLING_MARK",
   inputContract: {
```

The applied edit command was:

```sh
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/hapsland-security-wire-mutation-20260924/src/direct-event/pipeline.ts')
s=p.read_text()
a='  inputContract: {\n    id: prepared.input.contract,'
b='  unrelatedSource: "OUTSIDE_SIBLING_MARK",\n  inputContract: {\n    id: prepared.input.contract,'
assert s.count(a)==1
p.write_text(s.replace(a,b))
PY
```

In that worktree, `npm run typecheck` exited 0. The targeted Vitest command exited 1: the positive case failed at exact decoded-body equality because `state.unrelatedSource` was present; the two negative cases passed. The failure was an authorization assertion, not a compilation failure. Cleanup succeeded with:

```sh
git worktree remove --force /tmp/hapsland-security-wire-mutation-20260924
```

## Limits

The observer is inside the Effect HTTP boundary; it does not observe resident IPC, the compiled package, native/OS reads, redirects in a platform transport, or unrelated direct network clients. The corpus is small and uses unambiguous top-level declarations. The currently authorized raw declaration span includes an internal comment and a non-ASCII literal, so this check establishes provenance for this fixture, not secret absence or normalized structural-only disclosure. Source-read hooks are preliminary witnesses rather than independent filesystem instrumentation.
