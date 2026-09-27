# Local npm archive preflight evidence — 2026-09-24

This is a historical local observation, not a release plan or a claim about a
published package. The future publication procedure is in the
[publishing guide](../../docs/npm-publishing.md); [issue #87](https://github.com/dearlordylord/hapsland/issues/87)
tracks publication separately.

The candidate package was `@hapsland/hapsland@0.1.0` with the `hapsland` command.
The reviewed source commit was `a5939c97c4029ab5b9b0cd336cb04ba7dbcd9856`.
The audited local archive had SHA-256
`88475afb074e61dfd04098d87344e6bed72218fef87763be99358b04d07a8965`.
[`scripts/npm-release-pin.json`](../../scripts/npm-release-pin.json) records that
candidate pin.

The 2026-09-24 local preflight ran on Linux arm64 with Node 24.20.0. Typecheck,
build, native artifact verification, setup-package conformance, and local
package conformance passed. One installation-recovery check failed in the first
full offline run, then passed alone and with its file; the complete suite then
reported 450 passed and 2 skipped. The clean-worktree archive audit accepted
111 files, including seven pinned native artifacts. These observations do not
establish registry or real-host compatibility.

A read-only public-registry lookup on 2026-09-26 returned `E404` for
`@hapsland/hapsland@0.1.0`. This observation does not establish whether a
private package exists.
