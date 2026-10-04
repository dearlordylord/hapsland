import { readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
for (const entry of readdirSync(dist)) if (!["bin", "pi"].includes(entry)) rmSync(join(dist, entry), { recursive: true, force: true });

for (const entry of readdirSync(join(dist, "pi"))) if (entry !== "extension.js") rmSync(join(dist, "pi", entry), { recursive: true, force: true });
