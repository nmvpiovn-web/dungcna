import { chromium } from 'playwright';
import fs from 'node:fs';
const out='artifacts/ui-audit-live-2026-09-30';
const b=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
for (const item of [
  {name:'home-desktop',url:'/',w:1440,h:1000,full:true},
  {name:'home-mobile',url:'/',w:390,h:844,full:true},
  {name:'flashcards-mobile',url:'/flashcards',w:390,h:844,full:true},
  {name:'recruitment-mobile',url:'/recruitment',w:390,h:844,full:true},
  {name:'exam-desktop',url:'/exam',w:1440,h:1000,full:true}
]) {
 const p=await b.newPage({viewport:{width:item.w,height:item.h}});
 await p.goto('https://timbk.io.vn'+item.url,{waitUntil:'networkidle'});
 if(item.url==='/flashcards') { const f=p.locator('.flip-main'); if(await f.count()) { await f.click(); await p.waitForTimeout(500); }}
 await p.screenshot({path:`${out}/${item.name}.png`,fullPage:item.full});
 console.log(item.name, await p.title(), await p.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,text:document.body.innerText.slice(0,500)})));
 await p.close();
}
await b.close();
