# Installed release compatibility

Codex background and bounded finish delivery, and Claude synchronous edit delivery
with bounded Stop fallback, are **not part of the pinned release support declaration below**. The
[Advicing target contract](advicing-target-contract.md) states accepted behavior;
the [Linux evidence index](../evidence/advicing-linux/README.md) records current
candidate observations and gaps. The [product vocabulary](../CONTEXT.md)
defines its terms. Candidate results do not establish installed-release or
macOS support for that behavior. The verified release cells below apply only
to the earlier pinned commit and delivery behavior.

This support declaration is bound to integration commit `f2f47e94cd2d90cf73062f07c5e61416218e2f13`, the exact retained
evidence checksums, Linux Codex CLI 0.155.1, macOS Codex CLI 0.156.0, Node 24.20.0, and arm64.
This declaration predates the Hapsland rename and does not validate a public Hapsland package
name or registry artifact.

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
evidence. The replay makes zero Jev calls and zero authenticated real-host runs. It does not set a Codex
trust bypass. A missing native credential service, wrong operating system, wrong architecture,
wrong Node version, failed lifecycle stage, evidence mismatch, or omitted compatibility cell is a
mechanism failure: the command stops instead of converting that failure into an untested or passing
cell. The replay reports its own status separately from the compatibility verdict.

## Declared cells at the pinned integration commit

| Platform / cell | Exact environment and mode | State | Evidence boundary |
| --- | --- | --- | --- |
| Linux installed lifecycle | Linux arm64, Node 24.20.0; controlled headless and masked interactive setup | Verified | Packed production install, real Secret Service, independent hook, update/recovery, disable/logout/uninstall |
| Linux native trust | Codex 0.155.1; native interactive trust review | Verified | Exact hook-definition trust was persisted; no trust bypass was used |
| Linux authenticated host | Codex 0.155.1 `exec`; installed hook | Verified | One controlled submission and one correlated completed finding were observed; the independent hook also ran |
| macOS installed lifecycle | macOS 14 arm64, Node 24.20.0; controlled headless, masked interactive setup, isolated Keychains | Verified | Selected default Keychain lookup, replacement, and logout |
| macOS native-trust handoff | Codex 0.155.1 setup contract | Verified for setup; native review separately verified on 0.156.0 | Setup leaves native trust unchanged; the authenticated-host run persisted exact native trust without bypass |
| macOS authenticated host | macOS arm64, Node 24.20.0, Codex CLI 0.156.0 | Verified | One controlled offline submission and correlated completed finding; independent hook observed both host events |
| Installed first review | Linux arm64, packed installation, Codex 0.155.1 | Verified | Synthetic finding/repair/follow-up under normal native trust and a declared test host sandbox bypass |

The macOS controlled path does not imply compatibility beyond the exact authenticated
Codex CLI 0.156.0 cell. Codex's default workspace-write sandbox in the Linux container
is not verified by this declaration. No public registry or broader host support follows
from this gate. The [release acceptance record](../evidence/package/installed-release-acceptance.md)
retains first-review attribution details and setup measurements.

For authenticated macOS package validation, run `node scripts/run-clean-package-conformance.mjs
--real-codex --write-evidence` with Node 24.20.0 and a declared Codex CLI version selected.
The runner accepts 0.155.1 and 0.156.0, checks versions before packing or creating its isolated
Keychain fixture, and writes a separate evidence file for each real-host version. The retained
release manifest verifies the macOS arm64 real-host cell specifically for Codex CLI 0.156.0.

The supported observation profile still cannot attribute overlapping invisible writes in a shared
root when the host supplies no direct writer evidence. Such observations are
`unsupported-unattributed`; they do not publish agent-addressed advice. This limitation is part of
the machine manifest and may not be removed to obtain a passing declaration.

This declaration covers Codex only. It makes no runtime support claim for other agent hosts and no
public distribution or registry claim. Updating a version, platform, artifact, or evidence record
requires a new exact cell and checksum rather than inference from an adjacent tested profile.

## Pi installed native observation

Pi 1.0.0 on Linux arm64 is a separate current observed profile, documented in the [Pi guide](pi-installation.md) and [testing matrix](testing-matrix.md). Its installed native runner production-installs the current locally packed package and records each attempt independently. It does not amend the checksum-bound historical Codex release cells above. The [current installed TypeScript observation](../evidence/native-languages/pi-typescript-adoption-controlled-offline-1791013892029.json) separately demonstrates installed setup/doctor ownership, pre-edit permit registration, exact edit attribution, semantic cross-file review, submitted native advice, advice in a provider request, an observed repair, and its correlated clear follow-up. Its package checksum and clean source commit `64987460267792d48dd4a8679f6bbfad8b2b65ac` scope that observation; it uses authenticated gpt-6-luna in isolated print/JSON mode with zero Jev requests. Registration and offline doctor ownership readiness alone establish neither native review submission nor model-visible advice or repair. Registry publication, macOS Pi support, arbitrary Pi versions, and interactive native trust remain outside this observed declaration.

The final four Pi observations share production runtime asset SHA-256 `320cc9812f023ae72b5929c67700b2ada2826f54fb3ed4b773933c2ec3099117` across 168 compiled JavaScript, native, schema, and launcher assets. All four observed artifacts share tarball SHA-256 `efa7a522c0293a932b5e5d541b9fddb0a559e3c70b36725b33fab61487384b8f`; each record retains its own checksum. Later evidence-index and documentation updates change package bytes, while the checked production runtime inventory remains identical. The observed Pi host uses Node 24.18.0 and its installed Hapsland command uses the verified Node 24.20.0 runtime. These are separate runtime facts.
