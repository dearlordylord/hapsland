#!/usr/bin/env node
/** Source-free, offline join of proposed fixture scope and pinned HTTP body measurements. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const wire = resolve(here, "../issue-138-wire");
const target = join(here, "egress-accounting-proposal.json");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const count = (text) => Buffer.byteLength(text, "utf8");
const insist = (ok, why) => { if (!ok) throw new Error(why); };
const read = async (path) => readFile(path);
const json = async (path) => JSON.parse((await read(path)).toString("utf8"));
const anchor = async (path) => sha(await read(path));
const fixturePath = (relative) => {
  insist(typeof relative === "string" && !relative.startsWith("/") && !relative.includes("\\"), "invalid fixture path");
  const path = resolve(here, relative);
  insist(path.startsWith(`${here}${sep}`), "fixture path escaped corpus");
  return path;
};
const sourceFields = (input) => {
  const sources = [input.artifact.source];
  const visit = (references) => {
    for (const reference of references ?? []) {
      if (reference.kind !== "expanded") continue;
      sources.push(reference.node.artifact.source);
      visit(reference.node.references);
    }
  };
  if (Array.isArray(input.evidence)) visit(input.evidence);
  else sources.push(...(input.evidence?.nodes ?? []).map((node) => node.source));
  return sources.reduce((sum, value) => sum + count(value), 0);
};
const sourceAnchors = (providerInput) => {
  const sources = [providerInput.artifact, ...(providerInput.evidence?.nodes ?? [])];
  return sources.map((source) => ({path: source.domain, sha256: sha(Buffer.from(source.source, "utf8")), bytes: count(source.source)}));
};

const generate = async () => {
  const files = {
    corpus: join(here, "manifest.json"),
    declaredPlan: join(here, "live-plan-proposal.json"),
    comparators: join(wire, "comparators-proposal.json"),
    providerObservations: join(wire, "provider-http-observations.json"),
    typeGolden: join(wire, "type-candidate.json"),
    functionGolden: join(wire, "function-candidate.json"),
  };
  const [corpus, plan, comparators, provider, typeGolden, functionGolden] = await Promise.all(
    Object.values(files).map(json));
  const measuredCandidates = new Map((await json(target)).cases.map((item) => [item.id, item.candidate]));
  const candidateTest = resolve(here, "../../src/direct-event/candidate-egress-accounting.test.ts");
  const packageJson = await json(resolve(here, "../../package.json"));
  insist(corpus.status === "proposal-unapproved-no-live-egress" &&
    plan.phase === "pre-execution-declaration" && plan.status === "proposal-unapproved-no-live", "proposal status changed");
  insist(comparators.corpusManifestSha256 === await anchor(files.corpus), "comparator corpus anchor stale");
  insist(plan.anchors.corpus.sha256 === await anchor(files.corpus) &&
    plan.anchors.wireExample.sha256 === await anchor(files.typeGolden), "declared plan anchor stale");
  insist(provider.status === "observed-offline-pinned-client-only" &&
    provider.providerPackage === "@effect/ai-typesafe@4.0.0-rc.116" &&
    provider.effectPackage === "effect@4.0.0-rc.116" &&
    provider.endpoint === "https://api.typesafe.ai/v1/systemone" &&
    provider.method === "POST" &&
    packageJson.dependencies["@effect/ai-typesafe"] === "4.0.0-rc.116" &&
    packageJson.dependencies.effect === "4.0.0-rc.116", "provider observation or pinned dependency identity changed");
  const observed = new Map(provider.observations.map((item) => [item.id, item]));
  insist(observed.size === provider.observations.length && observed.size === 35, "expected 35 unique HTTP body observations");
  const used = new Set();
  const body = (id, localBytes, stateBytes, contract) => {
    const row = observed.get(id);
    insist(row && !used.has(id), `${id}: missing or duplicate HTTP body observation`);
    used.add(id);
    insist(row.localRequestBytes === localBytes && row.stateBytes === stateBytes &&
      row.inputContract === contract && row.httpBodyBytes > 0 &&
      /^[0-9a-f]{64}$/.test(row.httpBodySha256), `${id}: observed body/contract mismatch`);
    return {httpBodyBytes: row.httpBodyBytes, httpBodySha256: row.httpBodySha256};
  };
  const candidateGoldens = [];
  for (const [id, golden] of [["type-candidate", typeGolden], ["function-candidate", functionGolden]]) {
    insist(count(JSON.stringify(golden.completeRequest)) === golden.completeRequestBytes &&
      count(JSON.stringify(golden.providerInput)) === golden.providerInputBytes &&
      JSON.stringify(golden.completeRequest.input) === JSON.stringify(golden.providerInput), `${id}: golden bytes/input mismatch`);
    candidateGoldens.push({id, corpusCaseId: null,
      contract: golden.providerInput.inputContract.id,
      sourceFields: sourceAnchors(golden.providerInput),
      sourceFieldUtf8Bytes: sourceFields(golden.providerInput),
      localRequestBytes: golden.completeRequestBytes,
      ...body(id, golden.completeRequestBytes, golden.providerInputBytes, golden.providerInput.inputContract.id)});
  }
  const corpusCases = corpus.cases.filter((item) => item.branch === "type-shape/v2");
  insist(corpusCases.length === 12 && comparators.cases.length === 12 && plan.cases.length === 12,
    "expected 12 T cases in corpus, comparators, and plan");
  const comparatorById = new Map(comparators.cases.map((item) => [item.id, item]));
  const planById = new Map(plan.cases.map((item) => [item.id, item]));
  insist(comparatorById.size === 12 && planById.size === 12, "duplicate case ID");
  const cases = [];
  for (const fixture of corpusCases) {
    const proposal = comparatorById.get(fixture.id);
    const declared = planById.get(fixture.id);
    insist(proposal && declared && proposal.id === declared.id &&
      proposal.category === fixture.category && declared.category === fixture.category, `${fixture.id}: case join mismatch`);
    insist(JSON.stringify(proposal.sourceHashes) === JSON.stringify(fixture.sources) &&
      JSON.stringify(declared.fixtureHashes) === JSON.stringify(fixture.sources), `${fixture.id}: fixture inventory mismatch`);
    const sourceFiles = [];
    for (const source of fixture.sources) {
      const bytes = await read(fixturePath(source.path));
      insist(bytes.length === source.bytes && sha(bytes) === source.sha256, `${fixture.id}: source anchor stale: ${source.path}`);
      sourceFiles.push({path: source.path, sha256: source.sha256, bytes: source.bytes});
    }
    const arms = {};
    for (const [arm, value] of Object.entries(proposal.arms)) {
      const id = `${fixture.id}/${arm}`;
      const scope = value.sourceScope;
      insist(JSON.stringify(value.localRequest) === JSON.stringify({input: value.providerInput, decisions: value.localRequest.decisions}) &&
        count(JSON.stringify(value.localRequest)) === value.localRequestBytes &&
        count(JSON.stringify(value.providerInput)) === value.providerInputBytes, `${id}: local input bytes mismatch`);
      insist(sourceFields(value.providerInput) === scope.sourceFieldUtf8Bytes, `${id}: source-field bytes mismatch`);
      const roles = [
        ...scope.postEditPaths.map((path) => `post:${path}`),
        ...scope.preEditPaths.map((path) => `pre:${path}`),
        ...scope.supportingPostEditPaths.map((path) => `supporting-post:${path}`),
      ];
      const anchoredRoles = roles.map((role) => {
        const [version, virtualPath] = role.split(":");
        insist(virtualPath === "root.ts" || virtualPath === "support.ts", `${id}: unexpected path ${role}`);
        const filename = version === "pre" ? `${virtualPath.slice(0, -3)}.before.ts` : virtualPath;
        const match = sourceFiles.find((source) => source.path === `cases/${fixture.id}/${filename}`);
        insist(match, `${id}: unanchored source ${role}`);
        return {role, fixturePath: match.path};
      });
      insist(declared.applicableArms.includes(arm), `${id}: undeclared comparator arm`);
      arms[arm] = {status: value.contractStatus, inputContract: value.providerInput.inputContract.id,
        sourceRoles: anchoredRoles, sourceFieldUtf8Bytes: scope.sourceFieldUtf8Bytes,
        localRequestBytes: value.localRequestBytes,
        ...body(id, value.localRequestBytes, value.providerInputBytes, value.providerInput.inputContract.id)};
    }
    insist(JSON.stringify(Object.keys(arms).sort()) === JSON.stringify(declared.applicableArms.filter((arm) => arm !== "candidate").sort()),
      `${fixture.id}: comparator arms differ from plan`);
    const candidate = measuredCandidates.get(fixture.id);
    insist(candidate?.status === "observed-offline-pinned-client-only" &&
      candidate.inputContract === "direct-event/type-shape/v2" &&
      Number.isSafeInteger(candidate.localRequestBytes) && candidate.localRequestBytes > 0 &&
      Number.isSafeInteger(candidate.httpBodyBytes) &&
      candidate.httpBodyBytes === candidate.localRequestBytes + 14 &&
      /^[0-9a-f]{64}$/.test(candidate.httpBodySha256) &&
      Array.isArray(candidate.sourceFields) && candidate.sourceFields.length > 0,
      `${fixture.id}: candidate observation missing or malformed`);
    insist(candidate.sourceFields[0].role === "root" &&
      candidate.sourceFields.every((part, index) => {
        const file = sourceFiles.find((source) => source.path === part.fixturePath);
        return part.role === (index === 0 ? "root" : `node:${index - 1}`) &&
          part.path === part.fixturePath.split("/").at(-1) &&
          file !== undefined && part.bytes > 0 && part.bytes <= file.bytes &&
          /^[0-9a-f]{64}$/.test(part.sha256);
      }) && candidate.sourceFieldUtf8Bytes === candidate.sourceFields.reduce((sum, part) => sum + part.bytes, 0),
    `${fixture.id}: candidate source scope mismatched fixture inventory`);
    cases.push({id: fixture.id, sourceFiles, candidate, arms});
  }
  insist(used.size === observed.size, "unjoined provider observations");
  return {schemaVersion: 1, status: "unapproved-offline-egress-accounting-proposal",
    boundary: "HTTP JSON body from pinned injected Effect provider; excludes headers and transport framing",
    anchors: {...Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, path]) =>
      [name, sha(await read(path))]))), candidateTest: await anchor(candidateTest)},
    provider: {package: provider.providerPackage, effect: provider.effectPackage,
      endpoint: provider.endpoint, model: provider.model},
    candidateGoldens, cases,
    unresolved: ["Candidate T-case bodies were observed only with synthetic fixtures and an injected HTTP client; no backend acceptance or semantic result was measured.",
      "Comparator input contracts and source egress await owner approval.",
      "Pinned HTTP body measurements exclude header bytes and transport framing; #140 owns production sizing.",
      "No live Jev responses, semantic outcomes, or adoption eligibility have been established."]};
};

const mode = process.argv[2];
insist(mode === "--check" || mode === "--write", "usage: verify-egress-accounting.mjs --check|--write");
const generated = await generate();
if (mode === "--write") {
  await writeFile(target, `${JSON.stringify(generated, null, 2)}\n`);
  console.log("wrote 12 T-case candidate observations, 33 comparator joins, and two separate goldens");
} else {
  insist(JSON.stringify(await json(target)) === JSON.stringify(generated), "egress accounting differs from current source artifacts");
  console.log("verified 12 T-case candidate observations, 33 comparator joins, and two separate goldens");
}
