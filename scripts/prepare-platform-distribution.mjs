import { resolve } from "node:path"
import { preparePlatformDistribution } from "./platform-distribution.mjs"
const args = process.argv.slice(2)
if (args.length > 1 || (args[0] && !args[0].startsWith("--candidate=")))
  throw new Error("usage: npm run release:prepare:distribution -- [--candidate=/clean/prepared/checkout]")
const candidate = resolve(args[0]?.slice("--candidate=".length) || process.cwd())
const deadline = setTimeout(() => {
  console.error("Platform distribution preparation exceeded its two-minute deadline")
  process.exit(1)
}, 120000)
try {
  console.log(JSON.stringify(await preparePlatformDistribution(candidate), null, 2))
} finally {
  clearTimeout(deadline)
}
