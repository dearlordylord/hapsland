import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createRun } from '../../monkey-business/src/index.ts';
const before = process.env.EDIT_PERMIT_BEFORE === '1';
const directory = '/workspace/hapsland-review/edit-permits';
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1512, height: 1300 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const ensemble = page.locator('#agent-ensemble');
  const inspector = page.locator('#agent-simulation');
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const click = async name => { await page.getByRole('button', { name, exact: true }).click(); await settle(); };
  const load = async run => { await inspector.getByLabel('Replay JSON', { exact: true }).fill(JSON.stringify(run.exportReplay())); await click('Load replay'); await page.waitForFunction(() => document.querySelector('.ensemble-feedback').textContent.startsWith('Replay reconstructed')); await settle(); };
  const admission = layer => layer.getByRole('button', { name: 'Inspect Admission & capacity', exact: true });
  const check = async (projection, metadata) => {
    if (before) return;
    const global = projection.admissions.reduce((sum, scope) => sum + scope.permits.length, 0);
    for (const layer of await ensemble.locator('.ensemble-layer').all()) {
      const partition = Number((await layer.getAttribute('class')).match(/agent-index-(\d+)/)[1]) + 1;
      const local = projection.admissions.filter(scope => scope.partition === partition).reduce((sum, scope) => sum + scope.permits.length, 0);
      const localMax = metadata?.permits?.adviceeLimits?.find(scope => scope.partition === partition)?.limit ?? metadata?.permits?.adviceeLimit;
      for (const [selector, used, maximum, scope] of [['local', local, localMax, 'this agent'], ['global', global, metadata?.permits?.residentLimit, 'all agents']]) {
        const row = admission(layer).locator(`.admission-permit-${selector}`);
        assert.equal(await row.getAttribute('aria-label'), `Edit permits, ${scope}: ${maximum === undefined ? `${used} used; limit not recorded` : `${used} of ${maximum}`}`);
        assert.equal(await row.locator('.admission-permit-fill').count(), maximum === undefined ? 0 : 1);
        if (maximum !== undefined) assert.ok(Math.abs(Number(await row.locator('.admission-permit-fill').getAttribute('width')) - used / maximum * 57) < 1e-8);
      }
      assert.equal(await admission(layer).locator('.topology-event-fact').count(), 0);
    }
    assert.doesNotMatch(await ensemble.locator('.shared-secondary-resources').innerText(), /Edit permits/);
    assert.match(await ensemble.locator('.shared-secondary-resources').innerText(), /Background collectors/);
  };
  const owners = ['agent-1', 'agent-2', 'agent-3'];
  const sessions = owners.map(agent => ({ agent, editIntervalMs: 1000000 }));
  const ordinary = createRun({ sessions, inputs: [0, 0, 1].map((index, revision) => ({ agent: owners[index], generation: 0, recurring: false, revision: revision + 1, at: 0, kind: 'edit', bytes: 10, unitBytes: [5], outcome: 'clear' })), lifecycles: { permits: { adviceeLimit: 16, residentLimit: 64, holdMs: 1000, lifetimeMs: 2000 }, collectors: { capacity: 3 } } });
  ordinary.advance({ untilTime: 5, maxEvents: 1000 });
  assert.deepEqual(owners.map((_, index) => ordinary.projection.admissions.find(scope => scope.partition === index + 1)?.permits.length ?? 0), [2, 1, 0]);
  assert.ok(ordinary.observations.every(frame => frame.event.kind === 'issuePermit' && frame.commands.some(command => command.kind === 'permitIssued')));
  await load(ordinary); await check(ordinary.projection, ordinary.capacityMetadata);
  await ensemble.screenshot({ path: `${directory}/${before ? 'before' : 'after'}-ordinary-3d.png` });
  await click('Focus selected agent'); await check(ordinary.projection, ordinary.capacityMetadata);
  await ensemble.screenshot({ path: `${directory}/${before ? 'before' : 'after'}-ordinary-focus.png` });
  await admission(ensemble.locator('.ensemble-layer')).screenshot({ path: `${directory}/${before ? 'before' : 'after'}-ordinary-detail.png` });
  await admission(ensemble.locator('.ensemble-layer')).click(); await settle();
  assert.match(await inspector.locator('.simulation-details pre').textContent(), /permitIssued/);
  await page.setViewportSize({ width: 390, height: 844 }); await settle();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const viewport = ensemble.locator('.ensemble-viewport');
  await viewport.evaluate(element => { const box = element.querySelector('.topology-node[aria-label="Inspect Admission & capacity"]').getBoundingClientRect(); const view = element.getBoundingClientRect(); element.scrollLeft += box.left - view.left - (element.clientWidth - box.width) / 2; }); await settle();
  await viewport.screenshot({ path: `${directory}/${before ? 'before' : 'after'}-ordinary-narrow.png` });
  if (before) { console.log('Edit-permit before captures complete with checked 2+1+0 permits and recorded 16/64 limits.'); }
  else {
    await page.setViewportSize({ width: 1512, height: 1300 });
    const issue = (partition, at, maximum) => ({ at, kind: 'canonical', event: { kind: 'issuePermit', partition, lifetime: 1, tool: partition * 100, started: at, deadline: at + 30, now: at, minimumStarted: 0, facts: { clockValid: true, hookWindow: 30, startedUpper: at, nowLower: at, adviceePermitLimit: maximum, residentPermitLimit: 8 } } });
    const scoped = createRun({ sessions, inputs: [issue(1, 1, 2), issue(2, 2, 3)] }); scoped.advance({ untilTime: 2, maxEvents: 100 });
    await load(scoped); await check(scoped.projection, scoped.capacityMetadata);
    await click('Select agent 2'); await check(scoped.projection, scoped.capacityMetadata);
    await ensemble.screenshot({ path: `${directory}/after-heterogeneous-focus.png` });
    await admission(ensemble.locator('.ensemble-layer')).screenshot({ path: `${directory}/after-heterogeneous-detail.png` });
    await click('Previous event'); const prior = JSON.parse(await inspector.locator('.simulation-details pre').textContent());
    await check(prior.after, prior.capacityMetadata);
    await admission(ensemble.locator('.ensemble-layer')).screenshot({ path: `${directory}/after-historical-unknown-detail.png` });
    const empty = createRun({ sessions, inputs: [] }); await load(empty);
    await check(empty.projection, empty.capacityMetadata);
    await admission(ensemble.locator('.ensemble-layer')).screenshot({ path: `${directory}/after-initial-unknown-detail.png` });
    await load(scoped); await check(scoped.projection, scoped.capacityMetadata);
    await click('Export replay'); await click('Load replay'); await check(scoped.projection, scoped.capacityMetadata);
    assert.deepEqual(errors, []);
    console.log('Edit permit browser passed: real occupied 16/64 permits, local 2/1/0 versus shared 3, heterogeneous 2/3 ceilings, unknown historical maxima without fills, retained event facts, history/reload, top duplicate removed/collectors preserved, 3D/focus/narrow.');
  }
} finally { await browser?.close(); await server.close(); }
