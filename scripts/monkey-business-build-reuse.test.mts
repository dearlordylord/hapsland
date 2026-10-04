import { afterEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directories = new Set<string>();
afterEach(() => { for (const directory of directories) rmSync(directory, { recursive: true, force: true }); directories.clear(); });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "hapsland-engine-reuse-"));
  directories.add(directory);
  for (const path of ["packages/monkey-business-bend", "packages/agent-flow-bend", "packages/monkey-business/src", "src/canonical"]) {
    mkdirSync(join(directory,path,".."), { recursive: true });
    cpSync(resolve(path),join(directory,path), { recursive: true });
  }
  const file = (name: string) => join(directory,"packages/monkey-business-bend",name);
  const run = (option = "--reuse-compiled-policy") => spawnSync(process.execPath,[file("build.mjs"),option],
    { encoding: "utf8", timeout: 15000, env: { ...process.env, PATH: "" } });
  const change = (path: string, transform: (source: string) => string) => writeFileSync(path,transform(readFileSync(path,"utf8")));
  return { directory, file, run, change };
}
it("reuses verified compiled policy for host-only changes through the same wrapper producer without Bend", () => {
  const { directory,file,run,change } = fixture();
  const before = readFileSync(file("engine.mjs"),"utf8"), old = JSON.parse(readFileSync(file("generated.json"),"utf8"));
  change(join(directory,"packages/monkey-business/src/index.ts"),source => source + "\n// isolated host identity change\n");
  expect(run().status).toBe(0);
  const after = readFileSync(file("engine.mjs"),"utf8"), current = JSON.parse(readFileSync(file("generated.json"),"utf8"));
  const policy = (source: string) => source.slice(0,source.indexOf("\nexport const SOURCE_IDENTITY = "));
  expect(policy(after)).toBe(policy(before));
  expect(current.hostHash).not.toBe(old.hostHash);
  expect(current.moduleHash).toBe(hash(after));
  expect(current.reuse).toMatchObject({ kind: "verifiedCompiledPolicyReuse", previousBuildHash: old.buildHash,
    previousModuleHash: old.moduleHash, compiledPolicyHash: hash(policy(before)), provenance: "verified existing module; no fresh compiler invocation" });
  expect(run("--check").status).toBe(0);
});
for (const [name,target] of [["source","Engine.bend"],["declaration","engine.d.mts"]] as const) {
  it(`refuses changed ${name} while preserving the original artifact`, () => {
    const { file,run,change } = fixture();
    const original = readFileSync(file("engine.mjs"),"utf8");
    change(file(target),source => source + "\n// changed contract\n");
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Cannot reuse changed Engine source, declaration, or preparation ABI");
    expect(readFileSync(file("engine.mjs"),"utf8")).toBe(original);
  });
}
it("refuses corrupt module bytes before refreshing any metadata", () => {
  const { file,run,change } = fixture();
  const manifest = readFileSync(file("generated.json"),"utf8");
  change(file("engine.mjs"),source => source + "\n// corrupt artifact\n");
  const result = run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Cannot reuse corrupt shared Engine module");
  expect(readFileSync(file("generated.json"),"utf8")).toBe(manifest);
});
it("refuses a changed export wrapper rather than relabelling its old compiled output", () => {
  const { file,run,change } = fixture();
  const original = readFileSync(file("engine.mjs"),"utf8");
  change(file("build.mjs"),source => source.replace("quiet_command: (state,command,event,partition,now)","quiet_command: (state,command,event,partition,changedNow)"));
  const result = run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Cannot reuse changed shared Engine wrapper or embedded identity");
  expect(readFileSync(file("engine.mjs"),"utf8")).toBe(original);
});
