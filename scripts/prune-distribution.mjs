import { readdirSync, rmSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist")
for (const entry of readdirSync(dist))
  if (!["bin", "pi", "runtime"].includes(entry)) rmSync(join(dist, entry), { recursive: true, force: true })

for (const entry of readdirSync(join(dist, "pi")))
  if (!["extension.js", "inspection.js"].includes(entry))
    rmSync(join(dist, "pi", entry), { recursive: true, force: true })

for (const entry of readdirSync(join(dist, "runtime")))
  if (entry !== "hook-catalog.js") rmSync(join(dist, "runtime", entry), { recursive: true, force: true })
