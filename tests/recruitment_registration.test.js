import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { POST } from '../src/routes/api/teachers/workflows/+server.js';
function fixture(failNotification = false) {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(`CREATE TABLE teacher_recruitment(id TEXT PRIMARY KEY,candidate_name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT,role_type TEXT NOT NULL,experience_years REAL,certificates TEXT,status TEXT,interview_notes TEXT,selected_grades_json TEXT,selected_subjects_json TEXT,interview_preference TEXT,availability TEXT,cv_link TEXT); CREATE TABLE system_notifications(id TEXT PRIMARY KEY,target_role TEXT,title TEXT,body TEXT,category TEXT,reference_id TEXT);`);
 const DB={prepare(sql){ const create=(args=[])=>({all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>{if(failNotification && sql.includes('INSERT INTO system_notifications'))throw Error('notification offline');return sqlite.prepare(sql).run(...args);}});return {...create(),bind:(...args)=>create(args)};}};
 return {sqlite, platform:{env:{DB}}};
}
const payload={action:'candidate_apply',candidate_name:'Test Teacher',phone:'0900000000',role_type:'assistant',selected_grades:['IELTS Academic','TESOL','IELTS Academic']};
const call=(ctx,body)=>POST({platform:ctx.platform,request:new Request('https://test/api/teachers/workflows',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
test('teacher and assistant applications accept multiple certificates without class or login',async()=>{
 for(const role_type of ['lead','assistant']){const ctx=fixture();const response=await call(ctx,{...payload,role_type});assert.equal(response.status,200);const result=await response.json();assert.equal(result.success,true);assert.equal(result.token,undefined);const row=ctx.sqlite.prepare('SELECT * FROM teacher_recruitment').get();assert.equal(row.status,'applied');assert.equal(row.role_type,role_type);assert.deepEqual(JSON.parse(row.selected_grades_json),['IELTS Academic','TESOL']);assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM system_notifications').get().n,1);ctx.sqlite.close();}
});
test('invalid role and selection rejected before application is stored',async()=>{const ctx=fixture();for(const fields of [{role_type:'superadmin'},{selected_grades:[]},{selected_grades:'7A'},{selected_grades:[{}]}])assert.equal((await call(ctx,{...payload,...fields})).status,400);assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM teacher_recruitment').get().n,0);ctx.sqlite.close();});
test('notification failure does not report a saved application as failed',async()=>{const ctx=fixture(true);const response=await call(ctx,payload);assert.equal(response.status,200);assert.equal((await response.json()).success,true);assert.equal(ctx.sqlite.prepare('SELECT count(*) n FROM teacher_recruitment').get().n,1);ctx.sqlite.close();});
