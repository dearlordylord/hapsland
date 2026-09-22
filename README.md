# Realtime review integration prototype

This private repository develops an unnamed, host-neutral integration for giving coding
agents configurable feedback after edits. Jev is the first external review backend; it is
not the product name.

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

## Current research direction

Pause broader review-integration development while researching and prototyping declaration
extraction. The prototype should identify each added or changed interface, type, or schema; present
each as an independent artifact with the minimum necessary referenced context; and measure whether
that boundary detects invalid representable states more reliably than edit- or file-level review.

Whether to continue building the product or use Abide as the review integration remains open until
that experiment is evaluated. This is a research gate, not a commitment to a particular parser,
language set, or production architecture.

The [extraction feasibility brief](./EXTRACTION-FEASIBILITY-BRIEF.md) records the current
TypeScript 7+ scope, TypeScript/Zod/Effect Schema cases, diff-review hypothesis, and parked
work. The [tooling research](./RESEARCH-DECLARATION-EXTRACTION-2026-09-20.md) is advisory;
the proposed extraction composition has not yet been runtime-validated.

## Current status

- Research and architecture advisory material is complete for the initial comparison.
- The Jev decision prototype uses Effect's provider-neutral `Decision` / `DecisionModel`
  API and `@effect/ai-typesafe`.
- The versioned Codex adapter contract and sanitized `0.155.1` runtime probes cover
  headless, interactive, and multi-file post-write-to-advice behavior.
- The runtime command uses the pinned Effect 4 `DecisionModel` authority for both controlled
  tests and the live `@effect/ai-typesafe` provider.
- The credential-gated live Jev milestones pass for the recorded representative rule, the
  full nine-rule batch, and 100 complete product-process calls. The 100-call sample had no
  unavailable or malformed result; see the sanitized latency, retry, and usage aggregates
  under [`evidence/codex/0.155.1`](./evidence/codex/0.155.1/README.md). Ordinary tests still
  make no paid network calls.

See [`PRODUCT-IMPLEMENTATION-PLAN.md`](./PRODUCT-IMPLEMENTATION-PLAN.md) for the staged
plan and [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary.

## Development

```sh
npx --yes bun@1.3.14 install
npm run typecheck
npm test
npm run conformance:package
npm run review -- --controlled < request.json
```

`npm pack` builds JavaScript release entry points for the review CLI, TypeScript parser,
resident process, and offline package doctor. The tested installed profile is exactly Node
24.20.0 on Linux arm64 with Git and `/proc/self/fd`, plus Node 24.20.0 on macOS arm64 with
Git and a packaged `openat` capture helper. The macOS controlled package path is tested; its
real Codex-host cell remains unverified. Other operating systems and architectures are
unsupported. After installing the tarball, run
`review-tool-doctor` for source-free compatibility checks and recovery actions. Installation
may acquire and build production dependencies once. Hook invocations use the installed CLI
and resident and do not download packages per edit.

The packaged CLI's preview/install/enable/disable/uninstall contract, ownership rules, recovery
behavior, and native trust handoff are documented in
[`docs/codex-installation.md`](./docs/codex-installation.md).
After setup completes, that guide also documents the separate `review-tool --demo` preview and
live-confirmation flow. Its default preview is offline; the paid run requires explicit fixed
budgets and a new consent digest for a generated disposable repository.

`npm run conformance:package` packs into an isolated temporary prefix, installs with production
dependencies only, and runs the parser and controlled offline review outside the checkout. Add
`-- --real-codex --write-evidence` only for the declared real-host acceptance fixture; it uses
an isolated Codex home and temporary Git repository, does not change the user's host, removes
provider credentials, and retains only sanitized package/host outcomes.

`npm run conformance:installed-release` verifies the assembled installed-product evidence and
replays the complete offline lifecycle in isolated homes. Its compatibility verdict is currently
blocked by the untested authenticated macOS/Codex cell and the inconclusive installed first-review
milestone. Exact versions, checksums, setup-effort evidence, and the rule that untested cells remain
gaps are published in
[`docs/installed-release-compatibility.md`](./docs/installed-release-compatibility.md). The command
does not perform paid Jev work or an authenticated Codex retry.

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
whether the resolved source is present. On Linux and macOS, `review-tool --login` uses masked
terminal input with the platform's native credential store;
`review-tool --login --credential-stdin` is the explicit headless form, and
`review-tool --logout` removes the owned saved item. The default is `TYPESAFE_API_KEY`;
credential values and environment files are never stored in project files or printed. Project settings are optional JSONC in
`.review.jsonc` at the Git root. It may select the credential variable, but the Jev
backend and `/v1/systemone` destination are fixed in this phase; arbitrary endpoint
routing is not supported. `consent`/`enabled` fields never authorize source transmission.
Hooks do not prompt: without a matching root/backend/destination grant, review returns a
bounded `skipped` result and makes no provider request. Disabling affects future
dispatches and does not claim to recall a request already sent.

The product-owned JSON contract is documented in
[`CODEX-ADAPTER-CONTRACT-v1.md`](./CODEX-ADAPTER-CONTRACT-v1.md). During development, a
Codex command hook invokes
`node /absolute/path/to/this/repo/src/cli.ts --codex-hook --controlled-writer`.
The second flag is an explicit operator assertion that the supported Add event is in the
controlled-writer envelope; matching source reads alone never establish attribution.
Without that assertion, supported Add input stays quiet rather than falling back to the
superseded whole-file path. A packed installation invokes the corresponding installed
`dist/cli.js` entry and never depends on this source path. Live use reads `TYPESAFE_API_KEY` through
the Effect provider configuration. Run the paid integration checks only with explicit
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
the review hook never perform a paid evaluation.

The historical `vendor/distilled` tree is retained as a Git submodule and migration oracle;
it is not an active workspace or production dependency. Clone it when that evidence is
needed:

```sh
git submodule update --init
```
