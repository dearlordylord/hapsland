# Secure local credential storage for Codex onboarding

Status: advisory research; no dependency adoption or platform support claim. Date: 2026-09-22.
Canonical scope: [Research secure credential storage for Linux and macOS](https://github.com/dearlordylord/jevs/issues/58), under [Specify convenient Codex onboarding](https://github.com/dearlordylord/jevs/issues/56).

## Brief and change log

Question: which native storage mechanisms can remember a Jev API key once while allowing bounded, noninteractive retrieval by Codex hooks and a resident reviewer on Linux and macOS?

The user selected Codex first, interactive and headless execution on Linux/macOS, and enter-once secure local storage. Environment injection remains an automation alternative. This report adds a narrow credential-mechanism investigation to the existing onboarding research; it does not supersede competitor research or decide distribution. No secrets, vault contents, paid APIs, host configuration, or keychain state were accessed or changed.

Workflows: explicit setup may obtain consent and unlock a vault; subsequent advisory review must tolerate missing credentials without stalling editing; any separately configured blocking behavior must follow the existing product policy. Other tools' credentials must survive replacement/logout. Remote Jev failure must remain distinct from local credential failure. Headless Codex within a logged-in desktop session must be distinguished from an SSH/container/server process without a usable session vault. The model provider does not change this boundary.

Existing-solution baseline: call native stores through an existing Node binding instead of designing encryption and master-key management. Required: persistent local storage, narrow identity, replacement/deletion, explicit absent versus unavailable errors, noninteractive retrieval, and bounded failure. Desirable: prebuilt packages for both CPU architectures, little system provisioning, and one adapter contract. Evidence overturning the preference for an existing binding: uncontrolled native prompts, uninterruptible retrieval, wrong storage fallback, inability to preserve credential identity across updates, or unavailable release artifacts.

Discovery: first pass searched official Secret Service/Apple docs and Node bindings; second inspected the selected binding and its native backend docs. Queries included `site.specifications.freedesktop.org secret service API locked prompt session`, `site.developer.apple.com kSecUseAuthenticationUIFail keychain macOS`, and `github napi-rs keyring node keytar archived`. Stopping condition: two bounded passes covering OS APIs and realistic integration paths, not ecosystem completeness.

## Inventory

All candidates are adjacent credential infrastructure, not review engines or agent adapters.

| Candidate/use | Inclusion or exclusion | Advisory classification |
| --- | --- | --- |
| Secret Service and macOS Keychain | Native persistent storage baseline | OPTIONAL INTEGRATION: platform services behind an owned credential boundary |
| OS prompt policy and narrow item identity | Reimplement orchestration rather than cryptography | BORROW |
| `@napi-rs/keyring` 2.1.0 | Maintained Node wrapper with platform artifacts; detailed source inspection | DEPEND ON, conditional on gates below; not accepted for production |
| Archived `keytar` | Historical implementation confirms familiar API; archived upstream | REJECT for new production dependency |
| Automatic kernel-keyring fallback | Does not deliver the selected persistent enter-once experience | REJECT for durable onboarding |
| Plaintext configuration or locally encrypted file with colocated key | Does not provide the intended native-vault boundary | REJECT for secure-storage fulfillment |
| External password-manager CLI | Adds another account/session/install prerequisite; no demonstrated necessity | OPTIONAL INTEGRATION, deferred and not surveyed |
| `security` / `secret-tool` subprocesses | Possible implementation spike, not a selected dependency; nonprompting, error, and secret-transport contracts still need proof | BORROW subprocess isolation pattern only |

## Evidence ledger

Documentation access date is 2026-09-22 throughout. No entry is RUNTIME-TESTED. Source retrieval and registry inspection are not platform conformance tests.

| ID | Exact proposition, source, evidence state | Limits |
| --- | --- | --- |
| L1 | Secret Service runs in the user's login session. [freedesktop overview](https://wiki.freedesktop.org/www/Specifications/secret-storage-spec/). DOC / DOCUMENTED. | A host's headless mode does not establish session-bus or daemon availability. |
| L2 | Locked items cannot be read/modified. Unlock can return a prompt; the client explicitly invokes it. Matching attributes support replacement. The API does not mandate access control or a particular lock implementation. [Secret Service 0.2 draft, sections 8–10 and CreateItem](https://specifications.freedesktop.org/secret-service/latest-single/). DOC / DOCUMENTED. | Protocol behavior is not a guarantee of every desktop implementation's storage or isolation. |
| L3 | libsecret search separates unlocking from loading unlocked secrets; synchronous search may block indefinitely. [search_sync](https://gnome.pages.gitlab.gnome.org/libsecret/method.Service.search_sync.html), [flags](https://gnome.pages.gitlab.gnome.org/libsecret/flags.SearchFlags.html), library docs 0.21.8.2. DOC / DOCUMENTED. | A no-unlock policy still needs cancellation/deadline handling and relock-race handling. |
| M1 | macOS has file-based and data-protection Keychains. The latter requires user login context; access groups derive from executable signing entitlements and provisioning. Command-line packaging needs additional treatment. The `security` CLI primarily targets file-based stores. [Apple TN3137](https://developer.apple.com/documentation/technotes/tn3137-on-mac-keychains). DOC / DOCUMENTED. | Do not transfer iOS/data-protection claims to an ordinary Node CLI or system daemon. |
| M2 | Authentication can be disallowed using an LAContext. Apple deprecates `kSecUseAuthenticationUIFail` in favor of that mechanism. [interactionNotAllowed](https://developer.apple.com/documentation/localauthentication/lacontext/interactionnotallowed), [UI fail](https://developer.apple.com/documentation/security/ksecuseauthenticationuifail). DOC / DOCUMENTED. | Applicable control must be checked against the chosen macOS implementation, not presumed. |
| M3 | Legacy Keychain UI is enabled by default; disabling it makes UI-requiring functions error. Apple warns callers to restore interaction afterward. [SecKeychainSetUserInteractionAllowed](https://developer.apple.com/documentation/security/seckeychainsetuserinteractionallowed(_:)). DOC / DOCUMENTED. | Deprecated API; global-state implications make use inside a shared process unattractive. |
| M4 | SecItemUpdate and SecItemDelete are query-scoped blocking operations; delete defaults to all matching items. [Update](https://developer.apple.com/documentation/security/secitemupdate(_:_:)), [Delete](https://developer.apple.com/documentation/security/secitemdelete(_:)). DOC / DOCUMENTED. | A broad product/service-only delete is not an acceptable ownership contract. |
| N1 | Binding source at `1635ed458e8349ba28233728a8238ad99a5b2817` declares version 2.1.0, MIT license, and Darwin/Linux x64/arm64 build targets. [Manifest](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/package.json), [Cargo manifest](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/Cargo.toml). META / SOURCE-INSPECTED. | Registry `npm view @napi-rs/keyring@2.1.0 optionalDependencies --json` lists corresponding version-pinned packages. No package was installed/executed; binary provenance/compatibility remain untested. GitHub metadata reported unarchived and pushed 2026-09-13. |
| N2 | Linux selection falls back from Secret Service construction failure to keyutils. Explicit `linux.store = secret-service` propagates failure instead. Options describe keyutils as reboot-volatile. [Builder](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/src/entry_builder.rs), [fallback](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/src/linux_credential_builder.rs), [options](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/src/options.rs). SRC / SOURCE-INSPECTED. | A successful default write cannot be assumed durable. |
| N3 | Public EntryOptions only expose Linux store selection. AsyncEntry constructor synchronously creates the entry; async methods wrap synchronous credential operations in native tasks, with optional AbortSignal. [AsyncEntry](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/src/async_entry.rs), options in N2. SRC / SOURCE-INSPECTED. | No public no-prompt option is exposed here. INFERRED: an AbortSignal alone is insufficient evidence of interruption of an already-running OS call. Actual prompting and cancellation remain UNKNOWN. |
| N4 | Lookup maps only NoEntry to missing; deletion maps only NoEntry to false, propagating other errors. Tests encode that distinction. [Result conversion and tests](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/src/result.rs). SRC / SOURCE-INSPECTED. | Not runtime evidence; product still needs stable structured error translation. |
| N5 | Binding chooses apple-native-keyring-store's `keychain` backend. [Builder in N2]. SRC / SOURCE-INSPECTED. Backend docs describe default login file-based Keychain. [Backend 1.0.2](https://docs.rs/apple-native-keyring-store/1.0.2/apple_native_keyring_store/keychain/index.html). DOC / DOCUMENTED. | Cargo uses a compatible version range and no Cargo.lock was present in inspected checkout; docs version does not establish exact transitive versions in released binaries. |
| N6 | Secret-Service backend documents headless session provisioning complications and static-link build option. [Backend 1.0.1](https://docs.rs/dbus-secret-service-keyring-store/1.0.1/dbus_secret_service_keyring_store/). DOC / DOCUMENTED. | CI unlocking with a known test password is not a production master-password strategy. |
| K1 | `atom/node-keytar` upstream archived December 2022; docs describe native Keychain/libsecret dependency. [Upstream](https://github.com/atom/node-keytar). META / DOCUMENTED. | Rejection concerns this archived upstream, not every fork. |

## Comparable infrastructure cards

**Native services.** Identity/role: OS/service interfaces, not redistributable product packages; Apple SDK and actual Linux provider licensing need checking for any redistributed helper. Lifecycle: setup/read/update/delete, no review events or blocking policy. Contract: product-owned credential identity mapped onto provider item identifiers; errors remain distinct. Failure: locks and missing sessions are normal states (L1–L3, M1–M4). Extension/composition: platform implementations vary; coexist using a reserved product namespace and exact account identity. State: credentials outlive processes; in-memory caches are independent of vault deletion. Security: native storage does not establish isolation from all same-user processes (L2); do not promise such isolation. Portability/operations: logged-in user contexts and headless servers require separate conformance profiles. Replacement cost: maintain a narrow adapter and explicit migration if identifiers/store change. Classification: OPTIONAL INTEGRATION for each platform service; BORROW lifecycle separation.

**Node binding.** Identity: N1, MIT, native dependency at the credential boundary. Lifecycle/contract: get/set/delete, missing versus error (N4); no host/review policy. Failure: initialization and native work can block; no proved public no-prompt path (N3). Extension/packaging: N-API binaries and Rust dependencies; Linux pinning is explicit (N2). Composition: exact service/account pairs, no broad enumeration needed. State: default fallback can change durability; this must be disabled for onboarding. Security: dependency handles plaintext in process memory; package inspection is not a security audit. Portability: target declarations are metadata only. Operations: require a killable helper or proven interruptible alternative, native-error mapping, artifact pinning, and per-platform tests. Replacement cost: manageable with owned interface, but item identity/migration must be preserved. Conditional DEPEND ON; adoption gates unresolved.

**Archived binding.** Same conceptual CRUD boundary; K1 supports rejection for new dependency ownership. Its lifecycle/API pattern can inform comparisons, but no runtime, security, or failure claim is adopted. Broader review is unnecessary after this maintenance exclusion.

## Capability matrix

| Capability | Linux native service | macOS native Keychain | Selected Node wrapper |
| --- | --- | --- | --- |
| Persistent store | DOCUMENTED L1/L2; provider configuration matters | DOCUMENTED M1 | SOURCE-INSPECTED selection N2/N5; default Linux fallback unsuitable |
| No-interaction operation | DOCUMENTED protocol controls L2/L3 | DOCUMENTED controls M2/M3; implementation-specific | UNKNOWN end to end; no public option N3 |
| Bounded failure | UNKNOWN product behavior | UNKNOWN product behavior | UNKNOWN; async is not a deadline proof N3 |
| Replace/logout | DOCUMENTED L2 | DOCUMENTED M4 | SOURCE-INSPECTED CRUD/result mapping N4 |
| Headless real Codex access | UNKNOWN | UNKNOWN | UNKNOWN |
| Packaging compatibility | UNKNOWN supported distro matrix | UNKNOWN executable/update identity | SOURCE-INSPECTED targets N1; execution UNKNOWN |

## Conditional dependency gates

All gates are mandatory for adopting `@napi-rs/keyring`; an unresolved gate is not acceptance.

| Gate | Status | Evidence and resolving check |
| --- | --- | --- |
| License compatibility | UNRESOLVED | MIT top-level N1; audit exact released native/transitive license set and redistribution. |
| API/version guarantees | UNRESOLVED | N1–N4 offer suitable CRUD shape; pin actual artifacts and confirm transitive build provenance/error contract. |
| Real-host conformance | UNRESOLVED | No native run. Execute setup → actual Codex hook/reviewer retrieval on Linux and macOS, interactive and headless. |
| Trust, egress, credential handling, supply chain | UNRESOLVED | Inspect binaries/build provenance; synthetic-secret traces must show no CLI arguments/logs/config leakage. Validate actual store and item access policy. |
| Timeout, crash, degradation, policy | UNRESOLVED | Locked/absent daemon, denied access, relock, stalled helper, native abort after start; prove no prompt and bounded process cleanup. N3 does not prove these. |
| Maintenance and compatibility ownership | UNRESOLVED | Recent upstream activity N1 is a positive signal, not a support guarantee; designate product owner and platform upgrade tests. |
| Integration/ongoing cost | UNRESOLVED | Confirm whether prompt controls require custom helper/fork; measure cold retrieval and constructor behavior. |
| Replacement/exit/fallback | UNRESOLVED | Prototype credential identity migration and exact deletion; explicit environment injection can keep automation working but cannot satisfy enter-once by itself. |

Default auto-fallback mode fails the mandatory durability requirement (N2), so it is REJECTED regardless of the conditional library recommendation. No other gate is silently passed.

## Synthesis and disconfirmation

The mechanisms exist, but a library advertising Keychain support does not establish unattended Codex support. A headless CLI in an unlocked desktop session is plausibly compatible; that is an inference requiring real-host checks. A server without a user vault cannot be promised enter-once native storage merely because its OS is Linux or macOS (L1, M1, N6).

Convergent pattern: separate intentional setup interaction from background retrieval. Retain a product-owned credential boundary, with no-prompt read and explicit setup/update/delete operations. Resolve credentials in the reviewer where possible rather than in every edit hook; this is an advisory performance/isolation choice, not a decided architecture. Never place credentials in review events or repository configuration.

No new cryptographic store is justified by this evidence. Existing native services suffice as the infrastructure baseline, but an off-the-shelf wrapper alone has not met the unattended contract. The strongest case against the wrapper is its inaccessible prompt controls and blocking initialization. If a small native helper is required anyway, direct platform adapters may cost less than layering a wrapper and then bypassing it. Conversely, a retained no-prompt/cancellation test with supported public API and audited binaries would favor the wrapper.

Source facts do not settle the user-facing behavior when a vault is unavailable: specify a recoverable setup/doctor state, explicit automation environment mode, and the pre-existing review failure policy. Do not silently replace persistence with keyutils or a plaintext file. Logout must not claim remote Jev key revocation; that requires a separate backend capability. Also decide how an already-running reviewer loses cached authorization after replacement/logout.

## Traceable handoff

| ID | Advisory implication | Support / uncertainty / consequence if wrong | Next step |
| --- | --- | --- | --- |
| P1 | Setup may interact; hooks/reviewer must not initiate unlock prompts and must return within a bound. | L2/L3, M2/M3, N3; macOS implementation control unresolved; wrong choice can hang edits. | Both specification and native spike. |
| P2 | Diagnose missing, locked, unavailable, denied, and timed-out storage separately from missing key or remote failure. | L2, N4; exact error mapping unknown; false success would mislead onboarding. | Both; inject synthetic failures at owned credential boundary. |
| P3 | Use persistent Secret Service explicitly and separately validate login Keychain access. | N2/N5; actual host contexts unknown; wrong store loses key after reboot. | Both; restart process/session tests and storage identity evidence. |
| P4 | Keep installation and secret identity stable across versions; narrow replacement/delete to the owned item. | L2, M4, N4; executable trust on update unknown; wrong query could affect other tools. | Both; synthetic neighboring items, denied delete, update/reinstall tests. |
| P5 | Define headless profiles: user-session access versus provisioned server vault/environment injection. | L1, M1, N6; support envelope unknown. | Specification plus separate Linux/macOS host conformance. |
| P6 | Replacement/logout invalidates resident caches; report deletion failure honestly. | N4 and architectural inference; cache behavior is product-owned, not OS evidence. | Specification; external behavior test through setup/reviewer boundary. |
| P7 | Keep package selection conditional on no-prompt, bounded cancellation, and distributable artifacts. | N1/N3; unresolved native controls can change distribution design. | Prototype before final dependency choice. |

Suggested highest-level acceptance seam: run setup and a reviewer-triggering host event as separate processes under the same controlled test user, then replace/logout and repeat. Use synthetic credentials with an offline fake Jev endpoint; preserve deterministic unit coverage behind the owned credential interface. Add actual native vault fixtures on Linux/macOS in dedicated disposable user environments. Check unlocked/locked/no-session cases, no UI, deadline, replacement, failed deletion, restart, and package update identity. This pass did not execute those checks and does not authorize changes to a real user's vault.

## Limits and replay

Report is source/documentation research performed from a Linux workspace; no macOS execution, vault connection, native module installation, credential retrieval, or paid call occurred. Environment access was intentionally not probed for real keychains. Available-environment work now can validate owned-interface error contracts offline; native service behavior needs a disposable vault/user environment, and macOS needs a real macOS runner.

Reproduce inspection using `git clone https://github.com/Brooooooklyn/keyring-node`, checkout `1635ed458e8349ba28233728a8238ad99a5b2817`, read the linked sources, and query package metadata for exactly 2.1.0. Apple pages provide `.md` equivalents when the rendered page needs JavaScript. No runtime fixture or sanitized credential evidence exists for this pass because none was run.

The two discovery passes found enough mechanism diversity to bound this question. This is not an exhaustive vault/library survey. Next discovery, if gates fail, should target a minimal platform helper's no-prompt controls, not repeat broad competitor research. Primary-source index is the evidence ledger; all material external claims point there. Product proposals are explicitly inferences or future checks.
