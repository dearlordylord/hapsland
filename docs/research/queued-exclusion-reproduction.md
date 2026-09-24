# Resident queued-exclusion reproduction

Status: **observed defect against existing conformance obligation 11b** on local revision `b4af0533ba3fdf2689fdc15b2b745134e16c9caf` plus unrelated working-tree changes. This is an offline development-source observation, not a packaged binary or HTTP wire-body result.

Filed as [Hapsland issue #99](https://github.com/dearlordylord/hapsland/issues/99) after checking the issue tracker for a matching report.

Run `npx vitest run --maxWorkers=1 src/resident/security-queued.test.ts`. The original pre-fix reproduction had three cases; the committed regression suite has four. The fixture contains only synthetic TypeScript source and uses the production Codex direct-event adapter, resident admission, preparation, dispatch, settings reload, consent service, and `evaluatePrepared`. A controlled `DecisionModel` writes one `called` line at its `decide` boundary for each provider attempt. No live Jev request or credential is used.

| Ordered case | Provider attempts after resident idle |
| --- | ---: |
| Eligible source, unchanged policy (positive control) | 1 |
| Exclusion present before preparation | 0 |
| Preparation reaches `beforeEvaluate`; write valid `.review.jsonc` excluding `type.ts` and await write completion; release evaluation | 1 |

The barrier is after preparation and before the resident's settings reload and consent check. The marker's presence in the prepared declaration is asserted before the exclusion write. `server.whenIdle()` supplies a completion barrier before counting calls. These observations establish an invocation of the production provider-neutral model after a completed restrictive policy update; they do **not** establish exact serialized HTTP bytes. The resident reloads settings but does not apply the new path exclusion to the already prepared unit before `evaluatePrepared`. Later publication revalidation can suppress advice after the provider call.

Existing [direct-event v1 conformance obligation 11b](../../conformance/direct-event-v1.json) states: “Recheck consent and current configuration immediately before resident backend dispatch.” Its cited test, “loads current configuration at dispatch rather than freezing admission config,” changes the exclusion immediately after admission; preparation can therefore observe the new exclusion before making a prepared unit. The deterministic test here covers the missing prepared-work interval. The recommended `SEC-AUTHORITY` contract makes that interval and ordering explicit, but the defect is already within 11b's current-configuration dispatch promise.

Regression acceptance: a completed restrictive exclusion update before the dispatch authority read must yield zero provider attempts for the queued unit, while the eligible positive control still yields one. Preserve deterministic preparation and completion barriers. A separate encoded HTTP observer is required before making a wire-body claim.

## Narrow fix follow-up

The resident now reloads file-backed configuration after the credential wait and applies the same pure path-policy predicate used by production `eligibleNamedPath` to the prepared path under the current resolved policy before `evaluatePrepared`. That predicate preserves hard exclusions and include/exclude precedence without repeating filesystem and Git checks for already captured source. Captured path identity remains established at preparation, and root identity is rechecked at dispatch. Consent and credential-name compatibility are also rechecked. The second configuration read is needed because credential resolution and its test barrier can wait after the earlier settings read; it does not recompile rule packs. Credential generation is checked after that wait and immediately before provider evaluation.

On the patched development source at HEAD `a6799312fcc6d2cccdcd66c318f98b62cffd1808` plus local changes, the same command passes **4 tests**: the two original controls, prepare → exclude → dispatch with **zero** provider attempts, and exclusion completed at the credential-to-dispatch barrier with **zero** attempts. The full `src/resident/server.test.ts` passes **34/34** under default time limits after the pure predicate replaces repeated Git checks; `src/direct-event/selection-capture.test.ts` and the queued prototype pass **15/15** together. The two existing resident dispatch subprocess tests for current configuration and consent pass. `npm run typecheck` also passes. The earlier one-attempt observation above is retained as pre-fix evidence against `b4af0533ba3fdf2689fdc15b2b745134e16c9caf`.

This fix addresses **path exclusion for prepared queued units**. It does not recompile or compare already prepared rule definitions, selected questions, or input contracts against a changed configuration. Whether those changes must invalidate queued work at dispatch requires a separate contract decision and conformance case. The policy file can still change concurrently after the final read; this test covers completed updates before that read, not atomic revocation of in-flight transport.

## Installed package witness

After `npm run build`, `node scripts/security-prototype/installed-queued-witness.mjs` freshly packed and installed the local archive without development dependencies. On Linux arm64, Node v24.20.0, archive SHA-256 `206d6c571b2a5edcc316b76c8709e5b9165b347de10f8716849d12e7e9800e54`, the installed resident module produced provider-attempt counts `allowed=1`, `initiallyExcluded=0`, `queuedExcluded=0`. The script uses the same synthetic marker and a deterministic preparation barrier, prints only source-free counts, and removes its temporary installation.

As a negative control, a detached clean worktree at `18b0d66194487c12077c7233c8554ba89b7b5f66` (without the fix) built and packed its own archive and ran the same copied witness. It exited 1 with counts `1/0/1`, detecting the queued policy bypass. The detached worktree was removed. This confirms provider-neutral attempt behavior from an installed artifact, while encoded resident HTTP bytes remain unobserved. The latter is a separate broader contract-gate task.
