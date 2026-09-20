# Realtime review integration prototype

This private repository develops an unnamed, host-neutral integration for giving coding
agents configurable feedback after edits. Jev is the first external review backend; it is
not the product name.

The first supported path targets Codex CLI with synchronous, advisory post-write review.
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
npm run review -- --controlled < request.json
```

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
whether it is non-empty. The default is `TYPESAFE_API_KEY`; credential values and
environment files are never stored or printed. Project settings are optional JSONC in
`.review.jsonc` at the Git root. It may select the credential variable, but the Jev
backend and `/v1/systemone` destination are fixed in this phase; arbitrary endpoint
routing is not supported. `consent`/`enabled` fields never authorize source transmission.
Hooks do not prompt: without a matching root/backend/destination grant, review returns a
bounded `skipped` result and makes no provider request. Disabling affects future
dispatches and does not claim to recall a request already sent.

The product-owned JSON contract is documented in
[`CODEX-ADAPTER-CONTRACT-v1.md`](./CODEX-ADAPTER-CONTRACT-v1.md). During development, a
Codex command hook invokes `node /absolute/path/to/this/repo/src/cli.ts --codex-hook`;
packaged installation belongs to a later phase. Live use reads `TYPESAFE_API_KEY` through
the Effect provider configuration. Run the paid integration checks only with explicit
opt-in via `npm run test:live`. The reproducible 100-call milestone additionally requires
`RUN_LIVE_JEV_BENCHMARK=1 npm run benchmark:live`.

Headless activity inspection is documented in [`docs/status.md`](./docs/status.md). It
uses an explicit host session ID and local source-free receipts; readiness and observed
activity are reported separately.

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
