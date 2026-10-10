import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { instrumentGoHooks } from "./native-go-hook-observation.mjs"
import { executeNative } from "./native-process.mjs"

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
for (const code of [0, 3])
  test(`Go stdout observer preserves native submission boundary at exit ${code}`, async () => {
    const temporary = mkdtempSync(join(tmpdir(), "go-observer-unit-"))
    try {
      writeFileSync(join(temporary, "payment.go"), "type PaymentState struct {}")
      const output = JSON.stringify({ systemMessage: "ACTUAL_ADVICE_SENTENCE", other: "unchanged" })
      const delegate = join(temporary, "delegate.mjs")
      writeFileSync(
        delegate,
        `let input='';for await(const chunk of process.stdin)input+=chunk;if(input!=='EVENT')process.exit(9);process.stdout.write(${JSON.stringify(output)});process.exitCode=${code};`
      )
      const settings = {
        hooks: {
          AfterTool: [
            {
              matcher: "apply_patch",
              hooks: [{ command: `${quote(process.execPath)} ${quote(delegate)}`, timeout: 45, async: true }]
            }
          ]
        }
      }
      const observations = instrumentGoHooks({
        settings,
        temporary,
        repository: temporary,
        finding: "ACTUAL_ADVICE_SENTENCE"
      })
      const hook = settings.hooks.AfterTool[0].hooks[0]
      assert.equal(hook.timeout, 45)
      assert.equal(hook.async, true)
      assert.equal(settings.hooks.AfterTool[0].matcher, "apply_patch")
      const result = await executeNative("/bin/sh", ["-c", hook.command], { input: "EVENT", timeout: 10000 })
      assert.equal(result.code, code)
      assert.equal(result.stdout, code === 0 ? output : "")
      if (code === 0)
        assert.deepEqual(JSON.parse(readFileSync(observations, "utf8")), {
          initialRoot: true,
          adviceSubmitted: true,
          exitCode: 0
        })
      else assert.equal(existsSync(observations), false)
    } finally {
      rmSync(temporary, { recursive: true, force: true })
    }
  })
