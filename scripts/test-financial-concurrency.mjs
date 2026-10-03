import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
if(existsSync('supabase/.temp/project-ref'))throw Error('Remote link forbidden');
const args=['exec','-i','supabase_db_rideledger','psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];
const owner='91000000-0000-0000-0000-000000000001', passenger='92000000-0000-0000-0000-000000000001';
const children=[];
function sql(query){const r=spawnSync('docker',args,{input:query,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout.trim();}
function session(query,open=false){const child=spawn('docker',args);children.push(child);let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,out,err}));});if(open)child.stdin.write(query);else child.stdin.end(query);return {child,done,output:()=>out};}
async function until(fn){const deadline=Date.now()+15000;while(!fn()){if(Date.now()>deadline)throw Error('Local race barrier timeout');await new Promise(r=>setTimeout(r,40));}}
const auth=`set role authenticated;set request.jwt.claim.sub='${owner}';set statement_timeout='12s';set lock_timeout='10s';`;
const priorEvents = new Map();
function state(){return JSON.parse(sql(`select row_to_json(c) from public.monthly_charges c where user_id='${owner}'`));}
async function race(label,queries){
 const barrier=session(`begin;select public.financial_lock('${owner}');select 'READY';\n`,true);
 await until(()=>barrier.output().includes('READY'));
 const requests=queries.map((q,n)=>session(`set application_name='finance-race-${n}';${auth}${q};`));
 await until(()=>sql("select count(*) from pg_stat_activity where application_name like 'finance-race-%' and wait_event_type='Lock'")==='2');
 barrier.child.stdin.end('commit;\n');assert.equal((await barrier.done).code,0);
 const results=await Promise.all(requests.map(r=>r.done));
 for(const r of results)assert.ok(r.code===0||r.err.includes('STALE_OBLIGATION'),r.err);
 for (const result of results) assert.ok(!/deadlock|40P01/i.test(result.err), result.err);
 console.log(`${label}: sessions=${JSON.stringify(results.map(x=>x.code===0?'OK':'STALE_OBLIGATION'))}; deadlock=none`);return results;
}

function audit(label, revision, amount, paid, paymentCount, cancelCount, reopenCount) {
 const c=state(); assert.equal(c.revision,revision); assert.equal(c.total_amount,amount); assert.equal(c.paid,paid);
 assert.equal(c.paid_amount,paid?amount:0); assert.equal(Boolean(c.active_payment_id),paid);assert.equal(Boolean(c.paid_at),paid);
 const events=JSON.parse(sql(`select coalesce(json_agg(e order by occurred_at,id),'[]'::json) from public.monthly_charge_events e where user_id='${owner}'`));
 assert.equal(events.filter(e=>e.kind==='PAYMENT').length,paymentCount);assert.equal(events.filter(e=>e.kind==='CANCEL').length,cancelCount);assert.equal(events.filter(e=>e.kind==='REOPEN').length,reopenCount);
 const versions=new Set(),reversals=new Set();
 for(const e of events){
  assert.equal(e.monthly_charge_id,c.id);assert.equal(e.user_id,owner);assert.equal(e.passenger_id,passenger);assert.equal(e.reference_month,'2025-01-01');assert.ok(e.revision<=c.revision);assert.notEqual(e.signed_amount,0);
  if(priorEvents.has(e.id))assert.equal(JSON.stringify(e),priorEvents.get(e.id),'immutable event changed');
  priorEvents.set(e.id,JSON.stringify(e));
  if(e.kind==='PAYMENT'){assert.ok(!versions.has(e.revision),'duplicate payment revision');versions.add(e.revision);}
  else {const original=events.find(p=>p.id===e.related_payment_id);assert.ok(original);assert.equal(original.kind,'PAYMENT');assert.equal(e.signed_amount,original.signed_amount);assert.equal(e.revision,original.revision);assert.ok(Date.parse(e.occurred_at)>=Date.parse(original.occurred_at));assert.ok(!reversals.has(e.related_payment_id),'duplicate cancel/reopen');reversals.add(e.related_payment_id);}
 }
 for(const id of priorEvents.keys())assert.ok(events.some(e=>e.id===id),'audit event disappeared');
 if(paid){const active=events.find(e=>e.id===c.active_payment_id);assert.ok(active);assert.equal(active.kind,'PAYMENT');assert.equal(active.revision,c.revision);assert.equal(active.signed_amount,c.total_amount);assert.equal(active.occurred_at,c.paid_at);assert.ok(!reversals.has(active.id));}
 const persisted=Number(sql(`select coalesce((select sum(rate_charged) from public.rides where user_id='${owner}'),0)-coalesce((select sum(amount) from public.received_rides where user_id='${owner}'),0)`));assert.equal(c.total_amount,persisted);
 console.log(`${label} FINAL: revision=${c.revision}, amount=${c.total_amount}, paid=${c.paid}, active=${Boolean(c.active_payment_id)}, PAYMENT/CANCEL/REOPEN=${paymentCount}/${cancelCount}/${reopenCount}; immutable audit PASS`);
}

