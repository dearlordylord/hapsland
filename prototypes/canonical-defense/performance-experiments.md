# Native runtime and compiler performance experiments

**Purpose:** Track bounded experiments that explain and reduce game validation and Bend compilation costs.
**Status:** Active temporary experiment journal; full issue #199 validation remains incomplete.
**Authority:** Experiment plan and measured implementation evidence, not a product contract or a new acceptance gate.
**Expected use:** Follow the ordered experiments, record every terminal result, and check off completed investigations even when their hypotheses fail.
**Lifecycle:** When issue #199's runtime comparison is accepted and compiler triage is handed off or resolved, consolidate retained conclusions and runner guidance into this prototype's README and docs/testing-matrix.md, preserve executable evidence, update links, and delete this journal.

## Execution rules

- Workload experiments run for at most **10 seconds each**. Compiler preparation has its own declared finite allowance and is excluded from workload timings.
- Freeze inputs and source/tool identities. Preserve the four original campaigns, 3,222 ticks, numeric data, and correctness assertions.
- Compare identical work. TS without structural observations is distinct from TS with observations; short sample shares are distinct from full-run wall-clock shares.
- Record failures and inconclusive results. A checked checkbox means the experiment is completed, not that the hypothesis is true or the product is accepted.
- Stop after two attempts that yield no new discriminating evidence. Change the experiment rather than repeating validation.
- Optional benchmarks do not block other issue owners. Full game acceptance still requires all 145 batches and the existing native/JS/public/replay comparisons.

## Existing evidence

- [x] Try concrete eager `match` helpers instead of record-valued `Bool.pick`: 14 sites in five files, isolated branch `task/monkey-bool-pick-experiment`, source commit `5b250980`, codec owner hashes `fd302b22`. Candidate C emission completed in approximately 170 seconds and clang completed; the baseline exhausted 380 seconds without C. This is one comparison, not a stable speed estimate. Source review found no changes to inputs, types, wire or oracles.
- [x] Check whether native execution stalled: the saved executable continued to produce output through 44.4 seconds; at 45 seconds it had 61 complete batches and 34.5 MB. The former 15-second cutoff was insufficient. This was diagnostic output, not full validation.
- [x] Locate the simulation boundary without rebuilding: first-call timestamps put all four campaigns and retained snapshots at approximately 3.76 seconds, before codec encoding. Evidence: `/tmp/hapsland-native-boundaries.json`.
- [x] Measure TS structural-observation cost: one complete run took 4.503 seconds, including 3.222 seconds inside structural observation hooks and 1.271 seconds outside them. Earlier bounded runs varied significantly; do not claim a stable native/TS speed ratio. Evidence: `/tmp/hapsland-component-comparison.json`.
- [x] Short native stack profile: 177 samples in six seconds attributed approximately 58% to engine/game, 28% to text formatting, 6% to numeric encoding, 8% to IO and less than 1% to explicit snapshot/batch helpers. Shared helper costs were attributed to callers; these are initial-window sample shares, not whole-run phase times.
- [x] Try an optional pure-core benchmark: its new fixture's C generation exhausted 90 seconds without a phase diagnosis. Park it off the critical path. Evidence: `/tmp/hapsland-core-benchmark/results.json`.
- [x] Consult Astra: prioritize saved-C optimization and post-simulation profiling. The renderer already prepends bounded decimal chunks; quadratic string construction is not established.

## Ordered experiments

### E1 Optimize the saved executable

- [x] Attempt compilation of the unchanged retained game C with clang `-O1`, at most **120 seconds**; preserve `-O0`.
- [ ] Run each executable once for at most **10 seconds**, with identical draining and output accounting.
- [ ] Compare first-output time, complete batches, bytes and peak RSS; compare every common complete batch byte-for-byte.
- [x] Record a decision: **inconclusive preparation failure**. Clang exhausted 120 seconds (observed 120.184s including termination); no O1 executable or runtime comparison. Remaining execution/comparison steps were not run.

Hypothesis: `-O0` amplifies runtime overhead. No Bend source or transport changes are required. A faster prefix does not establish full correctness. If preparation times out, record that result and proceed to E2; do not silently raise the limit.

### E2 Attribute and reduce trace serialization cost

- [x] Profile a post-simulation window: 8.022s execution; sampling began after first output at 2.184s. Among 210 samples, text formatting 138 (65.7%), IO 46 (21.9%), numeric encoding 25 (11.9%), and one shared engine-labelled helper (0.5%).
- [ ] Quantify repeated envelope data (`config`, `original`, `final_world`) separately from tick/frame data using available output.
- [x] Choose the text formatting/string allocation path for a bounded chunked-output experiment. Preserve exact numeric text and line boundaries; do not assume quadratic complexity.
- [ ] Test one narrow improvement with exact common-output equality, or lossless reconstruction if transport changes are explicitly adopted.
- [ ] Record a decision and the preserved semantic checks.

Hypotheses: formatting/allocation and repeated envelope serialization increase trace cost. Source inspection confirms repetition, not its measured contribution. The visual renderer is outside this fixture. Do not delete required ticks, public facts, frames or replay checks to produce a speedup.

### E3 Isolate compiler runtime and phase costs

- [ ] Prepare the identical uninstrumented compiler JS payload and frozen source closure for both runtimes.
- [ ] Compare Bun 1.3.14 and 1.4.2 with equal **240-second compiler limits**, recording hashes, elapsed time, peak RSS, exit and emitted C.
- [ ] If still necessary, add stage markers to distinguish frontend, lowering iterations, reachability and C writing.
- [ ] Record a cause supported by evidence, or state that the result remains inconclusive; decide whether an upstream reproduction is warranted.

Hypothesis: compiler runtime or packaging contributes to variability. The prior instrumented Bun 1.4.2 run is not an uncontaminated comparison with the packaged CLI. The known 247-live-word limitation is separate from timeouts.

### E4 Reduce TS observation copies

- [ ] Identify repeated copies in `structuralBefore` and `structuralRecord`.
- [ ] Test one change with structural observations enabled and the same schedule, at most 10 seconds per execution.
- [ ] Verify mutation isolation, frame data and replay; record measured cost and decision.

### E5 Revisit carrier allocation only if attributed

- [ ] Identify a specific expensive carrier family from profiling.
- [ ] Change only that family; preserve the working arity mitigation.
- [ ] Check affected semantics and emitted continuation widths; record the decision.

## Result log

Append one row per terminal experiment; include failed preparation. Store detailed receipts beside executable evidence and summarize their limits here.

| Experiment | Source/artifact identity | Allowance | Observed result | Correctness evidence | Decision |
| --- | --- | --- | --- | --- | --- |
| E1 | Saved C SHA256 `2ba171a706e39c72fe4a3064a9a50eba503a465e7eea87d508dd9680cdb68eb8` | Compile 120s | Timed out after 120.184s; no O1 executable | Runtime comparison not performed | Inconclusive; proceed to E2 |
| E2 profiling | Same saved O0 executable | Execution cap 10s; actual 8.022s | 210 post-output samples; 65.7% attributed to text formatting | Diagnostic only; no full output comparison | Test bounded chunked text output next |

Detailed terminal evidence: [initial experiment receipts](performance-evidence/2026-10-04-initial-experiments.json).
