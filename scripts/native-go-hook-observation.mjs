import { writeFileSync } from "node:fs"
import { join } from "node:path"

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`

/** Observe successful stdout submission without retaining event or advice bodies. */
export function instrumentGoHooks({ settings, temporary, repository, finding }) {
  const observer = join(temporary, "go-hook-observer.mjs")
  const observations = join(temporary, "go-hook-observations.jsonl")
  writeFileSync(
    observer,
    `
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
const chunks=[]; let bytes=0;
for await (const chunk of process.stdin) { bytes+=chunk.length; if(bytes>1048576) throw new Error('Hook input budget'); chunks.push(chunk); }
let initial=false; try { initial=readFileSync(${JSON.stringify(join(repository, "payment.go"))},'utf8').includes('type PaymentState struct'); } catch {}
const result=spawnSync('/bin/sh',['-c',process.argv[2]],{input:Buffer.concat(chunks),env:process.env,timeout:30000,maxBuffer:1048576});
let value; try { value=JSON.parse(result.stdout?.toString() ?? ''); } catch {}
const message=value?.reason ?? value?.hookSpecificOutput?.additionalContext ?? value?.systemMessage ?? '';
const advice=typeof message==='string' && message.includes(${JSON.stringify(finding)});
process.stderr.write(result.stderr ?? Buffer.alloc(0));
process.exitCode=result.status ?? 1;
if(result.status===0) process.stdout.write(result.stdout ?? Buffer.alloc(0), () => {
  appendFileSync(${JSON.stringify(observations)},JSON.stringify({initialRoot:initial,adviceSubmitted:advice,exitCode:0})+'\\n',{mode:0o600});
});
`,
    { mode: 0o600 }
  )
  for (const groups of Object.values(settings.hooks))
    for (const group of groups)
      for (const hook of group.hooks)
        hook.command = `${quote(process.execPath)} ${quote(observer)} ${quote(hook.command)}`
  return observations
}
