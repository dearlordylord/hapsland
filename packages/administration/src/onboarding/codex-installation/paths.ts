import { join } from "node:path"

const PRODUCT_DIRECTORY = ".hapsland"

export const pathsFor = (home: string) => ({
  binding: join(home, PRODUCT_DIRECTORY, "codex-hook-launcher.sh"),
  config: join(home, "config.toml"),
  hooks: join(home, "hooks.json"),
  product: join(home, PRODUCT_DIRECTORY),
  ownership: join(home, PRODUCT_DIRECTORY, "installation-v1.json"),
  journal: join(home, PRODUCT_DIRECTORY, "journal-v1.json"),
  lock: join(home, PRODUCT_DIRECTORY, "installation.lock")
})
