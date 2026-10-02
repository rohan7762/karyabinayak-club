import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReturnTo,sameOrigin,imageIsPublic,validPhoto,MAX_PHOTO_BYTES} from '../lib/security.ts';
import {schemas,totals} from '../lib/club-model.ts';
test('OAuth return paths cannot redirect to another origin',()=>{
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/\nevil.test','/auth/sign-in']) assert.equal(safeReturnTo(value),'/admin');
 assert.equal(safeReturnTo('/admin?tab=members'),'/admin?tab=members');
});
test('mutation requests must match the configured origin',()=>{
 process.env.APP_URL='https://club.example';
 assert.equal(sameOrigin(new Request('https://club.example/api/club',{headers:{origin:'https://evil.test'}})),false);
 assert.equal(sameOrigin(new Request('https://club.example/api/club')),false);
 assert.equal(sameOrigin(new Request('https://club.example/api/club',{headers:{origin:'https://club.example'}})),true);
});
test('only published photos or active committee photos are public',()=>{
 assert.equal(imageIsPublic({kind:'members',data:{status:'Active',position:'Member'}}),false);
 assert.equal(imageIsPublic({kind:'members',data:{status:'Inactive',position:'President'}}),false);
 assert.equal(imageIsPublic({kind:'members',data:{status:'Active',position:'President'}}),true);
 assert.equal(imageIsPublic({kind:'gallery',data:{public:false}}),false);
 assert.equal(imageIsPublic({kind:'gallery',deleted:true,data:{public:true}}),false);
 assert.equal(imageIsPublic({kind:'activities',data:{public:true}}),true);
});
test('photo validation rejects misleading MIME types and supports the Vercel payload limit',()=>{
 assert.equal(validPhoto(new Uint8Array([60,115,118,103]),'image/png'),false);
 assert.equal(validPhoto(new Uint8Array([137,80,78,71,13,10,26,10]),'image/png'),true);
 assert.ok(MAX_PHOTO_BYTES<4.5*1024*1024);
});
test('invalid calendar dates, money precision and forged fields are rejected or stripped',()=>{
 const txn={date:'2026-10-02',type:'Income',category:'Donation',amount:123.45,description:'Test',source:'Member',recordedBy:'forged'};
 assert.equal(schemas.transactions.parse(txn).recordedBy,undefined);
 assert.equal(schemas.transactions.safeParse({...txn,amount:-1}).success,false);
 assert.equal(schemas.transactions.safeParse({...txn,amount:1.111}).success,false);
 assert.equal(schemas.transactions.safeParse({...txn,date:'2026-02-30'}).success,false);
});
test('balance excludes archives and uses integer-paisa summation',()=>{
 assert.deepEqual(totals([{type:'Income',amount:0.1},{type:'Income',amount:0.2},{type:'Expense',amount:0.1},{type:'Income',amount:999,deleted:true}]),{income:0.3,expense:0.1,balance:0.2});
});
