**Purpose:** Explain what the final npm `fetch manifest` log line means for the timed-out local archive install and identify the smallest useful follow-up probe.
**Audience:** Build and release maintainers; contributors investigating installed-package behavior.
**Status:** Temporary diagnostic research report.
**Authority:** First-party npm and Pacote source establish the described install path; local timing and timeout observations are implementation or validation evidence. This report is advisory and does not define product behavior.
**Expected use:** Use this source trace to interpret the current npm install failure and choose a bounded diagnostic when the test host is idle.
**Lifecycle:** Temporary. When the npm archive stall tracked by issue #212 is resolved, consolidate any lasting package-install test guidance into [the testing matrix](../../docs/testing-matrix.md) and [installed compatibility guidance](../../docs/installed-release-compatibility.md), then delete this report.

# Local npm archive install stall

## Finding

The final `silly fetch manifest @hapsland/hapsland@file:...` line is emitted immediately before npm awaits `pacote.manifest(spec)`. In npm 11.19.0, Arborist's `#fetchManifest` logs that marker and then awaits Pacote, so the line is an entry marker, not a completion marker and not evidence of an HTTP request. [Arborist source](https://raw.githubusercontent.com/npm/cli/v11.19.0/workspaces/arborist/lib/arborist/build-ideal-tree.js#L1237-L1257)

The npm 11.19.0 release lockfile pins Pacote 21.5.1 and tar 7.5.19. For a local tarball, Pacote's `FileFetcher.manifest()` creates a temporary directory, calls `extract()` on the archive, and only then reads and normalizes `package.json`. The source stream is a local filesystem read. The extractor pipes the archive through `tar.x`; its filter does not select only `package.json`, so regular package files are unpacked during this metadata pass. [npm release lockfile](https://raw.githubusercontent.com/npm/cli/v11.19.0/package-lock.json#L9021-L9043), [Pacote file fetcher](https://raw.githubusercontent.com/npm/pacote/v21.5.1/lib/file.js#L17-L31), [local archive stream](https://raw.githubusercontent.com/npm/pacote/v21.5.1/lib/file.js#L55-L67), [Pacote extraction path and filter](https://raw.githubusercontent.com/npm/pacote/v21.5.1/lib/fetcher.js#L320-L374) and [tar extraction options](https://raw.githubusercontent.com/npm/pacote/v21.5.1/lib/fetcher.js#L388-L427)

The install has a second extraction phase: Arborist's reify path calls `pacote.extract(res, node.path, ...)` to populate the installed package after building the ideal tree. For a clean one-package install, the source therefore establishes at least two full archive-to-directory passes: one temporary unpack to inspect the manifest and another unpack for the installation. Pacote may serve the latter pass from its content cache, but it still has to unpack the package files. [Arborist reify/unpack path](https://raw.githubusercontent.com/npm/cli/v11.19.0/workspaces/arborist/lib/arborist/reify.js#L1182-L1218), [Pacote extract implementation](https://raw.githubusercontent.com/npm/pacote/v21.5.1/lib/fetcher.js#L329-L375)

This cost is explicitly recognized upstream. Pacote issue #97 describes extracting the full tarball into a temporary directory solely to read `package.json`; that behavior is still present in the v21.5.1 source. The issue documents redundant work, not a hang or a specific performance limit. [Pacote issue #97](https://github.com/npm/pacote/issues/97)

## What the current observations support

The worktree owner supplied an archive measurement of 268 MB compressed and 737 MB unpacked, with 35 entries and eight executables. GNU tar listing took 21.7 seconds. That listing measures reading and decompressing the archive without writing the extracted package; npm's manifest pass additionally writes package files to a temporary directory, and the later reify pass writes them to the install tree.

