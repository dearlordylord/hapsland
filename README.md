# Hapsland

<p align="center"><img src="./assets/brand/readme-splash.svg" alt="Hapsland: a human hand correcting a skeletal robot hand" width="900"></p>

Review changed types and functions with their related code.

Hapsland gives your coding agent early feedback on changed types and functions,
using their related code. Start with built-in checks or add rules for your team's
code-design concerns.

## Review the decisions behind an edit

A type can allow a state that makes no sense. A function can make an assumption
its inputs do not support. Those choices can spread as the agent writes more code.
Hapsland reviews supported edits while the agent is working, giving it a chance
to revisit the decision early.

Hapsland starts from the edited lines, finds the changed type or function, then
follows its references to build a tree of related definitions. Checks use that declaration and the related code they
need. This lets review consider relationships beyond the changed lines. A check
that lacks necessary code is skipped.

<p align="center"><img src="./assets/review-flow.gif" alt="Illustrative review loop: an agent edit gains related code context, receives feedback, and is repaired and reviewed again" width="800"></p>

The animation starts with a small edit, expands to the declaration and related
code, then illustrates a feedback and repair loop. Feedback follows the edit; it does not
undo it or guarantee a repair. Delivery and optional blocking feedback depend on
the agent runtime and configuration. See the [architecture guide](./docs/architecture.md)
for the flow and its boundaries.

## Choose what leaves your repository

Sending source to a review service is a data-sharing decision. Your task prompt
and conversation with the agent are not sent to Jev.

You control which files are eligible through includes, exclusions, and privacy
exclusions. Every supporting file passes the same selection checks before its
source is read; project includes cannot restore a user exclusion. Limits bound
the files explored and the code included in the review tree.

Selected source code and rule questions are sent to [Jev](https://typesafe.ai),
the external classifier. It sees that code and those questions, not the agent’s
task or conversation. Hapsland maps its results to configured feedback messages.
The review input excludes the full file, edit diff, agent conversation, and
unrelated source. With Jev credentials and no
file settings, all otherwise eligible files are selected. Set an explicit scope
when you want a narrower boundary. See [configuration](./docs/configuration.md).

## A formally checked core

The review request must fit the model’s context, including the rule questions.
Hapsland limits how much related code it collects. Formal proofs check that the
core keeps selected code within that configured size limit.
A checked access-refusal case issues no command to read the excluded file.*
Deterministic simulations exercise failures and recovery using that core;
native integration tests check separate filesystem, transport, and host boundaries.

\* In the checked exclusion case, the core issues no source-read command for
the denied dependency. This is a proof of that case, not a general proof of
absence of leaks across every execution. Source parsing, filesystem observations,
and network calls remain native code. See [proof scope and evidence](./docs/architecture.md#what-verification-establishes).

## Built-in rules and your own

Hapsland starts with the Noul rule pack: nine questions about code design, including
whether a declaration allows meaningless combinations of values. Which rules
run depends on the kind of declaration and the available related code.

You can add local rule packs for your team's concerns and configure their scope,
when feedback should be returned, and what its messages say. Rules ask yes-or-no
questions about the supplied type or function and its related code. See [custom rule packs](./docs/configuration.md#declarative-rule-packs)
and the [type-design rules](./TYPE-DESIGN-RULES.md).

See [supported languages and limits](#supported-languages) before setup.

## Installation

Ask your coding agent to install it:

> Install Hapsland for my coding agent using https://github.com/dearlordylord/hapsland/blob/master/docs/installation-workflows.md. Let me review and approve the setup changes interactively. Ask me to enter any Jev key in the masked setup prompt, not in chat.

Or install manually after a stable release is published and verified:

1. Install Hapsland:

   ```sh
   npm install -g --ignore-scripts @hapsland/hapsland
   ```

2. In the Git repository you want reviewed, run:

   ```sh
   hapsland setup
   ```

   Select Claude Code, Codex CLI, or both with the checkboxes (arrows to move,
   Space to toggle, Enter to continue). Installed clients are checked and labeled.
   Unchecking a client leaves its installation intact. To skip the selector, use
   `hapsland setup claude` or `hapsland setup codex`.

   Setup previews owned hooks, asks before applying them, accepts a missing Jev key
   through masked input, and reports offline readiness.

3. Finish current client work, restart the client normally, complete its native
   trust prompts, and make a supported edit. Follow the [status guide](./docs/status.md) to inspect observed review activity;
   installation alone does not establish that a review ran.

The hooks apply across the selected user profile, not just the repository where
you ran setup. Set [file selection](./docs/configuration.md) before reviewing
private code. Installation and setup do not send code to Jev.

The npm command uses your configured global prefix and assumes its `bin`
directory is on PATH. If installation fails on permissions or the command is
missing, use the [user-owned prefix alternative](./docs/installation-workflows.md#user-owned-prefix-alternative).
Keep optional dependencies enabled: they supply Hapsland's Node runtime.

Public registry availability is not established by this guide. See the
[installation lanes](./docs/installation-workflows.md#stable-installation-and-ordinary-use)
for current distribution and host evidence.

Update installed integrations with `hapsland update`; add `claude` or `codex`
to select one client. The command previews hook changes and asks before applying
them. Use `--channel=next` for a published candidate.

If review is not working, start with `hapsland doctor`: it diagnoses registered
clients without changing files. See [installation workflows](./docs/installation-workflows.md)
for local builds, updates, recovery, and removal, or the
[Claude](./docs/claude-installation.md) and [Codex](./docs/codex-installation.md)
guides for exact host limits and automation.

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

## Supported languages

| Language | Reviewed code | Main limits |
| --- | --- | --- |
| TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`) | Interfaces, type aliases, and named functions, with related local types and imports, within configured limits | Unsupported syntax or unresolved evidence can prevent review. |
| Rust (`.rs`) | Top-level structs, enums, and type aliases, with local type context across verified Cargo modules | Explicit local `mod`/`use` bindings and aliases are supported. External crates, re-exports, inline modules, functions, macros, and conditional compilation are not supported. Cargo metadata and supporting files must pass file selection. Attributes such as `derive` make evidence incomplete for the default rules. |
| Bend (`.bend`) | Top-level `type` datatypes and constructor payloads, with related definitions from the same file or explicit relative `.bend` alias imports, within configured limits | Functions, laws/proofs, dependent or computed types, and hub, bare, or absolute imports are unsupported. This first profile skips files with string literals and requires single-line constructors indented with two spaces. |

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

## Development

See the [draft comparison with Abide](./docs/abide-comparison-draft.md)
for the main architectural differences and the rationale for a separate product.

Use the [repository map](./docs/agents/navigation.md) to locate contracts,
implementation entry points, tests, the website, and research assets.

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
ID and bounded source-free resident activity, and never treats silence or missing
instrumentation as a clear review. Optional [session analytics](./docs/status.md#optional-session-analytics)
are disabled by default; user configuration can enable Jev outcome totals and recent
rule-ID history. The shared activity store expires inactive sessions after 30 days and
is capped at 20 MiB.

The maintainer-only semantic evaluation protocol and its sanitized offline milestone
evidence are documented in [`docs/evaluation.md`](./docs/evaluation.md) and
[`evidence/evaluation/README.md`](./evidence/evaluation/README.md). Ordinary tests and
the review hook never run the maintainer evaluation suite against Jev.
