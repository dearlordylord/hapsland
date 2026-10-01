# Hapsland — reltime customisable context-aware agentic feedback with Jev. 

## Slap this hand!

<p align="center"><img src="./assets/readme-splash.png" alt="Constructivist-inspired scene of a worker hand slapping a bony hand away from a laptop" width="480"></p>

## What is Hapsland

With Jev-like AI backends, we can get real-time feedback on certain questions about our code.

We can customize and write our own questions and rules,
and we don't have to wait for a "classic" review agent to check the codestyle with 
a lengthy and expensive turn-around manner.

Hapsland lets your agent have immediate review feedback on your code.

How is it better? The agent won't go into the wrong direction and won't waste time and tokens. 

> We slap its hand right away!

## Defining architectural and decision

Agents would often simply send a diff. Often it's enough to answer certain questions about code quality.

As I found out, certain very important questions, e.g. about data model integrity, could be left unanswered if we don't enhance the diff with context.

TODO privacy (context link)

Context enhancement unlocks the power of Jev to answer fundamental question about API and data model decisions.

Coincidentally, models are pretty bad at those decisions by default and need constant nudging.

<p align="center"><img src="./assets/review-flow.gif" alt="Hapsland review flow: an agent edit is expanded into type context, reviewed, repaired, checked again, and committed" width="800"></p>

### Supported languages