The worktree owner reported successful focused Pi test runs using the same archive and npm installation fixture: 41 seconds without coverage and 85 seconds with coverage. These are complete fixture/test-run times, not isolated npm installation measurements. Subsequent npm installation probes exceeded their 120-second child deadline both with and without coverage, including offline/no-audit/no-fund runs and a fresh cache. The variation means neither coverage nor a warm shared cache is established as the cause. The root's read-only cgroup check found no CPU quota throttling or memory OOM events; the host snapshot showed 298 processes, many long-lived Node main threads. This leaves shared-host contention plausible but unproven.

The repository's physical-archive runtime fixtures do not run npm installation. The testing matrix assigns clean npm install and setup behavior to package conformance, so a runtime fixture pass does not resolve this install failure. [Testing matrix](../../docs/testing-matrix.md#which-gate-to-run)

## Interpretation and limit

The tried `--ignore-scripts`, offline, audit/fund, omit, and cache options do not bypass this manifest step: Pacote's file-manifest path still extracts the local tarball, and npm runs lifecycle scripts after `arb.reify`. [npm install flow](https://raw.githubusercontent.com/npm/cli/v11.19.0/lib/commands/install.js#L135-L168), [Pacote manifest path](https://raw.githubusercontent.com/npm/pacote/v21.5.1/lib/file.js#L17-L31)

The strongest current candidate is simply the archive work on the manifest path: read 268 MB, decompress and unpack 737 MB into a temporary tree, cache the archive bytes, then unpack the package again during reify. The log boundary and archive size make that a supported mechanism for substantial fixed work. They do **not** prove whether the 120-second timeout came from gzip CPU time, filesystem writes, cache writes, event-loop scheduling, host contention, or an npm/tar defect.

There is no first-party issue found here that matches this exact signature on npm 11.19.0, Node 24.20.0, Linux arm64. Pacote #97 is the directly relevant upstream report: it confirms the full manifest-time extraction, not the observed timeout's cause.

## Smallest next probe

When the Pi/Claude test work is idle, compare one full extraction with one direct call to the npm-bundled Pacote 21.5.1 on the same archive and filesystem. Use fresh owned temporary destinations, no coverage, and `/usr/bin/time -v` for elapsed time, user/system CPU, maximum RSS, and filesystem input/output counters:

1. Extract once with GNU tar using the same `--strip-components=1` layout npm expects.
2. Call `pacote.manifest('file:<absolute-archive-path>', { where: '<fixture-root>', cache: '<owned-temp-cache>' })` through the Pacote copy bundled with npm 11.19.0. Do not print the returned manifest; only record success and timing.

The tarball install contract requires a package subdirectory and `package.json` with `name` and `version`; npm strips one directory level during installation. [npm install tarball contract](https://github.com/npm/cli/blob/v11.19.0/docs/lib/content/commands/npm-install.md#L250-L261)

If Pacote's manifest call itself approaches the timeout while GNU tar is materially faster, the Node/Pacote extraction and caching path merits a focused profile. If both are similarly slow, large-file decompression and destination I/O under that host profile dominate. If both finish well within the deadline, a subsequent install trace with `--timing --loglevel=silly` can establish whether Arborist proceeds beyond the manifest call. Do not use a coverage run for this comparison because it measures the test harness and coverage instrumentation as well as npm.

## Follow-up validation

A subsequent isolated install of the same archive with Bun 1.3.14 completed in 2.89 seconds, including a successful packaged CLI runtime-identity check. All four public command links were executable. The install destination had its own private package manifest and a fresh owned cache. Clean-package conformance and all seven setup journeys then passed with Bun; their evidence records the manager used. The conformance harness now uses Bun by default and retains an explicit npm mode. This is a validated workaround for repeated local-archive installation, not proof of the npm timeout cause.

A subsequent npm probe with a fresh private install manifest, an installation-local working directory, and a fresh owned cache also completed in 17.34 seconds; all four command links were executable. The changed fixture isolation and host timing prevent attributing earlier timeouts to one cause. This validates basic local npm installation of the current archive, separately from the full Bun conformance journeys.
