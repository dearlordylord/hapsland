import { readFileSync } from "node:fs";

interface NativeHost {
  readonly platform: string;
  readonly architecture: string;
}

const machoArchitectures = new Map([
  ["arm64", 0x0100000c],
  ["x64", 0x01000007],
]);
const thinMachoMagic = new Set(["feedface", "feedfacf", "cefaedfe", "cffaedfe"]);
const fatMachoMagic = new Set(["cafebabe", "bebafeca"]);
const readMachine = (bytes: Buffer, offset: number, littleEndian: boolean) =>
  littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);

const elfArchitecture = (bytes: Buffer, architecture: string) => {
  const machine = architecture === "arm64" ? 183 : 62;
  return bytes.length >= 20 && bytes.readUInt16LE(18) === machine ? architecture : "wrong-architecture";
};

const thinMachoArchitecture = (bytes: Buffer, magic: string, expected: number, architecture: string) => {
  const littleEndian = magic === "cefaedfe" || magic === "cffaedfe";
  return bytes.length >= 8 && readMachine(bytes, 4, littleEndian) === expected ? architecture : "wrong-architecture";
};

const fatMachoArchitecture = (bytes: Buffer, magic: string, expected: number, architecture: string) => {
  const littleEndian = magic === "bebafeca";
  const count = readMachine(bytes, 4, littleEndian);
  for (let index = 0; index < count; index += 1) {
    const offset = 8 + index * 20;
    if (offset + 4 > bytes.length) break;
    if (readMachine(bytes, offset, littleEndian) === expected) return architecture;
  }
  return "wrong-architecture";
};

const inspectNativeBytes = (bytes: Buffer, host: NativeHost) => {
  const magic = bytes.subarray(0, 4).toString("hex");
  const expected = machoArchitectures.get(host.architecture);
  if (expected === undefined) return "unsupported-host-architecture";
  if (host.platform === "linux" && magic === "7f454c46") return elfArchitecture(bytes, host.architecture);
  if (host.platform !== "darwin") return "wrong-native-format";
  if (thinMachoMagic.has(magic)) return thinMachoArchitecture(bytes, magic, expected, host.architecture);
  if (fatMachoMagic.has(magic)) return fatMachoArchitecture(bytes, magic, expected, host.architecture);
  return "wrong-native-format";
};

/** Identify a packaged native artifact without loading or executing it. */
export const nativeArchitecture = (
  path: string,
  host: NativeHost = { platform: process.platform, architecture: process.arch },
): string => {
  try {
    return inspectNativeBytes(readFileSync(path), host);
  } catch {
    return "unavailable";
  }
};
