import { join } from "node:path";
import { ResidentServer } from "./server.ts";

const directory = process.argv[2];
if (directory === undefined) throw new Error("resident runtime directory is required");

const server = new ResidentServer({
  directory,
  socket: join(directory, "resident.sock"),
  lock: join(directory, "owner.lock"),
  owner: join(directory, "owner.json"),
});

await server.listen();

const stop = () => {
  void server.close().finally(() => process.exit(0));
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
