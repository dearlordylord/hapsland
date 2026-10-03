# Pi installation and native profile

**Purpose:** Explain Pi registration, lifecycle operations, and the exact native evidence boundary.
**Status:** Maintained installation guidance; native validation is recorded separately below.
**Authority:** Maintained operational guidance implementing issues #204–209; validation evidence does not broaden the accepted review or advice contracts.
**Expected use:** Install into a selected Pi agent home, diagnose readiness, and distinguish installed review from observed model use.
**Lifecycle:** Update with Pi installer, adapter, or extension changes. Review whenever the exact supported Pi version, native tool evidence, settlement lifecycle, or retained package evidence changes.

After acquiring a package through the [installation lanes](installation-workflows.md), run from the repository to review:

```sh
hapsland setup pi
hapsland doctor pi
```

Setup previews the owned extension before applying it. It preserves unrelated extensions, settings, model/provider configuration, and credentials. The extension lives at `<pi-home>/extensions/hapsland.ts` and imports the retained package's compiled extension. Restart Pi after setup or an update. Global agent-home extension loading and project-local trust are separate boundaries; installation does not prove execution or native trust approval.

Select another executable and profile explicitly:

```sh
hapsland setup pi --pi-home=/absolute/isolated/agent --pi-executable=/absolute/path/to/pi
```

The default agent home is `PI_CODING_AGENT_DIR`, or `~/.pi/agent`. Launch Pi with the same `PI_CODING_AGENT_DIR` for a custom profile; selecting a registration home does not change Pi's own environment. Compatibility requires exact Pi 1.0.0 on Linux arm64. Other versions or platforms are reported as unsupported before installing.

The ordinary version-1 JSON `--setup` and `--doctor` interfaces accept `host: "pi"`, `piHome`, and `piExecutable`. Setup accepts `installProposalDigest` from its installation preview. Maintenance commands use the same ownership and proposal workflow:

```sh
hapsland update pi
hapsland repair pi
hapsland reinstall pi
hapsland uninstall pi
```

Uninstall removes unchanged Hapsland-owned artifacts. Changed owned files are conflicts to inspect, rather than authorization to delete user modifications. Unrelated settings and extensions remain owned by the user.

## Native edit and delivery limits

Native `edit` evidence includes its tool-call identity, targeted replacements, and the runtime's unified result patch. The adapter verifies patch coordinates against bounded current source and routes eligible semantic declarations through the shared resident and cross-file review pipeline. A source-free permit precedes the tool; failed registration leaves review incomplete and permits the native edit. Hapsland does not capture a separate pre-edit file, retain previous code, or establish a Git baseline.

Native `write` is explicitly unsupported/incomplete in this profile. Matching written content does not establish creation or changed spans. Existing Unicode patch limitations tracked by [#151](https://github.com/dearlordylord/hapsland/issues/151) remain; refusal must not become a clear or addressed review. Shell mutations, custom tools, and nested calls without validated originating-session evidence are outside this profile.

Advice submitted through an extension result is a handoff observation. A finding observed in a native provider request establishes the tested request's model-visible input; it does not guarantee compliance. A repair and its correlated clear follow-up are separate assertions. The resident owns pending work, freshness, finish wait, continuation budgets, and expiry. The extension does not introduce another review queue or repair policy.

## Validation boundary

The [testing matrix](testing-matrix.md) owns the installed native commands and evidence links. The shared runner production-installs a locally packed artifact, runs ordinary setup/doctor in an isolated home, and uses the existing `openai-codex/gpt-6-luna` configuration with copied disposable credentials. The user's ordinary profile is unchanged. The controlled reviewer makes zero Jev requests; authenticated model use is a separate external boundary.

Until a run is recorded as demonstrated, installation and deterministic fixtures do not establish native advice adoption. Exact evidence must distinguish installed, ready, admitted, review submitted, advice submitted, model-visible, repaired, and follow-up clear. There is no claim of registry publication, macOS support, arbitrary Pi versions, interactive trust validation, or universal agent compliance.
