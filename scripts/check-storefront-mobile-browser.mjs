import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "h2-storefront-"));
const evidence = "/tmp/storefront-mobile-evidence";
fs.mkdirSync(evidence, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.H2_PLAYWRIGHT_MODULE).href);
const home = fs.readFileSync("client/src/pages/Home.tsx", "utf8");
const start = home.indexOf('        <div data-testid="storefront-quick-services"');
const end = home.indexOf("      </header>", start);
assert.ok(start > 0 && end > start);
const exactQuickServices = home.slice(start, end);
const fixture = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import {Package, Clock, Wallet, Ticket, BarChart3, FileUp, CalendarDays, CreditCard, ChevronDown} from "lucide-react";
import {StorefrontFilters} from "./client/src/components/StorefrontFilters";
const root = createRoot(document.getElementById("root"));
const standard = ["Todos", "Uber", "Táxi", "Documentos"];
const extra = [...standard, "99", "Outros"];
const counts = {Todos:7, Uber:4, "Táxi":2, Documentos:1, "99":12, Outros:100};
function App({state, all, custom}) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const settings = { home_btn2_text: custom ? "ACOMPANHAR PEDIDO" : "Acompanhar pedido", home_btn2_url:"/acompanhar" };
  const shortcutLabel = (_key, fallback) => fallback;
  const shortcutLogo = () => "";
  const shortcutSubtitle = (_key, fallback) => fallback;
  const shortcutUrl = (_key, fallback) => fallback;
  const myActiveScheduleQuery = {data:{active:state!=="inactive", status:state==="confirmed"?"confirmed":"pending",token:"test-only",slotDate:"2026-11-27",slotTime:"15:00"}};
  return <><header className="relative bg-black/40 backdrop-blur-md shadow-sm border-b border-primary/30">${exactQuickServices}</header>
  <section className="pt-2"><div className="container"><div className="mb-2 text-center"><h2 className="mb-1 text-2xl font-bold">FAÇA SEU PEDIDO</h2></div>
  <StorefrontFilters search={search} onSearchChange={setSearch} categories={all?extra:standard} categoryCounts={counts} activeCategory={activeCategory} onCategoryChange={setActiveCategory} resultCount={counts[activeCategory]}/>
  <article data-testid="first-product">Primeiro produto</article></div></section></>;
}
window.renderFixture = (state,all=false,custom=false) => root.render(<App key={state+all+custom} state={state} all={all} custom={custom}/>);
window.renderFixture("confirmed");
`;
await build({
  stdin:{contents:fixture,loader:"tsx",resolveDir:root},
  alias:{"@":path.join(root,"client/src"),"@shared":path.join(root,"shared")},
  bundle:true,format:"esm",platform:"browser",jsx:"automatic",outfile:path.join(temporary,"app.js")
});
const assets = path.join(root,"dist/public/assets");
const productionCss = fs.readdirSync(assets).filter(name=>name.endsWith(".css"));
assert.ok(productionCss.length);
const index = fs.readFileSync("client/index.html","utf8");
const publicCss = [...index.matchAll(/<link rel="stylesheet" href="(\/[^"?]+\.css)(?:\?[^"]*)?"\s*\/>/g)].map(m=>m[1]);
assert.ok(publicCss.includes("/h2-main-route-cards-v2.css"));
const server = http.createServer((req,res)=>{
  const url = new URL(req.url,"http://127.0.0.1");
  if(url.pathname==="/"){
    res.setHeader("Content-Type","text/html; charset=utf-8");
    res.end('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+publicCss.map(p=>'<link rel="stylesheet" href="'+p+'">').join("")+productionCss.map(p=>'<link rel="stylesheet" href="/production/'+encodeURIComponent(p)+'">').join("")+'</head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');
    return;
  }
  let file;
  if(url.pathname==="/app.js")file=path.join(temporary,"app.js");
  else if(publicCss.includes(url.pathname))file=path.join(root,"client/public",url.pathname.slice(1));
  else if(url.pathname.startsWith("/production/") && productionCss.includes(decodeURIComponent(url.pathname.slice(12))))file=path.join(assets,decodeURIComponent(url.pathname.slice(12)));
  if(!file){res.statusCode=404;res.end();return;}
  res.setHeader("Content-Type",file.endsWith(".css")?"text/css":"text/javascript");
  res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true});
const results=[];
try {
  const page=await browser.newPage();
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  for(const width of [320,360,375,390,430,639]){
    await page.setViewportSize({width,height:850});
    await page.goto("http://127.0.0.1:"+server.address().port+"/");
    await page.locator('[data-h2-service="schedule"]').waitFor();
    for(const [state,all,custom] of [["confirmed",false,false],["available",true,true],["inactive",false,true]]){
      await page.evaluate(([state,all,custom])=>window.renderFixture(state,all,custom),[state,all,custom]);
      await page.waitForFunction(({state,all})=>{
        const schedule=document.querySelector('[data-h2-service="schedule"]');
        return !!schedule && (state==="confirmed"?schedule.classList.contains("h2-schedule-card-confirmed"):state==="available"?schedule.classList.contains("h2-schedule-card-available"):schedule.disabled) && document.querySelector('[data-testid="storefront-category-strip"]').children.length===(all?6:4);
      },{state,all});
      const m=await page.evaluate(()=>{
        const rect=e=>{const {x,y,width,height,right,bottom}=e.getBoundingClientRect();return {x,y,width,height,right,bottom}};
        const quick=document.querySelector('[data-testid="storefront-quick-services"]');
        const strip=document.querySelector('[data-testid="storefront-category-strip"]');
        const buttons=[...quick.querySelectorAll("[data-h2-service]")];
        const cards=[...strip.querySelectorAll("button")];
        const overflow=e=>e.scrollWidth>e.clientWidth+1;
        const textClips=(element,button)=>{
          const range=document.createRange();range.selectNodeContents(element);
          const bounds=button.getBoundingClientRect();
          return [...range.getClientRects()].some(r=>r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1);
        };
        return {quick:rect(quick),strip:rect(strip),services:buttons.map(e=>({name:e.dataset.h2Service,...rect(e),direction:getComputedStyle(e).flexDirection,background:getComputedStyle(e).backgroundImage,subtitle:getComputedStyle(e.children[1].children[1]).display,textClipped:textClips(e.children[1].children[0],e)})),categories:cards.map(e=>({label:e.children[1].children[0].textContent,...rect(e),textClipped:textClips(e.children[1].children[0],e)||textClips(e.children[1].children[1],e),overflow:overflow(e)})),pageOverflow:document.documentElement.scrollWidth>innerWidth+1,stripOverflow:overflow(strip)};
      });
      assert.equal(m.services.length,5);
      const [a,b,c,d,s]=m.services;
      assert.equal(m.pageOverflow,false,"page overflow "+width);
      assert.equal(m.stripOverflow,false,"category overflow "+width);
      for(const x of m.services){
        assert.equal(x.direction,"row");
        assert.equal(x.subtitle,"none");
        assert.equal(x.textClipped,false,x.name+" text clipped at "+width);
        assert.ok(x.height>=48&&x.height<=66,x.name+" height "+x.height+" at "+width);
        assert.ok(x.background.includes("linear-gradient"));
      }
      assert.equal(new Set([a,b,c,d].map(x=>x.background)).size,4);
      for(const x of [b,c,d]){assert.ok(Math.abs(x.width-a.width)<1);assert.ok(Math.abs(x.height-a.height)<1);}
      assert.ok(Math.abs(a.y-b.y)<1&&Math.abs(c.y-d.y)<1&&Math.abs(a.x-c.x)<1&&Math.abs(b.x-d.x)<1&&c.y>=a.bottom&&s.y>=c.bottom);
      assert.ok(Math.abs(s.width-(b.right-a.x))<1);
      assert.ok(m.quick.height<200,"quick panel too tall: "+m.quick.height);
      assert.equal(m.categories.length,all?6:4);
      assert.ok(m.categories.some(x=>x.label==="Documentos"));
      for(const x of m.categories){assert.equal(x.textClipped,false,x.label+" clipped at "+width);assert.equal(x.overflow,false);assert.ok(x.height>=46&&x.height<=64);}
      const rows=new Set(m.categories.map(x=>Math.round(x.y))).size;
      assert.equal(rows,all||width<375?2:1,"wrong category rows at "+width);
      const documents=page.getByRole("button",{name:/Documentos/});
      await documents.click();
      assert.equal(await documents.getAttribute("aria-pressed"),"true");
      assert.equal(await page.getByText("1 produto encontrado",{exact:true}).count(),1);
      await page.getByRole("button",{name:/Todos/}).click();
      await page.getByRole("textbox",{name:"Buscar serviço, opção ou documento"}).fill("teste");
      await page.getByRole("button",{name:"Limpar busca"}).click();
      assert.equal(await page.getByRole("textbox",{name:"Buscar serviço, opção ou documento"}).inputValue(),"");
      assert.equal(await page.locator('[data-h2-service="schedule"]').isDisabled(),state==="inactive");
      if([320,390,430].includes(width)&&state==="confirmed")await page.screenshot({path:path.join(evidence,"mobile-"+width+".png")});
      results.push({width,state,all,quickHeight:m.quick.height,categoryRows:rows,categoryHeight:m.strip.height,services:m.services,categories:m.categories});
    }
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,"browser-results.json"),JSON.stringify({success:true,results},null,2));
  console.log("Browser checks passed: 6 widths, 3 schedule states, all shortcuts equal, all categories visible, no overflow, selection and search.");
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(temporary,{recursive:true,force:true});
}
