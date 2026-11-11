-- Disposable local database only. Synthetic fixture; entire transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('b1000000-0000-0000-0000-000000000001','period-owner@example.test'),
 ('b1000000-0000-0000-0000-000000000002','period-other@example.test');
insert into public.responsible_accounts(user_id) values
 ('b1000000-0000-0000-0000-000000000001'),('b1000000-0000-0000-0000-000000000002');
insert into public.passengers(id,user_id,name,default_daily_rate) values
 ('b2000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Period p1',10),
 ('b2000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000001','Period p2',10),
 ('b2000000-0000-0000-0000-000000000003','b1000000-0000-0000-0000-000000000001','Period p3',10),
 ('b2000000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000002','Foreign passenger',10);
create function pg_temp.c(pid uuid, ref date) returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where passenger_id=pid and reference_month=ref $$;

-- Estrutura -----------------------------------------------------------------
select has_column('public','monthly_charges','period_start','period_start exists');
select has_column('public','monthly_charges','period_end','period_end exists');
select col_not_null('public','monthly_charges','period_start','period_start is not null');
select col_not_null('public','monthly_charges','period_end','period_end is not null');
select ok(not exists(select 1 from pg_constraint where conname='charges_canonical_month' and conrelid='public.monthly_charges'::regclass),'canonical day-1 constraint removed');
select has_trigger('public','monthly_charges','charge_reference_immutable','reference_month immutability trigger exists');
select has_trigger('public','monthly_charges','charge_period_defaults','legacy inserts get a period from reference_month');
select ok(not has_function_privilege('anon','public.reconcile_charge_by_id(uuid,uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.reconcile_charge_by_id(uuid,uuid)','EXECUTE'),'by-id reconcile is internal');
select ok(not has_function_privilege('anon','public.charge_period_total(uuid,uuid,date,date)','EXECUTE')
 and not has_function_privilege('authenticated','public.charge_period_total(uuid,uuid,date,date)','EXECUTE'),'period total is internal');
select ok(not has_function_privilege('anon','public.reconcile_charge(uuid,uuid,date)','EXECUTE')
 and not has_function_privilege('authenticated','public.reconcile_charge(uuid,uuid,date)','EXECUTE'),'legacy reconcile wrapper stays internal');

-- Cobranças criadas pelo caminho antigo (close_month e eventos de pagamento) --
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-0000-0000-000000000001';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'b2000000-0000-0000-0000-000000000001','2025-03-03',10),
 (auth.uid(),'b2000000-0000-0000-0000-000000000001','2025-03-04',10),
 (auth.uid(),'b2000000-0000-0000-0000-000000000002','2024-02-10',10),
 (auth.uid(),'b2000000-0000-0000-0000-000000000002','2025-12-31',10);
select lives_ok($$select public.close_month('2025-03-01')$$,'close_month still closes a calendar month');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).total_amount,20::numeric,'close_month total is unchanged');
select ok((public.pay_charge((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).id,(pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).revision)).paid,'pay_charge works through the wrapper');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'b2000000-0000-0000-0000-000000000001','2025-03-05',10);
select is((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).total_amount,30::numeric,'ride trigger still recalculates the month');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).paid_amount,20::numeric,'partial payment is preserved on recalculation');
select ok(not (pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).paid,'month reopens with a balance');
select lives_ok($$select public.close_month('2024-02-01')$$,'close leap February');
select lives_ok($$select public.close_month('2025-12-01')$$,'close December');
select is((select count(*) from public.close_month('2025-02-01')),0::bigint,'a month without movement still creates nothing');

-- Período gravado pelo caminho de criação -------------------------------------
reset role;
select is((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).period_start,date '2025-03-01','new monthly charge: period_start is the first day');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-03-01')).period_end,date '2025-03-31','new monthly charge: period_end is the last day');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000002','2024-02-01')).period_end,date '2024-02-29','leap February ends on the 29th');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-12-01')).period_end,date '2025-12-31','December ends on the 31st');
select ok(not exists(select 1 from public.monthly_charges where reference_month<>period_start),'reference_month always equals period_start');

