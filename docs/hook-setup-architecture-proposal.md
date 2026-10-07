# Hook and setup separation

**Purpose:** Capture candidate package structure, dependencies and implementation slices.
**Status:** Fluid advisory proposal; neither package layout nor workspace technology is decided.
**Authority:** Design proposal, not an accepted product contract or implementation instruction.
**Expected use:** Inform implementation; an architectural agent should review and revise it at each implementation milestone.
**Lifecycle:** Temporary. At completion of the hook/setup separation milestone, consolidate accepted decisions into `architecture.md` and the installation contract, update inbound links, then delete this proposal.

## Discussion decisions and open questions

Agreed direction: hooks-only executable and dependency closure; setup/admin excluded, including lazy imports. Keep one installable release with separate executables and Pi assets. Share small contracts and read-only inputs; retain resident IPC. These record discussion agreement pending consolidation into contract owners.

Undecided: workspace adoption/tool, package granularity, enforcement tool and Bun exit strategy. Avoid Bun-specific workspace coupling; replacing its runtime/compiler is a separate investigation. The repository already contains packages; no workspace conversion is approved here.

Questions: Can chosen tooling enforce transitive source imports and actual bundle contents, including aliases/dynamic imports? Can its native graph provide useful fallback visibility? What migration/build cost buys stronger isolation? Preserve compatible resident reuse unless separately reconsidered; retained release paths do not imply exclusive resident ownership.

## Current versus candidate

Current: root production TypeScript package; admin and hooks share `src/cli.ts`. Resident/parser/doctor have separate executable entries. Admin diagnostics and hooks both use resident-client code; the resident is a separate process, not a second CLI. Existing import checks cover eager imports only.

Candidate: one repository, private internal workspace packages, one published release containing independently compiled executables. Workspace adoption remains open. Prefer portable `package.json` workspaces, exports and TypeScript projects; keep Bun compilation behind a build adapter. Replacing Bun compilation/runtime is separate from changing workspace management and requires validation.

## Candidate layout and dependencies

- `apps/{admin,hook,resident,parser,doctor,pi-extension}`: thin executable/host composition roots.
- `packages/setup`: installation, repair, updates and credential management.
- `packages/hook-runtime`: runtime adapters, deadlines and native output.
- `packages/resident-client`: IPC, admission and collection.
- `packages/review-engine`: review execution and providers; parsing remains separately owned.
- `packages/runtime-inputs`: read-only configuration and credential capture.
- `packages/contracts`: small IPC schemas, hook descriptors and package identity; no general utilities bucket.
- `distribution/hapsland`: assembly of one release, including native assets.

Candidate edges: admin → setup; hook → hook-runtime → resident-client; resident → review-engine; parser → parsing implementation; Pi → runtime transport. Small contracts/runtime inputs may be shared. Setup registers retained-release hook paths; hooks never import setup/admin/provider execution. Diagnostics may use resident-client. Package count and seams remain adjustable.

## Enforcement side-quest (not an adoption decision)

BORROW: explicit dependency manifests, exports, TypeScript project references and full hook/Pi import-closure checks; include dynamic imports and fail on unaccounted computed imports. Validate actual production bundle resolution too.

OPTIONAL INTEGRATION: [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) documents forbidden-edge rules, graphs and literal dynamic imports; compatibility, license, computed-import handling and build agreement remain unverified. Spike before adoption; fall back to repository-owned graph checks.

Fallback visibility: [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/) plus [`npm query`](https://docs.npmjs.com/cli/v11/commands/npm-query/) expose installed package relationships as JSON. A manifest-derived workspace graph is portable, but neither proves the source/bundle graph obeys it.

## Candidate slices

1. Extract neutral contracts, read-only inputs and hook handlers; preserve behavior.
2. Atomically add the hook executable and update launcher, registrations, Pi, release inventories and integration fixtures; remove superseded CLI hook routing.
3. Deepen admin/setup interfaces; enforce package/source/build graphs and validate installed behavior. Architectural review at every milestone may revise the layout.

## Next research threads

Next session: rerun agent research; consult Astra on seams, dependency direction and implementation slices; ask Luna Max to compare dependency-cruiser alternatives and integrated tools such as Turborepo **only if they fit**. Distinguish task/package graphs from source-import enforcement and compiled-artifact isolation; compare portability, dynamic-import coverage, maintenance and replacement cost. Follow the repository research methodology; recommendations remain advisory.

Earlier Astra consultation supported separate executable/dependency graphs with one release. No new Astra/Luna consultation occurred for this workspace/enforcement follow-up: side-conversation instructions prohibit sub-agents. Current enforcement findings are documentation-only, not locally verified. Only this proposal was changed; no implementation or tooling adoption occurred.
