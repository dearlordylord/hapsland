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
Execution and O0/O1 comparison were **not run** because preparation produced no O1 executable. These follow-up steps are cancelled for this terminal experiment; there is no runtime improvement claim.
- [x] Record a decision: **inconclusive preparation failure**. Clang exhausted 120 seconds (observed 120.184s including termination); no O1 executable or runtime comparison. Remaining execution/comparison steps were not run.

Hypothesis: `-O0` amplifies runtime overhead. No Bend source or transport changes are required. A faster prefix does not establish full correctness. If preparation times out, record that result and proceed to E2; do not silently raise the limit.

### E2 Attribute and reduce trace serialization cost

- [x] Profile a post-simulation window: 8.022s execution; sampling began after first output at 2.184s. Among 210 samples, text formatting 138 (65.7%), IO 46 (21.9%), numeric encoding 25 (11.9%), and one shared engine-labelled helper (0.5%).
- [x] Quantify repeated envelope data on the retained 20-batch campaign-0 prefix: 43,020 words / 108,580 bytes, about 2.5% of 4,359,638 total JSON bytes. All fields match their repeated serialization hashes; every array decodes completely. Observation fields contribute 4,250,818 bytes. Do not extrapolate to all 145 batches; no deduplication change justified.
- [x] Choose the text formatting/string allocation path for a bounded chunked-output experiment. Preserve exact numeric text and line boundaries; do not assume quadratic complexity.
- [x] Prepare the isolated chunked writer and verify a small executable canary: exact equality for empty, zero, u48 maximum and 258 words crossing a chunk boundary (561 bytes total). Initial candidate `d8dce5d3`; this establishes small-case grammar only.
- [x] Remove growing-left string accumulation: candidate `749acf78` buffers reversed decimal pieces and prepends them. Focused canary remains byte-identical; JS emission 0.155s, execution 0.021s.
- [x] Compile the frozen candidate with separately bounded preparation: C emission **240s**, clang **120s**. Started after a separate 10-second baseline run; receipt `/tmp/hapsland-e2-comparison/result.json`.
- [x] Run saved baseline and candidate separately for at most **10s each**, without concurrent compilation; compare every common complete batch byte-for-byte, first output, batch/byte throughput and peak RSS.
- [x] Record a decision: do not integrate this candidate as a speed improvement. All 20 common complete batches match exactly, but bytes in 10 seconds decreased by 24.7%; peak RSS decreased by 18.1%. This is one bounded comparison, not full game acceptance.

Hypotheses: formatting/allocation and repeated envelope serialization increase trace cost. Source inspection confirms repetition, not its measured contribution. The visual renderer is outside this fixture. Do not delete required ticks, public facts, frames or replay checks to produce a speedup.

### E3 Isolate compiler runtime and phase costs

- [x] Prepare identical uninstrumented compiler JS: extracted original SHA256 `546fc6036d1e718404ce628e5405ec4574c24fb70af43016dc6a832ef388e214`, independently confirmed against an earlier clean extraction. Only adaptation is the installed Base directory path; compiler expressions unchanged. Both runtimes verified locally.
- [x] Compare Bun 1.3.14 and 1.4.2 with equal **240-second compiler limits**, recording hashes, elapsed time, peak RSS, exit and emitted C. Sequential trial started on the same Bool.pick candidate; receipts `/tmp/hapsland-e3-compiler-runtime/`.
Stage markers are unnecessary for this completed comparison; add them only if a new unexplained compiler failure needs localization.
- [x] Record a bounded result: Bun 1.3.14 took 36.69s/5,855,064 KiB peak RSS; 1.4.2 took 24.35s/4,209,720 KiB. Both emitted identical C matching the retained baseline. Runtime version affects this pair; packaging effects and earlier timing variability remain unisolated. No new upstream defect established; no stage instrumentation needed now.

Hypothesis: compiler runtime or packaging contributes to variability. The prior instrumented Bun 1.4.2 run is not an uncontaminated comparison with the packaged CLI. The known 247-live-word limitation is separate from timeouts.

### E4 Reduce TS observation copies

