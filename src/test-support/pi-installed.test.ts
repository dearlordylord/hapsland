import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanupPiFixtures, fixture, setupInstalledPi } from "./pi-installed.ts";

beforeAll(() => setupInstalledPi("source"));
afterEach(cleanupPiFixtures);

const waitFile = async (path: string) => {
  const deadline = Date.now() + 5_000;
  while (!existsSync(path) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  expect(existsSync(path)).toBe(true);
};
const closed = (child: ChildProcess) => new Promise<void>(resolve => child.once("close", () => resolve()));
const expectClosed = async (completion: Promise<void>) => {
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([completion, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("fixture child remained alive after cleanup")), 1_000);
    })]);
  } finally { clearTimeout(timer!); }
};
const bootstrap = "const fs=require('node:fs');const path=require('node:path');const directory=process.argv[2];fs.mkdirSync(path.join(directory,'owner.lock'),{recursive:true,mode:0o700});fs.writeFileSync(path.join(directory,'owner.lock','owner.json'),JSON.stringify({pid:process.pid,token:'bootstrap-test'}),{mode:0o600});setInterval(()=>{},1000);";

describe("Pi fixture process ownership", { timeout: 15_000 }, () => {
  it.each(process.platform === "linux" ? ["direct", "symlink"] : ["direct"])("stops its bootstrap process through %s paths before an endpoint owner exists", async mode => {
    const { root } = fixture();
    const directory = join(root, "runtime");
    const preload = join(root, "bootstrap.cjs");
    writeFileSync(preload, bootstrap);
    const main = join(process.cwd(), "src/resident/main.ts");
    const mainAlias = mode === "symlink" ? join(root, "resident-main.ts") : main;
    const directoryAlias = mode === "symlink" ? join(root, "runtime-alias") : directory;
    if (mode === "symlink") {
      mkdirSync(directory);
      symlinkSync(main, mainAlias);
      symlinkSync(directory, directoryAlias);
    }
    const child = spawn(process.execPath, [mainAlias, directoryAlias], {
      env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${JSON.stringify(preload)}` }, stdio: "ignore",
    });
    const completion = closed(child);
    try {
      await waitFile(join(directory, "owner.lock/owner.json"));
      expect(existsSync(join(directory, "owner.json"))).toBe(false);
      await cleanupPiFixtures();
      await expectClosed(completion);
      expect(existsSync(root)).toBe(false);
    } finally { child.kill("SIGKILL"); await completion; }
  });

  it("does not signal a foreign process named by fixture metadata", async () => {
    const { root } = fixture();
    const directory = join(root, "runtime");
    const foreign = join(root, "foreign.cjs");
    writeFileSync(foreign, bootstrap);
    const child = spawn(process.execPath, [foreign, directory], { stdio: "ignore" });
    const completion = closed(child);
    try {
      await waitFile(join(directory, "owner.lock/owner.json"));
      await cleanupPiFixtures();
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBeNull();
      expect(() => process.kill(child.pid!, 0)).not.toThrow();
    } finally { child.kill("SIGKILL"); await completion; }
  });
});
