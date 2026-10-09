# Runtime and platform support

**Purpose:** State the runtime and platform profile used by ready-made and source-built Hapsland distributions.
**Audience:** End users choosing an installation route; build and release maintainers.
**Status:** Active maintained support guide.
**Authority:** Maintained distribution guidance; per-agent installation guides and build contracts own their requirements.
**Expected use:** Check the supported operating-system and architecture targets, then follow the relevant installation or build guide.
**Lifecycle:** Keep aligned with the package manifest, release build contract and installation guides; review when a target, embedded runtime or distribution route changes.

Ready-made Hapsland distributions target Linux and macOS on arm64. Homebrew and npm
are the documented installation routes. The standalone commands embed Bun 1.3.14,
so an end user's system does not need Node.js or Bun on `PATH`. See the
[installation workflows](installation-workflows.md) for setup instructions and
the [publishing runbook](npm-publishing.md) for archive and package details.

Building from source uses Node.js 24.20.0 and Bun 1.3.14. These are build-tool
versions; agent runtimes such as Codex CLI, Claude Code and Pi have separate
requirements in their respective installation guides. The documented target
profile does not certify that every artifact or agent-runtime combination has
been executed. The product-specific guides state their own tested behavior and
limits.
