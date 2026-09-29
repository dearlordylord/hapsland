import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
for (const path of ["src/cli.ts", "src/onboarding/setup.ts", "src/onboarding/first-review-demo.ts", "src/runtime/review.ts",
  "src/direct-event/pipeline.ts", "src/resident/server.ts"]) {
  const source = read(path);
  if (/\bconsent\.(authorize|enable|disable|preview|list)\s*\(/.test(source)) {
    throw new Error(`retired repository grant call returned to ${path}`);
  }
}
for (const [path, call] of [
  ["src/configuration/resolve.ts", "replaceIncludes("],
  ["src/policy/file-policy.ts", "selectFile("],
  ["src/direct-event/selection.ts", "selectFile("],
  ["src/direct-event/pipeline.ts", "admitReview("],
  ["src/resident/server.ts", "admitReview("],
  ["src/cli.ts", "admitReview("],
  ["src/cli.ts", "reloadPolicy:"],
  ["src/runtime/review.ts", "currentSelection()"],
]) {
  if (!read(path).includes(call)) throw new Error(`canonical configuration route missing: ${path}`);
}
