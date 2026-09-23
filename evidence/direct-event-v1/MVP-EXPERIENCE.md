# Real Codex → real Jev → repair demonstration

On 2026-09-22 the first headless run completed the full loop in approximately
55 seconds, using Codex CLI 0.155.1 on Linux arm64 and the production review
command, resident process, built-in Noul rules, and live Effect Jev provider.
There were two actual instrumented provider fetch invocations and two HTTP 200
responses. No controlled backend or synthetic review advice was used.

The [source-free run record](./mvp-experience.json) contains the observations.

| Time from launch | Observed behavior |
| --- | --- |
| 9.9 s | Codex added the supplied initial payment-state draft through `apply_patch`. |
| 11.2 s | The first live provider response arrived. |
| 16.0 s | A normal Bash hook returned a finding, including the rule about field combinations with no domain meaning. |
| 46.7 s | Codex changed the payment type through `apply_patch`. Its source fingerprint changed. |
| 47.4 s | The second live provider response arrived; the subsequent collection returned no findings. |
| 55.0 s | The host had exited successfully and independent checks had completed. The reviewer had two successful cache entries and no running work, pending findings, or operational notices. |

Times for hooks denote entry, not completed delivery. Provider timings measure
fetch until response headers, not full evaluation latency. Timeline entries are
written on completion and may therefore appear out of entry-time order.

## What was checked

The task asked Codex to start from an explicitly supplied draft representing
pending, succeeded, and failed payments with independent nullable receipt and
failure fields. It then asked for valid usage examples, documentation, and an
ordinary `npm test` typecheck, and allowed automated review feedback to guide
changes. It did not prescribe the repair.

The host changed the type after the live finding was submitted and mentioned
review in its response. Independently, after Codex exited, the runner checked:

- the resulting project and examples compile;
- TypeScript rejects success without a receipt;
- TypeScript rejects a pending payment containing a successful receipt;
- TypeScript rejects success carrying both a receipt and a failure reason.

The independent invalid-state checks were not available to Codex and did not
trigger review hooks. They used `@ts-expect-error`, so accepting an invalid
assignment fails the check.

## How close this is to the user experience

Codex made real edits and ran normal development commands in a disposable Git
repository. Native `PostToolUse` events invoked an observing wrapper around
`src/cli.ts --codex-hook --controlled-writer`. That wrapper passed the production
stdout/stderr through unchanged. There were no visibility tokens, injected
advice, artificial delays, fabricated host events, or external collection polls.
Consent was enabled through the ordinary preview/digest-confirmation commands,
on behalf of the user's explicit authorization for this disposable test.

The observer counted fetch invocations at the real provider boundary without
reading request or response bodies. It limited that run to six invocations;
the run used two. This count does not claim backend billing or internal-service
attempt counts. The production deadline was 15 seconds with zero retries.

This is one successful demonstration, not a reliability estimate. The flawed
initial draft was deliberately supplied, so it does not measure how often Codex
naturally creates such a problem. Mentioning review plus a subsequent repair is
behavioral evidence, not a controlled causal experiment. The historical
randomized visibility probe remains separate evidence. Interactive sessions,
other platforms/versions, and reliable final delivery remain unvalidated.

## Reproduce

With Codex authentication and a Jev credential available:

```sh
node scripts/run-mvp-experience.mjs --execute-paid
```

This command performs paid calls and overwrites `mvp-experience.json` with the
new outcome, including an incomplete outcome if the loop does not succeed.
The API key is read as data from the environment or the primary checkout's
`.env`; it is never printed or sourced as shell code. Host authentication is
copied into a private temporary Codex home. The repository, temporary host
state, and credentials copy are removed after the run. Source, transcripts,
raw advice, probabilities, and raw provider responses are not retained.