function cleanup(){sql(`update public.monthly_charges set active_payment_id=null where user_id='${owner}';delete from public.monthly_charge_events where user_id='${owner}';delete from public.monthly_charges where user_id='${owner}';delete from public.rides where user_id='${owner}';delete from public.received_rides where user_id='${owner}';delete from public.passengers where id='${passenger}';delete from public.responsible_accounts where user_id='${owner}';delete from auth.users where id='${owner}';`);}
try{
 cleanup();sql(`insert into auth.users(id,email)values('${owner}','finance-race@example.test');insert into public.responsible_accounts(user_id)values('${owner}');insert into public.passengers(id,user_id,name,default_daily_rate)values('${passenger}','${owner}','Synthetic race',10);${auth}insert into public.rides(user_id,passenger_id,ride_date,rate_charged)values('${owner}','${passenger}','2025-01-01',10);`);
 let r=await race('A simultaneous closing',["select public.close_month('2025-01-01')","select public.close_month('2025-01-01')"]);
 assert.equal(r.filter(x=>x.code===0).length,2);assert.equal(state().total_amount,10);assert.equal(sql(`select count(*) from public.monthly_charges where user_id='${owner}'`),'1');
 audit('A',1,10,false,0,0,0);
 let c=state();r=await race('B duplicate payment',[`select public.pay_charge('${c.id}',${c.revision})`,`select public.pay_charge('${c.id}',${c.revision})`]);assert.equal(r.filter(x=>x.code===0).length,2);assert.equal(sql(`select count(*) from public.monthly_charge_events where user_id='${owner}' and kind='PAYMENT'`),'1');assert.ok(state().paid);
 audit('B',1,10,true,1,0,0);
 c=state();r=await race('E duplicate cancellation',[`select public.cancel_charge_payment('${c.id}','${c.active_payment_id}')`,`select public.cancel_charge_payment('${c.id}','${c.active_payment_id}')`]);assert.equal(r.filter(x=>x.code===0).length,2);assert.equal(sql(`select count(*) from public.monthly_charge_events where user_id='${owner}' and kind='CANCEL'`),'1');assert.equal(state().paid,false);
 audit('E',2,10,false,1,1,0);
 c=state();sql(`${auth}select public.pay_charge('${c.id}',${c.revision});`);c=state();
 r=await race('F pay versus cancel',[`select public.pay_charge('${c.id}',${c.revision})`,`select public.cancel_charge_payment('${c.id}','${c.active_payment_id}')`]);assert.equal(state().paid,false);assert.equal(state().active_payment_id,null);assert.equal(sql(`select count(*) from public.monthly_charge_events where related_payment_id='${c.active_payment_id}' and kind='CANCEL'`),'1');
 assert.equal(r[1].code,0);audit('F',3,10,false,2,2,0);
 const oldPayment=c.active_payment_id; c=state();
 r=await race('G new payment versus old cancellation', [`select public.pay_charge('${c.id}',${c.revision})`,`select public.cancel_charge_payment('${c.id}','${oldPayment}')`]);assert.ok(state().paid);assert.notEqual(state().active_payment_id,oldPayment);
 assert.equal(r[0].code,0);audit('G',3,10,true,3,2,0);
 // Administrative fixture leaves a stale total deliberately. Both RPCs must compute persisted data.
 c=state();sql(`update public.rides set rate_charged=20 where user_id='${owner}';`);
 r=await race('C pay versus changed recalculation',[`select public.pay_charge('${c.id}',${c.revision})`,"select public.close_month('2025-01-01')"]);assert.equal(r.filter(x=>x.err.includes('STALE_OBLIGATION')).length,1);assert.equal(state().total_amount,20);assert.equal(state().paid,false);
 assert.equal(r[1].code,0);assert.ok(r[0].err.includes('STALE_OBLIGATION'));audit('C',4,20,false,3,2,1);
 r=await race('D ledger edit versus recalculation',[`update public.rides set rate_charged=30 where user_id='${owner}'`,"select public.close_month('2025-01-01')"]);assert.equal(state().total_amount,30);assert.equal(state().paid,false);
 assert.equal(r.filter(x=>x.code===0).length,2);audit('D',5,30,false,3,2,1);
 c=state();sql(`${auth}select public.pay_charge('${c.id}',${c.revision});`);const current=state();
 const stale=session(`${auth}select public.cancel_charge_payment('${c.id}','${sql(`select id from public.monthly_charge_events where user_id='${owner}' and kind='PAYMENT' order by occurred_at limit 1`)}');`);assert.ok((await stale.done).err.includes('STALE_OBLIGATION'));assert.equal(state().active_payment_id,current.active_payment_id);
 console.log('LOCAL financial concurrency PASS: A–G, final states and stale cancellation verified.');
}finally{for(const child of children)if(child.exitCode===null)child.kill();cleanup();}
