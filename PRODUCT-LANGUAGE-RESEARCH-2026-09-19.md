# Product implementation-language research

**Date:** 2026-09-19 (America/Montreal)  
**Status:** advisory research; not a normative product specification  
**Canonical path for this pass:** `PRODUCT-LANGUAGE-RESEARCH-2026-09-19.md`  
**Scope:** TypeScript, Rust, Go, and credible hybrid designs for the unnamed
host-neutral realtime review product. Jev is the external review backend, not the
product name.

> **Adoption update (2026-09-19):** The TypeScript recommendation is accepted. Its Jev
> dependency recommendation is superseded by the implementation decision to use the
> matched latest Effect 4 RC cohort: `Decision` / `DecisionModel` plus
> `@effect/ai-typesafe` (currently `4.0.0-rc.116`). References below to adopting
> `@typesafe-ai/sdk`, direct HTTP, or the local `@distilled.cloud/typesafe-ai` wrapper
> remain evidence from the original comparison, not the selected production path.

## Executive recommendation

Use **TypeScript as the version-one implementation language**, with these boundaries:

1. Keep the review core independent of every agent host and of the raw Jev response.
2. Ship a synchronous, language-neutral command adapter whose stdin/stdout contract is
   versioned JSON. Initially run it on Node.js 20+ or a measured Bun-compiled executable.
3. Add very small native TypeScript shims for hosts whose real extension ABI is
   JavaScript/TypeScript, notably OpenCode and Pi. Those shims call the same core contract;
   they do not become a second implementation.
4. Treat an already-connected MCP server as a later process-lifetime optimization where a
   host's lifecycle hook can invoke MCP synchronously. Do not require MCP for version one.
5. Do not introduce Rust or Go into version one. Reconsider a Rust or Go executable only if
   measurements show that process startup, resident memory, binary deployment, or an
   enterprise installation constraint materially fails the TypeScript acceptance budget.

This is a **conditional** recommendation. No startup, memory, packaging, host, or live Jev
benchmark was run in this pass. Claims that Rust or Go would start faster, use less memory,
or appear more credible are hypotheses until measured. The principal reason to start with
TypeScript is integration leverage, not assumed runtime speed: the official Jev JavaScript
SDK is available; this repository and its prototype client are TypeScript; and OpenCode and
Pi expose native TypeScript/JavaScript extension surfaces. Codex, Claude Code, and Kimi Code
all admit external command hooks, so TypeScript does not prevent those adapters.

The architecture should preserve an exit: a bounded JSON contract makes a later Rust or Go
core an implementation replacement rather than a host-plugin rewrite.

## 1. Research brief and change log

### Question

Which implementation language and process shape best support a synchronous post-edit,
advisory review path across Codex CLI first and OpenCode, Claude Code, Kimi Code, and Pi
later, while calling Jev safely, distributing predictably, and retaining a usable extension
boundary?

### Current product assumptions

- Version one is post-write, synchronous, advisory, and fail-open with respect to an edit.
- Codex CLI is first; other hosts are documented design targets until exercised in their
  real runtimes.
- All applicable Noul questions for one file are sent in one Jev request; the returned map
  is validated before local policy derives advice.
- A hook may be started once per event, so cold-process cost and failure behavior matter.
- Source and configured questions can leave the machine only after local eligibility and
  privacy checks.
- User rules should be configurable without modifying a host adapter. A mature public
  executable-plugin ABI is not a version-one requirement.

### Representative workflows

| Workflow | Language-decision pressure |
|---|---|
| Codex successful edit -> synchronous advice | Cold start, JSON stdin/stdout correctness, stdout discipline, timeout/cancellation |
| Multiple installed hooks | No global runtime mutation; idempotent install; bounded resources under concurrent starts |
| Headless execution | No interactive installer or `ask`; deterministic diagnostics and exit behavior |
| Jev timeout/429/529/malformed response | Bounded retry and cancellation; unavailable is not an empty assessment |
| Future OpenCode/Pi integration | Native TypeScript API compatibility without coupling the core to a host |
| Future Claude/Kimi integration | Portable executable/command packaging and host-specific output translation |
| User-authored analyzer later | Versioned, capability-limited process protocol rather than unstable native ABI |

### Existing-solution baseline

The baseline is not “write all transport and host machinery ourselves.” It is:

- official host lifecycle hooks or native plugin APIs;
- the official TypeSafe JavaScript SDK where its runtime and packaging gates pass;
- a narrow direct-HTTP Jev client as the language-neutral fallback;
- standard package registries or signed release artifacts rather than a custom updater.

A multi-language core must beat that baseline after accounting for adapter duplication,
release matrices, debugging, and replacement cost.

### Existing-solution baseline sufficiency assessment

The baseline is **sufficient as a set of building blocks, not as the product**. Official
host surfaces supply lifecycle entry points and TypeSafe supplies a typed SDK or direct HTTP
endpoint (E01-E15). No official component examined here combines cross-host event
normalization, pre-egress filtering, snapshot identity, Noul-map validation, local rule
policy, bounded advisory delivery, composition-safe installation, and diagnostics. The
evidence therefore supports building the thin product layer while depending conditionally
on host surfaces and, if its gates pass, the official SDK. It does not support replacing
host hooks, forking a host, or building a general agent runtime.

### Discovery and stopping condition

Primary discovery covered official host documentation/source, official TypeSafe API and
SDK sources, official language/runtime and package-manager documentation, and the local
repository/package sources. Searches included combinations of each host with `hooks`,
`plugins`, `extensions`, `install`, and `security`, plus each language with standalone
distribution and plugin ABI terms.

The pass stopped after a host-boundary pass, a runtime/distribution pass, and a
security/ABI follow-up produced no additional architecture class. This is not a claim of
ecosystem completeness. Package popularity, broad hiring data, every cross-compilation
tool, and third-party updaters were intentionally excluded.

### Change log

This is the first language-decision report. It does not supersede the general product
research advisory or the implementation plan. It supplies the plan's Phase A advisory
input. No older document was edited because this task owns only this file.

## 2. Candidate inventory

