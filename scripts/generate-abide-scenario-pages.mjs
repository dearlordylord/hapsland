// Render reader pages from the exact measured fixtures and frozen judgments.
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import assert from "node:assert/strict"
import { cases } from "./abide-large-declaration-fixtures.mjs"
const project = path.resolve(import.meta.dirname, "..")
const evidence = "evidence/abide-large-declarations-current"
const read = (p) => JSON.parse(fs.readFileSync(path.join(project, p)))
const comparison = read(`${evidence}/effective-comparison.json`)
const declaration = read(`${evidence}/declaration.json`)
assert.equal(comparison.agentRuntimeVersion, "0.155.1")
assert.equal(comparison.model, "gpt-6-luna")
assert.equal(comparison.reasoning, "max")
assert.equal(
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(project, "scripts/abide-large-declaration-fixtures.mjs")))
    .digest("hex"),
  declaration.protectedDigests["scripts/abide-large-declaration-fixtures.mjs"],
  "Fixtures changed: regenerate only after replacing their measured evidence."
)
for (const fixture of cases) {
  const dir = path.join(project, "docs/examples/large-declarations", fixture.candidateId, fixture.layout)
  assert(
    fs.readFileSync(path.join(dir, fixture.gold ? "defect.ts" : "clean.ts"), "utf8").endsWith(fixture.before),
    `Reader input drift: ${fixture.id}`
  )
  for (const [name, source] of Object.entries(fixture.support))
    assert.equal(fs.readFileSync(path.join(dir, name), "utf8"), source, `Reader helper drift: ${fixture.id}/${name}`)
}
const descriptions = {
  "report-delivery": {
    title: "Report delivery: email needs recipients",
    rule: "r2 — prevent meaningless field combinations",
    kind: "Type",
    problem:
      "A report can be downloaded by its requester or sent by email. The type below also accepts email without recipients and download with recipients: its fields do not enforce the chosen delivery mode.",
    repair:
      "Keep arbitrary report configuration and both delivery modes. Email must require at least one recipient; download must exclude a recipient list. A tagged delivery value or a correctly constrained top-level union can express this.",
    checks:
      "Compiler probes supply complete variable assignments for both valid modes and invalid combinations, and check that independent configuration fields retain their original types and requiredness.",
    note: "Both Hapsland sessions repaired the type. The compact Abide session also repaired it, but reported `NO_FEEDBACK` and had no identified feedback output; that repair has no demonstrated feedback-to-repair link."
  },
  "map-camera": {
    title: "Map camera: a center needs both coordinates",
    rule: "r3 — keep the parts of one fact together",
    kind: "Type",
    problem:
      "A map either starts at a geographic center or fits all markers. Independently optional latitude and longitude also allow a partial center, such as latitude with no longitude.",
    repair:
      "Preserve optional centering and arbitrary coordinates. When a center exists, both coordinates must exist. Keep every independent map setting and its admitted values.",
    checks:
      "Compiler probes accept no center and a complete center, reject each partial center, and verify independent-field preservation. Known nested and complete-or-absent top-level representations are checked.",
    note: "Hapsland repaired both tested defect layouts. In detection, it also warned once on a valid compact control. Both products preserved their two native clean controls; detecting a problem and giving a correct warning are separate obligations."
  },
  "attachment-manifest": {
    title: "Attachment manifest: one source for the count",
    rule: "r4 — avoid storing the same fact twice",
    kind: "Type",
    problem:
      "A manifest stores attachments and their count independently. It therefore accepts an empty list with count two, or a one-item list with count zero.",
    repair:
      "Retain arbitrary attachments, filenames, media types and independent settings. Derive the count from the actual list or enforce equality. Removing the redundant count while keeping the list is a valid repair.",
    checks:
      "Blinded review checks all independent fields and arbitrary filenames. Compiler witnesses and empty/one/two-item array probes check count derivation availability. These type fixtures contain no UI badge renderer.",
    note: "Both Hapsland sessions removed redundant count and retained attachments. Neither Abide session repaired the independent count. The authored valid control demonstrates the intended representation; it is separate from the agents’ final code.",
    manual: true,
    probe: "adjudicate.mjs"
  },
  "render-pool": {
    title: "Render pool: allow only supported worker counts",
    rule: "r7 — enforce what the field name promises",
    kind: "Type",
    problem:
      "The service offers pools of exactly one, two or four workers. A plain number also accepts unsupported counts such as three or seventeen.",
    repair:
      "Accept all three supported counts and reject other numbers, while preserving every independent setting. For this domain, `workerCount: 1 | 2 | 4` is sufficient.",
    checks:
      "Complete compiler assignment witnesses test all supported counts, unsupported counts and independent settings. This is a local-value diagnostic; it does not require imported implementation context.",
    note: "This is the collection’s counterexample. In the compact Hapsland session, Jev found the problem and the agent confirmed receipt, but reported `NOT_APPLIED` and left the numeric type. The compact Abide session repaired it while reporting `NO_FEEDBACK`. In the larger layout, only Hapsland repaired it."
  },
  "reservation-window": {
    title: "Reservation window: make the clock explicit",
    rule: "r9 — declare the resources the body uses",
    kind: "Function",
    problem:
      "Booking decisions depend on the current time, but the function signature below does not declare a clock. Its helper `readServiceTime()` calls `Date.now()`, which reads the system clock. The same booking arguments can therefore yield a different decision as time passes.",
    repair:
      "Declare a usable clock or observation time and actually use it. Preserve closure → expiry → insufficient inventory → availability precedence, the booking reference and trimmed description. Decrement inventory only for an available booking.",
    checks:
      "Blinded runtime probes use deadline 100 with times 99, 100 and 101, closed and insufficient-inventory cases, and distinct supplied versus hidden clock values. They check actual supplied-clock use, call counts and exact inventory updates.",
    note: "Both Hapsland sessions declared and used a Clock. Neither Abide session repaired the hidden clock dependency. Across layouts, the function keeps the same computations and ordering; the larger forms expand the signature and paragraph layout.",
    manual: true,
    probe: "probe.mjs"
  },
  "moderation-decision": {
    title: "Moderation decision: make the audit writer explicit",
    rule: "r9 — declare the resources the body uses",
    kind: "Function",
    problem:
      "Each decision must record the submission ID, status and exact original text once. The helper `appendAudit()` appends to a shared in-memory audit log, but this writing capability is absent from the function signature.",
    repair:
      "Declare a usable audit writer and use the supplied writer. Keep exactly one raw audit entry, trimmed returned text and every public result field. Preserve empty → too long → blocked → accepted precedence; deleting audit is not a repair.",
    checks:
      "Blinded runtime probes check exact raw audit entries, one write per decision, empty and rejected input, length boundaries, arbitrary case-insensitive blocked terms and all returned facts. Compiler checks preserve the full input/output contract.",
    note: "Both Hapsland sessions used an explicit writer and passed the behavior probes. Neither Abide session repaired the hidden writer dependency. This scenario uses the declared renderer-repair batch; fixtures and scoring stayed unchanged.",
    manual: true,
    probe: "probe.mjs"
  }
}
const domains = comparison.domains.map((d) => d.candidateId)
let checked = 0
for (const domain of domains) {
  const info = descriptions[domain],
    result = comparison.domains.find((d) => d.candidateId === domain)
  assert(info)
  const dir = `docs/examples/large-declarations/${domain}`
  const link = (label, target) => `[${label}](${path.relative(dir, target).replaceAll("\\", "/")})`
  const measuredRoot = `evidence/${comparison.batches[domain].root}`
  const fixture = cases.find((f) => f.candidateId === domain && f.layout === "large-separated" && f.gold)
  assert(fixture)
  const inputs =
    link("full input file", `${dir}/large-separated/defect.ts`) +
    (info.kind === "Function" ? ` and ${link("helper definitions", `${dir}/large-separated/support.ts`)}` : "")
  let text = `# ${info.title}\n\n**Purpose:** Explain this measured scenario, show its code and route readers to its specific checks.\n**Status:** Completed exploratory scenario; generated from the current frozen comparison.\n**Authority:** Comparative research advisory and validation evidence, not a product contract or release certification.\n**Expected use:** Understand the problem, compare final agent code and inspect the predefined correctness checks.\n**Lifecycle:** Regenerate with scripts/generate-abide-scenario-pages.mjs when the owning fixtures or current evidence change. Review when rule wording, input selection or scoring changes; replace superseded results and update links.\n\n${link("Studies", "docs/review-studies.md")} → ${info.title.split(":")[0]} · ${link("Full methodology", "docs/abide-large-declaration-study.md#methodology")}\n\n## What can go wrong\n\n${info.problem}\n\n**Code:** ${info.kind}. **Rule:** ${info.rule}. \`CaseState\` is the exported declaration name used by the experiment.\n\n## Read the larger input\n\nThis is the exact measured input before the maintenance rename. Open the ${inputs}.\n\n\`\`\`typescript\n${fixture.before.trimEnd()}\n\`\`\`\n\nThe task asks the agent to rename \`label\` to \`displayLabel\` while preserving the domain. The defect is present before that edit.\n\n## What happened\n\nEach result below is **one native session on one defective input**, using **Codex CLI 0.155.1, model \`gpt-6-luna\`, reasoning \`max\`**. Both reviewers use Jev and the same target design concern; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.\n\n| Input layout | Hapsland session | Abide session |\n| --- | --- | --- |\n`
  for (const layout of ["small", "large-separated"]) {
    const outcomes = ["hapsland", "abide"].map((arm) => {
      const cell = result.cells.find((c) => c.gold && c.layout === layout && c.candidate === arm)
      assert(cell)
      const status =
        cell.finalStatus === "repaired"
          ? "Repaired"
          : cell.finalStatus === "remaining"
            ? "Not repaired"
            : cell.finalStatus
      return `${status} · ${link("final code", `${measuredRoot}/${domain}/native/blind/${cell.blindId}/subject.ts`)}`
    })
    text += `| ${layout === "small" ? "Compact" : info.kind === "Function" ? "Expanded signature, grouped body" : "Larger, separated fields"} | ${outcomes.join(" | ")} |\n`
  }
  text += `\n${info.note}\n\n## What counts as a correct repair\n\n${info.repair}\n\nThe ${link("valid larger control", `${dir}/large-separated/clean.ts`)} was authored before the runs. It is not an agent’s final repair. Each product preserved both native clean inputs in this scenario.\n\n## Other input variants\n\n| Layout | Defective input | Authored valid control |\n| --- | --- | --- |\n`
  for (const [layout, label] of [
    ["small", "Compact"],
    [
      "large-adjacent",
      info.kind === "Function" ? "Expanded signature, compact body" : "Larger, related fields adjacent"
    ],
    [
      "large-separated",
      info.kind === "Function" ? "Expanded signature, grouped body" : "Larger, related fields separated"
    ]
  ])
    text += `| ${label} | ${link("TypeScript", `${dir}/${layout}/defect.ts`)} | ${link("TypeScript", `${dir}/${layout}/clean.ts`)} |\n`
  text += `\nDetection uses all three layouts with two reviews per input and product. Native sessions use compact and separated layouts. Four type scenarios add independent configuration facts; the two function scenarios change layout while keeping computations unchanged. These variants are not independent real-world programs.\n\n## Inspect the checks\n\n${info.checks}\n\n`
  const warnings = (arm) => Object.values(result.detection).reduce((n, layout) => n + layout[arm].falsePositives, 0)
  text += `Detection false warnings on six clean observations: **Hapsland ${warnings("hapsland")}/6; Abide ${warnings("abide")}/6**. Those six observations repeat the three valid layouts; they are not six independent clean designs.\n\n`
  const links = [
    link("Frozen anonymous code scores", `${measuredRoot}/${domain}/native/blind-scores.json`),
    link("Exact session and artifact mapping", `${measuredRoot}/${domain}/native/index.json`),
    link("Current comparison and source-batch map", `${evidence}/effective-comparison.json`)
  ]
  if (info.manual)
    links.unshift(
      link("Blinded semantic judgments", `${measuredRoot}/manual/${domain}.json`),
      link("Executable probes", `${measuredRoot}/manual/probes/${domain}/${info.probe}`)
    )
  else links.unshift(link("Independent compiler oracle", "scripts/score-abide-large-declarations.mjs"))
  for (const l of links) text += `- ${l}.\n`
  text += `\nSee ${link("full results and limitations", "docs/abide-large-declaration-study.md#results")} and ${link("shared methodology", "docs/abide-large-declaration-study.md#methodology")} for thresholds, sample sizes, input boundaries and what these observations do not establish.\n\n${link("All scenarios", "docs/review-studies.md#choose-a-scenario")} · ${link("Nine-rule coverage study", "docs/abide-contextual-review-study.md")}\n`
  const output = path.join(project, dir, "README.md")
  if (process.argv.includes("--check"))
    assert.equal(fs.readFileSync(output, "utf8"), text, `Regenerate ${path.relative(project, output)}`)
  else fs.writeFileSync(output, text)
  checked++
}
console.log(
  JSON.stringify({
    scenarioPages: checked,
    mode: process.argv.includes("--check") ? "checked" : "generated",
    providerRequests: 0
  })
)
