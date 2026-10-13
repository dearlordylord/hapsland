import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { tmpdir } from "node:os"

const owner = import.meta.dirname
const corePath = join(owner, "ArtifactComposition.bend")
const proofPath = join(owner, "PROOF.bend")
const core = readFileSync(corePath, "utf8")
const proof = readFileSync(proofPath, "utf8")
const temporary = mkdtempSync(join(tmpdir(), "hapsland-request-mutant-"))
const check = (file) => spawnSync("bend", [file, "--check-only"], { encoding: "utf8", timeout: 10000 })
let assertions = 0
const verify = (method, ...arguments_) => {
  assert[method](...arguments_)
  assertions += 1
}
try {
  const baseline = check(proofPath)
  verify("equal", baseline.status, 0, baseline.stdout + baseline.stderr)
  verify("match", baseline.stdout + baseline.stderr, /ALL PROOFS CHECK/u)
  const anchor = "def awaiting_request(step: Step) -> Maybe<&2, T.Request>:\n  request_from_view(view(step))"
  verify("equal", core.split(anchor).length, 2, "one exact production projection")
  const imports = (text, original) =>
    text.replace(
      /^import (\.[^\s]+)(.*)$/gmu,
      (_all, path, tail) =>
        "import " + relative(temporary, resolve(dirname(original), path)).replaceAll("\\", "/") + tail
    )
  const mutantPath = join(temporary, "ArtifactComposition.bend")
  writeFileSync(
    mutantPath,
    imports(core.replace(anchor, "def awaiting_request(step: Step) -> Maybe<&2, T.Request>:\n  None{}"), corePath)
  )
  const mutantProof = imports(proof, proofPath).replace(
    /^import .*ArtifactComposition\.bend as Core$/mu,
    "import ./ArtifactComposition.bend as Core"
  )
  const mutantProofPath = join(temporary, "PROOF.bend")
  writeFileSync(mutantProofPath, mutantProof)
  const rejected = check(mutantProofPath)
  verify("equal", rejected.error, undefined, "mutant must finish within hard10")
  verify("notEqual", rejected.status, 0, "constant None must fail the original projection corollary")
  verify("match", rejected.stdout + rejected.stderr, /awaiting_request_exact/u)
  verify("match", rejected.stdout + rejected.stderr, /expected|observed/u)
  verify("equal", readFileSync(corePath, "utf8"), core, "production core unchanged")
  verify("equal", readFileSync(proofPath, "utf8"), proof, "production corollary unchanged")
  console.log(
    JSON.stringify({
      passed: true,
      assertions,
      universalRequestProjection: true,
      constantNoneMutantRejected: true,
      hardDeadlineSeconds: 10
    })
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
