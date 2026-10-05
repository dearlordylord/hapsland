import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
const root = dirname(fileURLToPath(import.meta.url))
const hash = (value) => createHash("sha256").update(value).digest("hex")
const sourceHash = hash(readFileSync(join(root, "Session.bend")))
const declarationHash = hash(readFileSync(join(root, "session.d.mts")))
const buildHash = hash(readFileSync(fileURLToPath(import.meta.url)))
// This projection delegates to the single shared engine and source owner.
const module = execFileSync(join(root, "../../node_modules/.bin/dprint"), ["fmt", "--stdin", "session.mjs"], {
  cwd: join(root, "../.."),
  encoding: "utf8",
  input: `import Engine from "./engine.mjs";
export default {
 initial: Engine.session_initial, next: Engine.session_next, sample_delay: Engine.session_delay,
 finish_state: Engine.session_finish,
 on_finish: (config, state, continuation) => Engine.session_next(config, Engine.session_finish(state, continuation)),
 on_advice: Engine.session_advice,
 transition_state: transition => transition.state,
 transition_events: transition => transition.events,
 state_generation: Engine.session_generation,
 set_interval: Engine.session_interval, rewind: Engine.session_rewind,
 sizes: Engine.session_sizes, suspend: Engine.session_suspend, burst: Engine.session_burst,
};
`
})
const manifest = { sourceHash, declarationHash, buildHash, moduleHash: hash(module) }
if (process.argv.includes("--check")) {
  if (
    readFileSync(join(root, "session.mjs"), "utf8") !== module ||
    JSON.stringify(JSON.parse(readFileSync(join(root, "session.generated.json"), "utf8"))) !== JSON.stringify(manifest)
  )
    throw new Error("Stale Session projection bridge; run node packages/monkey-business-bend/build-session.mjs")
} else {
  writeFileSync(join(root, "session.mjs"), module)
  writeFileSync(join(root, "session.generated.json"), JSON.stringify(manifest, null, 2) + "\n")
}
