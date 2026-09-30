import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
const p=await b.newPage({viewport:{width:390,height:844}});
p.setDefaultTimeout(8000);
await p.goto('http://127.0.0.1:4173/evaluations',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.setItem('tienganh_user',JSON.stringify({id:'audit_teacher',username:'audit',name:'Giáo viên Audit',role:'teacher'})));
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1000);
console.log((await p.locator('body').innerText()).slice(0,1000));
const btn=p.getByRole('button',{name:/Tạo Đánh Giá/}); console.log('buttons',await btn.count());
if(await btn.count()){await btn.first().click();const m=p.locator('[role=dialog]');await m.waitFor(); console.log(await m.evaluate(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,close:!!e.querySelector('[aria-label="Đóng bảng đánh giá"]')}})); await p.screenshot({path:'artifacts/ui-audit-live-2026-09-30/evaluation-modal-mobile-fixed.png'});}
await b.close();