| Language | Reviewed code | Main limits |
| --- | --- | --- |
| TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`) | Interfaces, type aliases, and named functions, with bounded local type/import context | Unsupported syntax or unresolved evidence can prevent review. |
| Rust (`.rs`) | Top-level structs, enums, and type aliases, with local type context across verified Cargo modules | Explicit local `mod`/`use` bindings and aliases are supported. External crates, re-exports, inline modules, functions, macros, and conditional compilation are not supported. Cargo metadata and supporting files must pass file selection. Attributes such as `derive` make evidence incomplete for the default rules. |
| Bend (`.bend`) | Top-level `type` datatypes and constructor payloads, with bounded same-file and explicit relative `.bend` alias-import context | Functions, laws/proofs, dependent or computed types, and hub, bare, or absolute imports are unsupported. This first profile skips files with string literals and requires single-line constructors indented with two spaces. |

Rust cross-file context requires a selected `Cargo.toml` with an explicit
2018, 2021, or 2024 edition and supported library/binary targets. Workspace-inherited
editions, custom build targets, and test/example/bench target tables are outside
this profile. Module paths must be unambiguous; excluded supporting files stay unread.

Language support applies to source review; it does not select an agent runtime.
If an edit lacks the evidence a rule needs, Hapsland skips that rule. Silence
is not confirmation that the code passed review. See the
[review contract](./docs/type-function-review-proposal.md#branch-contracts) for
the exact supported syntax and [session status](./docs/status.md) to inspect
review activity.

TODO contribution guide

## FAQ

### What hand are we slapping?

The agent who makes bad API and data structure decisions despite you instructing it in AGENTS.md one hundred times already.

### Why are we slapping the hand?

"Slap" has a nice ring to it. But also, we want to prevent certain very common agentic mistakes when it comes to interface modeling.

### When are we slapping the hand?

Right after the file been modified. The agent gets almost immediate *non-blocking* feedback. It makes its own decision whether to follow it.

### Who's slapping the hand?

The system works as agent hooks. Each agent host has its own implementation. TODO contribution. There is a background job that manages all queuing and async communication with Jev.

### Jev is slapping the hand?

More backends are planned.

## Rule examples and default rules

TODO

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

## Installation

The locally packed candidate has been checked for Codex CLI 0.155.1 on Linux arm64
and Codex CLI 0.156.0 on macOS arm64. The [local release preflight](./evidence/release/npm-0.1.0-preflight.md)
records that `@hapsland/hapsland@0.1.0` was not available on the public registry
when checked on 2026-09-26. The steps below apply after publication and registry
artifact verification.

1. Install Hapsland into a user-writable prefix. Keep optional dependencies enabled; the package
   supplies its own Node 24.20.0 runtime.

   ```sh
   npm install --global --prefix "$HOME/.local" --ignore-scripts=true --include=optional @hapsland/hapsland@0.1.0
   "$HOME/.local/bin/hapsland-doctor"
   ```

2. In the Git repository you want reviewed, run:

   ```sh
   "$HOME/.local/bin/hapsland" setup
   ```

   Select Claude Code, Codex CLI, or both with the checkboxes (arrows to move,
   Space to toggle, Enter to continue). Installed clients are checked and labeled.
   Unchecking a client leaves its installation intact. To skip the selector, use
   `hapsland setup claude` or `hapsland setup codex`.

   Setup previews owned hooks, asks before applying them, accepts a missing Jev key
   through masked input, and reports offline readiness. The hooks apply to the selected
   client profile; [file configuration](./docs/configuration.md) controls review scope.
3. Start the client normally, complete its native trust prompts, and make a supported
   edit. Follow the [status guide](./docs/status.md) to inspect observed review activity;
   installation alone does not establish that a review ran.

Update every installed client integration with `hapsland update`. It acquires one target,
previews each installed client, and asks once before applying the available changes.
Use `hapsland update claude` or `hapsland update codex` for a specific client. Add `--channel=next`
to opt into a published candidate. Updates stage a separate package, preview hook changes,
and ask before applying them. See the [four installation lanes](./docs/installation-workflows.md)
for stable/candidate installation, development builds, recovery, and removal. The
[Claude guide](./docs/claude-installation.md) and [Codex guide](./docs/codex-installation.md)
retain exact host support limits and automation contracts.

`hapsland doctor` checks every installed client without changing files. Use `hapsland repair`
to restore deleted hooks, `hapsland reinstall` to replace damaged marked Hapsland entries
without losing user settings or credentials, and `hapsland uninstall` to remove integrations.
Each accepts `claude` or `codex` to limit its scope. Changed or duplicate marked hooks require
explicit reinstall; malformed client JSON/TOML must be corrected first. Repeating update
with the same verified release does not rewrite hooks. Public lifecycle commands follow
the active package after an update. See [recovery and removal](./docs/installation-workflows.md#disablement-removal-and-recovery).


<!-- configuration-readme:start -->

## Configuration

Configure file selection and exclusions, local rule packs, per-rule overrides, and the credential environment-variable reference. The product accepts layered JSONC files. With no file settings, all otherwise eligible files are selected; user exclusions can turn review off.

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

Install a fresh local snapshot on your own client without publishing:

```sh
npm run dev-install -- --host=claude
npm run dev-install -- --host=codex
# Add --update when the selected profile already has Hapsland.
```

For installing a freshly packed snapshot into your own Claude Code or Codex profile,
see [installation and development workflows](./docs/installation-workflows.md#personal-development-on-your-own-clients).


```sh
npx --yes bun@1.3.14 install
npm run config:generate
npm run config:check
npm run typecheck
npm test
npm run conformance:package
```

`npm pack` builds JavaScript release entry points for the review CLI, source parsers,
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
For publishing stable and `next` releases, use the
[publishing runbook](./docs/npm-publishing.md). The public command is
`hapsland`. The product is Hapsland and Jev is the external backend. The
[local release preflight](./evidence/release/npm-0.1.0-preflight.md) is not a registry release record.
After setup completes, the [installation guide](./docs/codex-installation.md) also documents the separate `hapsland --demo` preview and
live-confirmation flow. Its default preview is offline; a live run requires an exact
selection digest for a generated disposable repository and has explicit request,
source, and time limits.

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
[`docs/codex-opt-in-pilot.md`](./evidence/codex-pilot/README.md).

Review dispatch uses effective file settings. With no file settings, every otherwise
eligible file is selected. User `excludes` accumulate with project exclusions and
`["**/*"]` turns review off even when a project supplies includes. Protected paths,
Git ignore rules, and invalid configuration still stop the relevant work.

```sh
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
fixed in this phase; arbitrary endpoint routing is not supported. Hooks do not prompt.
An unavailable credential prevents provider dispatch. Changing effective exclusions
affects future dispatches and cannot recall a request already sent.

The supported Codex event boundary is documented in the
[direct-event profile](./docs/direct-event-v1-supported-profile.md). The installed Codex
integration uses a synchronous pre-edit permit and its matching composed post-edit hook.
An isolated `--codex-hook` call without that lifecycle stays quiet. The installed
hooks invoke the packed `dist/cli.js` entry and never depend on this source path.
Live use reads `TYPESAFE_API_KEY` through
the Effect provider configuration. Run the live integration checks only with explicit
opt-in via `npm run test:live`.
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
