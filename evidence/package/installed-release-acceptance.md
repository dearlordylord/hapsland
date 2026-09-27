# Installed release acceptance record

**Historical pinned acceptance.** The release-ready conclusion applies to integration
commit `f2f47e94cd2d90cf73062f07c5e61416218e2f13`, its checksum-bound records,
and the exact pre-rename profiles in the [support declaration](../../docs/installed-release-compatibility.md).
It does not validate the composed delivery candidate or a public registry artifact.
The [machine manifest](../../conformance/installed-release-v1.json) binds the evidence.

## Retained observations by declared cell

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

## Setup-effort evidence

Retained single-run measurements are descriptive rather than performance guarantees. The Linux
first-review preview reported one setup action in 31 ms. Linux Secret Service login and separate
process lookup took 587 ms and 292 ms. The macOS Keychain run reported 689 ms and 479 ms for the same
two stages. Interactive native trust effort has no comparable retained timing and remains unmeasured.