- [x] Identify repeated copies: `structuralRecord` clones already copied/frozen `before` and `after` again. Candidate: copy mutable details and freeze the frame while reusing immutable snapshots; keep `runtimeSnapshot` unchanged. Isolated implementation underway.
- [x] Test one change with structural observations enabled: full original schedule completed in both 10-second-capped arms, baseline 5.913s and candidate 2.842s. One pair is promising evidence, not a stable speed guarantee.
- [x] Verify mutation isolation, frame data and replay: focused 10/10 tests and `check:fast` passed; read-only review found zero issues. A separate bounded pair produced identical hashes for all 1,336 frames and all four final snapshots. Integrate the narrow redundant-copy removal; do not change `runtimeSnapshot`.

### E5 Revisit carrier allocation only if attributed

**Deferred after E4:** no specific expensive carrier family is established by profiling. Do not remove working arity mitigation on speculation; revisit only when attribution identifies a candidate.

- [x] Evaluate the prerequisite and record the decision: current samples do not identify an expensive carrier family. No carrier mutation is justified. A future attributed candidate must preserve the arity mitigation and pass affected semantic/continuation-width checks.

## Result log

Append one row per terminal experiment; include failed preparation. Store detailed receipts beside executable evidence and summarize their limits here.

| Experiment | Source/artifact identity | Allowance | Observed result | Correctness evidence | Decision |
| --- | --- | --- | --- | --- | --- |
| E1 | Saved C SHA256 `2ba171a706e39c72fe4a3064a9a50eba503a465e7eea87d508dd9680cdb68eb8` | Compile 120s | Timed out after 120.184s; no O1 executable | Runtime comparison not performed | Inconclusive; proceed to E2 |
| E2 writer canary | Candidate `d8dce5d3` | Frontend 5s; JS emission/execution 10s each | Four lines, 561 bytes; exact literal equality | Empty, zero, u48 maximum, 258-word boundary; full game not run | Improve chunk construction before full preparation |
| E2 profiling | Same saved O0 executable | Execution cap 10s; actual 8.022s | 210 post-output samples; 65.7% attributed to text formatting | Diagnostic only; no full output comparison | Test bounded chunked text output next |

| E2 chunked native output | Candidate `749acf78`, unchanged saved baseline | C 240s; clang 120s; execution 10s each | C 33.35s, clang 40.66s. Baseline/candidate: 20/20 complete batches, 6,455,296/4,861,952 output bytes; peak RSS 132,508/108,592 KiB | All 20 common batches byte-identical; full 145-batch validation not run | No demonstrated speed improvement; retain experiment, proceed to E3 |

| E3 compiler runtime | Same uninstrumented payload and Bool.pick source closure | 240s per runtime | Bun 1.3.14: 36.69s; 1.4.2: 24.35s (33.6% less time), 28.1% less peak RSS | Identical emitted C; sources unchanged; no execution in this experiment | Runtime difference measured once; proceed to E4 |

| E4 TS snapshot copies | Candidate `da75b8c8` | Execution 10s each | All four campaigns, 3,222 ticks and 1,336 frames; 5.913s baseline versus 2.842s candidate in timing pair | Separate pair: identical full frame/end-snapshot hashes; 10 focused tests and check:fast PASS; review 0 findings | Integrate redundant-copy removal; timings remain preliminary |

Detailed terminal evidence: [initial experiment receipts](performance-evidence/2026-10-04-initial-experiments.json).

Focused writer evidence: [chunked writer canary](performance-evidence/2026-10-04-chunked-writer-canary.json). Canary success does not close the full-game comparison checkbox.


Detailed E2 comparison: [native prefix measurements](performance-evidence/2026-10-04-chunked-output-comparison.json).

Detailed E3 comparison: [compiler runtime measurements](performance-evidence/2026-10-04-compiler-runtime-comparison.json).

Detailed E4 comparison: [TS observation measurements and equality hashes](performance-evidence/2026-10-04-ts-observation-comparison.json).

## Full game acceptance follow-through

