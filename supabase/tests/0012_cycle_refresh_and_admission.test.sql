-- Disposable local database only. Synthetic fixture; entire transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('d1000000-0000-0000-0000-000000000001','cycle-owner@example.test'),
 ('d1000000-0000-0000-0000-000000000002','cycle-other@example.test');
insert into public.responsible_accounts(user_id) values
 ('d1000000-0000-0000-0000-000000000001'),('d1000000-0000-0000-0000-000000000002');
insert into public.passengers(id,user_id,name,default_daily_rate) values
 ('d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Cycle A',10),
 ('d2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','Cycle B',10),
 ('d2000000-0000-0000-0000-000000000003','d1000000-0000-0000-0000-000000000001','Cycle C',10),
 ('d2000000-0000-0000-0000-000000000004','d1000000-0000-0000-0000-000000000001','Cycle D',10),
 ('d2000000-0000-0000-0000-000000000005','d1000000-0000-0000-0000-000000000001','Cycle E (no cycle ever)',10),
 ('d2000000-0000-0000-0000-000000000009','d1000000-0000-0000-0000-000000000002','Foreign passenger',10);

create function pg_temp.c(pid uuid, ref date) returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where passenger_id=pid and reference_month=ref $$;
-- "total/revision" de uma cobrança, para conferir recálculo e não-recálculo de uma vez.
create function pg_temp.st(pid uuid, ref date) returns text language sql as $$
 select c.total_amount||'/'||c.revision from public.monthly_charges c where passenger_id=pid and reference_month=ref $$;
-- SQLSTATE, mensagem e HINT de um erro, ou 'no error'.
create function pg_temp.err(q text) returns text language plpgsql as $$
declare h text; begin execute q; return 'no error';
exception when others then get stacked diagnostics h = pg_exception_hint;
 return sqlstate||'|'||sqlerrm||'|'||coalesce(h,'');
end $$;

-- Estrutura e permissões ----------------------------------------------------------
select has_trigger('public','rides','ride_before_first_cycle','rides: admission trigger exists');
select has_trigger('public','received_rides','received_before_first_cycle','compensations: admission trigger exists');
select ok(not has_function_privilege('anon','public.reject_before_first_cycle()','EXECUTE')
 and not has_function_privilege('authenticated','public.reject_before_first_cycle()','EXECUTE'),'admission function is internal');
select ok(not has_function_privilege('anon','public.refresh_existing_charges()','EXECUTE')
 and not has_function_privilege('authenticated','public.refresh_existing_charges()','EXECUTE'),'refresh function is internal');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.reject_before_first_cycle()'::regprocedure),'admission: definer with safe search_path');

-- Ciclos livres montados direto na tabela (a 0013 ainda não existe) ------------------
-- A: ciclo 1 de 1/jan a 6/fev, ciclo 2 de 7/fev a 6/mar; depois disso, ciclo em aberto.
-- B: mesmo período do ciclo 1 de A, para provar o isolamento entre passageiros.
insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount) values
 ('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','2025-01-01','2025-01-01','2025-02-06',0),
 ('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','2025-02-07','2025-02-07','2025-03-06',0),
 ('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','2025-01-01','2025-01-01','2025-02-06',0);

set local role authenticated;
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000001';

-- Refresh por período ---------------------------------------------------------------
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'d2000000-0000-0000-0000-000000000001','2025-01-20',10);
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'10.00/2','ride inside cycle 1 recalculates cycle 1');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'0.00/1','cycle 2 untouched');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'d2000000-0000-0000-0000-000000000001','2025-02-03',10);
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'20.00/3','a February ride before day 7 belongs to cycle 1, not to calendar February');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'0.00/1','cycle 2 still untouched');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'d2000000-0000-0000-0000-000000000001','2025-02-07',10);
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/2','first day of cycle 2 recalculates cycle 2');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'20.00/3','cycle 1 untouched by a cycle 2 ride');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'d2000000-0000-0000-0000-000000000001','2025-03-07',10);
select is((select count(*) from public.monthly_charges where passenger_id='d2000000-0000-0000-0000-000000000001'),2::bigint,'ride in the open cycle creates no charge');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/2','ride in the open cycle recalculates nothing');

