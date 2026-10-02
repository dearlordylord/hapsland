// Non-intervening source-free diagnostic sampler for the running native study.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const out = resolve('evidence/abide-quality-native/activity-observations.jsonl');
const seen = new Set();
const deadline = Date.now() + 25 * 60 * 1000;
while (Date.now() < deadline) {
  const list = spawnSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).stdout.split('\n');
  for (const line of list) {
    if (!line.includes('/.bin/codex exec')) continue;
    const pid = line.trim().split(/\s+/)[0];
    let env;
    try {
      const selected = ['QUALITY_CANDIDATE', 'QUALITY_CASE', 'QUALITY_GLOBAL_CAP', 'REVIEW_ACTIVITY_PATH'];
      env = Object.fromEntries(readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').flatMap(item => {
        const i = item.indexOf('='); const key = item.slice(0, i);
        return selected.includes(key) ? [[key, item.slice(i + 1)]] : [];
      }));
    } catch { continue; }
    if (env.QUALITY_CANDIDATE !== 'hapsland' || env.QUALITY_GLOBAL_CAP !== '180') continue;
    const visit = directory => {
      let entries; try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
      for (const item of entries) {
        const path = join(directory, item.name);
        if (item.isDirectory()) visit(path);
        else if (item.isFile() && item.name.endsWith('.json')) {
          let record, raw; try { raw = readFileSync(path, 'utf8'); record = JSON.parse(raw); } catch { continue; }
          const id = createHash('sha256').update(raw).digest('hex');
          if (seen.has(id)) continue; seen.add(id);
          const keys = ['version', 'kind', 'stage', 'findings', 'reason', 'observedAt', 'reservedContinuations'];
          const safe = Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
          appendFileSync(out, JSON.stringify({ sampledAt: Date.now(), taskId: env.QUALITY_CASE, candidate: 'hapsland', contentDigest: id, activity: safe }) + '\n');
        }
      }
    };
    if (env.REVIEW_ACTIVITY_PATH) visit(env.REVIEW_ACTIVITY_PATH);
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
