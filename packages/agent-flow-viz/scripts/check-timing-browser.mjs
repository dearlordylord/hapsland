import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1512,height:1100}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}#post-edit-timing`);
  const panel=page.locator('#post-edit-timing');await panel.scrollIntoViewIfNeeded();
  assert.equal(await panel.locator('details').evaluate(element=>element.open),true);
  assert.equal(await panel.locator('svg').count(),3);
  const text=await panel.innerText();
  assert.match(text,/Installed flow still uses pre-edit permits and a synchronous post hook/);
  assert.match(text,/foreground post hook waits only for bounded registration, never for Jev/);
  assert.match(text,/Grace consumes the same Stop deadline/);
  assert.match(text,/A post arriving after grace can still be missed/);
  assert.match(text,/not the installed baseline/);
  for(const trace of await panel.locator('svg').all()){
    const labels=await trace.textContent();for(const lane of ['Agent edit','Post receipt','Resident','Jev','Stop'])assert.ok(labels.includes(lane));
  }
  const summary=panel.locator('summary');await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await panel.locator('details').evaluate(element=>element.open),false);
  await page.keyboard.press('Enter');assert.equal(await panel.locator('details').evaluate(element=>element.open),true);
  await panel.screenshot({path:'/tmp/hapsland-post-edit-timing-1512.png'});
  await page.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const traces=panel.locator('.post-edit-trace-scroll');
  for(const trace of await traces.all()){
    assert.ok(await trace.evaluate(element=>element.scrollWidth>element.clientWidth));
    await trace.focus();await page.keyboard.press('End');
    await trace.evaluate(element=>element.scrollLeft=element.scrollWidth-element.clientWidth);
    assert.ok(await trace.evaluate(element=>element.scrollLeft>0));
  }
  await panel.screenshot({path:'/tmp/hapsland-post-edit-timing-390.png'});
  await traces.first().evaluate(element=>element.scrollLeft=0);
  await panel.locator('.post-edit-trace').first().screenshot({path:'/tmp/hapsland-post-edit-timing-receipt-390.png'});
  assert.deepEqual(errors,[]);
  console.log('Timing browser passed: direct anchor, open disclosure, proposal/baseline distinction, registration/review separation, bounded grace, keyboard disclosure, narrow contained scrolling.');
}finally{await browser?.close();await server.close();}