| Candidate | Class | Included use | Inclusion or exclusion reason |
|---|---|---|---|
| TypeScript on Node.js | implementation/runtime | Core, command hook, tests, native TS shims | Official Jev SDK target and broad host fit; requires installed runtime unless bundled |
| TypeScript in a Bun standalone executable | implementation/distribution | Same source, self-contained command artifact | Bun documents standalone cross-target executables; runtime compatibility and signing need testing |
| Rust executable | implementation/runtime | Alternative core/command hook | Strong static executable story and explicit types; host-native adapters and Jev client would still need work |
| Go executable | implementation/runtime | Alternative core/command hook | Simple compiled command and module tooling; no official Jev Go SDK found in scoped sources |
| TypeScript adapters + Rust core | hybrid | Native host shims around a binary core | Credible only if a measured core bottleneck justifies two toolchains |
| TypeScript adapters + Go core | hybrid | Same | Same duplication issue; Go may be simpler operationally but has no evidenced v1 advantage |
| WebAssembly core | hybrid | Portable sandboxed analyzer | **Excluded:** the core is mostly filesystem, HTTP, policy, and host I/O; WASI capability and host glue add work without an evidenced hot compute kernel |
| Native shared-library plugins | extension ABI | In-process third-party rules | **Rejected:** cross-language ABI, toolchain, crash isolation, and upgrade coupling conflict with host portability |
| Versioned JSON subprocess plugins | extension ABI | Later user analyzers | Included as the portable isolation boundary; executable code remains trusted and must be opt-in |
| Persistent MCP review service | process topology | Later startup amortization | Included as an optional host edge where lifecycle hooks can call an existing connection |

## 3. Evidence ledger

`DOC`, `SRC`, `RUN`, `ISSUE`, and `META` are source classes. `DOCUMENTED`,
`SOURCE-INSPECTED`, `RUNTIME-TESTED`, `INFERRED`, `UNKNOWN`, and `NOT APPLICABLE` are
verification states. They are intentionally independent.

