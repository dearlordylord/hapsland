# Process and sink prototype (draft contract)

Date: 2026-09-24. Profile exercised: Linux aarch64, Node v24.20.0, checkout HEAD `a6799312fcc6d2cccdcd66c318f98b62cffd1808` with uncommitted investigation changes. This is a throwaway, offline probe of the proposed SEC-SINKS and SEC-INGRESS properties, not a product-wide security result.

## Reproduction

```sh
npx vitest run src/resident/security-sinks.test.ts --maxWorkers=1
npx tsc -p tsconfig.json --noEmit --pretty false
npm pack --ignore-scripts=true --dry-run --json
node scripts/security-prototype/installed-debug-witness.mjs # after npm run build
```

The first case creates a fresh Git fixture and uses the real Codex event adapter, consent store, resident process, Unix socket admission, production preparation/evaluation, and controlled `DecisionModel`. The permitted source file and the synthetic controlled backend failure both contain the unique `SYNTHETIC_SOURCE_MARKER_7fb741a1` marker. The test retains the exact admission frame in memory, writes that frame to the actual resident socket, awaits the controlled provider call, and then inspects the collect response, launcher stdout/stderr and every regular file in its isolated consent, activity and runtime tree. `REVIEW_RESIDENT_DEBUG=1` is enabled.

Observed on this run: the serialized admission frame contains the marker; the provider call marker file is created; the collected response and inspected files contain no marker; launcher stdout/stderr contain no marker. The provider error is converted by `evaluatePrepared` into a `backend` status before either resident `console.error` catch. Thus this case establishes that this particular controlled model failure is contained. The startup diagnostic file is removed after successful launch and no debug exception was triggered by this fixture.

The second case uses the existing `ResidentServer.afterPrepare` scheduling seam to throw a synthetic source-bearing `Error` in a separate Node process, after real source preparation. **Before the local fix**, with `REVIEW_RESIDENT_DEBUG=1`, process stderr contained the source marker. This reproduced the catch-level unsafe output behavior under injected unexpected failure. It did not show a naturally occurring production exception carrying captured source, and the injected process was not launched through `ensureResident`; therefore it did not dynamically demonstrate persistence to `<owner.lock>.startup-error`. The launcher source routes resident stderr to that file, but this specific file write remains source-inspected rather than observed.

**After the local fix**, the two resident debug catches emit fixed `resident preparation unavailable` and `resident evaluation unavailable` messages. The same injected preparation failure now produces the bounded preparation message in child stderr with no source marker. The focused two-case suite and TypeScript typecheck pass. This result covers the source checkout process and the injected preparation catch; the evaluation catch has the same fixed-string code but no separate injected runtime witness yet. A narrow serializable failure injection seam in the launched resident would enable a diagnostic-file and packaged-process witness.

This catch-level behavior was filed as [Hapsland issue #100](https://github.com/dearlordylord/hapsland/issues/100) after checking existing diagnostics issues #3 and #13 and finding no matching defect report. The issue distinguishes the demonstrated stderr output from the unobserved natural-exception and launcher-file paths.

The earlier package dry run listed `bin/launch.sh`, `dist/cli.js`, `dist/resident/main.js` and native prebuilt entries, with package identifier `@hapsland/hapsland@0.1.0` and reported shasum `976f76bab4d022c0a7efb9f0d55822f31df35b90`. It was inventory evidence only. A later freshly built and installed archive (SHA-256 `206d6c571b2a5edcc316b76c8709e5b9165b347de10f8716849d12e7e9800e54`) passed the [installed debug witness](../../../scripts/security-prototype/installed-debug-witness.mjs): a child using the installed resident module printed the bounded preparation category with no synthetic source marker. The same witness against an isolated unfixed checkout exited 1 because the marker reached child stderr. Both runs used the test-only `afterPrepare` injection, so they still do not show launcher diagnostic-file behavior.

## Observer coverage and gaps

| Boundary | Actual observation | Remaining gap |
| --- | --- | --- |
| Host to resident ingress | Captured the JSON frame written to the real Unix socket; source marker was present. | This test uses an eligible path and also inserts the marker in the test-only failure option. Excluded-path early discard is a separate SEC-INGRESS case. No independent socket tap observed arbitrary clients. |
| Provider | Controlled `DecisionModel` call marker file. | No installed Jev provider serialization or actual HTTP request observed here. The controlled model is a lower boundary. |
| Durable stores | Read every regular file under the isolated state/activity/runtime root after completion. | Does not observe attempted writes that fail or writes outside that root. The fixture source file is intentionally outside this scan. Native/dependency I/O needs a process-level observer. |
| Process output | Captured launcher client stdout/stderr and collect response object in the first case; captured actual child stderr with a bounded category and no marker after the local fix in the second. | Resident stdout is configured as ignored by the launcher. The raw collect response bytes were parsed by `residentRequest`, not independently tapped. The catch injection did not use the launcher, so diagnostic-file persistence remains unobserved. |
| Package | Freshly built installed module with injected preparation error; artifact digest and negative control in [results](RESULTS.md). | No launcher-owned diagnostic-file observation, native helper tracing, installed wire body, or natural source-bearing exception. |

The fix removes the demonstrated catch-level stderr leak in source-checkout and installed-module probes. It does not satisfy SEC-SINKS or SEC-INGRESS in full. The next formal-gate sink witness should exercise that cause in the launcher-owned process and observe attempted writes and direct output descriptors on each declared platform.
