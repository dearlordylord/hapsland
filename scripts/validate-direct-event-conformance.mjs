import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const manifestPath = resolve(root, "conformance/direct-event-v1.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const fail = (message) => {
  process.stderr.write(`direct-event conformance invalid: ${message}\n`);
  process.exitCode = 1;
};

if (manifest.schemaVersion !== 1 || manifest.ordinaryTests !== "deterministic-offline") {
  fail("manifest identity or offline policy is missing");
}
if (!Array.isArray(manifest.groups) || manifest.groups.length !== 12) {
  fail("exactly twelve acceptance groups are required");
}
const numbers = manifest.groups?.map((group) => group.group) ?? [];
if (numbers.join(",") !== "1,2,3,4,5,6,7,8,9,10,11,12") {
  fail("acceptance groups must be complete and ordered");
}

for (const group of manifest.groups ?? []) {
  if (typeof group.boundary !== "string" || group.boundary.length === 0 || !Array.isArray(group.checks) || group.checks.length === 0) {
    fail(`group ${group.group} has no boundary or checks`);
    continue;
  }
  for (const check of group.checks) {
    if (!Array.isArray(check) || check.length !== 2) {
      fail(`group ${group.group} has a malformed check`);
      continue;
    }
    const [file, title] = check;
    const content = await readFile(resolve(root, file), "utf8").catch(() => undefined);
    if (content === undefined) fail(`group ${group.group} references missing ${file}`);
    else if (!content.includes(`\"${title}\"`)) fail(`group ${group.group} references missing check: ${title}`);
  }
}

const evidenceDirectory = resolve(root, "evidence/direct-event-v1");
const evidenceFiles = await readdir(evidenceDirectory).catch(() => []);
const forbiddenKeys = new Set([
  "additionalContext", "advice", "answer", "answers", "command", "content",
  "credential", "credentials", "input", "output", "patch", "probability",
  "probabilities", "prompt", "providerUsage", "rawResponse", "response", "source",
  "toolInput", "toolResponse", "transcript", "usage",
]);
const forbiddenText = /(TYPESAFE_API_KEY\s*=|authorization:\s*bearer|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY)/iu;

const inspect = (value, path) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspect(item, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && forbiddenText.test(value)) fail(`${path} contains secret-shaped text`);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) fail(`${path}.${key} is forbidden in retained evidence`);
    inspect(item, `${path}.${key}`);
  }
};

for (const file of evidenceFiles.filter((name) => name.endsWith(".json"))) {
  const encoded = await readFile(resolve(evidenceDirectory, file), "utf8");
  if (forbiddenText.test(encoded)) fail(`${file} contains secret-shaped text`);
  inspect(JSON.parse(encoded), file);
}

if (process.exitCode === undefined) {
  process.stdout.write(`direct-event conformance manifest valid: 12 groups, ${manifest.groups.reduce((count, group) => count + group.checks.length, 0)} mapped checks, ${evidenceFiles.filter((name) => name.endsWith(".json")).length} sanitized evidence records\n`);
}
