# Hapsland

<!--
**Purpose:** Introduce Hapsland and help users choose, install, and configure it.
**Status:** Active product introduction.
**Authority:** Maintained user guidance; linked contracts and evidence own behavior and validation claims.
**Expected use:** Understand review boundaries, choose an installation path, and find detailed guidance.
**Lifecycle:** Update with user-facing behavior and distribution changes; review when supported runtimes, source scope, or setup changes.
-->

<p align="center"><img src="./assets/brand/readme-splash.svg" alt="Hapsland: a human hand correcting a skeletal robot hand" width="900"></p>

Catch design mistakes before your agent builds on them. Immediately slap its hand.

Hapsland lets you apply auto-review your coding agent changes and give it immediate feedback.

It does so in a smart way, collecting semantic context from the agent's diff.

It does it keeping your privacy in mind: no prompts or unrelated changes are sent to the classifier,
and the review requests are built with respect to your access settings.

It sends findings back to the agent in realtime,
so it can address a mistake before building more code around it.

It cares about your agents' context and attention, batching reviews together and discarding any stale reviews.

It is fully observable: you can see what goes to the classifier (e.g. Jev) and what comes to the agent.

No more AGENTS.md begging "please use domain types". Elevate your AGENTS.md instructions to realtime, and **slap that robot hand** immediately when your code style rule is violated.

## Review the decisions behind code edits

A type can allow combinations of values that make no sense. A function can assume
its inputs satisfy a constraint that their types do not enforce. Spotting these
problems can require reading definitions beyond the edited lines.

Hapsland finds the changed type or function and follows its references to gather
related definitions, including those in other files. Each rule reviews the
changed declaration with the related code it needs. If the necessary code is
unavailable, Hapsland skips that rule.

## Subagents

Hapsland also reviews supported native edits made by Codex CLI and Claude Code
subagents. When the runtime reliably identifies the editing subagent, Hapsland
directs review feedback to it.

## What leaves my repository?

Sending source to a review service is a data-sharing decision.

Some classifiers like Jev store your data and can do with it whatever they want.

Your task prompt and conversation with the agent are not sent to the review backend.

