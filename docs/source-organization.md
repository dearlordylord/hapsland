# Source organization

**Purpose:** Define mandatory domain ownership, capability slices, and source dependency rules.
**Audience:** Contributors, including coding agents; architecture reviewers; build and release maintainers.
**Status:** Active contributor policy.
**Authority:** Accepted repository architecture policy, adopted by owner instruction on 2026-10-10. Named product contracts continue to own behavior and process authority.
**Expected use:** Apply before adding, moving, or splitting modules, types, package interfaces, or dependencies, and during structural reviews.
**Lifecycle:** Maintain with accepted ownership and dependency decisions. Review when a capability crosses a package or process, a shared owner changes, or enforcement changes; update this policy and affected guidance together.

## Domain ownership first

Organize source by the domain concepts and capabilities it owns. Name an owner
for each concept before choosing its files, folders, or workspace package.
Technical kinds such as commands, models, services, and storage may subdivide a
capability locally; they must not become repository-wide buckets that scatter
its behavior among unrelated owners.

Keep types and implementations with their domain owner. Being a type, pure
function, or reusable helper does not make a definition globally shared.

- Local concepts stay within their capability until their meaning and consumers justify sharing.
- Concepts shared across a narrower domain seam belong to a specifically scoped owner used by those consumers.
- Domain-wide concepts may have a domain-wide owner when their meaning is genuinely common across the product.

Shared owners must have a named concept, explicit consumers, dependency direction,
and a rationale for their scope. Transport contracts belong to their contract
owner; other shared concepts retain their own owners. An omnibus `common`,
`shared`, `types`, or `utils` owner is not a substitute for identifying that scope.

## Vertical capability slices

A vertical slice groups a capability's entry, workflows, models, effects, and
behavioral tests around the behavior it delivers. Within an implementation
owner, use capability folders with narrow entrypoints; keep implementation
stages and local models together. Place focused tests beside the capability or
in its matching verification-owner directory, with an explicit route between them.

A slice is a behavioral organization, not an implementation milestone or an
executable. Cross-process slices may have producer and consumer implementations
in different owners while retaining one named contract and behavioral test owner.
Preserve that path when reorganizing source, including cross-process checks.

Shared policy and state retain one authority. Splitting capabilities must not
create competing admission, capacity, freshness, or delivery state. The
[runtime ownership](architecture.md#runtime-ownership) and
[decision ledger](typescript-decision-boundary-ledger.md) identify those authorities.

## Interfaces, composition, and package extraction

Give callers a narrow interface that hides internal stages, ordering, and state
coordination. Document its invariants, ordering requirements, errors, configuration,
and operational constraints. Consumers use this interface rather than reaching
into implementation files. Split implementation where responsibilities and lifetimes separate;
file size and complexity scores are navigation aids, not reasons to introduce
forwarding layers or expose every helper.

Composition roots assemble dependencies, process resources, lifetimes, and
capability entrypoints. Domain workflows and decisions belong to their named
implementation owners. An application must consume another owner's declared
interface rather than another application's internals.

A capability folder does not automatically need a workspace package. Extract a
package when actual consumers, independent build needs, or enforceable ownership
justify it. Record its concept, interface, consumers, and allowed dependencies.
Choose names and directory depth to express that ownership; this policy mandates
neither a fixed package inventory nor a technical layer tree.

## Dependency and execution boundaries

Apply ownership rules to static, transitive, lazy, aliased, and type-only imports.
Keep source dependencies between capability owners and packages acyclic.
Where a consumer is restricted to read-only access, provide a read interface
whose source closure excludes mutation and administrative workflows. Respect the process-specific
capability restrictions owned by [runtime ownership](architecture.md#runtime-ownership)
and the named product contracts, including through shared helpers.

Source dependency enforcement and production artifact validation establish
different facts. Moving files, tree shaking, successful compilation, or a cache
hit alone does not establish isolation. Maintain one dependency declaration
authority and enforced agreement with actual source resolution and build inputs.
Use the [build contract](build-workflow-contract.md) for build and publication
requirements and [CHECKS.md](../CHECKS.md) for check selection.

## Structural review and completion

Changes to capability ownership, external interfaces, composition roots, shared
owners, or package dependencies require structural review. For a reorganization,
identify each affected capability's entry, workflow, contract, state authority,
and tests before changing its ownership. At each substantial restructuring
milestone, obtain an architectural agent review. Structural review covers:

- Domain and folder ownership, shared-owner scope, interface size, and composition roots.
- Dependency direction and closures, including lazy and type-only edges.
- Preserved capability paths, process boundaries, shared state authority, and behavioral test ownership.
- Agreement between declared dependencies, source enforcement, and affected build inputs.

Record decisions, rationale, and unresolved concerns in the change description
or their maintained owner. Resolve structural findings before dependent
integration. Passing tests does not replace structural review; review does not
replace the local checks required by the [testing matrix](testing-matrix.md).
Routine edits within an unchanged owner do not create a structural milestone.

Existing code is not an exemption from this policy. For an affected scope that
does not conform, identify and correct the mismatch as part of the authorized
reorganization; report any remaining mismatch explicitly. Changes to accepted
product authority or these rules require an explicit owner decision, while
routine conforming file and interface choices need no additional approval.
