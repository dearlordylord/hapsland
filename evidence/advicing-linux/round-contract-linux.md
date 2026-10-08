# Linux round contract probes for #105

**Audience:** Contributors, including coding agents validating runtime behavior; Build and release maintainers; Product and specification owners.

Run from the candidate worktree:

```sh
node evidence/advicing-linux/run-round-contract-linux.ts
```

The [recorded results](./linux-round-contract.json) identify the candidate commit,
platform, timings, assertions and source-free round closure summaries. The harness
uses the production resident and Effect controlled DecisionModel, and launches the
real Stop CLI as a subprocess connected through local IPC. Runtime event inputs
and edit actions are fixtures. No native Codex or Claude process, model inference,
or live Jev request runs in this harness.

Each case runs for both supported adapter identities:

| Case | What the assertion establishes |
| --- | --- |
| Deadline | Stop waits to its deadline, allows completion, cancels running review, discards queued units, and leaves zero retained review bytes, advice, cache entries and current-work records. |
| Backend unavailable | Stop emits an operational notice, records closure as `unavailable`, and does not report a clear review. |
| Stale advice | A previously produced finding is removed after its source changes before Stop revalidation. |
| Multiple units | Two current findings fit one collection; Stop requests continuation, and a later Stop does not repeat those findings. |
| Background/Stop competition | A gated background collection owns its unreserved lease while a competing Stop collection reports pending. |
| Lost acknowledgement | Once background output is authorized, Stop can reoffer that uncertain advice. Its old token cannot regain ownership. |
| Submitted background advice | Acknowledged background advice can be reoffered once at Stop. A later Stop does not repeat it. |
| Reoffer cost | The controlled evaluation call count does not increase when Stop reoffers retained advice. |
| Repair findings and bound | Four fixture repair attempts can produce four Stop continuations. The fifth finding closes with reason `limit` and is discarded. A fresh permitted edit opens another round with a fresh count. |

The repair edits are driven by the harness. These results do **not** establish that
an agent saw the advice or followed it. The background acknowledgement and its
loss are injected at the resident protocol boundary; there is no native background
writer in these cases. Cold startup, process restart, agent cancellation and native
parallel-tool scheduling are also outside these probes. Native before/after repair
and repeatability evidence comes from the separate matched Linux harness.

Fixture source and hook output exist only in scratch directories or process
memory. The committed results retain no source, backend response or credential.
