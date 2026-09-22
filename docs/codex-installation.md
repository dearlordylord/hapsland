# Codex installation lifecycle

The packaged `review-tool` CLI exposes versioned, noninteractive JSON operations for the
supported Codex CLI 0.155.1 / Node 24.20.0 / Linux arm64 profile. Every request is supplied on
stdin and every result is a single version-1 JSON object on stdout.
Exit code 0 covers successful previews, completed operations, and idempotent no-ops. Code 2 is
an invalid request, 3 is an unsupported host, 4 is a configuration/digest conflict, and 5 is
journaled partial completion that requires recovery.

Installation and repository enablement are separate. Installation writes the adapter hook and
an ownership record into the selected Codex home, but grants no permission to send repository
source. Enablement separately previews the canonical Git root, Jev backend and destination, and
eligible-source scope. Both mutations require the digest returned by their preview.

```sh
printf '%s\n' '{"version":1,"operation":"install-preview","codexHome":"/absolute/codex-home"}' \
  | review-tool --install-preview

printf '%s\n' '{"version":1,"operation":"install","codexHome":"/absolute/codex-home","proposalDigest":"<preview-digest>"}' \
  | review-tool --install

printf '%s\n' '{"version":1,"operation":"enable","cwd":"/absolute/repository"}' \
  | review-tool --enable

printf '%s\n' '{"version":1,"operation":"enable-confirm","cwd":"/absolute/repository","proposalDigest":"<enable-digest>"}' \
  | review-tool --enable-confirm

printf '%s\n' '{"version":1,"operation":"disable","cwd":"/absolute/repository"}' \
  | review-tool --disable

printf '%s\n' '{"version":1,"operation":"uninstall","codexHome":"/absolute/codex-home"}' \
  | review-tool --uninstall
```

The first uninstall call is a preview. Repeat it with its `proposalDigest` to remove only the
owned hook and ownership record. Uninstall preserves repository grants, credentials, user rules,
unrelated hooks, native trust records, and settings required by remaining hooks. Disable grants
before uninstall when future review dispatch must stop; uninstall alone does not revoke them.
Requests already sent to Jev cannot be recalled.

The installer validates `config.toml` and `hooks.json`, preserves object and array order, and
rejects malformed or unreadable files, duplicate owned markers, explicit hook disablement, and
locally changed owned entries. It uses a bounded 1.5-second configuration lock, digest-based
concurrent-change checks, atomic per-file replacement, and a versioned journal. A `partial`
result includes the original proposal digest and completed-file count. Rerun the same operation
with that digest to resume. If another tool changed a pending file, recovery returns a conflict
and leaves the newer file untouched.

Codex owns repository and hook trust. The installer does not edit trust records or use bypass
flags. Start Codex normally in the enabled repository and approve the native repository and hook
review prompts. Managed policy or an explicit `features.hooks = false` remains authoritative.
