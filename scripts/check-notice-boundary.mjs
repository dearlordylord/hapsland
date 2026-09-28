import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const adapter = readFileSync(resolve(root, "src/canonical/adapter.ts"), "utf8");
if (existsSync(resolve(root, "src/resident/operational-notice-policy.ts"))) {
  throw new Error("superseded resident notice policy returned");
}
const state = readFileSync(resolve(root, "packages/agent-flow-bend/NoticeState.bend"), "utf8");
for (const name of ["bendNoticeAdvance", "bendNoticeDecide", "bendNoticePrune", "bendDeliveryNoticeCandidate", "operationalNoticeAdvance"]) {
  if (server.includes(name)) throw new Error(`resident notice bypass returned: ${name}`);
}
for (const event of ["noticeAdvance", "noticeCommit", "noticePrune", "noticeDrop", "noticeLease", "noticeClearPending", "noticeSelect"]) {
  if (!server.includes(`kind: "${event}"`) || !adapter.includes(`"${event}"`)) {
    throw new Error(`canonical notice event missing: ${event}`);
  }
}
for (const operation of ["def advance(", "def commit(", "def prune(", "def select("]) {
  if (!state.includes(operation)) throw new Error(`retained notice owner missing: ${operation}`);
}
