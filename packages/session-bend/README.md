# Shared session scheduling

**Purpose:** Share deterministic workload scheduling between Monkey Business and the Bend game.
**Status:** Implemented prototype port; proposed laws remain unapproved and unproved.
**Authority:** Implementation and validation evidence, not an accepted product contract.
**Expected use:** Import `Session.bend` from native Bend; use compiler-generated `session.mjs` through the Monkey Business host adapter.
**Lifecycle:** Keep source, declarations, generated module and tests consistent whenever scheduling changes; review when either consumer changes its event mapping.

`Session.bend` owns seed hashing, xorshift32 jitter, task/edit/finish phases, pending-arrival rewind, generation invalidation, bursts, repairs and suspension. Monkey Business retains input validation, UTF-16 identity representation, event decoding and absolute JS timestamps. The game reuses task scheduling only: its own wave engine still owns enemies, pacing and outcomes. Construction and upgrades stay manual.

Run `node packages/session-bend/build.mjs` from the repository root to regenerate JavaScript with Bend 2.0.34. `--check` validates artifact hashes without requiring Bend. Run Monkey Business tests with `node_modules/.bin/vitest run packages/monkey-business/src --config vitest.config.ts` in a full Hapsland checkout. Tests compare 4,800 mixed transitions against the retained independent test-only pre-port reference, including Unicode identities, extreme allowed jitter and large absolute clocks. The full package regression suite also exercises the shared module. `node packages/session-bend/verify-native.mjs` compiles `Trace.bend` and compares its native seeded state and delay with the emitted-JS result.

Relative delays are U32: validated interval and variation are at most one billion, so intermediate sums fit. Native and emitted-JS Nat values are limited to 2^48−1, including counters and byte facts. Absolute Monkey Business clocks stay in the host and retain the existing JavaScript safe-integer input domain. The game uses small bounded counters and bytes. No runtime dependency was added; the native game does not run JavaScript.

`LAWS.bend` records proposed invariants only. Typechecking the implementation and passing regression tests do not establish their formal proofs.
