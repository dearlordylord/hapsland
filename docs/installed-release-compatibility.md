# Installed release compatibility

The assembled installed-product gate is **release-ready for the exact declared profiles**. The declaration is intentionally
bound to integration commit `f2f47e94cd2d90cf73062f07c5e61416218e2f13`, the exact retained
evidence checksums, Linux Codex CLI 0.155.1, macOS Codex CLI 0.156.0, Node 24.20.0, and arm64. It selects no public product name or
package registry.

`npm run conformance:installed-release` is the authoritative check. It verifies each retained JSON
record against the SHA-256 at its declared provenance commit, checks semantic fields instead of
trusting filenames, and then creates fresh isolated homes to replay:

- noninteractive setup handoffs, interrupted setup recovery, repeat setup, disabled setup, and the
  masked interactive credential path;
- pack and production-only install, saved login through the deterministic credential seam, enable, controlled offline review, local
  update and incompatible/partial update recovery, disable, logout, and scoped uninstall;
- preservation of an independent hook, user settings, repository consent, credentials, and the old
  hook during partial update failure; and
- the deterministic environment-key resolution and resident-server fixtures that complement the
  installed native saved-key path.

The ordinary Linux replay uses a source-free controlled credential helper because this gate must run
without assuming a desktop Secret Service session. The separately retained real Secret Service and
macOS Keychain records remain required and checksum-bound; the helper result is not native-store
evidence. The replay makes zero paid Jev calls and zero authenticated real-host runs. It does not set a Codex
trust bypass. A missing native credential service, wrong operating system, wrong architecture,
wrong Node version, failed lifecycle stage, evidence mismatch, or omitted compatibility cell is a
mechanism failure: the command stops instead of converting that failure into an untested or passing
cell. The replay reports its own status separately from the compatibility verdict.

## Declared cells

| Platform / cell | Exact environment and mode | State | Evidence boundary |
| --- | --- | --- | --- |
| Linux installed lifecycle | Linux arm64, Node 24.20.0; controlled headless and masked interactive setup | Verified | Packed production install, real Secret Service, independent hook, update/recovery, disable/logout/uninstall |
| Linux native trust | Codex 0.155.1; native interactive trust review | Verified | Exact hook-definition trust was persisted; no trust bypass was used |
| Linux authenticated host | Codex 0.155.1 `exec`; installed hook | Verified | One controlled submission and one correlated completed finding were observed; the independent hook also ran |
| macOS installed lifecycle | macOS 14 arm64, Node 24.20.0; controlled headless, masked interactive setup, isolated Keychains | Verified | GitHub Actions run 35790230309; lookup/replacement/logout stayed in the selected default Keychain |
| macOS native-trust handoff | Codex 0.155.1 setup contract | Verified for setup; native review separately verified on 0.156.0 | Setup leaves native trust unchanged; the authenticated-host run persisted exact native trust without bypass |
| macOS authenticated host | macOS arm64, Node 24.20.0, Codex CLI 0.156.0 | Verified | One controlled offline submission and correlated completed finding; independent hook observed both host events |
| Installed first review | Linux arm64, packed installation, Codex 0.155.1 | Verified | Supervised synthetic run used normal native trust and an explicitly labeled test host sandbox bypass; 2 real Jev calls, 704 source bytes, correlated finding reaction, independently validated repair, completed follow-up |

The macOS controlled path does not imply compatibility beyond the exact authenticated Codex
CLI 0.156.0 cell. The legacy first-review record remains inconclusive and does not imply provider or repair success. The installed demo now records source-free edit,
finding-handoff, and review-terminal hashes and requires the host's final report to cite the
handed-off rule before it credits a reaction. A terminal review must match the independently
validated repaired source. The 2026-09-23 supervised record satisfies those checks under its
declared Linux test conditions. It does not verify Codex's default workspace-write sandbox in this
container; that mode remains a separate pilot observation. No public package registry or broader
host support follows from this gate.

For authenticated macOS package validation, run `node scripts/run-clean-package-conformance.mjs
--real-codex --write-evidence` with Node 24.20.0 and a declared Codex CLI version selected.
The runner accepts 0.155.1 and 0.156.0, checks versions before packing or creating its isolated
Keychain fixture, and writes a separate evidence file for each real-host version. The retained
release manifest verifies the macOS arm64 real-host cell specifically for Codex CLI 0.156.0.

## Setup-effort evidence

Retained single-run measurements are descriptive rather than performance guarantees. The Linux
first-review preview reported one setup action in 31 ms. Linux Secret Service login and separate
process lookup took 587 ms and 292 ms. The macOS Keychain run reported 689 ms and 479 ms for the same
two stages. Interactive native trust effort has no comparable retained timing and remains unmeasured.

The supported observation profile still cannot attribute overlapping invisible writes in a shared
root when the host supplies no direct writer evidence. Such observations are
`unsupported-unattributed`; they do not publish agent-addressed advice. This limitation is part of
the machine manifest and may not be removed to obtain a passing declaration.

This declaration covers Codex only. It makes no runtime support claim for other agent hosts and no
public distribution or registry claim. Updating a version, platform, artifact, or evidence record
requires a new exact cell and checksum rather than inference from an adjacent tested profile.
