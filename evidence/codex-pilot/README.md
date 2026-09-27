# First opt-in Codex pilot

**Historical evidence, 2026-09-23.** Repository enablement and runtime observations
below describe the retained runs. The [pilot quickstart](quickstart.md) and
[owner procedure](owner-procedure.md) retain the instructions used at that time.
Current installation guidance is in the [Hapsland installation status](../../README.md#installation).

The [interactive setup record](./interactive-setup-linux-arm64-2026-09-23.json) covers a packed
installation and guided, offline, opt-in path on the declared Linux arm64 / Node 24.20.0 /
Codex CLI 0.155.1 profile. It records zero provider calls and leaves native trust unknown.

The owner authorized one new, local Git test repository containing only a synthetic TypeScript
session-state fixture. The repository itself stays outside this product checkout and has no remote.
Its path, source, Codex transcript, credential, provider response, and consent digests are not in
the retained JSON. The local fixture has a baseline commit and a later reviewed-repair commit.

The Linux arm64 run installed the exact tarball SHA-256 from the conclusive first-review milestone
into an isolated Codex profile. Package doctor reported ready; installation and repository consent
were previewed and confirmed separately; native repository and exact hook trust persisted. The
project config selected only one TypeScript file, one concurrent review, no transient retry, and an
explicit environment credential. This container required a labeled Codex host sandbox bypass;
native hook trust was not bypassed.

For the one live edit, `scripts/pilot-provider-guard.mjs` was loaded into Node hook processes via
`NODE_OPTIONS`. It counted requests to the fixed Jev endpoint before dispatch and rejected any
request after the second. The fixture file was checked below 4,096 bytes before host execution,
and the host had a 180-second deadline. The retained result records two HTTP 200 responses,
one submitted finding, a passing independent state validator, and a completed host run. The pilot
repo remains enabled, but later Linux Codex runs need an explicitly supplied credential; no key was
stored in that repository.

The separate macOS arm64 / Codex CLI 0.156.0 owner-host pilot used an isolated profile, saved
Keychain credential, confirmed repository and exact-hook trust, and the user-authorized Codex
sandbox bypass. One ordinary edit added a valid optional property to the already repaired
synthetic file. Resident activity completed clear with zero findings; the independent validator
passed. The retained [sanitized Mac record](./macos-arm64-codex-0.156.0-2026-09-23.json) reports
that provider-call and source-byte counts were not independently measured. It establishes the
observed clear-review path under those conditions, not Mac finding delivery or an independently
metered Jev request. No second edit or paid attempt was made in that earlier run.

The later [script-free Mac pilot record](./script-free-macos-arm64-2026-09-23.json) covers a new
archive assembled with macOS and Linux arm64 native files. The owner installed it with lifecycle
scripts disabled, and package doctor found all ten checks ready. In the isolated Codex profile,
the owner accepted the native hook review and made one ordinary TypeScript edit. The corrected
status query reported repository consent and credentials ready, plus one resident `clear` event
with zero findings. Provider-call and source-byte counts were not independently measured, and no
positive finding or model repair is claimed for this new archive.

The subsequent [positive Mac demo record](./macos-arm64-positive-demo-2026-09-23.json) covers a
script-free installation whose public commands selected the packaged Node runtime even with a
deliberately unusable `node` first on `PATH`. After native trust, the built-in synthetic demo
reported one submitted finding, a correlated model reaction, an independently validated repair,
and a completed follow-up review. Its budget record reported two calls and 641 source bytes.
The separate request guard recorded none because the demo reused an earlier resident process;
those call and byte counts are not independently verified in this Mac record.

The first [independent-meter startup attempt](./macos-arm64-meter-startup-2026-09-23.json)
made no Jev request. Its fresh resident was placed under a test directory whose Unix socket
path macOS rejected with `EINVAL`. A later offline probe used a shorter private directory;
the resident started, answered its readiness request, and loaded the independent guard.

The final [independently metered Mac demo](./macos-arm64-independent-positive-demo-2026-09-23.json)
used that short resident path. The guard loaded in the resident and counted two real Jev requests,
both returning HTTP 200. It counted 290 UTF-8 bytes in the two declaration-source fields. The
product's 641-byte admission count covers the JSON-encoded provider input, including those source
fields and metadata. The synthetic demo also reported a submitted finding, correlated model
reaction, independently validated repair, completed follow-up review, and cleanup of consent
and the disposable repository. The temporary measurement resident was subsequently stopped and
removed. No source, credential, response body, transcript, or private path
is retained in the evidence record.