update public.rides set ride_date='2025-02-08' where ride_date='2025-02-03' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'10.00/4','move cycle 1 to cycle 2: cycle 1 recalculated');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'20.00/3','move cycle 1 to cycle 2: cycle 2 recalculated');
update public.rides set ride_date='2025-02-09' where ride_date='2025-02-08' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'20.00/3','move inside the same cycle keeps total and revision');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'10.00/4','move inside the same cycle leaves the other cycle alone');
update public.rides set ride_date='2025-03-10' where ride_date='2025-02-09' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/4','move closed to open: only the closed cycle is recalculated');
select is((select count(*) from public.monthly_charges where passenger_id='d2000000-0000-0000-0000-000000000001'),2::bigint,'move closed to open creates no charge');
update public.rides set ride_date='2025-03-11' where ride_date='2025-03-10' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/4','move open to open recalculates nothing');
update public.rides set ride_date='2025-02-10' where ride_date='2025-03-11' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'20.00/5','move open to closed: the closed cycle is recalculated');
delete from public.rides where ride_date='2025-02-10' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/6','delete inside a closed cycle recalculates it');

insert into public.received_rides(user_id,passenger_id,received_date,amount) values(auth.uid(),'d2000000-0000-0000-0000-000000000001','2025-01-25',4);
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'6.00/5','compensation inside cycle 1 lowers cycle 1');
update public.received_rides set received_date='2025-02-12' where received_date='2025-01-25' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'10.00/6','compensation moved out of cycle 1: cycle 1 recalculated');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'6.00/7','compensation moved into cycle 2: cycle 2 recalculated');
update public.received_rides set received_date='2025-03-12' where received_date='2025-02-12' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/8','compensation moved to the open cycle: only the closed cycle is recalculated');
delete from public.received_rides where received_date='2025-03-12' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/8','delete in the open cycle recalculates nothing');
select is((select count(*) from public.monthly_charges where passenger_id='d2000000-0000-0000-0000-000000000001'),2::bigint,'no charge was created by any of the above');

insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'d2000000-0000-0000-0000-000000000002','2025-01-21',10);
select is(pg_temp.st('d2000000-0000-0000-0000-000000000002','2025-01-01'),'10.00/2','another passenger with the same period is recalculated on its own');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-01-01'),'10.00/6','and the first passenger is untouched');

-- Pagamento parcial e saldo a devolver valem em ciclo livre -------------------------------
select ok((public.pay_charge((pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).id,
 (pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).revision)).paid,'pay cycle 1 of A in full (10)');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'d2000000-0000-0000-0000-000000000001','2025-02-05',10);
select is((pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).total_amount,20::numeric,'ride after payment raises the total');
select is((pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).paid_amount,10::numeric,'the 10 already received is kept');
select ok(not (pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).paid,'only the difference is owed');
select is((select count(*) from public.monthly_charge_events where monthly_charge_id=(pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).id and kind='REOPEN'),1::bigint,'one REOPEN audited');
delete from public.rides where ride_date='2025-02-05' and passenger_id='d2000000-0000-0000-0000-000000000001';
select ok((pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).paid,'ride removed: settled again');
delete from public.rides where ride_date='2025-01-20' and passenger_id='d2000000-0000-0000-0000-000000000001';
select is((pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).total_amount,0::numeric,'last ride removed: total zero');
select is((pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).paid_amount,10::numeric,'paid amount stays as a balance to refund');
select ok((pg_temp.c('d2000000-0000-0000-0000-000000000001','2025-01-01')).paid,'refund balance counts as settled, as in the monthly path');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000001','2025-02-07'),'10.00/8','cycle 2 untouched by cycle 1 payments');

-- CYCLE_OVERLAP ---------------------------------------------------------------------------
reset role;
insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000003','2025-06-07','2025-06-07','2025-07-06',0);
set local role authenticated;
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000001';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'d2000000-0000-0000-0000-000000000002','2025-06-15',10),
 (auth.uid(),'d2000000-0000-0000-0000-000000000003','2025-06-10',10);
select throws_ok($$select public.close_month('2025-06-01')$$,'23514','CYCLE_OVERLAP','close_month over an existing free cycle fails with a domain error');
select is((select count(*) from public.monthly_charges where reference_month='2025-06-01'),0::bigint,'close_month aborted as a whole: nobody got a June charge');
select is(pg_temp.err($$select public.recalculate_charge('d2000000-0000-0000-0000-000000000003','2025-06-01')$$),
 '23514|CYCLE_OVERLAP|Já existe um ciclo deste passageiro que cobre parte deste mês.','recalculate_charge: CYCLE_OVERLAP with a Portuguese hint');
select is(pg_temp.err($$select public.recalculate_charge('d2000000-0000-0000-0000-000000000003','2025-07-01')$$),
 '23514|CYCLE_OVERLAP|Já existe um ciclo deste passageiro que cobre parte deste mês.','a month that only touches the last days of the cycle overlaps too');
