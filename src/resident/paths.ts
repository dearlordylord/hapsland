import { lstat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ResidentPaths = {
  readonly directory: string;
  readonly socket: string;
  readonly lock: string;
  readonly owner: string;
};

export const residentPaths = (override = process.env.REVIEW_RESIDENT_DIR): ResidentPaths => {
  const uid = typeof process.getuid === "function" ? process.getuid() : process.pid;
  const trustedRuntime = process.env.XDG_RUNTIME_DIR;
  const directory = override ?? (trustedRuntime === undefined
    ? join(tmpdir(), `realtime-review-tool-${uid}`)
    : join(trustedRuntime, "realtime-review-tool"));
  return {
    directory,
    socket: join(directory, "resident.sock"),
    lock: join(directory, "owner.lock"),
    owner: join(directory, "owner.json"),
  };
};

type EndpointKind = "directory" | "socket" | "regular";
export type EndpointMetadata = {
  readonly uid: number;
  readonly mode: number;
  readonly isDirectory: boolean;
  readonly isSocket: boolean;
  readonly isFile: boolean;
  readonly isSymbolicLink: boolean;
};

export const validateEndpointMetadata = (
  metadata: EndpointMetadata,
  kind: EndpointKind,
  uid = typeof process.getuid === "function" ? process.getuid() : process.pid,
): boolean =>
  metadata.uid === uid &&
  !metadata.isSymbolicLink &&
  (metadata.mode & 0o077) === 0 &&
  (kind === "directory"
    ? metadata.isDirectory
    : kind === "socket"
      ? metadata.isSocket
      : metadata.isFile);

const metadata = async (path: string): Promise<EndpointMetadata> => {
  const value = await lstat(path);
  return {
    uid: value.uid,
    mode: value.mode,
    isDirectory: value.isDirectory(),
    isSocket: value.isSocket(),
    isFile: value.isFile(),
    isSymbolicLink: value.isSymbolicLink(),
  };
};

export const prepareResidentDirectory = async (paths: ResidentPaths): Promise<void> => {
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  if (!validateEndpointMetadata(await metadata(paths.directory), "directory")) {
    throw new Error("resident runtime directory is not a private user-owned directory");
  }
};

export const verifyResidentSocket = async (paths: ResidentPaths): Promise<void> => {
  // Node 24's net.Socket does not expose Linux SO_PEERCRED. The supported
  // profile therefore authenticates the endpoint through a private uid-owned
  // directory plus uid/type/mode checks on the socket itself.
  if (!validateEndpointMetadata(await metadata(paths.socket), "socket")) {
    throw new Error("resident socket is not a private user-owned socket");
  }
};

export const verifyRemovableSocket = async (paths: ResidentPaths): Promise<void> => {
  try {
    if (!validateEndpointMetadata(await metadata(paths.socket), "socket")) {
      throw new Error("resident socket pathname is unsafe");
    }
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return;
    throw cause;
  }
};
