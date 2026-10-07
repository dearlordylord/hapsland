# CLI interaction surfaces and acceptance

**Purpose:** Inventory the human-input surfaces, deliberate exceptions and evidence required for #244.
**Status:** Production integration and prototype consolidation completed; observed validation limits remain explicit below.
**Authority:** Maintained implementation and validation inventory. [#244](https://github.com/dearlordylord/hapsland/issues/244) and the linked domain contracts own required behavior; test results establish only their executed scope.
**Expected use:** Locate each workflow and its checks, and audit every row before declaring integration complete.
**Lifecycle:** Update when a CLI input surface, owner, scenario or validation result changes. Review all rows before closing #244 and when adding another interactive command.

The [architecture decision](../adr/0004-administration-cli-interactions.md) defines ownership, consent and Effect lifetime. Installation and credential behavior remain governed by [installation workflows](../installation-workflows.md). The [testing matrix](../testing-matrix.md) determines required checks.

| Surface | Production disposition | Behavior evidence owner | Replay documentation |
| --- | --- | --- | --- |
| Bare setup / agent selection | Shared selection, then per-agent setup; Back preserves current selection | [selection](../../src/onboarding/client-selection.test.ts), [terminal setup](../../src/onboarding/interactive.test.ts) | Selection transport is tested independently; [setup](setup.md) covers each selected agent's conversation |
| Explicit-client setup / pilot command | Setup reducer and Effect owner service; separate hook and default-rule approval | [pilot](../../src/onboarding/pilot.test.ts), [setup owner](../../src/onboarding/setup.test.ts) | [Setup](setup.md) |
| Credential verification / replacement | Source-aware reducer; separate saving and paid-check consent; bounded requests | [verification](../../src/onboarding/credential-verification.test.ts), [native storage seam](../../src/onboarding/credential-verification-storage.test.ts) | [Verification](verification.md) |
| Rules mutation | Project/Personal selection, actual owner preview and digest-bound approval | [rules interaction](../../src/rules/interaction.test.ts), [rules CLI](../../src/rules/cli.test.ts) | [Rules](rules.md) |
| Update | All applicable previews precede grouped approval; per-agent outcomes and activation remain distinct | [update](../../src/onboarding/update.test.ts), [terminal lifecycle](../../src/onboarding/interactive.test.ts) | [Update](update.md) |
| Repair / reinstall / uninstall | Inspected recovery operation and per-agent approval | [maintenance](../../src/onboarding/maintenance.test.ts), [terminal lifecycle](../../src/onboarding/interactive.test.ts) | [Maintenance](maintenance.md) |
| Interactive login | Existing native mutation owner with scoped hidden capture | [login interaction](../../src/credentials/login-interaction.test.ts), [credential process/TTY](../../src/credentials/cli.test.ts) | [Login](login.md) |
| Explicit interactive JSON setup | Structured request remains on stdin; authorized key entry uses the controlling terminal | [setup process/TTY](../../src/onboarding/setup.test.ts), [installed setup](../../scripts/run-setup-package-conformance.mjs) | Deliberate structured-input exception; no invented dialog states |
| Credential-stdin / logout | Explicit direct commands; no unsolicited dialog | [credential CLI](../../src/credentials/cli.test.ts) | Deliberate direct-input/output exceptions |
| Doctor / rules list, show and explain / dashboard | Direct inspection; no wizard | [CLI parser](../../src/cli-command.test.ts), [rules CLI](../../src/rules/cli.test.ts), [dashboard HTTP](../../src/inspection/http.test.ts) | Deliberate inspection exceptions |
| Ordinary JSON / unattended setup | Version-one request and explicit preview/apply contracts preserved | [CLI](../../src/cli.test.ts), [setup](../../src/onboarding/setup.test.ts), [unattended owner](../../packages/administration/src/onboarding/unattended.ts) | Deliberate automation exceptions |

## Observed integration evidence

The 2026-10-07 integration candidate passed the following local checks. These results describe their executed boundaries; they do not declare full-project qualification or native coding-agent approval.

- macOS arm64: fast gate; 58 setup, verification/storage and interaction-terminal tests; 8 credential CLI/PTY tests.
- Linux arm64: the same 58 owner/terminal tests and 27 credential CLI/setup PTY tests, in an isolated container without a host workspace mount.
- Both platforms: all nine installed setup journeys, including controlling-terminal capture, hidden-input cancellation preserving the previous credential, terminal restoration and fixture-only activation. Provider calls were zero.
- Linux installed lifecycle: approval grouping, active-package routing, retained Claude/Codex hooks, repair/reinstall/uninstall and Pi conflict/idempotency cases. The source fallback assertion checks the selected pinned Bun, as required by the source command owner.
- The ordinary two-profile build passed with explicit `HAPSLAND_BUILD_BUN`, including publication and process cleanup. Assembly tasks now preserve that documented override; executable identity, cache inputs and inventory checks remain enforced.
- All four physical build campaigns completed their assertions and rollback/repair within 240 seconds: [interaction-only change](../../evidence/build-243/build-acceptance-1791410894842-21334.json), [incomplete cached interaction output](../../evidence/build-243/build-acceptance-1791411136201-24977.json), [shared implementation with unchanged declarations](../../evidence/build-243/build-acceptance-1791411282903-27493.json), and [changed dependency policy](../../evidence/build-243/build-acceptance-1791411548080-32002.json).
- Astra milestone review findings were repaired: deferred CLI flags are read after parsing, hidden-input cancellation preserves required activation, and later successful agents cannot erase an earlier failure. A follow-up review of the Bun propagation fix found no issues.
- All six interaction diagrams passed freshness checks. The full documentation gate passed on macOS with `TMPDIR=/private/tmp`; the default aliased temporary path still makes two existing architecture-generator CLI fixtures return without executing. This environment limitation remains separate from diagram freshness and local-link correctness.
- The provider instruction-limit predicate was extracted without changing violation priority or Unicode code-point counting. Its 32 focused provider/limit tests, TypeScript and fast gate passed; Astra found no semantic issues. The complexity preflight now reports no guaranteed threshold failures, which is not a coverage result.

The installed checks above used archive SHA-256 `916fc05605c9bf631a7178b104841d005652da77009f430180cec168ce7bec11`; packaging reproduced those bytes after the lifecycle assertion correction. After the provider-limit refactoring, ordinary two-profile archive preparation passed in 237.8 seconds and produced `0188b32a0aac2d589b0e9922e6df9027cc1da89d29befc55f2c652ab89fb08b8`. That newer archive has build and packaging evidence, but has not undergone installed execution. The earlier installed results must not be relabeled as execution of the newer bytes.

## Acceptance decision and limits

On 2026-10-07 the owner accepted the completed full-quality attempt plus focused validation of its diagnosed complexity failure for #244, and directed continuation without another full run. This closes the separate full-run condition for this integration; it does not establish fresh full-project coverage or a passing final CRAP analysis. Those stages did not execute. Repository quality thresholds, missing-evidence policy and future gate requirements are unchanged.

Adopted interaction decisions now live in the architecture decision, installation workflows and configuration guide. Production workflow tests and all six generators own the retained behavior and diagrams. The #244 setup-interaction prototype and superseded proposal have been removed; Git history retains the experiments. Unrelated prototypes are outside this cleanup.

Visual readability remains an owner assessment, distinct from programmatic PTY acceptance. The archive identities and installed-execution limits above remain unchanged.

Each generated diagram names its scenarios and limits. `npm run interaction:diagrams:write` explicitly regenerates documentation; `npm run interaction:diagrams:check` is non-writing. These public commands follow the repository's maintained documentation-generation inventory.
