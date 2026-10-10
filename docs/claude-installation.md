# Set up Hapsland for Claude Code

**Purpose:** Explain Claude Code registration, setup, updates, and removal.
**Audience:** End users of the named agent runtime; contributors maintaining its integration.
**Status:** Maintained installation guidance.
**Authority:** Operational guidance for implemented lifecycle operations; exact compatibility claims are limited to the evidence cited below.
**Expected use:** Install, update, troubleshoot, or remove the Claude Code integration.
**Lifecycle:** Update with installer or onboarding changes; review when host versions accepted by the adapter, runtime profiles, or trust behavior change.

## Guided setup and updates

Start with a verified package from the [installation guide](installation-workflows.md), then run:

```sh
hapsland setup claude
```

Setup shows the hooks it will add and asks before installing them. If you need a
Jev key, you can enter it without displaying it in the terminal. Setup also
offers to check the key with a built-in greeting that contains no project code;
it asks before sending the request.

When setup finishes, finish your current Claude Code session, restart Claude
Code, and approve its trust prompts. The integration is installed for your user
account. Use [file settings](configuration.md) to choose which repositories and
files Hapsland reviews.

To set up several agents at once, run `hapsland setup`. Installed agents start
checked in the selector; unchecking one leaves its installation alone. Each
selected agent gets a separate preview and confirmation.

For a fixed checkout snapshot, use
`mise exec bun@1.3.14 -- npm run dev-install -- --host=claude`.
Rerun the same command after source changes: it rebuilds and activates the new
snapshot through guided setup. `--update` optionally selects the dedicated
update flow; it is not required for repeated installation. See the
[personal development workflow](installation-workflows.md#personal-development-on-your-own-clients).

To update the Claude Code integration:

```sh
hapsland update claude
```

Updates show the proposed hook changes and ask before applying them. Add
`--channel=next` to try a published candidate. Run `hapsland update` without an
agent name to update all registered agents with one preview and confirmation.

If setup or review is not working, diagnose it without changing files:

```sh
hapsland doctor claude
```

Choose a recovery or removal command based on the problem:

| Command | Action |
| --- | --- |
| `hapsland repair claude` | Restore missing hooks. |
| `hapsland reinstall claude` | Replace damaged marked Hapsland handlers while preserving user settings and credentials. |
| `hapsland uninstall claude` | Preview and remove this integration. |

See [recovery and removal](installation-workflows.md#disablement-removal-and-recovery)
for conflicting hooks or interrupted operations. Without an agent name, these
commands apply to all registered Claude Code and Codex CLI installations.

## Compatibility and review behavior

Setup accepts stable Claude Code releases without a fixed version list. This
check lets installation proceed; it does not guarantee that every release works
with Hapsland.

Automated trials have observed Claude Code receiving review findings and
repairing code, including a run with live Jev. Interactive sessions and how
consistently Claude follows advice still need validation. The
[native test results](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/native-136/index.json)
and [compatibility scope](https://github.com/dearlordylord/hapsland/blob/e0a071afea12c1808f54aefba4ff2d44bc825341/evidence/host-94/decision-and-evidence.md)
record what was tested and the remaining limits. For supported source languages,
see the [language table](../README.md#languages-and-limits).

Hapsland installs hooks before and after edits, at prompts, and when Claude or a
subagent finishes. The edit hook can return advice while Claude is working; the
Stop hook can deliver advice that becomes ready later. Claude has no background
collector for post-edit advice.

The edit hook allows five seconds, with about 3.9 seconds reserved for collecting
review results. A review may take longer, so an edit does not always receive
immediate advice.

Claude Code controls workspace trust and hook approval. Hapsland does not change
those permissions. Review also needs accessible Jev credentials and file settings
that allow the file. `hapsland doctor claude` checks these conditions without
changing files. Trust behavior in automated sessions can differ from interactive
sessions.

## Hook ownership and recovery

The setup preview lists hooks, timeouts, commands, and configuration files before
you approve changes. Hapsland tracks its own hooks under `~/.claude/.hapsland/`
and preserves your other settings and hooks.

If Hapsland hooks are missing, use `repair` or `update`. If they have been modified
or duplicated, use `reinstall` to replace the marked Hapsland handlers. Uninstall
removes the integration even if some hooks are already missing, while preserving
unrelated hooks.

## Lifecycle automation

This section is for scripts that need the JSON interface instead of guided setup.

The versioned JSON operations use `host: "claude"`, `claudeHome` (default `~/.claude`), and optionally `claudeExecutable` (default `claude`). Preview is read-only and returns `proposal.digest`. Apply that digest to install or update. The first uninstall call is also a preview; pass its digest to remove the owned entry.

```sh
printf '%s\n' '{"version":1,"operation":"install-preview","host":"claude"}' | hapsland --install-preview
printf '%s\n' '{"version":1,"operation":"install","host":"claude","proposalDigest":"<digest>"}' | hapsland --install
printf '%s\n' '{"version":1,"operation":"update-preview","host":"claude"}' | hapsland --update-preview
printf '%s\n' '{"version":1,"operation":"update","host":"claude","proposalDigest":"<digest>"}' | hapsland --update
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude"}' | hapsland --uninstall
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude","proposalDigest":"<digest>"}' | hapsland --uninstall
```

The installer also verifies that the packaged Hapsland command uses Bun
`1.3.14`. Installation adds synchronous `PreToolUse` and `PostToolUse` hooks;
the latter matches `Edit|Write`. Prompt, Stop, and SubagentStop hooks share the
same resident review state.

If the settings change between preview and apply, the proposal digest will no
longer match. Request a fresh preview before trying again.

For automation, `install-preview` and `install` accept `reinstall: true` to
replace marked Hapsland hooks and damaged ownership metadata. The same
proposal-digest approval applies. See
[recovery and removal](installation-workflows.md#disablement-removal-and-recovery)
for interrupted operations and cases where ownership cannot be safely recovered.
