# OpenCode integration status

**Purpose:** Explain the current OpenCode adapter boundary and how to remove an existing Hapsland-owned plugin.
**Status:** Candidate integration unavailable for review.
**Authority:** Maintained runtime guidance; the [advice contract](advicing-target-contract.md) owns admission requirements.
**Expected use:** Check whether OpenCode can currently deliver Hapsland review and remove an earlier owned installation.
**Lifecycle:** Keep this page current with OpenCode hook capabilities and Hapsland installation behavior. Review it when the before/after edit lifecycle is implemented and validated for an OpenCode version.

OpenCode exposes `tool.execute.before` and `tool.execute.after` hooks with a shared `sessionID` and `callID` in its [plugin API](https://github.com/anomalyco/opencode/blob/dev/packages/plugin/src/index.ts). This makes the accepted permit-before-edit and round-after-accepted-edit model plausible for OpenCode without changing the reducer rule. Hapsland's 1.14.44 candidate implemented only the after hook; it has not validated a paired, blocking before/after lifecycle. Hapsland therefore keeps OpenCode hook calls quiet and does not offer OpenCode install or update. Doctor reports this missing integration as not ready. No OpenCode finding is submitted to the agent through this path.

Before enabling an OpenCode version, verify in that version that the before hook blocks tool execution until permit registration completes, the after hook carries the same `callID`, failed tools can retire unused permits, and a finish boundary can hold completion long enough for the accepted advice wait with a deadline. The API definition establishes available fields, not these runtime observations. In particular, a notification that a session is already idle has not been shown to provide the needed blocking finish boundary.

An existing Hapsland-owned OpenCode plugin can still be removed. Call `uninstall` without a digest to preview removal, inspect the owned paths and digest, then repeat `uninstall` with that digest. Removal checks ownership and local modifications before deleting files; it does not remove unrelated plugins.

The [historical host evidence](../evidence/host-94/decision-and-evidence.md#remaining-decisions-and-evidence) records earlier local probes. Those observations do not establish the required pre-edit lifecycle or current review support.