- [x] Persist a separate 180-second full-validation native/JS execution allowance; keep short probes at 10 seconds and the maintained overall deadline finite.
- [x] Remove repeated growing-buffer copies/scans in the stdout reader, preserving all bounds and exact JSON.
- [x] Explicitly resume verified successful C/native preparation; actualnative+JS full145streams completed and retained. All145bytehashes match.
- [ ] Fix the concrete SourceJob discrepancy, then finish allfourcampaigns/3,222ticks/public/replay using explicit source-validated retainedvectors. No repeatnative/JSgeneration unless Bend/core/output source changes.
- [x] Record the first full-validation terminal result: native exceeded 180 seconds with 105/145 complete batches, 58,165,264 complete bytes and 2,172,807 pending bytes. JS/public/replay did not run. Acceptance remains incomplete; investigate selective C optimization next.

This is the previously required full acceptance milestone, not a longer performance probe. Native/JS allowances are 180 seconds each inside the existing 380-second supervisor; no compiler regeneration is planned for the retained matching source closure.

## E6 Selective saved-C optimization

- [x] Compile a reversible pragma-only derivative of the saved C at O1, at most 120 seconds. Optimize the 12 identified decimal/text segment functions and three spin helpers; keep other generated segments/helpers unoptimized. Runtime prelude remains eligible for O1; the generated-function region also leaves intervening IO-buffer support unoptimized until the IO marker. This is the exact current candidate scope, not a claim that all runtime support is optimized.
Execution was not run: selective compilation also exhausted 120 seconds (120.194s observed). No optimized executable exists.
- [x] Record a decision: preparation remains inconclusive; stop compiler-flag experiments after the two bounded O1 strategies. No limit increase or repeated build planned.

Detailed envelope measurement: [field spans and exact byte counts](performance-evidence/2026-10-04-envelope-measurement.json). Each file was parsed under a 10-second bound; maximum observed 6.844s.

Detailed E6 result: [selective compiler attempt](performance-evidence/2026-10-04-selective-c-optimization.json).

## E7 Direct numeric IO

- [x] Add a prototype-local supported C/JS IO effect that consumes the unchanged numeric word list, bypassing decimal cons-String construction.
- [x] Verify literal native/JS byte equality: both exactly561bytes, expectedSHA `e7a033f94b80b0665266dbff4afda28abdcf9eb57f75ad72c1581673c7a31ac0`. Native0.001s/JS0.019s, canaryfrontend/emission/clang allwithin declaredlimits; no fullgameclaim. Source377397f2; standardsreview0findings.
- [x] Prepare the full candidate once: C93.425s, clang94.278s, within C240/clang120 caps. Diagnostic10s: baseline19batches/4,358,144bytes; candidate62/35,045,376bytes. All19 common completebatches exact. Nativefull145/JS/public/replay still pending; proceed to full milestone with explicitly verified prepared artifacts.
- [x] Run the original full milestone with retained verified C/binary. Native and fresh JS both completed145batches; all145 uncompressed hashes match (82,303,930bytes perlane), allgzip/uncompressed hashes verified. Publiccomparison failed at campaign0/tick200/physical1/queueitem133 sourcebinding: NativeNone vsTS sourcejob(partition1,lifetime1,bytes100,units10/20,outcomeNone). Fullrun33.35s; no public/replay acceptance yet.

## Other original-checklist boundaries completed during investigation

- [x] NativeRun seven original native/emitted/public/replay cases: fresh7/7 PASS, matching retained14531-byte vectors; initialu48 configuration corrected without changing runtime-control limits. [Evidence](performance-evidence/2026-10-04-native-run-qualification.json).
- [x] Issue191/192/195 public/dashboard gaps:53 publictests +3 dashboardtests PASS; collector-meter/exclusiveStopslot/callbackHold-Release browserchecks nowPASS using locally extracted libraries. Stale advicee locators corrected; assertions retained. [Evidence](performance-evidence/2026-10-04-public-browser-qualification.json).

E7 canary: [direct numeric native/JS evidence](performance-evidence/2026-10-04-direct-numeric-canary.json).

E7 full-source diagnostic: [preparation and exact prefix comparison](performance-evidence/2026-10-04-direct-numeric-game-comparison.json).

Fullproducer evidence: [all145byte-equal batches](performance-evidence/2026-10-04-full-game-producers.json). Raw scoped receipts remain in the recorded worktree run directory.