Text copied into selected source code or configured rule questions can be sent as
part of those inputs. See the [content-isolation contract and proof limits](./docs/review-contract-compatibility.md#review-content-isolation).

You choose which changed files can be reviewed and which files can supply related
code.

Selected source code and rule questions are sent to the selected external
classifier: [Jev](https://typesafe.ai) by default, or Cloudflare Clef/Clef-flash. It sees that code and those questions, not the agent’s
task or conversation. Hapsland maps its results to configured feedback messages.
The checker receives one type declaration, or a TypeScript function's
signature and body, plus related code reached through local
references. What is NOT sent: the full file, edit diff, agent conversation, and
unrelated source. With review credentials and no
file settings, all otherwise eligible files are selected. Set an explicit scope
when you want a narrower boundary. See [configuration](./docs/configuration.md).

<p align="center"><img src="./assets/review-flow.gif" alt="Illustrative review loop: an agent edit gains related code context, receives feedback, and is repaired and reviewed again" width="800"></p>

The animation starts with a small edit, expands to the declaration and related
code, then illustrates a feedback and repair loop. Feedback follows the edit; it does not
undo it or guarantee a repair. Delivery and optional blocking feedback depend on
the agent runtime and configuration. See the [architecture guide](./docs/architecture.md)
for the flow and its boundaries. Run `hapsland --feedback-preview` to see the
shared agent instructions with a synthetic finding; no review request is made.

## Choose a review backend

Jev is the default. To use Cloudflare, set `reviewBackend` in your user
configuration (project configuration cannot choose the backend):

```jsonc
{
  "version": 1,
  "reviewBackend": {
    "provider": "cloudflare",
    "model": "clef",
    "accountId": "0123456789abcdef0123456789abcdef"
  }
}
```

Use your Cloudflare account ID and make `CLOUDFLARE_API_TOKEN` available to the
installed runtime. The model can also be `clef-flash`; `hapsland --login` manages
Jev credentials. A shared limit catalog checks request bytes and question counts
where documented, including Clef's 64-question limit. Token limits are recorded
but require a tokenizer before they can be enforced. See
[provider configuration and limits](./docs/review-providers.md) for details.

Hapsland also manages review resources: each background service has separate pools for
eight preparation jobs and eight concurrent classifier request permits, plus
limits on retained state and advice output. See
[review resources and limits](./docs/review-resources.md) for saturation behavior,
configuration controls, and the distinction between collection and model limits.

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

## Rules

<!-- shipped-rules:start -->

By default, authorized setup enables 7 editable JSON rule files with questions about code design.

<!-- shipped-rules:end -->

You can edit these rules or write your own concern as a local JSONC file.

<!-- rule-inspection:start -->

Inspect them with `hapsland rules list` or `hapsland rules show --id meaningless_combinations`.

<!-- rule-inspection:end -->

Use the [rule reference](./docs/rules.md) to inspect, manage, and test rules, or
follow [Write your first rule](./docs/write-first-rule.md) for a complete example.
Rule checks send selected source to your configured classifier; one result does
not establish rule accuracy. See [languages and limits](#languages-and-limits).

## Installation

> [!TIP]
> **[Download Hapsland ↗](https://github.com/dearlordylord/hapsland-releases/releases/latest)**
>
> macOS arm64 · Linux arm64 · Runtime included.
>
> [Installation and checksum verification](./docs/installation-workflows.md#install-a-ready-made-platform-release).

Ask your coding agent to install it:

<!-- agent-setup-instruction:start -->

> Install Hapsland for my coding agent using https://github.com/dearlordylord/hapsland/blob/master/docs/installation-workflows.md. Let me review and approve the setup changes interactively. Ask me to enter any Jev key in the masked setup prompt, not in chat.

<!-- agent-setup-instruction:end -->

Ready-made packages are available for macOS arm64 and Linux arm64:

```sh
brew install dearlordylord/tap/hapsland
"$(brew --prefix hapsland)/bin/hapsland" setup --target="$(brew --prefix hapsland)/bin/hapsland"
```

The public npm package returned **404 on 2026-10-06**; the npm commands below
require a separate npm publication. Contributors can still use the
[local checkout installation](./docs/installation-workflows.md#install-before-publication),
which requires the development toolchain.

Before setup, choose your agent and [review file scope](./docs/installation-workflows.md#before-setup).
Hooks apply to the selected user profile across repositories.

After a stable release is published and verified, install manually:

1. Install Hapsland:

   ```sh
   npm install -g --ignore-scripts @hapsland/hapsland
   ```

2. In the Git repository you want reviewed, run:

   ```sh
   hapsland setup
   ```

   Select Claude Code, Codex CLI, and/or Pi with the checkboxes (arrows to move,
   Space to toggle, Enter to continue). Installed clients are checked and labeled.
   Unchecking a client leaves its installation intact. To skip the selector, use
   `hapsland setup claude`, `hapsland setup codex`, or `hapsland setup pi`.
   Pi requires Linux arm64 and Pi 1.0.0; OpenCode setup is unavailable.

   Setup previews owned hooks, asks before applying them, accepts a missing Jev key
   through masked input, shows the selected key source and replacement instructions,
   and reports offline readiness. You can then approve one optional Jev key check
   using a built-in greeting; it sends no project code and may use paid credits.

3. Finish current client work, restart the client normally, complete its native
   trust prompts. Follow the [inspection guide](./docs/status.md#opt-in-local-inspection)
   to enable recording, make a new supported edit, and inspect its review;
   installation alone does not establish that a review ran.

The hooks apply across the selected user profile, not just the repository where
you ran setup. Set [file selection](./docs/configuration.md) before reviewing
private code. Installation and setup do not send code to Jev.

The npm command uses your configured global prefix and assumes its `bin`
directory is on PATH. If installation fails on permissions or the command is
missing, use the [user-owned prefix alternative](./docs/installation-workflows.md#user-owned-prefix-alternative).
The package includes one Bun runtime per platform; command bundles share it.

Public registry availability is not established by this guide. See the
[installation lanes](./docs/installation-workflows.md#stable-installation-and-ordinary-use)
for current distribution and host evidence.

Update installed integrations with `hapsland update`; add `claude`, `codex`, or `pi`
to select one client. The command previews hook changes and asks before applying
them. Use `--channel=next` for a published candidate.

If review is not working, start with `hapsland doctor`: it diagnoses registered
clients without changing files. See [installation workflows](./docs/installation-workflows.md)
for local builds, updates, recovery, and removal, or the
[Claude](./docs/claude-installation.md) and [Codex](./docs/codex-installation.md)
guides for exact host limits and automation.

<!-- configuration-readme:start -->

## Configuration

Configure file selection, related-code access, privacy exclusions, and per-rule application through personal and project JSONC settings. With no file settings, all otherwise eligible files are selected; user exclusions can turn review off.

A small project configuration:

```jsonc
{
  "version": 1,
  "includes": [
    "src/**"
  ]
}
```

See the [complete configuration guide](./docs/configuration.md) for fields, precedence, rule selection, and when saved changes apply.

<!-- configuration-readme:end -->

## Languages and limits

| Language | Reviewed code | Main limits |
| --- | --- | --- |
| TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`) | Interfaces, type aliases, and named functions, with related local types and imports, within configured limits | Unsupported syntax or unresolved evidence can prevent review. |
| Rust (`.rs`) | Top-level structs, enums, and type aliases, with local type context across verified Cargo modules | Hapsland resolves explicit local `mod`/`use` bindings and aliases. External crates, re-exports, inline modules, functions, macros, and conditional compilation are not supported. Cargo metadata and supporting files must pass file selection. Attributes such as `derive` make evidence incomplete for the default rules. |
| Bend (`.bend`) | Top-level `type` datatypes and constructor payloads, ordinary or erased datatype parameters, and literal quantity arguments. Related definitions come from the same file, explicit relative `.bend` alias imports, or the pinned Base `List`, within configured limits. | Functions, laws/proofs, dependent or computed types, and hub, bare, or absolute imports are unsupported. Constructors must occupy one line with two-space indentation. Literals inside datatype syntax remain unsupported; literals in unrelated bodies do not block extraction. |

Rust cross-file context requires a selected `Cargo.toml` with an explicit
2018, 2021, or 2024 edition and accepted library/binary targets. Workspace-inherited
editions, custom build targets, and test/example/bench target tables are outside
this profile. Module paths must be unambiguous; excluded supporting files stay unread.

Language support applies to source review; it does not select an agent runtime.
If an edit lacks the evidence a rule needs, Hapsland skips that rule. Silence
is not confirmation that the code passed review. See the
[review contract](./docs/type-function-review-proposal.md#branch-contracts) for
the syntax limits and [session status](./docs/status.md) to inspect
review activity.

## Documentation

Use the [documentation guide](https://github.com/dearlordylord/hapsland/blob/master/docs/README.md) to find installation, configuration,
rule authoring, diagnostics, architecture, and [comparisons with existing solutions](./docs/review-studies.md).

## Development

See [Contributing](https://github.com/dearlordylord/hapsland/blob/master/CONTRIBUTING.md) for source setup, code style, checks, and
local development workflows. The [repository map](./docs/agents/navigation.md)
locates contracts, implementation owners, tests, website assets, and research.
