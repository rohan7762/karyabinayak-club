import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const actor='11111111-1111-4111-8111-111111111111';
async function write(action,id,kind,version,data={},emails=null){return db.query('select public.club_write_record($1,$2,$3,$4,$5::jsonb,$6::uuid,$7,$8::text[]) as value',[action,id,kind,version,JSON.stringify(data),actor,'owner@example.test',emails]);}
async function attendance(version,rows){return db.query('select public.club_save_attendance($1,$2,$3::jsonb,$4::uuid,$5)',['meeting',version,JSON.stringify(rows),actor,'owner@example.test']);}
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
});
after(()=>db.close());
test('schema is idempotent and initialized with a private photo bucket',async()=>{
 await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 assert.equal((await db.query("select public from storage.buckets where id='club-photos'")).rows[0].public,false);
 assert.equal((await db.query("select count(*)::int as count from public.club_records where kind='settings'")).rows[0].count,1);
});
test('anonymous and signed-in clients cannot read tables or invoke privileged functions',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  try {
   await assert.rejects(db.query('select * from public.club_records'),/permission denied/);
   await assert.rejects(write('save','attack','notices',0,{title:'attack'}),/permission denied/);
   await assert.rejects(db.query("insert into public.club_admins(email,added_by) values('evil@example.test','evil')"),/permission denied/);
  }finally{await db.exec('reset role');}
 }
});
test('server role can save transaction and audit atomically; stale saves cannot overwrite',async()=>{
 await db.exec('set role service_role');
 try {
  await write('save','transaction','transactions',0,{date:'2026-10-02',type:'Income',amount:2000,recordedBy:'spoofed'});
  let row=(await db.query("select * from public.club_records where id='transaction'")).rows[0];
  assert.equal(row.data.recordedBy,'owner@example.test');
  assert.equal(row.version,1);
  await assert.rejects(write('save','transaction','transactions',0,{type:'Income',amount:9000}),/CLUB_CONFLICT/);
  row=(await db.query("select * from public.club_records where id='transaction'")).rows[0];
  assert.equal(row.data.amount,2000);
  assert.equal((await db.query("select count(*)::int as count from public.club_audit_logs where record_id='transaction'")).rows[0].count,1);
  await assert.rejects(write('save','invalid','transactions',0,{type:'Income',amount:-1}),/club_positive_amount/);
  assert.equal((await db.query("select count(*)::int as count from public.club_records where id='invalid'")).rows[0].count,0);
 }finally{await db.exec('reset role');}
});
test('archiving and restoring preserve financial history and balance',async()=>{
 await write('save','expense','transactions',0,{type:'Expense',amount:500});
 const balance=async()=>Number((await db.query("select sum(case when data->>'type'='Income' then (data->>'amount')::numeric else -(data->>'amount')::numeric end) as total from public.club_records where kind='transactions' and not deleted")).rows[0].total);
 assert.equal(await balance(),1500);
 await write('delete','transaction','transactions',1);
 assert.equal(await balance(),-500);
 await write('restore','transaction','transactions',2);
 assert.equal(await balance(),1500);
 assert.equal((await db.query("select count(*)::int as count from public.club_audit_logs where record_id='transaction'")).rows[0].count,3);
});
test('failed admin-list updates roll back settings and membership changes together',async()=>{
 const s=(await db.query("select * from public.club_records where id='settings'")).rows[0];
 await write('save','settings','settings',s.version,s.data,['secretary@example.test']);
 const current=(await db.query("select * from public.club_records where id='settings'")).rows[0];
 await assert.rejects(write('save','settings','settings',current.version,{...current.data,name:'should roll back'},['not-an-email']),/check constraint/);
 const after=(await db.query("select * from public.club_records where id='settings'")).rows[0];
 assert.equal(after.data.name,current.data.name);
 assert.equal(after.version,current.version);
 assert.equal((await db.query("select active from public.club_admins where email='secretary@example.test'")).rows[0].active,true);
 await write('save','settings','settings',current.version,current.data,[]);
 assert.equal((await db.query("select active from public.club_admins where email='secretary@example.test'")).rows[0].active,false);
});
test('attendance validates whole membership, prevents lost updates, and survives member archival',async()=>{
 await write('save','member1','members',0,{memberId:'M001',name:'Member One',status:'Active'});
 await write('save','member2','members',0,{memberId:'M002',name:'Member Two',status:'Active'});
 await write('save','meeting','meetings',0,{title:'Meeting',decisions:''});
 await assert.rejects(attendance(0,[{memberId:'member1',status:'Present'}]),/CLUB_MEMBER_LIST/);
 assert.equal((await db.query('select count(*)::int as count from public.club_attendance')).rows[0].count,0);
 const marks=[{memberId:'member1',status:'Present'},{memberId:'member2',status:'Excused'}];
 await attendance(0,marks);
 await assert.rejects(attendance(0,marks),/CLUB_CONFLICT/);
 await write('delete','member1','members',1);
 await write('save','meeting','meetings',1,{title:'Meeting',decisions:'Approved program'});
 assert.equal((await db.query('select count(*)::int as count from public.club_attendance')).rows[0].count,2);
 await attendance(1,[{memberId:'member1',status:'Absent'},{memberId:'member2',status:'Present'}]);
 assert.equal((await db.query("select status from public.club_attendance where member_id='member1'")).rows[0].status,'Absent');
});
test('case-insensitive Member IDs cannot be duplicated, including on restore',async()=>{
 await write('save','member3','members',0,{memberId:'m001',name:'Replacement',status:'Active'});
 await assert.rejects(write('restore','member1','members',2),/club_unique_member_id/);
 assert.equal((await db.query("select deleted from public.club_records where id='member1'")).rows[0].deleted,true);
});
