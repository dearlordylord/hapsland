import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { preflightPi, reusablePiPreflight } from "./native-pi-preflight.mjs"
import { resolveVerificationPlan } from "./test-harness/verification-plan.mjs"

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), "hapsland-pi-probe-test-"))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const settings = { defaultProvider: "openai", defaultModel: "gpt-6-luna", extensions: ["must-not-load"] }
  writeFileSync(join(home, "settings.json"), JSON.stringify(settings))
  writeFileSync(join(home, "auth.json"), "SYNTHETIC_PRIVATE_AUTH")
  const context = { id: "probe-run", deadline: Date.now() + 20000 }
  const env = { PI_CODING_AGENT_DIR: home, HAPSLAND_CHECK_CONTEXT: JSON.stringify(context) }
  return { home, settings, env }
}

test("preflight confirms the exact assistant model in an isolated profile and retains no response/auth text", (t) => {
  const f = fixture(t)
  let isolated,
    calls = 0
  const proof = preflightPi({
    env: f.env,
    execute: (_binary, args, options) => {
      calls++
      if (args[0] === "--version") return "1.0.0\n"
      isolated = options.env.PI_CODING_AGENT_DIR
      assert.notEqual(isolated, f.home)
      assert.deepEqual(JSON.parse(readFileSync(join(isolated, "settings.json"))).extensions, [])
      assert.ok(args.includes("--no-tools"))
      assert.ok(options.timeout > 0 && options.timeout <= 20000)
      return (
        JSON.stringify({
          type: "message_end",
          message: { role: "assistant", provider: "openai", model: "gpt-6-luna", content: "PRIVATE_RESPONSE" }
        }) + "\n"
      )
    }
  })
  assert.equal(calls, 2)
  assert.equal(proof.status, "authenticated")
  assert.equal(existsSync(isolated), false)
  assert.doesNotMatch(JSON.stringify(proof), /PRIVATE_RESPONSE|PRIVATE_AUTH/)
  const reused = { ...f.env, HAPSLAND_PI_PREFLIGHT: JSON.stringify(proof) }
  assert.deepEqual(reusablePiPreflight(reused, f.settings, "1.0.0"), proof)
  assert.throws(
    () => reusablePiPreflight(reused, { ...f.settings, defaultModel: "changed" }, "1.0.0"),
    /current owned run/
  )
  assert.throws(
    () =>
      reusablePiPreflight(
        { ...reused, HAPSLAND_CHECK_CONTEXT: JSON.stringify({ id: "another-run", deadline: Date.now() + 1000 }) },
        f.settings,
        "1.0.0"
      ),
    /current owned run/
  )
})

test("auth failure, wrong observed model and missing assistant responses reject preflight", (t) => {
  const f = fixture(t)
  for (const response of [
    "",
    JSON.stringify({ type: "message_end", message: { role: "assistant", provider: "openai", model: "wrong" } }),
    JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        provider: "openai",
        model: "gpt-6-luna",
        stopReason: "error",
        errorMessage: "PRIVATE_ERROR"
      }
    })
  ]) {
    assert.throws(
      () => preflightPi({ env: f.env, execute: (_binary, args) => (args[0] === "--version" ? "1.0.0" : response) }),
      /did not confirm/
    )
  }
  assert.throws(
    () =>
      preflightPi({
        env: f.env,
        execute: (_binary, args) => {
          if (args[0] === "--version") return "1.0.0"
          throw new Error("PRIVATE_AUTH")
        }
      }),
    /probe failed/
  )
})

test("Pi plans execute fresh auth/model preflight before build/archive work", () => {
  const plan = resolveVerificationPlan({
    profile: "native",
    host: "pi",
    provider: "openai",
    model: "gpt-6-luna",
    scenario: "adoption"
  })
  assert.deepEqual(
    plan.stages.map(({ kind }) => kind),
    ["agent-preflight", "package", "agent"]
  )
})

test("malformed provider events cannot disclose their contents through errors", (t) => {
  const f = fixture(t)
  assert.throws(
    () =>
      preflightPi({
        env: f.env,
        execute: (_binary, args) => (args[0] === "--version" ? "1.0.0" : "PRIVATE_UNSTRUCTURED_RESPONSE")
      }),
    (error) => error.message === "Pi auth/model probe returned malformed events"
  )
})

test("invalid run deadlines reject before invoking the native runtime", () => {
  const execute = () => assert.fail("Invalid context must not launch Pi")
  for (const context of [
    null,
    {},
    { id: "run", deadline: "tomorrow" },
    { id: "run", deadline: Date.now() - 1 },
    { id: "", deadline: Date.now() + 20000 }
  ])
    assert.throws(
      () => preflightPi({ env: { HAPSLAND_CHECK_CONTEXT: JSON.stringify(context) }, execute }),
      /Invalid Pi preflight run context/
    )
  assert.throws(
    () => preflightPi({ env: { HAPSLAND_CHECK_CONTEXT: "PRIVATE_INVALID_CONTEXT" }, execute }),
    (error) => error.message === "Invalid Pi preflight run context"
  )
  for (const deadline of [NaN, Infinity, -1, Date.now() - 1])
    assert.throws(() => preflightPi({ env: {}, execute, deadline }), /deadline must be finite/)
})