| ID | Exact proposition and scope | Evidence | Class/state | Limitations |
|---|---|---|---|---|
| E01 | Codex hooks can run commands or already-connected MCP tools during lifecycle events including `PostToolUse`; matching command hooks launch concurrently. | [Official Codex hooks](https://developers.openai.com/codex/hooks), accessed 2026-09-19 | DOC/DOCUMENTED | No real Codex event was run here; exact edit-tool coverage remains a prototype question. |
| E02 | Codex combines matching hook sources, requires exact-definition trust for non-managed hooks, and waits for command hooks unless configured async. | [Official Codex hooks](https://developers.openai.com/codex/hooks), accessed 2026-09-19 | DOC/DOCUMENTED | Trust UX and headless behavior need a pinned-version run. |
| E03 | Codex command-hook defaults include a 600-second timeout for most hooks; MCP-hook errors or missing tools do not block, and MCP hooks are synchronous. | [Official Codex hooks](https://developers.openai.com/codex/hooks), accessed 2026-09-19 | DOC/DOCUMENTED | Product must choose a much smaller explicit budget; docs do not establish observed cancellation cleanup. |
| E04 | OpenCode's current plugin surface loads JavaScript/TypeScript modules; local plugins are discovered from config directories and npm plugins are installed with Bun at startup. | [Official OpenCode plugin docs](https://opencode.ai/docs/plugins/), accessed 2026-09-19 | DOC/DOCUMENTED | Current documentation exposes more than one generation of plugin docs; version conformance is untested. |
| E05 | OpenCode exposes file and tool events and runs plugin hooks sequentially in load order. | [Official OpenCode plugin docs](https://opencode.ai/docs/plugins/), accessed 2026-09-19; [V2 plugin docs](https://opencode.ai/v2/docs/build/plugins), accessed 2026-09-19 | DOC/DOCUMENTED | V1/V2 lifecycle differences require pinned-host fixtures. |
| E06 | Claude Code supports command hooks around lifecycle events, including successful `PostToolUse`, and plugins can package hooks, MCP configuration, and executables. | [Official Claude hooks reference](https://code.claude.com/docs/en/hooks), accessed 2026-09-19; [plugin reference](https://code.claude.com/docs/en/plugins-reference), accessed 2026-09-19 | DOC/DOCUMENTED | No Claude runtime execution was performed. |
| E07 | Claude Code documents that plugin dependency setup cannot rely on a one-time Setup hook alone; eligible marketplace Node dependencies may be installed when the plugin is cached. | [Official Claude hooks reference](https://code.claude.com/docs/en/hooks), accessed 2026-09-19 | DOC/DOCUMENTED | Eligibility and marketplace behavior must be checked for the eventual package shape. |
| E08 | Kimi Code command hooks receive JSON on stdin, timeout defaults to 30 seconds and fails open, and multiple hooks run in parallel with identical commands deduplicated. `PostToolUse` runs after success but is documented as observation-only/fire-and-forget. | [Official Kimi hooks docs](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html), accessed 2026-09-19 | DOC/DOCUMENTED | No runtime check was run; the documented `PostToolUse` semantics do not establish synchronous advice before the next agent action. |
| E09 | Kimi plugins can declare hooks and stdio/HTTP MCP servers; plugins are copied to a managed per-user directory, changes require reload/new-session, and project-scoped installation is not currently supported. | [Official Kimi plugin docs](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins), accessed 2026-09-19 | DOC/DOCUMENTED | Install/update atomicity and lifecycle delivery were not tested. |
| E10 | Pi extensions are in-process TypeScript modules, loaded without a separate compile step, with lifecycle/tool interception and npm dependencies; extensions run with full system permissions. | [Canonical Pi extension documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md), accessed 2026-09-19 | SRC/SOURCE-INSPECTED | Default-branch documentation is mutable and the repository/package namespace has changed over Pi's history; pin before support. |
| E11 | Pi packages can be installed from npm or git and updated by Pi; project-local package settings can cause missing packages to install on startup. | [Canonical Pi package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md), accessed 2026-09-19 | SRC/SOURCE-INSPECTED | Installation behavior was not executed and implies supply-chain review. |
| E12 | TypeSafe exposes a bearer-authenticated JSON `POST /v1/systemone`; requests contain state, model, and a keyed question map, and responses return keyed answers. | [Official TypeSafe API reference](https://docs.typesafe.ai/api), accessed 2026-09-19 | DOC/DOCUMENTED | No live API call was made in this pass. |
| E13 | A Noul answer is the probability of yes in `[0,1]`; `429` and `529` should be retried with backoff, and official SDKs implement default retry handling. | [Official TypeSafe API reference](https://docs.typesafe.ai/api), accessed 2026-09-19 | DOC/DOCUMENTED | Exact SDK limits and cancellation behavior require tests. |
| E14 | The official JavaScript SDK package is MIT-licensed, ESM/CJS typed, version `0.6.0` when inspected, and requires Node.js 20+. | [Official SDK manifest](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/package.json), accessed 2026-09-19 | SRC/SOURCE-INSPECTED | Default branch is not immutable; pin the adopted release/tag and package integrity. |
| E15 | The Jev HTTP contract is small enough to implement in Rust or Go without a language SDK. | E12-E13 | DOC/INFERRED | “Small enough” assumes only the v1 Noul subset, not the complete SDK feature surface. |
| E16 | The local repository is TypeScript/Bun-oriented and depends on an Effect-based workspace package `@distilled.cloud/typesafe-ai`; its source models bearer auth, the Jev endpoint, typed Noul answers, and retry policies. | Local `package.json` and `vendor/distilled/packages/typesafe-ai/**`, inspected 2026-09-19 | SRC/SOURCE-INSPECTED | Bun was not installed in this environment; package tests were not run. The workspace client is not thereby an approved product dependency. |
| E17 | Current local prototypes call the Jev client from TypeScript and manually apply bounded Effect retries in several scripts. | Local `src/*.ts`, inspected 2026-09-19 | SRC/SOURCE-INSPECTED | Prototype code is evidence of migration cost and familiarity, not production fitness. |
| E18 | Bun documents compiling TS/JS plus its runtime into standalone executables and cross-targeting listed Linux, macOS, and Windows architectures. | [Official Bun executable docs](https://bun.com/docs/bundler/executables), accessed 2026-09-19 | DOC/DOCUMENTED | No product artifact was built; native modules, signing, CPU baseline, size, startup, and antivirus behavior are untested. |
| E19 | Node's single-executable application feature can distribute without Node installed, but Node 25.6 marks it active development and documents signing/platform constraints. | [Node 25.6 SEA docs](https://nodejs.org/download/release/v25.6.0/docs/api/single-executable-applications.html), accessed 2026-09-19 | DOC/DOCUMENTED | The official Jev SDK requires Node 20+, while SEA maturity differs across Node lines; not selected for v1 without a spike. |
| E20 | Cargo can build/install binary crates and accept a target triple; Rust cross-building may still require target toolchains and native-linker work. | [Cargo install](https://doc.rust-lang.org/cargo/commands/cargo-install.html), accessed 2026-09-19; [Cargo FAQ](https://doc.rust-lang.org/cargo/faq.html), accessed 2026-09-19 | DOC/DOCUMENTED | Target selection is not proof of painless release builds for every OS/architecture. |
| E21 | Cargo build scripts execute code before building a package. | [Cargo build scripts](https://doc.rust-lang.org/cargo/reference/build-scripts.html), accessed 2026-09-19 | DOC/DOCUMENTED | Relevant to source-install trust; prebuilt artifacts have a different threat model. |
| E22 | Go's standard tool builds and installs executable commands; modules are authenticated with `go.sum` and, by default, the checksum database. | [Go compile/install](https://go.dev/doc/tutorial/compile-install), accessed 2026-09-19; [Go command](https://go.dev/cmd/go/), accessed 2026-09-19 | DOC/DOCUMENTED | No product binary or cross-platform release was built. |
| E23 | Go's native `plugin` mechanism is unavailable on Windows and carries compatibility drawbacks. | [Go `plugin` package](https://go.dev/pkg/plugin/), accessed 2026-09-19 | DOC/DOCUMENTED | Supports rejecting it as the public plugin ABI; subprocesses are unaffected. |
| E24 | npm install/ci can run dependency lifecycle scripts including preinstall/install/postinstall; npm supports provenance and OIDC trusted publishing. | [npm scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/), [provenance](https://docs.npmjs.com/generating-provenance-statements/), and [trusted publishing](https://docs.npmjs.com/trusted-publishers), accessed 2026-09-19 | DOC/DOCUMENTED | Provenance establishes origin/build claims, not package safety or runtime sandboxing. |
| E25 | Rust, Go, and Bun/Node process startup, RSS, binary size, and Jev end-to-end latency for this product are unknown. | No retained source or run exists | —/UNKNOWN | Required benchmark defined below. |
| E26 | External executable hooks give a crash boundary across all command-capable hosts; in-process OpenCode/Pi plugins share host permissions and failure domain. | E01, E04, E06, E08, E10 | DOC/INFERRED | A child can still access user files/network unless the OS or host restricts it; “boundary” is not a sandbox. |
| E27 | A versioned JSON subprocess protocol is portable across all candidate languages and avoids committing the product to a native shared-library ABI. | Language process models plus E23 | DOC/INFERRED | Serialization and process overhead must be measured; executable plugins remain arbitrary code. |
| E28 | User or buyer perception that Rust is safer, Go is simpler, or TypeScript is less credible is not engineering evidence. | No primary runtime evidence applies | META/UNKNOWN | Test positioning through customer interviews; never substitute perception for security and reliability measurements. |

No proposition in this ledger is `RUNTIME-TESTED` by this pass.

## 4. Host-boundary findings

| Host | Native boundary relevant to post-edit review | Language consequence | Evidence level |
|---|---|---|---|
| Codex CLI | Synchronous command or MCP lifecycle hook; concurrent matching commands; explicit trust | Core can be any executable language. TS gains no native ABI advantage, but a persistent MCP service could amortize startup later. | E01-E03, documented only |
| OpenCode | In-process JS/TS plugin with file/tool events; npm/Bun installation | TypeScript has direct native access and the least shim code. Rust/Go still need a JS/TS shim or separate process. | E04-E05, documented only |
| Claude Code | Command hooks packaged in plugins; MCP and executable packaging surfaces | Core can be any executable. Node dependencies may integrate smoothly, but exact marketplace behavior needs a package spike. | E06-E07, documented only |
| Kimi Code | Command-hook protocol with stdin JSON; `PostToolUse` is observation-only/fire-and-forget; plugins may also declare MCP | Core can be any executable, but the documented post-tool hook does not satisfy synchronous-before-next-action delivery. Treat Kimi as an async/degraded target unless a runtime probe finds another supported path. | E08-E09, documented only |
| Pi | In-process TS extension API and npm/git package system | TypeScript is the only native choice among the candidates. Rust/Go require an in-process TS adapter plus IPC. | E10-E11, source-inspected only |

The host evidence argues against putting canonical review semantics inside native host
plugins. It does **not** establish that every host reports file writes with the same
fidelity. Shell-mediated writes, multi-file edits, failed edits, event ordering, and
headless feedback visibility remain per-host runtime questions.

## 5. Candidate cards

### 5.1 TypeScript on Node.js, with optional Bun executable

**Identity and role.** TypeScript is the source language; Node.js 20+ is the conservative
official-SDK runtime, while a Bun-compiled binary is an optional distribution artifact.
Proposed use: review core, Codex command adapter, config compiler, deterministic evaluator,
and native OpenCode/Pi shims.

**Lifecycle and payload.** Command hooks read one bounded JSON envelope from stdin and write
only protocol JSON to stdout; logs go to stderr or a file. In-process shims translate host
events to the same canonical event. Cancellation is represented explicitly and connected to
HTTP abort where supported.

**Jev access.** Best initial path is a gated dependency on official `@typesafe-ai/sdk`
(E14). Direct `fetch` against E12 is the fallback and the portability oracle. The local
Effect client proves a working source shape but is not automatically the production choice.

**Startup and steady state.** Node process spawn/cold module load and Bun compiled-binary
startup are unknown (E25). The remote evaluation likely dominates typical latency, but that
is also unmeasured and does not excuse cold-start tails. In-process OpenCode/Pi adapters
avoid a second process; a persistent MCP server could amortize initialization for Codex.

**Distribution.** Options are an npm CLI requiring Node 20+, a platform release containing
a Bun standalone executable, or both. npm provides the host ecosystems' most natural
install path, but install scripts increase supply-chain exposure (E24). A compiled artifact
removes the end-user runtime requirement but adds a release/signing matrix (E18).

**Extension model.** Configuration-first rules stay data. Later executable analyzers use a
versioned JSON subprocess protocol. Native TypeScript plugins may be offered only as an
explicit high-trust mode; importing project code inside the hook would run it with hook
privileges.

**Security.** Memory-safe runtime behavior does not make dependencies safe. Pin lockfiles,
minimize dependencies, publish provenance, avoid install scripts, sign release artifacts,
redact logs, and filter source before request construction. A compiled Bun bundle reduces
runtime dependency resolution but does not make bundled code trustworthy.

**Testing and maintenance.** TypeScript can share types/fixtures with native TS hosts and
the official SDK. Runtime schema validation is still mandatory because TypeScript types do
not validate hook JSON or HTTP responses. Maintain two tested runtime profiles only if Bun
compatibility earns its cost.

### 5.2 Rust executable

**Identity and role.** Rust compiled command or persistent service implementing the same
canonical contract. No official Jev Rust SDK was found in the scoped primary sources, so it
would use the narrow HTTP API.

**Strengths.** A self-contained executable, strong static modeling of result variants, no
JavaScript runtime requirement, and good control over memory and cancellation are credible
engineering properties. They do not establish superior product latency or security without
dependency review and measurement.

**Costs.** OpenCode and Pi still require JS/TS shims. The team would own HTTP schema,
retries, release targets, code signing, and two-language debugging. `cargo install` builds
source and can execute build scripts (E20-E21), so prebuilt signed releases are preferable
for ordinary users. Compile time is release/installation cost, not hook steady-state cost.

**Extension ABI.** Do not expose Rust dylibs as the public rule boundary. Language/compiler
coupling, unsafe FFI, and crash propagation make the process protocol a better fit.

**When it wins.** Rust becomes preferable if a representative signed binary materially
beats the TypeScript artifact on an agreed cold-start/RSS budget, or if a required deployment
environment prohibits Node/Bun and a Go alternative fails another mandatory constraint.

### 5.3 Go executable

**Identity and role.** Go compiled command or persistent service, calling Jev through the
narrow HTTP API.

**Strengths.** Straightforward command construction, standard cross-platform environment
targets, simple concurrency for bounded multi-file requests, a single executable, and a
module checksum system (E22). Operational simplicity may be attractive to maintainers.

**Costs.** As with Rust, OpenCode/Pi need TS shims, the product owns the HTTP client and
release matrix, and no actual startup/RSS advantage was measured. Go's native plugin system
is explicitly not portable to Windows and has compatibility constraints (E23).

**When it wins.** Go becomes preferable if measurements show an acceptable binary and
startup profile, the team values a simpler compiled implementation over native TS-host
integration, and customer environments reject JS runtimes while not requiring Rust-specific
controls.

### 5.4 Hybrid designs

| Design | Benefit | Cost | Advisory disposition |
|---|---|---|---|
| TS host shims + Rust core process | Native TS-host access plus compiled core | Two toolchains, IPC, duplicate release/debug surface | Defer; prototype only after a TypeScript budget fails |
| TS host shims + Go core process | Same, with a simpler compiled core | Same architectural duplication | Defer under the same falsifier |
| TS command + optional persistent TS MCP service | One language; amortized startup for supporting hosts | Stateful lifecycle, shutdown, cache, reconnection, extra test matrix | Credible later optimization; not v1 default |
| TS core + Rust/Wasm compute module | Potential hot-kernel acceleration | No evidenced compute-bound kernel; packaging complexity | Reject for current workflows |
| Per-host native implementations | Maximum local API fit | Semantic drift, five failure models, multiplied maintenance | Reject |

## 6. Runtime, packaging, and operational comparison

### Process startup and steady state

| Property | TypeScript/Node | TypeScript/Bun executable | Rust | Go | State |
|---|---|---|---|---|---|
| Cold hook spawn | Unknown | Unknown | Unknown | Unknown | Must benchmark E25 |
| Warm in-process OpenCode/Pi | Native option | Native source still runs in host runtime | Needs TS shim/IPC | Needs TS shim/IPC | Inferred from E04/E10 |
| Persistent service | Available | Available | Available | Available | Architectural fact; host lifecycle untested |
| HTTP steady state | Official SDK path | SDK compatibility unknown | Direct HTTP | Direct HTTP | E12-E15 |
| Multi-file bounded concurrency | Available | Available | Available | Available | Language choice is not decisive |
| Cancellation/timeout correctness | Unknown | Unknown | Unknown | Unknown | Must test against killed hook and server timeout |

Do not optimize a presumed 5-30 ms runtime difference around an unmeasured remote tail.
Conversely, do not wave away cold start because the backend is remote: a hook may skip Jev
for most files, in which case local startup can dominate the `skipped` path.

### Install, update, and distribution

| Concern | TypeScript | Rust | Go | Product implication |
|---|---|---|---|---|
| Developer install | npm/Node is native to OpenCode/Pi ecosystems | Cargo toolchain or downloaded release | Go toolchain or downloaded release | End users should not need a compiler |
| Self-contained artifact | Bun executable; Node SEA is less mature | Normal release binary | Normal release binary | Build, sign, checksum, and test per target |
| Host-native package | Strong for OpenCode/Pi; good plugin wrapper fit elsewhere | Wrapper required | Wrapper required | Keep wrappers declarative and tiny |
| Update | Registry or plugin manager; pinned versions possible | Release manager/custom host wrapper | Release manager/custom host wrapper | No silent self-update in v1 |
| Rollback | Pin npm/plugin version or artifact | Pin artifact | Pin artifact | Installer records owned files and previous version |
| Supply chain | npm lifecycle scripts and transitive graph | crates and build scripts | modules/checksum DB | Prefer minimal dependencies and verifiable artifacts in every language |

Recommended distribution evolution:

1. During prototype, use a pinned Node 20+ command package.
2. Before public release, compare that package against signed Bun standalone artifacts on
   the supported OS/architecture matrix.
3. Let host packages install or locate the product artifact; never rewrite unrelated hooks.
4. Publish checksums, provenance where supported, SBOMs, dependency/license inventory, and
   an explicit compatibility table. Auto-update is out of scope until rollback and policy
   ownership are defined.

## 7. Plugin ABI and rule boundary

Version one should not promise a stable in-process plugin API. The stable seam is semantic:
an analyzer receives an immutable snapshot reference and eligible content/context, then
returns advice or a typed unavailable/skipped result.

A later executable analyzer protocol should include:

- protocol version and analyzer identity/version;
- request ID, host/session correlation, deadline, and cancellation behavior;
- snapshot path plus content hash, with content supplied explicitly rather than reread by
  default;
- declared capabilities and required egress;
- structured advice with rule ID, probability where applicable, message, and snapshot;
- distinct `reviewed`, `skipped`, `unavailable`, and protocol-error outcomes;
- maximum input/output size and stderr/log rules;
- one-request mode first; an optional framed persistent mode only after measurement.

Executable analyzers are not sandboxed merely because they are subprocesses. Discovery must
be opt-in; project-local executable configuration must not silently override managed/user
policy; the doctor command must show the exact executable, origin, version, hash, requested
capabilities, and trust state. A future WASI boundary can be reconsidered if untrusted
third-party rules become a real requirement.

## 8. Security and supply-chain analysis

### Invariants independent of language

- Filter sensitive, excluded, generated, oversized, and non-regular paths before building
  the Jev request.
- Pass credentials through a narrow environment/config mechanism; never echo them in hook
  output, diagnostics, crash reports, or child-plugin environments by default.
- Validate the complete answer key set, discriminant, numeric finiteness, and `[0,1]` range.
- Bound connection, total request, retry, and hook time independently. Honor cancellation.
- Fail open for the already-completed edit but emit a typed, bounded `unavailable` signal.
- Keep protocol stdout free of logs. Cap model-visible output and persist only redacted
  diagnostics with explicit retention.
- Pin host compatibility and dependencies. Generate SBOM/license data and scan release
  artifacts. Sign artifacts and publish checksums/provenance.
- Treat every in-process extension as full host-user authority unless the host documents and
  proves a stronger sandbox.

### Language-specific risk summary

| Candidate | Principal risk | Required mitigation |
|---|---|---|
| TypeScript/npm | Large transitive graph, install scripts, runtime-version drift, types mistaken for validation | Small dependency set, lockfile, `ignore-scripts`-compatible package, runtime schemas, official Node range, provenance |
| Bun executable | Runtime compatibility, signing/JIT/CPU target, large opaque bundled artifact | Target matrix, reproducible build investigation, signing/notarization, SBOM, SDK compatibility tests |
| Rust | Unsafe/native transitive code, build scripts, target/linker variance, false “memory safe means secure” messaging | Audit dependencies/features, prefer rustls/pure Rust where justified, prebuilt signed releases, deny unsafe locally where feasible |
| Go | Module/proxy policy, static dependency inclusion, native plugin temptation, TLS/platform variance | Pin modules, retain `go.sum`, publish SBOM, avoid `plugin`, test supported OS/architectures |
| Hybrid | Two independent supply chains and credential/IPC surfaces | Adopt only after quantified benefit; one owner and one release manifest spanning both artifacts |

## 9. Testing and maintenance

### Required test layers

1. **Pure domain tests:** probability boundaries, missing/extra keys, applicability,
   thresholds, findings budget, snapshot staleness, deterministic ordering.
2. **Contract fixtures:** one sanitized input/output corpus per host and protocol version;
   golden translation tests in both directions.
3. **Transport tests:** fake Jev server for success, malformed JSON, partial answers, slow
   body, reset, 401, 422, 429 with `Retry-After`, 5xx, and 529.
4. **Process tests:** stdout contamination, stderr caps, signal/kill, timeout, cwd with spaces,
   non-UTF-8 filesystem cases, multiple concurrent invocations, and parent disappearance.
5. **Package tests:** clean VM/container install, upgrade, downgrade, uninstall, offline
   behavior, another hook preserved, and checksum/signature verification.
6. **Real-host conformance:** pinned Codex first, then one matrix per claimed host. Payload
   fixture tests do not prove live enforcement or feedback timing.
7. **Performance tests:** cold and warm latency/RSS plus end-to-end hook p50/p95/p99 with a
   fake backend and live Jev separately.

TypeScript's advantage is cheapest shared fixture/types integration with the current host
ecosystem. Rust and Go offer excellent unit/integration testing too; neither removes the
need for live host tests. Maintenance cost is driven more by five evolving host contracts
than by the review core, reinforcing the choice to centralize semantics and keep adapters
small.

### Ecosystem and credibility

The scoped primary evidence supports active official tooling in all three language
ecosystems, but this pass did not conduct a maintenance census or hiring survey. GitHub
stars, package downloads, and language reputation are not runtime evidence. Product-facing
credibility should come from signed releases, a small attack surface, transparent data flow,
measured latency, compatibility declarations, and reliable uninstall/rollback—not a
language badge (E28).

## 10. Capability and decision matrices

### Verification-state capability matrix

Every cell separates the source class from verification state and cites ledger claims.
`—/UNKNOWN` means the capability may exist but this pass retained no qualifying evidence.

| Capability | TS/Node or Bun | Rust | Go | Hybrid TS + compiled core |
|---|---|---|---|---|
| Codex/Claude/Kimi command boundary | DOC/INFERRED (E01,E06,E08): executable command is language-neutral | DOC/INFERRED (E01,E06,E08): same | DOC/INFERRED (E01,E06,E08): same | DOC/INFERRED (E01,E06,E08): TS shim is unnecessary for command hooks |
| Native OpenCode/Pi extension | DOC/DOCUMENTED (E04,E05) and SRC/SOURCE-INSPECTED (E10): native JS/TS | DOC/INFERRED (E04,E10): TS shim/IPC required | DOC/INFERRED (E04,E10): TS shim/IPC required | DOC/INFERRED (E04,E10): native shim plus IPC |
| Official Jev client | SRC/SOURCE-INSPECTED (E14): JS SDK | DOC/INFERRED (E12-E15): direct HTTP, no official Rust SDK found in scoped index | DOC/INFERRED (E12-E15): direct HTTP, no official Go SDK found in scoped index | SRC/SOURCE-INSPECTED (E14) for JS SDK and DOC/INFERRED (E12-E15) for compiled-core HTTP |
| Self-contained executable distribution | DOC/DOCUMENTED (E18,E19): Bun documented; Node SEA active development | DOC/DOCUMENTED (E20): binary target/install documented | DOC/DOCUMENTED (E22): binary build/install documented | DOC/INFERRED (E18,E20,E22): multiple artifacts are possible |
| Product cold start/RSS/size | —/UNKNOWN (E25) | —/UNKNOWN (E25) | —/UNKNOWN (E25) | —/UNKNOWN (E25) |
| Portable subprocess analyzer boundary | DOC/INFERRED (E23,E27) | DOC/INFERRED (E23,E27) | DOC/INFERRED (E23,E27) | DOC/INFERRED (E23,E27) |
| Portable native shared-library plugin ABI | —/UNKNOWN; not proposed | —/UNKNOWN; not proposed | DOC/DOCUMENTED (E23): Go `plugin` is not Windows-portable | —/UNKNOWN; not proposed |
| Install-time code risk | DOC/DOCUMENTED (E24): npm lifecycle scripts | DOC/DOCUMENTED (E21): Cargo build scripts | DOC/DOCUMENTED (E22): module authentication evidenced; arbitrary build risk not separately assessed | DOC/INFERRED (E21,E22,E24): union of both supply chains |

### Weighted decision matrix

Scores are advisory hypotheses from 1 (poor) to 5 (strong), not benchmark results. Weighted
totals guide the prototype order; they are not proof.

| Criterion | Weight | TS/Node + optional Bun | Rust | Go | TS + compiled core |
|---|---:|---:|---:|---:|---:|
| Native host integration | 20 | 5 (E04,E10) | 2 | 2 | 4 |
| Jev integration | 15 | 5 (E12-E14) | 3 (E15) | 3 (E15) | 4 |
| Distribution potential | 15 | 4 (E18-E19) | 5 (E20) | 5 (E22) | 3 |
| Cold-start confidence | 10 | 2 (E25) | 3 (E25) | 3 (E25) | 2 (E25) |
| Extension portability | 10 | 4 (E27) | 4 (E27) | 4 (E23,E27) | 4 |
| Security/supply-chain controllability | 10 | 3 (E24) | 4 (E21) | 4 (E22) | 2 |
| Repository/team migration cost | 10 | 5 (E16-E17) | 2 | 2 | 2 |
| Testing/debugging simplicity | 10 | 5 | 4 | 4 | 2 |
| **Weighted total / 500** | **100** | **430** | **320** | **320** | **310** |

Sensitivity: even if TypeScript cold start scores 1 and Rust or Go score 5, TypeScript still
leads this advisory model because host-native and Jev integration weights dominate. A hard
cold-start acceptance gate overrides the weighted score; that is why the benchmark is a
falsifier, not merely another preference.

### Borrow/depend/integrate/reject matrix

| Component or pattern and intended use | Classification | Rationale |
|---|---|---|
| Official host hook/plugin surfaces | **DEPEND ON** (host edge, conditional) | They are the only authoritative lifecycle boundary; pin/test each supported host. |
| Official `@typesafe-ai/sdk` for v1 Jev transport | **DEPEND ON** (conditional) | Best typed TS path, subject to license, runtime, retry/cancellation, and package tests. |
| Jev direct HTTP subset | **BORROW** | Keep as a conformance oracle and replacement path; do not duplicate the full SDK. |
| Local `@distilled.cloud/typesafe-ai` design patterns | **BORROW** | Useful Effect/schema/retry patterns, but its workspace status and publication/support gates are unresolved. |
| Bun standalone artifact | **OPTIONAL INTEGRATION** pending prototype | Distribution optimization; not the semantic runtime contract. |
| Rust core in version one | **REJECT** for v1 | No measured requirement offsets adapter/toolchain duplication. Revisit on falsifier. |
| Go core in version one | **REJECT** for v1 | Same. |
| Persistent MCP service | **OPTIONAL INTEGRATION** | Useful where a host hook can call an existing connection; should not become the universal core contract. |
| JSON subprocess analyzer ABI | **BORROW** as future boundary | Portable and isolatable, but defer third-party executable plugins until trust/versioning is specified. |
| Native Rust/Go/shared-library plugin ABI | **REJECT** | Portability and compatibility risk; Go explicitly lacks Windows support for `plugin` (E23). |

### Dependency gate: official JavaScript SDK

Mandatory gates are license, Noul-contract conformance, bounded failure behavior,
credential/egress control, supported runtime/artifact compatibility, and replaceability.

| Gate | Evidence/status | Unresolved condition and experiment |
|---|---|---|
| License | E14: MIT; **PASS** | Preserve notices and record adopted version. |
| API/versioning | E12-E14; **UNRESOLVED** | Pin release; compare SDK requests/responses with direct HTTP fixtures and changelog policy. |
| Real workflow | No product vertical slice; **UNRESOLVED** | Fake-server and live Jev slice with batched Noul map. |
| Credentials/egress | Bearer API documented; **UNRESOLVED** | Inspect pinned source and prove secrets absent from logs/errors. |
| Timeout/retry/cancel | Default retry documented; exact bounds unknown; **UNRESOLVED** | 429/529/slow-body/abort suite; product deadline must dominate retries. |
| Runtime compatibility | Node >=20 documented; Bun bundle unknown; **UNRESOLVED** | Run test suite and packaged smoke test on Node LTS and candidate Bun executable. |
| Maintenance/release health | Version/source exist; **UNRESOLVED** | Record release cadence, security policy, and compatibility ownership at adoption time. |
| Integration cost | Existing TS shape; **UNRESOLVED** | Implement thin adapter and compare complexity with direct `fetch`. |
| Replacement/exit | Small HTTP contract E12/E15; **PASS** | Retain transport contract fixtures independent of SDK types. |

Until mandatory unresolved gates pass, the SDK recommendation remains conditional.

### Dependency gate: official host hook/plugin surfaces

This gate applies separately to each host/version before that host is called supported.
Mandatory gates are usage/license terms, versioned API behavior, real-host conformance,
trust/egress, bounded failure behavior, and an operable fallback. Documentation alone does
not pass runtime gates.

| Gate | Evidence/status | Unresolved condition and resolving experiment |
|---|---|---|
| License/terms compatibility | Public official docs exist; **UNRESOLVED** | At adapter release, record the pinned host license/terms and plugin-distribution terms; legal/product owner approves the stated distribution channel. |
| API and versioning guarantees | E01-E11 document current surfaces; **UNRESOLVED** | Pin minimum/exact host versions, archive schemas/fixtures, and run upgrade/downgrade compatibility probes. |
| Real-host required workflows | No host run in this pass; **UNRESOLVED** | Execute P3 for successful/failed/native/shell/multi-file edits, interactive/headless delivery, ordering, and coexistence. Kimi must prove a synchronous alternative or be declared async/degraded. |
| Trust, source egress, credentials, supply chain | E02,E07,E09-E11 document partial controls; **UNRESOLVED** | Install from the intended channel on clean machines; inspect trust prompts/admin policy, environment inheritance, artifact origin, credential exposure, and pre-egress filtering. |
| Timeout, crash, degradation, fail-open/closed | E03,E08 document some policies; other exact behavior varies; **UNRESOLVED** | P3 timeout, malformed output, crash, process-tree kill, missing executable/server, host interrupt, and backend outage for every host. |
| Maintenance/release health and ownership | Rolling official surfaces exist; **UNRESOLVED** | Name adapter owner, monitor host changelogs/security notices, define supported-version window and response SLA before release. |
| Integration and ongoing adapter cost | Thin-adapter design inferred; **UNRESOLVED** | Time implementation and one simulated schema upgrade per host; reject/defer a host that exceeds the maintenance budget. |
| Replacement/exit cost and fallback | Core JSON contract limits coupling (E27), but lifecycle entry is host-owned; **UNRESOLVED** | Prove adapter disable/uninstall preserves the host and other hooks; document manual CLI/CI review fallback and unsupported-host behavior. |

Because all mandatory gates remain unresolved, this report recommends dependence on the
official surfaces as an architectural necessity but authorizes no supported-host claim
beyond later pinned, passing probes.

## 11. Strongest counter-case, falsifiers, and risks

### Strongest case against the recommendation

A synchronous per-edit command is an unusually hostile workload for a managed runtime: many
invocations may exit after only local filtering, users may lack the right Node runtime, and
enterprise buyers may prefer one signed binary with no package installation. Rust or Go
could yield a smaller operational surface and substantially lower cold-start/RSS, while the
TS-native host advantage may be confined to thin adapters anyway. If true at meaningful
magnitudes, starting the core in TypeScript would create a migration that the process
contract only partially softens.

This case is credible but currently unmeasured.

### Falsifiers that change the recommendation

Recommend Rust or Go for the core if any mandatory condition holds after an optimized,
apples-to-apples prototype:

- The TypeScript command misses the agreed skipped-path or reviewed-path p95/p99 startup
  budget by a material margin while Rust/Go passes on all supported machines.
- TypeScript peak/RSS under concurrent hooks causes real host degradation that a compiled
  alternative avoids.
- Bun/Node packaging cannot produce installable, signed, policy-compliant artifacts for a
  required OS/architecture, while Rust or Go can.
- Official SDK retry/cancellation or packaging behavior cannot be bounded without replacing
  most of it, erasing its leverage.
- Required customers prohibit JS runtimes/bundles or npm-derived artifacts.
- The product develops a compute-heavy local analysis kernel proven by profiling to benefit
  materially from Rust or Go.

Prefer Go over Rust if operational simplicity and team maintenance dominate and Go meets
all measured gates. Prefer Rust if memory/layout control, constrained deployment, or a
profiled native kernel creates a requirement Go does not meet. Do not decide between them on
reputation.

### Principal risks under the TypeScript recommendation

| Risk | Consequence | Mitigation/trigger |
|---|---|---|
| Cold start hidden by remote happy-path tests | Slow skips and cumulative agent delay | Benchmark fake-zero-latency backend and no-backend skip separately |
| OpenCode/Pi API churn | Native shim breakage | Pin versions, tiny adapters, fixtures, compatibility table |
| Codex hook coverage misses shell writes | Incomplete review claims | Live event probe before claiming coverage |
| SDK retries exceed hook deadline | Hung turn or killed process | Product-owned total deadline, abort propagation, retry cap tests |
| npm/plugin install runs code | Supply-chain compromise | Avoid lifecycle scripts, provenance/signing, opt-in trust, minimal deps |
| Bun artifact differs from Node | Release-only failures | Treat Bun as separate runtime target with complete contract suite |
| Public TS plugin API ossifies internals | Upgrade lock-in | Data-first rules and deferred process ABI |
| Hybrid introduced prematurely | Two release/security surfaces | Architecture review requires a failed numeric gate and measured win |

## 12. Required prototype measurements

Use the same canonical fixtures and behavior in each candidate. Record OS, CPU, filesystem,
runtime/compiler versions, build flags, artifact hashes, commands, raw output, and exit
status. Retain results in a later experiment report; none exist here.

### P0: cold command harness

- Implement `stdin JSON -> validate/filter/hash -> stdout JSON` in optimized TypeScript on
  Node 20+, Bun standalone, Rust, and Go.
- Measure at least 1,000 cold invocations after an explicit warm-up regime and a separate
  true-cold machine/reboot sample where practical.
- Report p50/p95/p99 wall time, CPU time, peak RSS, artifact/install size, and first-run
  anomalies for Linux x64/arm64, macOS arm64/x64, and Windows x64 where supported.
- Fixtures: skipped path, 8 KiB file, 1 MiB file, malformed input, and concurrent 2/4/8
  processes.

### P1: deterministic vertical slice

- Fake Jev at 0, 100, 500, and 2,000 ms; include partial/malformed answers, disconnect,
  401/422/429/500/529, `Retry-After`, timeout, and parent kill.
- Verify identical `ReviewResult` semantics, output bounds, snapshot hashes, retry counts,
  and cleanup across candidates.
- Acceptance budgets must be chosen before viewing results. At minimum, separate local
  overhead from backend wait and require no unbounded retry.

### P2: TypeScript distribution spike

- Produce a Node package and Bun standalone target matrix from the same source.
- Verify clean install without implicit lifecycle code, offline execution after install,
  signature/checksum, SBOM, macOS notarization/signing, Windows signing, Linux libc/CPU
  baseline, upgrade/downgrade/uninstall, and antivirus false-positive handling.
- Run official SDK contract tests in both artifacts. If Bun fails, keep Node distribution
  rather than changing the product language automatically.

### P3: pinned Codex and host probes

- Run the implementation plan's Codex event matrix, including native patch, creation,
  multi-file patch, failed tool, shell write, concurrent second hook, malformed output,
  timeout, crash, killed process, interactive, and headless modes.
- Later repeat host-specific subsets for OpenCode, Claude Code, Kimi Code, and Pi. Never
  promote documentation to supported-host status.

### P4: real Jev

- Compare official SDK and direct HTTP request/response, connection reuse, retry, and abort.
- Record end-to-end p50/p95/p99, input sizes, billed tokens, retries, and stale-snapshot
  frequency. Pin a versioned Jev model for calibrated thresholds; log resolved model IDs.

## 13. Specification/prototype handoff

| ID | Advisory implication | Support/counterevidence | Workflow/hosts | Uncertainty and consequence | Handoff/disposition |
|---|---|---|---|---|---|
| L01 | Select TypeScript for v1 core and Codex command adapter. | E01-E17; counter-case in §11 | Codex first; all later | Performance untested; wrong choice causes migration | Record language decision after P0/P1; **both** |
| L02 | Define a versioned JSON command contract independent of host and SDK types. | E26-E27 | All command-capable hosts | IPC overhead unknown; without it adapters couple to implementation | Specify now, benchmark P0; **both** |
| L03 | Keep host adapters thin and separately versioned/tested. | E01-E11 | All | Host churn unknown; semantic drift if wrong | Adapter contract + per-host fixtures; **both** |
| L04 | Gate official JS SDK adoption and preserve direct-HTTP exit. | E12-E15 and gate table | Jev path | Retry/cancel/runtime unresolved; can hang hooks | P1/P4 before dependency approval; **prototype** |
| L05 | Offer Bun standalone only if release and runtime gates pass. | E18-E19,E25 | Installation | Artifact compatibility unknown; failed install harms trust | P0/P2; **prototype** |
| L06 | Defer Rust/Go and hybrid core until a numeric TypeScript gate fails. | E20-E23,E25 | Core | Could miss a large operational win | Predeclare falsifiers and retain P0 comparison; **prototype** |
| L07 | Rules are data in v1; defer executable plugin API. | E23,E27 | User extensions | Future demand unknown; premature ABI freezes internals | Specify rule data; revisit at real use case; **specification** |
| L08 | If executable rules arrive, use an opt-in subprocess ABI, not native dylibs. | E23,E26-E27 | All | Subprocess is not sandbox; trust remains | Threat model + capability/timeout protocol; **both later** |
| L09 | Distribution must avoid silent updates and preserve other hooks. | E02,E07,E09,E11,E24 | All | Host installers differ | Install/doctor/uninstall spec and clean-machine tests; **both** |
| L10 | Credibility claims must cite measurements and controls, not language reputation. | E28 | Product positioning | Buyer preferences unknown | Customer research plus evidence-backed security sheet; **defer** |

## 14. Recommendation evolution

**Phase 1:** one TypeScript monorepo package with pure domain/core modules, a Jev transport
interface, a Node 20+ command adapter, runtime schemas, fake evaluator, and host fixtures.

**Phase 2:** pass the official SDK gate or use the narrow direct-HTTP adapter. Complete the
pinned Codex probe and real Jev slice before public compatibility claims.

**Phase 3:** choose distribution from measurement: Node package, Bun standalone artifacts,
or both. The source language need not equal the user's installed runtime.

**Phase 4:** add OpenCode/Pi native TS shims and Claude/Kimi command wrappers only after
their own real-host conformance runs. Keep canonical semantics in the core.

**Phase 5:** add persistent MCP/process mode only if startup or connection reuse warrants
state. Specify shutdown, reconnection, concurrency, cache, and stale-snapshot behavior.

**Phase 6:** reconsider Rust or Go when a falsifier fires. Reimplement behind the existing
contract, run the same fixtures, and migrate one adapter at a time. A rewrite is not an
architectural success unless it removes a measured constraint.

## 15. Limitations and primary-source index

### Limitations

- No host, candidate implementation, package install, compiled artifact, or live Jev call
  was executed in this pass.
- No benchmark supports startup, memory, throughput, binary size, or backend-latency claims.
- Official documentation establishes project claims, not observed runtime behavior.
- Default-branch source links are access-dated rather than immutable; adoption work must pin
  commits/tags/releases.
- OpenCode and Pi are evolving; their current and legacy docs/package namespaces require
  version pinning rather than generic compatibility claims.
- This pass did not assess every package, updater, CI release tool, embedded database, TLS
  stack, cross compiler, or enterprise endpoint-management product.
- No language-community popularity or maintainer-availability census was performed.

### Primary-source index

- OpenAI: [Codex hooks](https://developers.openai.com/codex/hooks) (accessed 2026-09-19).
- OpenCode: [plugins](https://opencode.ai/docs/plugins/) and
  [V2 plugin lifecycle](https://opencode.ai/v2/docs/build/plugins) (accessed 2026-09-19).
- Anthropic: [Claude Code hooks](https://code.claude.com/docs/en/hooks) and
  [plugin reference](https://code.claude.com/docs/en/plugins-reference) (accessed 2026-09-19).
- Moonshot AI: [Kimi hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)
  and [plugins](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins)
  (accessed 2026-09-19).
- Pi: [extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
  and [packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
  (accessed 2026-09-19; pin at support time).
- TypeSafe: [introduction](https://docs.typesafe.ai/introduction),
  [API](https://docs.typesafe.ai/api), [models](https://docs.typesafe.ai/models), and
  [official JS SDK manifest](https://github.com/typesafe-ai/typesafe-sdk-js/blob/main/package.json)
  (accessed 2026-09-19).
- Bun: [standalone executables](https://bun.com/docs/bundler/executables) (accessed
  2026-09-19).
- Node.js: [single executable applications](https://nodejs.org/download/release/v25.6.0/docs/api/single-executable-applications.html)
  (accessed 2026-09-19).
- Rust/Cargo: [cargo install](https://doc.rust-lang.org/cargo/commands/cargo-install.html),
  [build scripts](https://doc.rust-lang.org/cargo/reference/build-scripts.html), and
  [cross-compilation FAQ](https://doc.rust-lang.org/cargo/faq.html) (accessed 2026-09-19).
- Go: [compile/install](https://go.dev/doc/tutorial/compile-install),
  [module authentication](https://go.dev/cmd/go/), and
  [`plugin` warnings](https://go.dev/pkg/plugin/) (accessed 2026-09-19).
- npm: [lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/),
  [provenance](https://docs.npmjs.com/generating-provenance-statements/), and
  [trusted publishing](https://docs.npmjs.com/trusted-publishers) (accessed 2026-09-19).
