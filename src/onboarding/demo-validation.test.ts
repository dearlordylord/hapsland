import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { validateDemoSession } from "./demo-validation.ts";
const roots: string[] = [];
const fixture = (source: string) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-demo-validation-")); roots.push(root);
  writeFileSync(join(root, "session.ts"), source); return root;
};
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
it("accepts the actual repaired guard and rejects the original permissive guard", async () => {
  const repaired = fixture(`export function isSession(value: any): boolean {
    if (value.loggedIn === false) return value.userId === undefined;
    return value.loggedIn === true && typeof value.userId === "string";
  }`);
  const flawed = fixture(`export const isSession = (value: any): boolean => typeof value.loggedIn === "boolean";`);
  expect(await validateDemoSession(repaired)).toBe(true);
  expect(await validateDemoSession(flawed)).toBe(false);
});
it("rejects absent, noncallable or throwing guards without inventing validation", async () => {
  expect(await validateDemoSession(fixture("export const other = true"))).toBe(false);
  expect(await validateDemoSession(fixture("export const isSession = true"))).toBe(false);
  await expect(validateDemoSession(fixture('export const isSession = () => { throw Error("invalid") }'))).rejects.toThrow("invalid");
});
