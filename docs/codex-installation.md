# Codex installation lifecycle

**Purpose:** Explain Codex CLI registration, setup, updates, and removal.
**Status:** Maintained installation guidance.
**Authority:** Operational guidance for implemented lifecycle operations; exact compatibility claims remain bounded by the evidence cited below.
**Expected use:** Configure a selected client profile and diagnose ownership or readiness problems.
**Lifecycle:** Update with installer or onboarding changes; review when supported host versions, runtime profiles, or trust behavior change.

## Guided setup and updates

After acquiring a verified package through the [installation lanes](installation-workflows.md):

```sh
hapsland setup codex
hapsland doctor codex
hapsland update codex
hapsland update codex --channel=next
```

Setup previews owned changes, asks before installation, offers masked entry for a missing saved key, and reports offline readiness without a Jev call. Updates stage the target in a separate prefix, preview its registration, and apply the digest after confirmation. Finish current client work, restart, and complete native trust review. For local builds, use `npm run dev-install -- --host=codex`; add `--update` for an existing registration. Both client profiles default to user scope; effective file settings bound review across repositories.

## Lifecycle automation


For supported source languages and limitations, see the
[supported-language table](../README.md#supported-languages).

For a person using a normal Codex profile, start with the
[installation lanes](installation-workflows.md) and `hapsland setup codex` after the
registry release. The JSON operations below remain the versioned automation
interface. `hapsland` is the product command; Jev is the external backend.

After installation, diagnose the selected host and repository without mutation or a
provider call:

```sh
printf '%s' '{"version":1,"operation":"doctor","cwd":"/worktree","codexHome":"/home/user/.codex"}' \
  | hapsland --doctor
```

Treat `unknown` host trust or credential accessibility as an explicit state and follow
the single action reported for that stage. Doctor never prompts, launches or repairs the
resident, changes Codex configuration, or calls Jev.

The packaged `hapsland` CLI exposes versioned, noninteractive JSON operations for the
declared Codex CLI 0.155.1 and 0.156.0 / Node 24.20.0 installed profiles on Linux arm64 and macOS arm64.
Its public commands select an exact platform Node runtime from installed optional dependencies,
independently of the shell's Node version. Install with optional dependencies enabled.
The archive carries prebuilt native helpers and parser bindings for each declared profile. Installation does not run
the product's lifecycle scripts or require a compiler; `npm install --ignore-scripts=true` is a
supported path. Release assembly uses the helper sources and platform build hosts. If a helper
is missing or cannot start, setup and doctor report recovery instead of claiming credential
readiness.
Release assembly builds and probes the native helpers and parser bindings on each declared
platform. The resulting `native/prebuilt/linux-arm64` and `native/prebuilt/darwin-arm64` trees are
combined before running `npm run pack:release`, which rejects missing or wrong-architecture
artifacts. The release archive is then tested with install scripts disabled on both platforms.
Codex CLI 0.156.0 has a retained authenticated macOS arm64 host run through a controlled offline
backend. The real Jev first-review milestone is retained for Codex CLI 0.155.1 on Linux arm64
under the test conditions declared in the installed-release compatibility record.
The direct-event capture envelope remains narrower where documented. Every lifecycle automation request is supplied on
stdin and every result is a single version-1 JSON object on stdout.
Exit code 0 covers successful previews, completed operations, and idempotent no-ops. Code 2 is
an invalid request, 3 is an unsupported host, 4 is a configuration/digest conflict, and 5 is
journaled partial completion that requires recovery. Code 6 means setup needs bounded user action;
standalone credential-store failures also use code 6.

On Linux, login stores one product-owned default Jev credential in the session's persistent
Secret Service collection. On macOS, it stores the owned generic password in the selected default
Keychain and does not search, replace, or delete a matching item from another Keychain. Interactive
login on both platforms reads from `/dev/tty` with terminal echo disabled using the platform's
`stty` device flag.
Automation must opt into stdin explicitly; credential values are never accepted as arguments.

```sh
hapsland --login
printf '%s\n' "$TYPESAFE_API_KEY" | hapsland --login --credential-stdin
hapsland --logout
```

Login does not contact Jev. A definitively failed or cancelled replacement preserves the prior item.
If the helper loses its transport or deadline after Secret Service may have committed, login reports
`indeterminate`, suspends saved-key use, and requires an explicit login or logout recovery instead of
claiming that either value won. Background
hooks and the resident never request native-store interaction: Linux lookup omits the Secret
Service unlock flag, and macOS lookup suppresses Keychain UI. Lookup runs in a disposable helper
process with a 750 ms deadline. Missing, locked, unavailable, timed-out,
invalid and administratively suspended states are reported without the value by
`--inspect-credentials` and status output. Unlock the login keyring in the desktop session and retry
login when Linux storage is locked; start a Secret Service provider for that user session when
unavailable. On macOS, unlock or authorize the selected default Keychain from an explicit login.

The default nonempty `TYPESAFE_API_KEY` takes precedence over the saved item. Selecting
`credentialEnvVar` in user or project configuration is an explicit environment-only choice;
missing, empty or invalid selected values do not fall back to the saved default. Replacement and
logout advance a nonsecret generation file. Resident work captured under an older generation is
dropped before a provider call. Logout deletes only the owned credential item.
If deletion fails, saved-key use is suspended until a later successful login or logout. Logout
reports when `TYPESAFE_API_KEY` remains active and cannot recall a request already sent to Jev.

Installation writes the adapter hook and an ownership record into the selected Codex home.
Once the installed runtime runs with Jev credentials, effective file settings select
otherwise eligible files by default. User exclusions can narrow the set or turn review off.
Installation requires the digest returned by its preview.
The install preview's `proposal.ownedChanges` identifies the exact runtime executable,
entrypoint, Node/platform/architecture, feature key, hook event, matcher, command, timeout, and
ownership-record path. It does not echo unrelated configuration values.

## Primary setup flow

`--setup` composes installation, credential selection, file-settings inspection, execution-context
diagnosis, and native-trust handoff without calling Jev. Start with no approval digests. A headless
request returns `needs-user-action` with at most four ordered actions and exits 6. The installation
action contains the exact proposal digest needed for the next request:

```sh
printf '%s\n' '{"version":1,"operation":"setup","host":"codex","scope":{"cwd":"/absolute/repository","review":"enabled"},"credential":"environment","codexHome":"/absolute/codex-home"}' \
  | hapsland --setup

printf '%s\n' '{"version":1,"operation":"setup","host":"codex","scope":{"cwd":"/absolute/repository","review":"enabled"},"credential":"environment","codexHome":"/absolute/codex-home","installProposalDigest":"<install-digest>"}' \
  | TYPESAFE_API_KEY=... hapsland --setup
```

Do not substitute a digest from another preview. If installation stops after a write, setup reports
`partial`, exits 5, and returns `resume-installation` with the original digest. Repeat the same
request and digest; recovery revalidates completed state before continuing. Repeating completed
setup is idempotent and does not duplicate the owned hook.

For a saved credential, set `credential` to `saved` and `interactive` to `true`. Setup reads the
credential through the same masked `/dev/tty` path as `--login`; it never echoes the value. A
headless caller instead performs `--login --credential-stdin` explicitly, then reruns setup. Setup
does not claim native trust is complete: restart Codex normally after current work and accept its
native repository and exact hook-definition review when prompted.

To finish setup while keeping review off, set user `excludes` to `["**/*"]`, then
set `scope.review` to `disabled` and `credential` to `skip`. Setup checks that
user-owned exclusion and reports execution context as unknown. It leaves old
grant files untouched.

The lower-level operations below remain available for diagnosis and explicit lifecycle control.

```sh
printf '%s\n' '{"version":1,"operation":"install-preview","codexHome":"/absolute/codex-home"}' \
  | hapsland --install-preview

printf '%s\n' '{"version":1,"operation":"install","codexHome":"/absolute/codex-home","proposalDigest":"<preview-digest>"}' \
  | hapsland --install

printf '%s\n' '{"version":1,"operation":"uninstall","codexHome":"/absolute/codex-home"}' \
  | hapsland --uninstall
```

Updates are explicit and run from the target local package. They never poll for releases or
emit an update-available notice. Preview compares the installed package/runtime and owned hook
with the target package, then apply the returned digest:

```sh
printf '%s\n' '{"version":1,"operation":"update-preview","codexHome":"/absolute/codex-home"}' \
  | /path/to/target/hapsland --update-preview

printf '%s\n' '{"version":1,"operation":"update","codexHome":"/absolute/codex-home","proposalDigest":"<preview-digest>"}' \
  | /path/to/target/hapsland --update
```

The preview names both package versions, runtime and entrypoint paths, resident protocol, the
new owned hook, and the exact files that would change. Update accepts only a compatible resident
protocol and requires the target package to contain a nonempty package version plus valid,
versioned runtime metadata; missing or malformed metadata is rejected before any mutation.
Update changes only the ownership record and owned hook group. Old grant files,
credentials, user rules, independent hooks, current source work and running resident processes
remain untouched. A changed hook reports that Codex must be restarted after current work finishes
and that native hook trust may need renewal; the updater does not edit trust state or stop a
process. A repeated update returns `already-current`.

The ownership-record write precedes the hook replacement, so a failure after the first update
step leaves the previous hook working. Every `partial` update result includes a structured
`recovery.command` with the original digest. Rerun that exact request from the same target package.
Recovery binds the exact target package version, executable, entrypoint, and resident protocol.
It treats the journal as untrusted input: the operation reproduces every recorded transformation
from its recorded original content and cross-checks the before, after, and proposal digests before
continuing. Completed and pending files are then validated against current state, preserving
concurrent user edits rather than restoring an old whole-file snapshot. A later uninstall uses
the updated fingerprint normally.

The first uninstall call is a preview. Repeat it with its `proposalDigest` to remove only the
owned hook and ownership record. Uninstall preserves old grant files, credentials, user rules,
unrelated hooks, native trust records, and settings required by remaining hooks. Set user
`excludes` to `["**/*"]` when future review dispatch must stop.
Requests already sent to Jev cannot be recalled.

Before writing configuration, the installer executes a bounded probe through the selected
runtime and requires it to report Node 24.20.0 on Linux arm64 or macOS arm64. `/bin/true` or another merely
executable file is not accepted as a runtime. The CLI, parser, and resident packaged entrypoints
must all be readable regular files, and a declared Codex CLI version must be ready. The
installer validates `config.toml` and `hooks.json`, preserves object and array order, and
rejects malformed or unreadable files, duplicate owned markers, explicit hook disablement, and
locally changed owned entries. TOML edits locate parsed table/key spans, including quoted table
names, and ignore table-like text inside multiline strings; the resulting TOML and hooks semantic
state are parsed again before writing. It uses a bounded 1.5-second configuration lock, digest-based
concurrent-change checks, atomic per-file replacement, and a versioned journal. The lock is a
persistent generation directory: each generation points to a unique immutable owner record, and
release or stale recovery marks that exact owner before a contender atomically creates the next
generation. The canonical lock directory is never removed during recovery. A generation whose
recorded process is dead can be reclaimed only after a bounded stale interval; live, recent, or
malformed generations remain conflicts. After publishing a new owner, the installer retains at
most eight generations and removes only inactive unreferenced owner directories; a live contender's
unpublished owner directory is preserved. A `partial`
result includes the original proposal digest and completed-file count. Rerun the same operation
with that digest to resume. Recovery revalidates the runtime, journal targets, completed outputs,
pending prerequisites, preexisting `features.hooks = true` state, and generated configuration.
If another tool changed a completed or
pending file, recovery returns an actionable conflict and leaves the newer file untouched.
Recovery conflicts remain `partial` outcomes and report the original proposal digest, completed
and total file counts, completed step descriptions, and a bounded next action; the journal stays
in place for an explicit retry.

Codex owns repository and hook trust. The installer does not edit trust records or use bypass
flags. Start Codex normally in the enabled repository and approve the native repository and hook
review prompts. Managed policy or an explicit `features.hooks = false` remains authoritative.
Uninstall removes an owned feature entry only when its recorded semantic fingerprint still
matches `features.hooks = true`; a false, missing, or commented-out value produces a conflict and
is preserved.

## Optional first-review demo

Completed setup remains offline. The optional demo is a separate two-step operation and its
preview performs no Jev request. Preview creates a small disposable Git root containing only a
known synthetic `session.ts`, discloses that the input deliberately permits a logged-out session
with a user ID and a logged-in session without one, and does not tell Codex how to repair it.

```sh
printf '%s\n' '{"version":1,"operation":"demo","selection":"preview","codexHome":"/absolute/codex-home"}' \
  | hapsland --demo
```

The preview declares a 4,096-byte limit for the JSON-encoded provider input (declaration source
plus metadata), at most two provider calls, and a 180-second wall-clock limit. These bounds
limit source transmission and prevent an unattended run from growing indefinitely; they are
not a reason to avoid useful live validation. The preview returns a live-selection
digest for the exact disposable root. A matching confirmation is consumed atomically
before budget setup, so concurrent or replayed confirmations cannot start another live execution.

```sh
printf '%s\n' '{"version":1,"operation":"demo","selection":"live","demoId":"<id>","selectionDigest":"<selection-digest>","codexHome":"/absolute/codex-home"}' \
  | hapsland --demo
```

The demo uses the installed hook and queries the actual Codex version while retaining normal
repository and hook trust. It does not pass a trust-bypass or sandbox-bypass flag. Its result
reports host completion, finding submission, model reaction, independent invalid-state
validation, and follow-up review separately. Reaction requires evidence independently correlated
to a delivered finding. Follow-up completion requires a terminal clear, findings, or submitted
state after the validated repair. Generic host messages, file changes, validation success, and
event counts cannot establish either claim. When the host does not expose the required
instrumentation, both stages remain `unavailable` and the result is `inconclusive`. A model miss,
unavailable response, invalid repair, or exceeded budget is also `inconclusive`; it is never
replaced with a controlled backend.
Only bounded counts, versions, timestamps and stage outcomes are returned. The provider response
and synthetic source are not retained. The disposable root is removed after every live
attempt. To abandon a preview without a Jev call, send `selection: "cancel"` with its `demoId`.

The preview reports fixture setup actions and time independently from live review latency. A live
run still requires an authenticated Codex profile, completed native trust, and a Jev credential
available to the real hook context.