-- Backfill: o mesmo UPDATE da migração não altera mais nada ----------------------
create temporary table snap_c as select id,user_id,passenger_id,reference_month,total_amount,paid,paid_amount,revision,paid_at,active_payment_id,recalculated_at,created_at from public.monthly_charges;
create temporary table snap_e as select * from public.monthly_charge_events;
grant select on snap_c, snap_e to authenticated;
update public.monthly_charges
 set period_start = reference_month,
     period_end = ((reference_month + interval '1 month')::date - 1);
select is((select count(*) from snap_c),(select count(*) from public.monthly_charges),'backfill keeps the number of charges');
select is((select count(*) from (
  select * from snap_c
  except select id,user_id,passenger_id,reference_month,total_amount,paid,paid_amount,revision,paid_at,active_payment_id,recalculated_at,created_at from public.monthly_charges) x),0::bigint,
 'backfill: total, paid, paid_amount, revision, paid_at and active_payment_id are identical');
select is((select count(*) from (select * from snap_e except select * from public.monthly_charge_events) x),0::bigint,'backfill: events unchanged (before minus after)');
select is((select count(*) from (select * from public.monthly_charge_events except select * from snap_e) x),0::bigint,'backfill: events unchanged (after minus before)');
select is((select count(*) from public.monthly_charge_events),(select count(*) from snap_e),'backfill: same number of events');

-- Exclusão: ciclos do mesmo passageiro não se sobrepõem -----------------------
select lives_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-06-07','2025-06-07','2025-07-06',0)$$,'cycle starting on day 7 accepted (no day-1 rule)');
select throws_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-07-06','2025-07-06','2025-07-20',0)$$,'23P01',null,'sharing the last day overlaps');
select throws_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-06-10','2025-06-10','2025-06-20',0)$$,'23P01',null,'contained cycle overlaps');
select throws_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-05-01','2025-05-01','2025-08-01',0)$$,'23P01',null,'covering cycle overlaps');
select lives_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-07-07','2025-07-07','2025-08-06',0)$$,'next cycle starting the day after is accepted');
select lives_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-05-01','2025-05-01','2025-06-06',0)$$,'previous cycle ending the day before is accepted');
select lives_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-06-07','2025-06-07','2025-07-06',0)$$,'different passenger may have the same period');
select throws_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-09-01','2025-09-07','2025-09-30',0)$$,'23514',null,'reference_month must equal period_start');
select throws_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-10-10','2025-10-10','2025-10-09',0)$$,'23514',null,'period_start after period_end rejected');
select throws_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000003','2025-10-01','2025-10-01','infinity',0)$$,'23514',null,'infinite period rejected');
select throws_ok($$update public.monthly_charges set reference_month='2025-06-08' where passenger_id='b2000000-0000-0000-0000-000000000003' and reference_month='2025-06-07'$$,'23514','Identidade e vínculo não podem ser alterados.','reference_month is immutable');
select throws_ok($$update public.monthly_charges set period_start='2025-06-08' where passenger_id='b2000000-0000-0000-0000-000000000003' and reference_month='2025-06-07'$$,'23514',null,'period_start cannot drift from reference_month');

select lives_ok($$insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount)
 values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','2024-11-01',0)$$,'legacy insert without a period accepted');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000001','2024-11-01')).period_end,date '2024-11-30','legacy insert: period becomes the calendar month');

-- Recálculo por id num ciclo livre (dia 7 a dia 6) ----------------------------
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-06-06',10),
 ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-06-07',10),
 ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-07-06',10),
 ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-07-07',10);
insert into public.received_rides(user_id,passenger_id,received_date,amount) values
 ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-06-20',5),
 ('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-07-07',100);
