# Realtime review integration prototype

This private repository develops an unnamed, host-neutral integration for giving coding
agents configurable feedback after edits. Jev is the first external review backend; it is
not the product name.

The first supported path targets Codex CLI with synchronous, advisory post-write review.
The implementation uses TypeScript and the exact-matched Effect 4 RC cohort described in
[`AGENTS.md`](./AGENTS.md).

## Current status

- Research and architecture advisory material is complete for the initial comparison.
- The Jev decision prototype uses Effect's provider-neutral `Decision` / `DecisionModel`
  API and `@effect/ai-typesafe`.
- The next delivery stages are the Codex adapter contract, a targeted runtime probe, a
  deterministic end-to-end slice, and a live Jev slice.

See [`PRODUCT-IMPLEMENTATION-PLAN.md`](./PRODUCT-IMPLEMENTATION-PLAN.md) for the staged
plan and [`CONTEXT.md`](./CONTEXT.md) for the domain vocabulary.

## Development

```sh
npx --yes bun@1.3.14 install
npm run typecheck
npm test
```

The historical `vendor/distilled` tree is retained as a Git submodule and migration oracle;
it is not an active workspace or production dependency. Clone it when that evidence is
needed:

```sh
git submodule update --init
```
