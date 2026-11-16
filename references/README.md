# Upstream references

**Purpose:** Keep upstream source and API documentation available for the Clairic integration discussion.
**Audience:** Contributors and coding agents evaluating Effect AI provider APIs.
**Status:** Research snapshot.
**Authority:** Captured upstream implementation and vendor documentation; advisory evidence only, not an accepted Hapsland or Effect contract.
**Expected use:** Compare current Effect provider boundaries with Cloudflare's published Clairic request and response contract before proposing an upstream change.
**Lifecycle:** Keep while preparing or discussing the Effect Clairic proposal; once the proposal is submitted or declined, delete this snapshot and retain any useful decision in the proposal discussion or its owning issue.

## Effect

[`effect-clairic/`](../../effect-clairic/) is a separate sibling checkout (moved out of this repository for fork work), originally a shallow clone of [Effect-TS/effect](https://github.com/Effect-TS/effect), branch `main`, captured at `9a680d6985c6a27d7ebb29cd9eb674f3fe524505` (2026-10-20 UTC+13). The source manifests identify the `effect`, `@effect/ai-typesafe`, and `@effect/ai-cloudflare` packages as `4.0.5`.

Relevant implementation:

- [`DecisionModel`](../../effect-clairic/packages/effect/src/ai/DecisionModel.ts) and [`Decision`](../../effect-clairic/packages/effect/src/ai/Decision.ts): provider-neutral decision contract.
- [`CloudflareClient`](../../effect-clairic/packages/ai/cloudflare/src/CloudflareClient.ts), [`CloudflareSchema`](../../effect-clairic/packages/ai/cloudflare/src/CloudflareSchema.ts), and [`CloudflareDecisionModel`](../../effect-clairic/packages/ai/cloudflare/src/CloudflareDecisionModel.ts): current Clef integration and REST transport.
- [`@effect/ai-cloudflare` tests](../../effect-clairic/packages/ai/cloudflare/test/) and [type tests](../../effect-clairic/packages/ai/cloudflare/typetest/): integration conventions.

## Cloudflare Clairic

The following files are unmodified Markdown captures from Cloudflare's official docs:

- [`model.md`](cloudflare-clairic/model.md) — model contract, field types, API examples, response shape, limits, and raw schemas. [Source](https://developers.cloudflare.com/ai/models/%40cf/cloudflare/clairic/).
- [`changelog.md`](cloudflare-clairic/changelog.md) — October 19, 2026 preview announcement. [Source](https://developers.cloudflare.com/changelog/post/2026-10-19-clairic-workers-ai/).

Both captures address Cloudflare Workers AI developers; this index addresses
Hapsland contributors and coding agents. Their bytes are preserved. The
upstream-only navigation link `#main-content` has no target in the Markdown
exports; `lychee.toml` excludes only that fragment in these two captures while
checking their remaining links normally.
