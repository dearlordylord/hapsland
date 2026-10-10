# Contributing to Hapsland

**Purpose:** Route source contributors through setup, implementation, and validation without duplicating product or release guides.
**Audience:** Contributors, including coding agents; build and release maintainers.
**Status:** Active contributor guidance.
**Authority:** Maintained workflow guidance; AGENTS.md, CHECKS.md, and linked accepted contracts own their respective policies.
**Expected use:** Prepare a checkout, find the task owner, and select checks for the change.
**Lifecycle:** Update with contributor tooling and workflow changes; review when source prerequisites, Git hooks, checks, or documentation owners change.

## Prepare and change a checkout

1. Read [project instructions](AGENTS.md) and use the [repository map](docs/agents/navigation.md) to locate the accepted contract, implementation owner, and focused tests.
2. Follow [source prerequisites and dependency installation](docs/installation-workflows.md#install-before-publication). Use its prerequisite and dependency steps for source work; `dev-install` is the optional packaged-client workflow. Installed executables and source builds have different requirements.
3. Install Gitleaks (`brew install gitleaks` on macOS), then run `npm run hooks:install` once per repository. The shared Git dispatcher invokes the current worktree's maintained [.husky/pre-commit](.husky/pre-commit), including for newly created worktrees. Before formatting and type checks, the hook scans staged changes for secrets with redacted output and a 60-second deadline.
4. Before selecting or changing checks, read [CHECKS.md](CHECKS.md). Use the [testing matrix](docs/testing-matrix.md#which-gate-to-run) for commands and evidence boundaries. For TypeScript changes, the policy requires `check:fast` and focused tests for changed owners and affected consumers; physical boundary changes require their matching integration checks.

The task is complete when its required local checks pass for the acceptance candidate.
[Task and batch acceptance](docs/testing-matrix.md#task-and-batch-acceptance)
explains qualification ownership for delegated work. Report only checks actually run.

## Code style

Run `npm run format` to apply Oxlint fixes and dprint/OXC formatting.
`npm run lint:code` checks all authored code; `npm run lint:changed` checks staged,
unstaged and untracked code against `HEAD`. For a branch comparison, use
`npm run lint:changed -- --base=origin/master`.

The [formatter configuration](dprint.json) and [lint rules](.oxlintrc.json) own
exact settings. The formatting setup uses two-space indentation and
120-column formatting. Hapsland permits Effect generators without `yield` and
inline import types. TypeScript checks namespace type resolution because
Oxlint's import namespace check reports false positives for Effect.

Pre-commit checks staged Bend formatting, runs lint-staged (fixing and restaging
selected code), then runs `typecheck:source`. Generated, vendor, fixture, and
run outputs are excluded from code linting by the maintained tooling.
Source typechecking does not prepare private packages; after package changes,
prepare current exports through the ordinary build, typecheck, or focused test
runner as described in the [testing matrix](docs/testing-matrix.md).

## Choose a development workflow

| Task | Owner |
| --- | --- |
| Test a packaged snapshot on your own agent | [Personal development](docs/installation-workflows.md#personal-development-on-your-own-clients) and [repeated installation](docs/installation-workflows.md#source-changes-and-repeated-installation) |
| Edit the inspection dashboard with browser reload | [Source dashboard workflow](docs/installation-workflows.md#iterating-on-the-inspection-page) |
| Build for both platforms or prepare a release | [Native inputs and publishing](docs/npm-publishing.md#native-build-inputs); [installed compatibility evidence](docs/installed-release-compatibility.md) |
| Diagnose retained build ownership | [Build custody recovery](docs/testing-matrix.md#recovering-retained-build-custody) |
| Change runtime hooks | [Generated hook inventory](docs/architecture.md#agent-hooks), accepted [advice contract](docs/advicing-target-contract.md), and [installation workflows](docs/installation-workflows.md) |
| Automate a Codex hook experiment | [Invocation-only hook trust bypass](docs/testing-matrix.md#codex-hook-trust-in-automated-tests) |
| Run maintainer semantic evaluation | [Evaluation protocol](docs/evaluation.md) and its scoped evidence; ordinary tests are offline |

Ordinary tests are deterministic and offline. `npm run test:live` is an explicit
live-integration opt-in; follow the bounded milestone authorization and credential
handling policy in [AGENTS.md](AGENTS.md).

## Change documentation

Keep run logs, measurements, and diagnostic output in ignored `.test-runs/`,
not in a tracked `evidence/` directory. Retain only inputs exercised by current
tests, beside those tests. Put current decisions in their maintained documentation;
Git history preserves old experiments and results. A historical link alone is
not a reason to retain an artifact in the current checkout.

Use the [documentation guide](docs/README.md) to identify the intended audience
and the existing owner before adding a page. Follow the Markdown lifecycle in
[AGENTS.md](AGENTS.md); put requirements in their accepted contract and measured
outcomes in their evidence owner.

When documented source facts change, run `npm run docs:generate`; then run
`npm run docs:check` for documentation changes. The
[generator workflow](docs/testing-matrix.md) and [CHECKS.md](CHECKS.md) own
selection and prerequisites. Generation and drift checks are explicit manual
operations. They do not run automatically in product builds, fast/full gates,
Git hooks, or CI.
