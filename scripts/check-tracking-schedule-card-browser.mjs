import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const browserModule = process.env.H2_PLAYWRIGHT_MODULE;
if (!browserModule) throw new Error('H2_PLAYWRIGHT_MODULE is required; browser dependency belongs only to CI.');
const { chromium } = await import(pathToFileURL(browserModule).href);
const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'h2-tracking-card-'));
const evidence = '/tmp/tracking-schedule-evidence';
fs.mkdirSync(evidence, { recursive: true });
const token = 'test_only_'.padEnd(48, 'a');
await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import Card from './client/src/components/TrackingScheduleTopCard';
      const root=createRoot(document.getElementById('root'));
      const appointment={id:1,registrationId:101,token:${JSON.stringify(token)},status:'pending',serviceName:'ATENDIMENTO DE TESTE COM UM NOME DE SERVICO MUITO LONGO PARA VALIDAR A QUEBRA DE LINHA',slotDate:'2026-10-20',slotTime:'16:30'};
      window.setCardState=(status)=>root.render(<main style={{maxWidth:512,margin:'0 auto',padding:16,boxSizing:'border-box'}}><header style={{padding:'16px 0',fontSize:20,color:'white'}}>Acompanhar Pedido</header><Card key={status} appointment={{...appointment,status}}/><section style={{marginTop:24,padding:20,color:'white'}}>Situacao atual do pedido</section></main>);
      window.setCardState('pending');`,
    loader: 'tsx', resolveDir: root,
  },
  alias: { '@': path.join(root,'client/src'), '@shared': path.join(root,'shared') },
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  outfile: path.join(temporary, 'app.js'), logLevel: 'warning',
});
const assetsDir = path.join(root, 'dist/public/assets');
const cssFiles = fs.readdirSync(assetsDir).filter(name => name.endsWith('.css'));
const server = http.createServer((req,res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if(url.pathname === '/') {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${cssFiles.map(name=>`<link rel="stylesheet" href="/production/${encodeURIComponent(name)}">`).join('')}<link rel="stylesheet" href="/app.css"><style>html,body{margin:0;background:#0d0d1a}</style></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`);
    return;
  }
  let file;
  if(url.pathname === '/app.js' || url.pathname === '/app.css') file=path.join(temporary,url.pathname.slice(1));
  else if(url.pathname.startsWith('/production/')) {
    const name=decodeURIComponent(url.pathname.slice('/production/'.length));
    if(cssFiles.includes(name))file=path.join(assetsDir,name);
  }
  if(!file){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true});
const results = [];
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror',error=>pageErrors.push(error.message));
  for(const width of [320,360,390,768,1280]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
    const card=page.locator('.h2-schedule-top-card');
    await card.waitFor();
    assert.equal(await card.getAttribute('data-state'),'pending');
    assert.equal(await card.locator('a').getAttribute('href'),`/agendar/${token}`);
    assert.notEqual(await card.evaluate(el=>getComputedStyle(el).animationName),'none');
    for(const state of ['pending','confirmed']) {
      await page.evaluate(state=>window.setCardState(state),state);
      await page.waitForFunction(state=>document.querySelector('.h2-schedule-top-card')?.getAttribute('data-state')===state,state);
      const measurements=await page.evaluate(()=>{
        const el=document.querySelector('.h2-schedule-top-card');
        const title=el.querySelector('h2').getBoundingClientRect();
        const description=el.querySelector('.h2-schedule-top-card__description').getBoundingClientRect();
        const children=[...el.querySelectorAll('h2,p,a,button')];
        return {overflow:document.documentElement.scrollWidth>innerWidth || children.some(child=>child.scrollWidth>child.clientWidth+1), overlap:title.bottom>description.top+1, animation:getComputedStyle(el).animationName};
      });
      assert.equal(measurements.overflow,false,`${state}: overflow at ${width}`);
      assert.equal(measurements.overlap,false,`${state}: text overlap at ${width}`);
      if(state==='confirmed') {
        assert.equal(measurements.animation,'none');
        assert.equal(await card.locator('button').count(),0);
        assert.match(await card.textContent(),/20\/10\/2026.*16:30/);
      }
      if([320,390,1280].includes(width)) await card.screenshot({path:path.join(evidence,`${state}-${width}.png`)});
      results.push({width,state,...measurements});
    }
    await page.evaluate(()=>window.setCardState('pending'));
    await card.locator('button').waitFor();
    await card.locator('button').click();
    assert.equal(await card.evaluate(el=>getComputedStyle(el).animationName),'none');
    await card.locator('button').click();
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await card.evaluate(el=>getComputedStyle(el).animationName),'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    // :focus-visible deliberately does not activate after pointer clicks. Test
    // actual keyboard navigation from the pause button to the preceding link.
    await card.locator('button').focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await card.locator('a').evaluate(el=>el===document.activeElement),true);
    assert.equal(await card.locator('a').evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
    await page.evaluate(()=>window.setCardState('completed'));
    await card.waitFor({state:'detached'});
  }
  assert.deepEqual(pageErrors,[]);
  fs.writeFileSync(path.join(evidence,'browser-results.json'),JSON.stringify({success:true,results,checks:['pause','reduced-motion','keyboard-focus','same-tab-link','completed-hidden']},null,2));
  console.log('Browser checks passed: 5 widths, pending/confirmed, no overflow/overlap, reduced motion, pause, keyboard focus, closed-hidden.');
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(temporary,{recursive:true,force:true});
}
