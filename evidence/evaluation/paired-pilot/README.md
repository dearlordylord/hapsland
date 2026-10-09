# Paired agent evaluation pilot

<!--
**Audience:** Evaluation contributors and reviewers; Product and specification owners.
-->

**Status: closed incomplete on 2026-09-24.** The owner accepted the Stage 1
[fixture](fixture-acceptance.md) and the frozen Stage 2
[protocol](protocol.md). The fresh run stopped
after the B1 harness failed before it could write a sanitized runtime record.
The [stop report](stop-report-2026-09-24.md) records why B2 and A2 were not run.
There is no completed pair difference or Hapsland effect estimate.

Captured source trees and the old experiment harness are available in the
[historical Git snapshot](https://github.com/dearlordylord/hapsland/tree/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot). They are no longer kept in the current checkout.

The archive retains the frozen [prompt](prompt.md), source-free
run evidence, [blind artifact scores](blind-artifact-scores-2026-09-24.md),
[arm-aware addendum](arm-aware-addendum-2026-09-24.md), and the dated amendment
and acceptance records. The scores describe final artifacts; they do not prove
model visibility or causal effect. This directory is an evaluation archive, not
an installed-release support declaration or a production behavior contract.

## Audience of frozen artifacts

The prompt and captured source-tree README files retain their original bytes.
Their audience is recorded here rather than inserted into measured artifacts.
These labels describe intended readers; they do not amend the frozen task,
evaluation protocol, source scores or access order for blind reviewers.

| Document | Audience |
| --- | --- |
| [Accepted prompt](prompt.md) | Coding agents performing the frozen task; evaluation reviewers assessing that task |
| [Selected fixture README](https://github.com/dearlordylord/hapsland/blob/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot/selected-tree/README.md) | Evaluation reviewers inspecting the accepted source fixture |
| [Initial Arm A README](https://github.com/dearlordylord/hapsland/blob/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot/runs/pair-1-A/tree/README.md) | Evaluation reviewers inspecting the captured initial source artifact |
| [Fresh Arm A README](https://github.com/dearlordylord/hapsland/blob/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot/runs/fresh-pair-1-A/tree/README.md) | Evaluation reviewers inspecting the captured fresh source artifact after blind scoring |
| [Fresh Arm B README](https://github.com/dearlordylord/hapsland/blob/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot/runs/fresh-pair-1-B/tree/README.md) | Evaluation reviewers inspecting the captured interrupted source artifact after blind scoring |
| [Candidate m7 README](https://github.com/dearlordylord/hapsland/blob/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot/blind-score-2026-09-24/candidate-m7/README.md) | Source-only artifact scorers following the frozen blind-review procedure |
| [Candidate r4 README](https://github.com/dearlordylord/hapsland/blob/59dd9f17ca2187f0caa440836bcb43f25a86ce85/evidence/evaluation/paired-pilot/blind-score-2026-09-24/candidate-r4/README.md) | Source-only artifact scorers following the frozen blind-review procedure |
