# Issue #94: decision after incomplete Claude block control

**Status, 2026-09-24: owner decision required.** The approved trial stopped at its
no-finding control. Claude Code `2.1.218` exited 1 after 34,135 ms, within the
90-second and 2 MB limits, with zero native edits and zero hook calls. No review was
admitted and the block response was never exercised. The durable ledger consumed its
single control start, so it cannot be reused. The exit cause is unknown; the trial did
not retain raw output from which to infer one. See the [trial record](issue-94-claude-block-host-proposal.md)
for the full sanitized evidence.

This does **not** show whether Claude repairs a finding after a block. The runner now
records allowlisted, source-free exit categories and sanitized catch results for future
sessions; focused checks passed. That change cannot explain the consumed control after
the fact. The experiment remains isolated on `experiment/claude-block`; `master` is
unchanged.

## Choose one

**A. Request one fresh, bounded trial.** Use a new ledger and at most two sequential
authenticated sessions with the exact Claude Code `2.1.218` executable: control first,
then the finding arm only if control passes. Keep the existing 90-second and 2 MB caps,
controlled local Hapsland review, and no Jev calls. Apply the acceptance gates in the
[trial record](issue-94-claude-block-host-proposal.md). A failed or incomplete control
stops the run with no retry. If the finding arm fails to demonstrate both the required
block response and a model-originated repair, remove the experimental product code and
tests and retain only sanitized evidence. This option requires a new explicit approval;
this document authorizes no host or offline run.

**B. Discard the experiment now.** Remove the experimental block implementation and
its tests from this branch, leaving the current advisory behavior on `master`. No
further authenticated run is made.

OpenCode remains postponed under either choice.