select lives_ok($$select public.recalculate_charge('d2000000-0000-0000-0000-000000000003','2025-08-01')$$,'a month after the cycle is fine');
select throws_ok($$select public.recalculate_charge('d2000000-0000-0000-0000-000000000003','2025-06-02')$$,'23514','INVALID_COMPETENCE','non-day-1 competence is still INVALID_COMPETENCE');
select throws_ok($$select public.recalculate_charge('d2000000-0000-0000-0000-000000000009','2025-06-01')$$,'42501','FINANCIAL_FORBIDDEN','foreign passenger is still FINANCIAL_FORBIDDEN');

-- Rejeição de data anterior ao primeiro ciclo ----------------------------------------------
-- D: primeiro ciclo de 7/mar a 6/abr. E: nunca teve ciclo. B: primeiro ciclo mensal em 1/jan.
reset role;
insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount)
values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','2025-03-07','2025-03-07','2025-04-06',0);
-- Registro antigo que já existia antes da regra: criado com o gatilho desligado.
alter table public.rides disable trigger ride_before_first_cycle;
insert into public.rides(id,user_id,passenger_id,ride_date,rate_charged)
values('d3000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','2025-01-10',10),
 ('d3000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','2025-01-12',10);
alter table public.rides enable trigger ride_before_first_cycle;
set local role authenticated;
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000001';

select is(pg_temp.err($$insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','2025-03-06',10)$$),
 '23514|BEFORE_FIRST_CYCLE|Esta data é anterior ao primeiro fechamento deste passageiro (início em 2025-03-07).','ride the day before the first cycle: BEFORE_FIRST_CYCLE with the start date in the hint');
select is(pg_temp.err($$insert into public.received_rides(user_id,passenger_id,received_date,amount) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','2025-03-06',5)$$),
 '23514|BEFORE_FIRST_CYCLE|Esta data é anterior ao primeiro fechamento deste passageiro (início em 2025-03-07).','compensation the day before the first cycle: BEFORE_FIRST_CYCLE');
select lives_ok($$insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','2025-03-07',10)$$,'ride on the first day of the first cycle is accepted');
select throws_ok($$update public.rides set ride_date='2025-03-06' where ride_date='2025-03-07' and passenger_id='d2000000-0000-0000-0000-000000000004'$$,'23514','BEFORE_FIRST_CYCLE','moving a ride to before the first cycle is rejected');
select is((select ride_date from public.rides where passenger_id='d2000000-0000-0000-0000-000000000004' and ride_date>='2025-03-01'),date '2025-03-07','rejected move left the ride where it was');
select lives_ok($$update public.rides set rate_charged=12 where id='d3000000-0000-0000-0000-000000000001'$$,'editing the value of an old ride that predates the first cycle is allowed');
select lives_ok($$update public.rides set ride_date=ride_date where id='d3000000-0000-0000-0000-000000000001'$$,'writing the same date back is allowed');
select throws_ok($$update public.rides set ride_date='2025-01-11' where id='d3000000-0000-0000-0000-000000000001'$$,'23514','BEFORE_FIRST_CYCLE','moving an old ride to another date before the first cycle is rejected');
select lives_ok($$update public.rides set ride_date='2025-03-20' where id='d3000000-0000-0000-0000-000000000001'$$,'moving an old ride into a cycle is allowed');
select is(pg_temp.st('d2000000-0000-0000-0000-000000000004','2025-03-07'),'22.00/3','the moved ride is counted by its cycle (12 + the 10 on the first day)');
delete from public.rides where ride_date='2025-03-20' and passenger_id='d2000000-0000-0000-0000-000000000004';
select is(pg_temp.st('d2000000-0000-0000-0000-000000000004','2025-03-07'),'10.00/4','deleting the moved ride recalculates its cycle');
select lives_ok($$delete from public.rides where id='d3000000-0000-0000-0000-000000000002'$$,'deleting an old ride before the first cycle is allowed (no rule on delete)');
select lives_ok($$insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000005','1999-12-31',10)$$,'a passenger who never had a cycle accepts any past date');
select throws_ok($$insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','2024-12-31',10)$$,'23514','BEFORE_FIRST_CYCLE','calendar-month first cycle: the day before 1/jan is rejected');
select lives_ok($$insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','2025-01-01',10)$$,'calendar-month first cycle: 1/jan is accepted');
select throws_ok($$insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','2024-12-31',10)$$,'23514','BEFORE_FIRST_CYCLE','the rule is per passenger and uses the earliest cycle (A starts on 1/jan)');
select is((select count(*) from public.rides where passenger_id='d2000000-0000-0000-0000-000000000004'),1::bigint,'rejected inserts wrote nothing');

-- A regra vale também para escrita privilegiada (fixtures e scripts).
reset role;
select throws_ok($$insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values('d1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','2025-02-01',10)$$,'23514','BEFORE_FIRST_CYCLE','privileged insert is also rejected');

select * from finish();
rollback;
