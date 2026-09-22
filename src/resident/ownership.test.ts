import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireResidentOwnership, releaseResidentOwnership } from "./ownership.ts";

const roots: Array<string> = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "resident-ownership-"));
  roots.push(root);
  return join(root, "owner.lock");
};

describe("portable resident ownership", () => {
  it("does not replace a newly live owner after inspecting a stale inode", async () => {
    const lock = await fixture();
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead"}\n');
    const old = `${lock}.old`;
    await expect(acquireResidentOwnership(lock, { beforeReplace: async () => {
      await rename(lock, old);
      await mkdir(lock);
      await writeFile(join(lock, "owner.json"), `${JSON.stringify({ pid: process.pid, token: "live" })}\n`);
    } })).resolves.toBe(false);
    expect(JSON.parse(await readFile(join(lock, "owner.json"), "utf8"))).toEqual({ pid: process.pid, token: "live" });
  });

  it.each(["empty", "partial"])("recovers an interrupted %s owner directory", async (kind) => {
    const lock = await fixture();
    await mkdir(lock);
    if (kind === "partial") await writeFile(join(lock, "owner.json"), "{\n");
    await utimes(lock, new Date(0), new Date(0));
    await expect(acquireResidentOwnership(lock)).resolves.toBe(true);
    const owner = JSON.parse(await readFile(join(lock, "owner.json"), "utf8"));
    expect(owner.pid).toBe(process.pid);
    expect(typeof owner.token).toBe("string");
    await releaseResidentOwnership(lock);
  });

  it("preserves a live owner record from the prior directory-lock format", async () => {
    const lock = await fixture();
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), `${JSON.stringify({ pid: process.pid })}\n`);
    await expect(acquireResidentOwnership(lock)).resolves.toBe(false);
    expect(JSON.parse(await readFile(join(lock, "owner.json"), "utf8"))).toEqual({ pid: process.pid });
  });

  it("elects one owner under concurrent stale recovery", async () => {
    const lock = await fixture();
    await mkdir(lock);
    await writeFile(join(lock, "owner.json"), '{"pid":99999999,"token":"dead"}\n');
    const results = await Promise.all(Array.from({ length: 20 }, () => acquireResidentOwnership(lock)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await stat(lock)).isDirectory()).toBe(true);
    await releaseResidentOwnership(lock);
  });

  it("leaves a legacy regular-file lock untouched for the compatibility launcher", async () => {
    const lock = await fixture();
    await writeFile(lock, "");
    await expect(acquireResidentOwnership(lock)).resolves.toBe(false);
    expect((await stat(lock)).isFile()).toBe(true);
  });
});
