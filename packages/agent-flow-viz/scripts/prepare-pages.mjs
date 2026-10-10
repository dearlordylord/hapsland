import { copyFile, cp, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const output = new URL("../dist/", import.meta.url)
// Keep the dashboard available while making the public site the homepage.
await copyFile(new URL("index.html", output), new URL("dashboard.html", output))
await cp(new URL("../site-dist/", import.meta.url), output, { recursive: true })
const brand = new URL("../src/brand/", import.meta.url)
await copyFile(new URL("favicon.ico", brand), new URL("favicon.ico", output))
await copyFile(new URL("favicon.svg", brand), new URL("favicon.svg", output))
await writeFile(new URL("_redirects", output), "/site / 301\n/site.html / 301\n")
await writeFile(new URL("robots.txt", output), "User-agent: *\nAllow: /\n")
console.log(`Prepared Cloudflare Pages files in ${fileURLToPath(output)}`)
