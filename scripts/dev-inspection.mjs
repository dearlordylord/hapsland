import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import { runInspectionDashboard } from "../src/inspection/command.ts"

const reloadScript = `
const revision = document.querySelector('meta[name="hapsland-dev-revision"]').content;
let checking = false;
setInterval(async () => {
  if (document.hidden || checking) return;
  checking = true;
  try {
    const response = await fetch(location.href, { cache: 'no-store' });
    if (!response.ok) return;
    const page = new DOMParser().parseFromString(await response.text(), 'text/html');
    const next = page.querySelector('meta[name="hapsland-dev-revision"]')?.content;
    if (next && next !== revision) location.reload();
  } catch {} finally { checking = false; }
}, 1000);
`
const hash = (value) => createHash("sha256").update(value).digest("hex")
const reloadHash = createHash("sha256").update(reloadScript).digest("base64")

/** Reload only the page module; the journal server and its capability stay alive. */
export const makeDevelopmentInspectionPage = (source = new URL("../src/inspection/page.ts", import.meta.url)) => {
  let revision
  let page
  return async () => {
    const next = hash(await readFile(source))
    if (next !== revision) {
      revision = next
      const moduleUrl = new URL(source)
      moduleUrl.searchParams.set("revision", next)
      page = import(moduleUrl.href).then(({ inspectionPage, inspectionPagePolicy }) => ({
        html: inspectionPage
          .replace("<title>", `<meta name="hapsland-dev-revision" content="${next}"><title>`)
          .replace("</body>", `<script>${reloadScript}</script></body>`),
        policy: inspectionPagePolicy.replace("script-src ", `script-src 'sha256-${reloadHash}' `)
      }))
    }
    return page
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length && !/^--port=\d{1,5}$/.test(args[0])))
    throw new Error("usage: npm run dev:inspection -- [--port=0..65535]")
  const port = args.length ? Number(args[0].slice("--port=".length)) : 0
  const loadPage = makeDevelopmentInspectionPage()
  runInspectionDashboard({
    host: "127.0.0.1",
    port,
    page: Effect.tryPromise({
      try: () =>
        loadPage().catch((error) => {
          console.error("Inspection page compilation failed:", error.message)
          throw error
        }),
      catch: (error) => error
    })
  })
}
