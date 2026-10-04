import { rmSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

rmSync(resolve(fileURLToPath(new URL("..", import.meta.url)), "dist"), { recursive: true, force: true })
