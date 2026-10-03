import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeArchitecture } from "./native-architecture.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const inspect = (bytes: Buffer, platform: string, architecture: string) => {
  const root = mkdtempSync(join(tmpdir(), "hapsland-native-header-"));
  roots.push(root);
  const path = join(root, "artifact");
  writeFileSync(path, bytes);
  return nativeArchitecture(path, { platform, architecture });
};
const header = (magic: string, length: number) => {
  const bytes = Buffer.alloc(length);
  Buffer.from(magic, "hex").copy(bytes);
  return bytes;
};

it("checks ELF machine identity for both supported architectures", () => {
  for (const [architecture, machine] of [
    ["arm64", 183],
    ["x64", 62],
  ] as const) {
    const bytes = header("7f454c46", 20);
    bytes.writeUInt16LE(machine, 18);
    expect(inspect(bytes, "linux", architecture)).toBe(architecture);
    expect(inspect(bytes, "linux", architecture === "arm64" ? "x64" : "arm64")).toBe("wrong-architecture");
    expect(inspect(bytes.subarray(0, 19), "linux", architecture)).toBe("wrong-architecture");
  }
});

it("checks thin Mach-O headers in both byte orders and word sizes", () => {
  for (const magic of ["feedface", "feedfacf", "cefaedfe", "cffaedfe"]) {
    for (const [architecture, machine] of [
      ["arm64", 0x0100000c],
      ["x64", 0x01000007],
    ] as const) {
      const bytes = header(magic, 8);
      if (magic.startsWith("fe")) bytes.writeUInt32BE(machine, 4);
      else bytes.writeUInt32LE(machine, 4);
      expect(inspect(bytes, "darwin", architecture)).toBe(architecture);
      expect(inspect(bytes, "darwin", architecture === "arm64" ? "x64" : "arm64")).toBe("wrong-architecture");
      expect(inspect(bytes.subarray(0, 7), "darwin", architecture)).toBe("wrong-architecture");
    }
  }
});

it("finds a matching universal Mach-O slice and stops at truncated tables", () => {
  for (const magic of ["cafebabe", "bebafeca"]) {
    const bytes = header(magic, 48);
    const write = (value: number, offset: number) =>
      magic === "cafebabe" ? bytes.writeUInt32BE(value, offset) : bytes.writeUInt32LE(value, offset);
    write(2, 4);
    write(0x01000007, 8);
    write(0x0100000c, 28);
    expect(inspect(bytes, "darwin", "arm64")).toBe("arm64");
    expect(inspect(bytes, "darwin", "x64")).toBe("x64");
    expect(inspect(bytes.subarray(0, 28), "darwin", "arm64")).toBe("wrong-architecture");
    expect(inspect(bytes.subarray(0, 4), "darwin", "arm64")).toBe("unavailable");
    write(0, 4);
    expect(inspect(bytes, "darwin", "arm64")).toBe("wrong-architecture");
  }
});

it("reports unreadable files, unsupported host architectures and format mismatches", () => {
  expect(nativeArchitecture(join(tmpdir(), "hapsland-nonexistent-native-artifact"))).toBe("unavailable");
  expect(inspect(Buffer.from("script"), "linux", "riscv64")).toBe("unsupported-host-architecture");
  expect(inspect(Buffer.from("script"), "linux", "arm64")).toBe("wrong-native-format");
  expect(inspect(header("7f454c46", 20), "darwin", "arm64")).toBe("wrong-native-format");
  expect(inspect(header("feedfacf", 8), "win32", "x64")).toBe("wrong-native-format");
});
