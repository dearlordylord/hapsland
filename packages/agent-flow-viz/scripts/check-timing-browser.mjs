import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const captures='/workspace/hapsland-review/current-hook-timing';
await mkdir(captures,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1512,height:1100}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}#post-edit-timing`);
  const panel=page.locator('#post-edit-timing');await panel.scrollIntoViewIfNeeded();
  assert.equal(await panel.locator('details').evaluate(element=>element.open),true);
  assert.equal(await panel.locator('.post-edit-proposals').count(),0);
  assert.equal(await panel.locator('#current-hook-timing svg').count(),2);
  const text=await panel.innerText();
  assert.match(text,/synchronous post hook reports it and can wait for review/);
  assert.match(text,/synchronous post hook reports it and returns/);
  assert.match(text,/Repeat pre → edit → post for each edit/);
  assert.match(text,/Stop: nothing to wait for/);
  const summary=panel.locator('summary');await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await panel.locator('details').evaluate(element=>element.open),false);
  await page.keyboard.press('Enter');assert.equal(await panel.locator('details').evaluate(element=>element.open),true);
  await panel.locator('#current-hook-timing').screenshot({path:`${captures}/current-1512.png`});
  await page.setViewportSize({width:390,height:844});await panel.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  const traces=panel.locator('.post-edit-trace-scroll');
  for(const trace of await traces.all()){
    assert.ok(await trace.evaluate(element=>element.scrollWidth>element.clientWidth));
    await trace.focus();await page.keyboard.press('End');
    await trace.evaluate(element=>element.scrollLeft=element.scrollWidth-element.clientWidth);
    assert.ok(await trace.evaluate(element=>element.scrollLeft>0));
  }
  await panel.locator('#current-hook-timing').screenshot({path:`${captures}/current-390.png`});
  await traces.first().evaluate(element=>element.scrollLeft=0);
  await panel.locator('.current-hook-trace').first().screenshot({path:`${captures}/current-left-390.png`});
  assert.deepEqual(errors,[]);
  console.log('Timing browser passed: direct anchor, open disclosure, current-only traces, registration/review separation, current Stop paths, keyboard disclosure, narrow contained scrolling.');
}finally{await browser?.close();await server.close();}