select is((public.reconcile_charge_by_id('b1000000-0000-0000-0000-000000000001',(pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).id)).total_amount,15::numeric,
 'free cycle sums rides and compensations between period_start and period_end, both inclusive');
select throws_ok($$select public.reconcile_charge_by_id('b1000000-0000-0000-0000-000000000002',(select id from public.monthly_charges where reference_month='2025-06-07' and passenger_id='b2000000-0000-0000-0000-000000000002'))$$,'42501','FINANCIAL_FORBIDDEN','by-id reconcile rejects another owner');

-- pay_charge e cancel_charge_payment, sem alteração, funcionam em ciclo livre ---
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-0000-0000-000000000001';
select ok((public.pay_charge((pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).id,(pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).revision)).paid,'pay_charge accepts a cycle that does not start on day 1');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).paid_amount,15::numeric,'free cycle paid in full');
reset role;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values('b1000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','2025-06-10',10);
select is((public.reconcile_charge_by_id('b1000000-0000-0000-0000-000000000001',(pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).id)).total_amount,25::numeric,'ride inside a closed free cycle raises the total');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).paid_amount,15::numeric,'free cycle keeps what was received');
select ok(not (pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).paid,'free cycle reopens with the difference');
select is((select count(*) from public.monthly_charge_events where monthly_charge_id=(pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).id and kind='REOPEN'),1::bigint,'recalculation audits one REOPEN');
set local role authenticated;
set local request.jwt.claim.sub='b1000000-0000-0000-0000-000000000001';
select is((public.cancel_charge_payment((pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).id,
  (select id from public.monthly_charge_events where monthly_charge_id=(pg_temp.c('b2000000-0000-0000-0000-000000000002','2025-06-07')).id and kind='PAYMENT'))).paid_amount,0::numeric,'cancel_charge_payment works after recalculation in a free cycle');

-- Wrapper e compatibilidade com o front antigo ----------------------------------
select is((public.recalculate_charge('b2000000-0000-0000-0000-000000000001','2025-03-01')).id,(select id from snap_c where passenger_id='b2000000-0000-0000-0000-000000000001' and reference_month='2025-03-01'),'recalculate_charge finds the same charge by (passenger, reference_month)');
select is((public.recalculate_charge('b2000000-0000-0000-0000-000000000001','2025-03-01')).total_amount,30::numeric,'recalculate_charge returns the same total as before');
select is((select count(*) from public.close_month('2025-03-01')),1::bigint,'close_month returns the same single charge');
select is((select total_amount from public.close_month('2025-03-01')),30::numeric,'close_month total is stable');
select is((public.recalculate_charge('b2000000-0000-0000-0000-000000000001','2025-04-01')).total_amount,0::numeric,'wrapper creates an empty month with total zero');
select ok((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-04-01')).paid,'empty month is settled, as before');
select is((pg_temp.c('b2000000-0000-0000-0000-000000000001','2025-04-01')).period_end,date '2025-04-30','wrapper-created month ends on the last day');
select throws_ok($$select public.recalculate_charge('b2000000-0000-0000-0000-000000000001','2025-03-02')$$,'23514','INVALID_COMPETENCE','non-day-1 competence still rejected when no charge exists');
select throws_ok($$select public.recalculate_charge('b2000000-0000-0000-0000-000000000001',null)$$,'23514','INVALID_COMPETENCE','null competence rejected');
select throws_ok($$select public.close_month('2025-03-02')$$,'23514','INVALID_COMPETENCE','close_month still requires day 1');
select throws_ok($$select public.recalculate_charge('b2000000-0000-0000-0000-000000000009','2025-03-01')$$,'42501','FINANCIAL_FORBIDDEN','foreign passenger still rejected');
select throws_ok($$select public.recalculate_charge('b2000000-0000-0000-0000-000000000003','2025-06-01')$$,'23P01',null,'creating a month over an existing free cycle is rejected by the exclusion');

reset role;
select * from finish();
rollback;
