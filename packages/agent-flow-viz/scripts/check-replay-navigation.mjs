import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = process.env.REPLAY_URL ? undefined : await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await server?.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.REPLAY_URL ?? server.resolvedUrls.local[0]);
  const replay = page.locator('#canonical-replay');
  const slider = replay.getByRole('slider', { name: 'Guided replay history' });
  const position = (at, length) => page.waitForFunction(([at, length]) =>
    document.querySelector('.canonical-progress').textContent.includes(`history ${at}/`) && document.querySelector('.canonical-progress').textContent.includes(`${length} recorded events`), [at, length]);
  const seek = async at => {
    await slider.evaluate((input, at) => {
      input.value = String(at);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, at);
  };
  assert.equal(await slider.isDisabled(), false);
  assert.equal(await slider.getAttribute('max'), '104');
  await seek(104); await position(104, 104);
  assert.match(await replay.locator('.canonical-progress').innerText(), /Guided step 63 of 63/);
  await seek(0); await position(0, 104);
  await seek(17); await position(17, 104);
  await replay.getByRole('button', { name: 'Reset replay' }).click();
  await position(0, 0);
  assert.equal(await slider.getAttribute('max'), '104');
  await replay.locator('.manual-event summary').click();
  for (let guided = 1; guided <= 3; guided++) {
    await replay.getByRole('button', { name: /^Next:/ }).click();
    if (guided < 3) for (let manual = 0; manual < 2; manual++) {
      await replay.getByLabel('Event JSON').fill('{"kind":"fileSelectionCheck","protected":false,"excluded":false,"includesEmpty":false,"included":true}');
      await replay.getByRole('button', { name: 'Apply event' }).click();
    }
  }
  await position(7, 7);
  assert.equal(await slider.getAttribute('max'), '108');
  await page.locator('h1').click();
  await page.keyboard.press('Shift+ArrowLeft'); await position(4, 7);
  await page.keyboard.press('Shift+ArrowLeft'); await position(1, 7);
  await page.keyboard.press('Shift+ArrowRight'); await position(4, 7);
  await seek(5); await position(5, 7);
  await page.locator('h1').click();
  await page.keyboard.press('Shift+ArrowLeft'); await position(1, 7);
  await page.keyboard.down('ArrowRight'); await position(2, 7);
  await page.keyboard.down('ArrowRight'); await position(3, 7);
  await page.keyboard.down('ArrowRight'); await position(4, 7);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft'); await position(3, 7);
  await page.keyboard.down('ArrowLeft'); await position(2, 7);
  await page.keyboard.up('ArrowLeft');
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  await page.mouse.click(box.x + 8 + (box.width - 16) * 6 / 108, box.y + box.height / 2);
  await position(6, 7);
  await page.mouse.move(box.x + 8 + (box.width - 16) * 6 / 108, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 8 + (box.width - 16) * 2 / 108, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await position(2, 7);
  await replay.getByLabel('Event JSON').focus();
  await page.keyboard.press('ArrowLeft'); await position(2, 7);
  await seek(0); await position(0, 7);
  await page.locator('h1').click();
  await page.keyboard.press('ArrowLeft'); await position(0, 7);
  await seek(7); await position(7, 7);
  await page.locator('h1').click();
  await page.keyboard.press('Shift+ArrowRight'); await position(8, 8);
  // Real preparation facts share one guided step; shift must cross the whole group.
  await replay.getByRole('button', { name: 'Reset replay' }).click();
  await position(0, 0);
  const progress = async () => {
    const text = await replay.locator('.canonical-progress').innerText();
    const parts = text.match(/Guided step (\d+) of \d+ · action \d+\/\d+ · history (\d+)\/(\d+) · (\d+) recorded events/);
    return { guided: Number(parts[1]), at: Number(parts[2]), total: Number(parts[3]), recorded: Number(parts[4]) };
  };
  let before;
  for (let step = 0; step < 63; step++) {
    before = await progress();
    if ((await replay.getByRole('button', { name: /^Next:/ }).innerText()).includes('preparation ·')) break;
    await page.locator('h1').click();
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForFunction(guided => document.querySelector('.canonical-progress').textContent.includes(`Guided step ${guided} of`), before.guided + 1);
  }
  assert.match(await replay.getByRole('button', { name: /^Next:/ }).innerText(), /preparation ·/);
  await page.locator('h1').click();
  await page.keyboard.press('ArrowRight');
  await position(before.at + 1, before.recorded + 1);
  assert.equal((await progress()).guided, before.guided);
  await page.keyboard.press('Shift+ArrowRight');
  await page.waitForFunction(guided => document.querySelector('.canonical-progress').textContent.includes(`Guided step ${guided} of`), before.guided + 1);
  const after = await progress();
  assert.ok(after.at > before.at + 2, 'Shift traverses several preparation history events');
  await page.keyboard.press('Shift+ArrowLeft'); await position(before.at, after.recorded);
  await page.keyboard.press('Shift+ArrowRight'); await position(after.at, after.recorded);
  assert.equal(await slider.getAttribute('max'), '104', 'the scenario horizon stays fixed through inner events');
  await replay.getByRole('button', { name: 'Reset replay' }).click(); await position(0, 0);
  await seek(10); await position(10, 10);
  await replay.getByLabel('Event JSON').fill('{"kind":"interruptPreparation","partition":1,"lifetime":1,"round":1,"operation":3}');
  await replay.getByLabel('Event JSON').press('Tab');
  await replay.getByRole('button', { name: 'Apply event' }).click(); await position(11, 11);
  assert.equal(await slider.getAttribute('max'), '105');
  await seek(105);
  await page.waitForFunction(() => document.querySelector('.canonical-feedback').textContent.includes('Cannot reach timeline event 105'));
  await position(11, 11);
  assert.equal(await slider.inputValue(), '11', 'blocked seeking settles on the last checked event');
  await seek(10); await position(10, 11);
  await replay.getByLabel('Event JSON').fill('{"kind":"fileSelectionCheck","protected":false,"excluded":false,"includesEmpty":false,"included":true}');
  await replay.getByLabel('Event JSON').press('Tab');
  await replay.getByRole('button', { name: 'Apply event' }).click(); await position(11, 11);
  await seek(105); await position(105, 105);
  assert.match(await replay.locator('.canonical-progress').innerText(), /Guided step 63 of 63/);
  await replay.getByLabel('Guided scenario', { exact: true }).selectOption({ label: 'Shared review capacity and partial unit admission' });
  await position(0, 0);
  assert.equal(await slider.getAttribute('max'), '11');
  await slider.focus(); await slider.press('End'); await position(11, 11);
  assert.deepEqual(errors, []);
  console.log('Replay navigation: repeated arrows, guided boundaries, preserved future, mouse scrubbing, input focus and endpoints PASS');
} finally {
  await browser?.close();
  await server?.close();
}
