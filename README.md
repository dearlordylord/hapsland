# Hapsland — realtime review integration

<p align="center"><img src="./assets/readme-splash.png" alt="Constructivist-inspired scene of a worker hand slapping a bony hand away from a laptop" width="480"></p>

This private repository develops Hapsland, a host-neutral integration for giving coding
agents configurable feedback after edits. Jev is the first external review backend;
Jev and Hapsland are distinct names.

The initial supported production profile targets Codex CLI 0.155.1 on Linux arm64 with
asynchronous, advisory post-write review through headless command hooks and a controlled
writer. Its exact limits, evidence levels, and exclusions are documented in
[`docs/direct-event-v1-supported-profile.md`](./docs/direct-event-v1-supported-profile.md).
The implementation uses TypeScript and the exact-matched Effect 4 RC cohort described in
[`AGENTS.md`](./AGENTS.md).

## Genesis use case

The product began from one specific recurring failure in current coding agents: whenever an
agent writes or changes an interface, type, or schema, review that declaration as its own
type-shape artifact and determine whether it makes invalid domain states representable. Do this
for every such declaration, automatically and early enough for the agent to repair the design
before continuing.

Here, an invalid state is a concrete value or field combination admitted by the declaration that
has no meaning in the domain. The governing invariant and review question are Rule 2 in
[`TYPE-DESIGN-RULES.md`](./TYPE-DESIGN-RULES.md#2-every-representable-combination-is-meaningful).
This declaration-level use case is the product's origin, not a claim that every future rule must
operate on a complete file or use the same evidence boundary.

## Current scope

The supported review path starts with completed Codex edits. Declaration extraction was
explored, but the comparison did not authorize a production extractor. The current input
and coverage boundaries are in the
[supported profile](./docs/direct-event-v1-supported-profile.md).

## Current status

- The runtime uses Effect's provider-neutral `Decision` / `DecisionModel` API and
  `@effect/ai-typesafe` for Jev review.
- The supported Codex profile and its evidence levels are documented in the
  [profile declaration](./docs/direct-event-v1-supported-profile.md).
- Ordinary tests remain deterministic and make no Jev network calls. Live validation
  requires an explicit opt-in milestone.

See [`PRODUCT-IMPLEMENTATION-PLAN.md`](./PRODUCT-IMPLEMENTATION-PLAN.md) for the staged
plan and [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary.

<!-- configuration-readme:start -->

## Configuration

Configure file selection and exclusions, whole-file JSON request settings, local rule packs, per-rule overrides, and the credential environment-variable reference. The product accepts layered JSONC files; repository enablement remains a separate user-owned grant.

A small project configuration:

```jsonc
{
  "version": 1,
  "includes": [
    "src/**"
  ]
}
```

See the [complete configuration guide](./docs/configuration.md) for field details, rule packs, precedence, and runtime behavior.

<!-- configuration-readme:end -->

## Development

```sh
npx --yes bun@1.3.14 install
npm run config:generate
npm run config:check
npm run typecheck
npm test
npm run conformance:package
npm run review -- --controlled < request.json
```

`npm pack` builds JavaScript release entry points for the review CLI, TypeScript parser,
resident process, and offline package doctor. The tested installed profile is exactly Node
24.20.0 on Linux arm64 with Git and `/proc/self/fd`, plus Node 24.20.0 on macOS arm64 with
Git and a packaged `openat` capture helper. The macOS controlled package path and authenticated
Codex CLI 0.156.0 host cell are verified. Other operating systems and architectures are
unsupported. After installing the tarball, run
`hapsland-doctor` for source-free compatibility checks and recovery actions. The public commands
use an installed, platform-specific Node 24.20.0 runtime, so the shell's Node version does not
select the review runtime. Installation may fetch production dependencies, including that runtime,
once; keep optional dependencies enabled. The no-script installation does not compile native code.
Hook invocations use the installed CLI
and resident and do not download packages per edit.

The packaged CLI's preview/install/enable/disable/uninstall contract, ownership rules, recovery
behavior, and native trust handoff are documented in
[`docs/codex-installation.md`](./docs/codex-installation.md).
For the proposed registry release, use the
[`Codex npm quickstart`](./docs/npm-quickstart.md). The public command is
`hapsland`. The product is Hapsland and Jev is the external backend. The registry release is pending
the [release record](./docs/npm-release-record.md).
After setup completes, the [installation guide](./docs/codex-installation.md) also documents the separate `hapsland --demo` preview and
live-confirmation flow. Its default preview is offline; a live run requires a new consent
digest for a generated disposable repository and explicit request, source, and time limits.

`npm run conformance:package` packs into an isolated temporary prefix, installs with production
dependencies only, and runs the parser and controlled offline review outside the checkout. Add
`-- --real-codex --write-evidence` only for the declared real-host acceptance fixture; it uses
an isolated Codex home and temporary Git repository, does not change the user's host, removes
provider credentials, and retains only sanitized package/host outcomes.

`npm run conformance:installed-release` verifies the assembled installed-product evidence and
replays the complete offline lifecycle in isolated homes. Its declared compatibility cells include
a supervised synthetic first review through real Jev on Linux arm64; that test used normal native
hook trust and a labeled host sandbox bypass in this container. Exact versions, checksums,
setup-effort evidence, and the rule that untested cells remain
gaps are published in
[`docs/installed-release-compatibility.md`](./docs/installed-release-compatibility.md). The command
does not call Jev or perform an authenticated Codex retry.
The local single-repository opt-in pilot is scoped in
[`docs/codex-opt-in-pilot.md`](./docs/codex-opt-in-pilot.md).

Review dispatch is repository opt-in. The explicit enable operation first previews the
canonical Git working-tree root, fixed Jev backend, actual destination, and
repository-wide eligible-source scope. Confirm that proposal with its digest to record
a user-owned grant; project configuration cannot create that grant. For a temporary
state directory (useful in tests), set `REVIEW_STATE_PATH`:

```sh
printf '%s\n' '{"version":1,"operation":"enable","cwd":"/absolute/repo"}' \\
  | REVIEW_STATE_PATH="$HOME/.config/realtime-review-tool/consent" node src/cli.ts --enable
printf '%s\n' '{"version":1,"operation":"enable-confirm","cwd":"/absolute/repo","proposalDigest":"<digest-from-preview>"}' \\
  | REVIEW_STATE_PATH="$HOME/.config/realtime-review-tool/consent" node src/cli.ts --enable-confirm
printf '%s\n' '{"version":1,"operation":"disable","cwd":"/absolute/repo"}' \\
  | node src/cli.ts --disable
printf '%s\n' '{"version":1,"operation":"credentials","cwd":"/absolute/repo"}' \\
  | node src/cli.ts --inspect-credentials
```

`--inspect-credentials` reports only the configured environment-variable name and
whether the resolved source is present. On Linux and macOS, `hapsland --login` uses masked
terminal input with the platform's native credential store;
`hapsland --login --credential-stdin` is the explicit headless form, and
`hapsland --logout` removes the owned saved item. Project configuration refers to a
credential environment-variable name; secret values and environment files are never
stored in project files or printed. The Jev backend and `/v1/systemone` destination are
fixed in this phase; arbitrary endpoint routing is not supported. Configuration cannot
grant repository approval. Hooks do not prompt: without a matching root/backend/destination
grant, review returns a bounded `skipped` result and makes no provider request. Disabling
affects future dispatches and does not claim to recall a request already sent.

The supported Codex event boundary is documented in the
[direct-event profile](./docs/direct-event-v1-supported-profile.md). During development, a
Codex command hook invokes
`node /absolute/path/to/this/repo/src/cli.ts --codex-hook --controlled-writer`.
The second flag is an explicit operator assertion that the supported Add event is in the
controlled-writer envelope; matching source reads alone never establish attribution.
Without that assertion, supported Add input stays quiet rather than falling back to the
superseded whole-file path. A packed installation invokes the corresponding installed
`dist/cli.js` entry and never depends on this source path. Live use reads `TYPESAFE_API_KEY` through
the Effect provider configuration. Run the live integration checks only with explicit
opt-in via `npm run test:live`. The reproducible 100-call milestone additionally requires
`RUN_LIVE_JEV_BENCHMARK=1 npm run benchmark:live`.

The initial direct-event capture profile is Linux-only. It binds the adapted working-tree
device/inode to an open directory descriptor and traverses through `/proc/self/fd`; hosts
without that facility are unsupported rather than falling back to path-only source reads.

Offline readiness diagnosis and headless activity inspection are documented in
[`docs/status.md`](./docs/status.md). Doctor checks the selected installed integration
without prompts, repairs, source reads, or Jev calls. Status uses an explicit host session
ID and bounded source-free resident activity, labels legacy receipts separately, and never
treats silence or missing instrumentation as a clear review.

The maintainer-only semantic evaluation protocol and its sanitized offline milestone
evidence are documented in [`docs/evaluation.md`](./docs/evaluation.md) and
[`evidence/evaluation/README.md`](./evidence/evaluation/README.md). Ordinary tests and
the review hook never run the maintainer evaluation suite against Jev.
