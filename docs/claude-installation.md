# Claude Code installation lifecycle

**Purpose:** Explain Claude Code registration, setup, updates, and removal.
**Status:** Maintained installation guidance.
**Authority:** Operational guidance for implemented lifecycle operations; exact compatibility claims remain bounded by the evidence cited below.
**Expected use:** Configure a selected client profile and diagnose ownership or readiness problems.
**Lifecycle:** Update with installer or onboarding changes; review when supported host versions, runtime profiles, or trust behavior change.

## Guided setup and updates

`hapsland setup` opens a checkbox selector for Claude Code and Codex CLI. Installed clients are checked by default. Choose either or both; unchecking a client preserves its installation. Each selected client gets its own preview and confirmation. The named commands below bypass selection. `hapsland update` updates every registered Claude/Codex client with one target and one confirmation of the previewed changes; `hapsland update claude` limits the operation to this client.

After acquiring a verified package through the [installation lanes](installation-workflows.md):

```sh
hapsland setup claude
```

Setup previews owned hooks, asks before installation, offers masked entry for a
missing Jev key, and reports offline readiness without contacting Jev. Finish
current client work, restart the client, and complete its native trust prompts.
The default registration is user-wide: [file settings](configuration.md) control
which repositories and files can be reviewed.

For a fresh checkout build, use `npm run dev-install -- --host=claude`; add
`--update` when this profile already has Hapsland. See the
[personal development workflow](installation-workflows.md#personal-development-on-your-own-clients).

Update this integration separately:

```sh
hapsland update claude
```

Use `--channel=next` to select a published candidate. Updates stage or reuse a
verified package, preview hook changes, and ask before applying them. Public
lifecycle commands then follow the active package.

If setup or review is not working, diagnose it without changing files:

```sh
hapsland doctor claude
```

Run recovery or removal only for the action you intend:

| Command | Action |
| --- | --- |
| `hapsland repair claude` | Restore missing hooks or resume a supported interrupted operation. |
| `hapsland reinstall claude` | Replace damaged marked Hapsland handlers while preserving user settings and credentials. |
| `hapsland uninstall claude` | Preview and remove this integration. |

See [recovery and removal](installation-workflows.md#disablement-removal-and-recovery)
for ownership conflicts and interrupted operations. Omitting the client name
checks or acts on every registered Claude/Codex profile; setup opens the selector.

## Lifecycle automation

For supported source languages and limitations, see the
[supported-language table](../README.md#supported-languages).

This adapter targets the exact Claude Code `2.1.218` profile. Selected headless native `Edit|Write` trials with a controlled local backend passed an opted-in block-and-repair fixture and bounded stale, failure, and restart fixtures. The bounded [#136 native evidence](issue-136-native-evidence.md) later observed live Jev findings through Stop and a model-originated repair, without a final acknowledgment token. These selected runs do not establish interactive compatibility, a reaction rate, or general Claude Code support. Installation alone does not establish host compatibility or advice reaction; see the [#94 scope decision package](../evidence/host-94/decision-and-evidence.md).

The versioned JSON operations use `host: "claude"`, `claudeHome` (default `~/.claude`), and optionally `claudeExecutable` (default `claude`). Preview is read-only and returns `proposal.digest`. Apply that digest to install or update. The first uninstall call is also a preview; pass its digest to remove the owned entry.

```sh
printf '%s\n' '{"version":1,"operation":"install-preview","host":"claude"}' | hapsland --install-preview
printf '%s\n' '{"version":1,"operation":"install","host":"claude","proposalDigest":"<digest>"}' | hapsland --install
printf '%s\n' '{"version":1,"operation":"update-preview","host":"claude"}' | hapsland --update-preview
printf '%s\n' '{"version":1,"operation":"update","host":"claude","proposalDigest":"<digest>"}' | hapsland --update
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude"}' | hapsland --uninstall
printf '%s\n' '{"version":1,"operation":"uninstall","host":"claude","proposalDigest":"<digest>"}' | hapsland --uninstall
```

The installer checks the selected executable's exact host version, Node `v24.20.0`, and the packaged CLI entrypoint. It installs a synchronous `PreToolUse` permit command, one marked `PostToolUse` `Edit|Write` group containing one synchronous command, and prompt, Stop, and SubagentStop commands. Those commands share the resident's admission, advice, lease, and round state. The synchronous edit command may return current advice within its hook budget; Stop may offer it later as a safety net. Claude has no asynchronous PostToolUse collector, so background output cannot consume advice before Stop. The installer records owned fingerprints under `~/.claude/.realtime-review-tool/`. Existing settings and unrelated hooks remain in order. Inspection reports missing, duplicated, or modified owned entries as a damaged integration. Update/repair can restore missing entries; explicit reinstall replaces modified or duplicate marked handlers. Removal tolerates missing entries and preserves unrelated hooks. A digest mismatch requires a fresh preview.

The edit hook has a five-second host timeout; the handler's resident collection bound remains approximately 3.9 seconds. A finite deadline does not guarantee a review result. The preview discloses all events, matchers, foreground/background commands, timeouts and configuration files. Claude Code owns workspace trust and native hook approval. With Jev credentials available, effective file settings select otherwise eligible files by default. User exclusions can turn review off. The installer does not change native trust or file settings. `doctor` is read-only and reports native trust, file settings, and credential accessibility. Headless Claude Code trust behavior can differ from interactive use.

For automation, `install-preview` and `install` accept `reinstall: true` with the same proposal-digest authorization. This explicitly replaces marked Hapsland entries and can replace damaged ownership metadata. See [recovery and removal](installation-workflows.md#disablement-removal-and-recovery) for journal recovery and the limits of safe reconstruction.
