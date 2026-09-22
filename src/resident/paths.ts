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
  const directory = override ?? join(tmpdir(), `realtime-review-tool-${uid}`);
  return {
    directory,
    socket: join(directory, "resident.sock"),
    lock: join(directory, "owner.lock"),
    owner: join(directory, "owner.json"),
  };
};
