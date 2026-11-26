-- Disposable local database only. Synthetic fixture; entire transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Um responsável por cenário, para um close_cycle não mexer nos passageiros do outro.
-- O1 (A): ciclo que cruza meses, adjacente, recálculo, ciclo em aberto.
-- O2 (R): o caso real (novembro com pagamento parcial, depois 1/dez a 6/dez).
-- O3 (S, Z, C): passageiro novo, NO_MOVEMENT.
-- O4 (P1, P2): SKIPPED misturado com CLOSED, todos pulados.
-- O5 (T): validações de end_date, "hoje" aceito.
-- O6 (Q1, Q2, Q3): preview igual ao close, sem gravar.
insert into auth.users(id,email) values
 ('e1000000-0000-0000-0000-000000000001','o1@example.test'),
 ('e1000000-0000-0000-0000-000000000002','o2@example.test'),
 ('e1000000-0000-0000-0000-000000000003','o3@example.test'),
 ('e1000000-0000-0000-0000-000000000004','o4@example.test'),
 ('e1000000-0000-0000-0000-000000000005','o5@example.test'),
 ('e1000000-0000-0000-0000-000000000006','o6@example.test'),
 ('e1000000-0000-0000-0000-000000000008','unlinked@example.test'),
 ('e1000000-0000-0000-0000-000000000009','passenger-login@example.test');
insert into public.responsible_accounts(user_id) values
 ('e1000000-0000-0000-0000-000000000001'),('e1000000-0000-0000-0000-000000000002'),
 ('e1000000-0000-0000-0000-000000000003'),('e1000000-0000-0000-0000-000000000004'),
 ('e1000000-0000-0000-0000-000000000005'),('e1000000-0000-0000-0000-000000000006');
insert into public.passengers(id,user_id,name,default_daily_rate) values
 ('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','A',10),
 ('e2000000-0000-0000-0000-000000000002','e1000000-0000-0000-0000-000000000002','R',10),
 ('e2000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003','S',10),
 ('e2000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000003','Z',10),
 ('e2000000-0000-0000-0000-000000000005','e1000000-0000-0000-0000-000000000003','C',10),
 ('e2000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000004','P1',10),
 ('e2000000-0000-0000-0000-000000000007','e1000000-0000-0000-0000-000000000004','P2',10),
 ('e2000000-0000-0000-0000-000000000008','e1000000-0000-0000-0000-000000000005','T',10),
 ('e2000000-0000-0000-0000-000000000009','e1000000-0000-0000-0000-000000000006','Q1',10),
 ('e2000000-0000-0000-0000-000000000010','e1000000-0000-0000-0000-000000000006','Q2',10),
 ('e2000000-0000-0000-0000-000000000011','e1000000-0000-0000-0000-000000000006','Q3',10),
 ('e2000000-0000-0000-0000-000000000012','e1000000-0000-0000-0000-000000000001','Linked passenger',10);
insert into public.passenger_accounts(user_id,passenger_id,owner_user_id) values
 ('e1000000-0000-0000-0000-000000000009','e2000000-0000-0000-0000-000000000012','e1000000-0000-0000-0000-000000000001');

-- Resultados das chamadas e fotografias, para comparar depois. Criadas antes de trocar de papel.
create temporary table results(label text, passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric,
 paid_amount numeric, amount_due numeric, refund_due numeric);
grant select,insert on results to authenticated;
create temporary table snap(label text, charge jsonb, events jsonb);
grant select,insert on snap to authenticated;
create temporary table counts_before(charges bigint, events bigint, rides bigint);
grant select,insert on counts_before to authenticated;

create function pg_temp.c(pid uuid, ref date) returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where passenger_id=pid and reference_month=ref $$;
create function pg_temp.st(pid uuid, ref date) returns text language sql as $$
 select c.total_amount||'/'||c.revision from public.monthly_charges c where passenger_id=pid and reference_month=ref $$;
create function pg_temp.err(q text) returns text language plpgsql as $$
declare h text; begin execute q; return 'no error';
exception when others then get stacked diagnostics h = pg_exception_hint;
 return sqlstate||'|'||sqlerrm||'|'||coalesce(h,'');
end $$;
create function pg_temp.today() returns date language sql as $$
 select (clock_timestamp() at time zone 'America/Sao_Paulo')::date $$;
create function pg_temp.fotografa(lbl text, pid uuid, ref date) returns void language sql as $$
 insert into snap select lbl, to_jsonb(c),
  (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.monthly_charge_events e where e.monthly_charge_id=c.id)
 from public.monthly_charges c where c.passenger_id=pid and c.reference_month=ref $$;

-- Estrutura e permissões ----------------------------------------------------------
select ok(has_function_privilege('authenticated','public.close_cycle(date)','EXECUTE')
 and has_function_privilege('authenticated','public.preview_cycle(date)','EXECUTE'),'authenticated can call close_cycle and preview_cycle');
select ok(not has_function_privilege('anon','public.close_cycle(date)','EXECUTE')
 and not has_function_privilege('anon','public.preview_cycle(date)','EXECUTE'),'anon cannot call close_cycle nor preview_cycle');
select ok(not has_function_privilege('anon','public.cycle_plan(uuid,date)','EXECUTE')
 and not has_function_privilege('authenticated','public.cycle_plan(uuid,date)','EXECUTE'),'cycle_plan is internal');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
 where oid in ('public.close_cycle(date)'::regprocedure,'public.preview_cycle(date)'::regprocedure,'public.cycle_plan(uuid,date)'::regprocedure)),
 'cycle functions are definer with a safe search_path');

set local role authenticated;

-- 1. Ciclo que cruza meses (O1 / A) -------------------------------------------------------
set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000001';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000001','2025-11-01',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000001','2025-11-20',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000001','2025-12-06',10);
insert into results select 'x1',* from public.close_cycle('2025-12-06');
select is((select count(*) from results where label='x1'),1::bigint,'x1: one passenger in the summary');
select is((select status from results where label='x1'),'CLOSED','x1: CLOSED');
select is((select period_start||'..'||period_end||' total '||total_amount from results where label='x1'),
 '2025-11-01..2025-12-06 total 30.00','x1: the cycle crosses months with the right total');
select ok((select charge_id=(pg_temp.c('e2000000-0000-0000-0000-000000000001','2025-11-01')).id from results where label='x1'),'x1: summary carries the created charge id');
select is((select c.period_start||'..'||c.period_end||' ref '||c.reference_month||' total '||c.total_amount||' rev '||c.revision||' paid '||c.paid
 from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000001'),
 '2025-11-01..2025-12-06 ref 2025-11-01 total 30.00 rev 1 paid false','x1: charge stored with reference_month = period_start');

-- 2. Ciclo adjacente e ciclo em aberto -------------------------------------------------------
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000001','2025-12-07',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000001','2025-12-20',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000001','2026-01-10',10);
select is((select count(*) from public.monthly_charges where passenger_id='e2000000-0000-0000-0000-000000000001'),1::bigint,'open cycle: rides after the last end create no charge');
select is(pg_temp.st('e2000000-0000-0000-0000-000000000001','2025-11-01'),'30.00/1','open cycle: the closed cycle is not recalculated by rides after its end');
insert into results select 'x2',* from public.close_cycle('2025-12-31');
select is((select period_start||'..'||period_end||' total '||total_amount from results where label='x2'),
 '2025-12-07..2025-12-31 total 20.00','adjacent: the next cycle starts at the previous end + 1 and takes only its own rides');
select is((select c2.period_start-c1.period_end from public.monthly_charges c1, public.monthly_charges c2
 where c1.reference_month='2025-11-01' and c2.reference_month='2025-12-07' and c1.passenger_id=c2.passenger_id
 and c1.passenger_id='e2000000-0000-0000-0000-000000000001'),1,'adjacent: no gap between the cycles');
select is((select count(*) from public.monthly_charges c1 join public.monthly_charges c2 on c1.passenger_id=c2.passenger_id and c1.id<c2.id
 and daterange(c1.period_start,c1.period_end,'[]') && daterange(c2.period_start,c2.period_end,'[]')
 where c1.passenger_id='e2000000-0000-0000-0000-000000000001'),0::bigint,'adjacent: no overlap');
select is(pg_temp.st('e2000000-0000-0000-0000-000000000001','2025-11-01'),'30.00/1','adjacent: first cycle untouched by closing the second');

-- 3. Diária dentro de ciclo fechado recalcula e preserva o pago; remover gera saldo a devolver
select ok((public.pay_charge((pg_temp.c('e2000000-0000-0000-0000-000000000001','2025-11-01')).id,(pg_temp.c('e2000000-0000-0000-0000-000000000001','2025-11-01')).revision)).paid,'pay the first cycle in full');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'e2000000-0000-0000-0000-000000000001','2025-11-10',5);
select is((select c.total_amount||'/'||c.paid_amount from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000001' and c.reference_month='2025-11-01'),
 '35.00/30.00','ride inside a closed cycle recalculates the total and keeps what was paid');
select is((select (pg_temp.c('e2000000-0000-0000-0000-000000000001','2025-12-07')).total_amount),20::numeric,'the ride in the first cycle does not touch the second');
delete from public.rides where passenger_id='e2000000-0000-0000-0000-000000000001' and ride_date in ('2025-11-20','2025-12-06');
select is((select c.total_amount||'/'||c.paid_amount from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000001' and c.reference_month='2025-11-01'),
 '15.00/30.00','removing rides leaves paid above the total (balance to refund)');
select ok((select c.paid_amount>c.total_amount from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000001' and c.reference_month='2025-11-01'),'refund is paid_amount minus total');
insert into results select 'x3',* from public.close_cycle('2026-01-31');
select is((select period_start||'..'||period_end||' total '||total_amount from results where label='x3'),
 '2026-01-01..2026-01-31 total 10.00','the ride left in the open cycle enters the next closing');

-- 4. O caso real, opção B (O2 / R) --------------------------------------------------------------
set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000002';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000002','2025-11-03',30),
 (auth.uid(),'e2000000-0000-0000-0000-000000000002','2025-11-10',30),
 (auth.uid(),'e2000000-0000-0000-0000-000000000002','2025-11-17',30);
select lives_ok($$select public.close_month('2025-11-01')$$,'legacy path: close November');
select ok((public.pay_charge((pg_temp.c('e2000000-0000-0000-0000-000000000002','2025-11-01')).id,(pg_temp.c('e2000000-0000-0000-0000-000000000002','2025-11-01')).revision)).paid,'legacy path: pay 90');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'e2000000-0000-0000-0000-000000000002','2025-11-24',16);
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'e2000000-0000-0000-0000-000000000002','2025-11-28',20);
select is((select c.total_amount||'/'||c.paid_amount||'/'||c.revision from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000002' and c.reference_month='2025-11-01'),
 '126.00/90.00/3','real case: November total 126, paid 90, revision 3');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000002','2025-12-02',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000002','2025-12-05',10);
select pg_temp.fotografa('nov','e2000000-0000-0000-0000-000000000002','2025-11-01');
select ok((select jsonb_array_length(events)>0 from snap where label='nov'),'real case: November has audit events to compare');
insert into results select 'x4',* from public.close_cycle('2025-12-06');
select is((select period_start||'..'||period_end||' total '||total_amount from results where label='x4'),
 '2025-12-01..2025-12-06 total 20.00','real case: close_cycle(6/dec) creates 1/dec to 6/dec');
select is((select c.reference_month from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000002' and c.period_start='2025-12-01'),
 date '2025-12-01','real case: the new charge has reference_month = period_start');
select ok((select charge=(select to_jsonb(c) from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000002' and c.reference_month='2025-11-01')
 from snap where label='nov'),'real case: the November charge row is identical');
select ok((select events=(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.monthly_charge_events e where e.monthly_charge_id=(charge->>'id')::uuid)
 from snap where label='nov'),'real case: the November events are identical');

-- 5. Passageiro novo, NO_MOVEMENT, SKIPPED misturado (O3 e O4) -------------------------------
set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000003';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000003','2025-01-10',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000004','2025-01-12',10);
insert into results select 'x5',* from public.close_cycle('2025-02-28');
select is((select string_agg(status||' '||period_start||'..'||period_end,'; ' order by passenger_id) from results where label='x5'),
 'CLOSED 2025-01-10..2025-02-28; CLOSED 2025-01-12..2025-02-28','first cycle of an existing passenger starts at the first ride');
-- C é passageiro novo: primeira data é a compensação (2/mar), não a diária (5/mar).
insert into public.received_rides(user_id,passenger_id,received_date,amount) values(auth.uid(),'e2000000-0000-0000-0000-000000000005','2025-03-02',4);
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000005','2025-03-05',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000003','2025-03-10',10);
insert into results select 'x6',* from public.close_cycle('2025-03-31');
select is((select count(*) from results where label='x6'),3::bigint,'x6: three passengers in the summary');
select is((select array_agg(passenger_id order by ctid) from results where label='x6'),
 (select array_agg(passenger_id order by passenger_id) from results where label='x6'),'x6: summary is ordered by passenger');
select is((select status||' '||period_start||'..'||period_end||' total '||total_amount from results where label='x6' and passenger_id='e2000000-0000-0000-0000-000000000003'),
 'CLOSED 2025-03-01..2025-03-31 total 10.00','x6: S continues from the previous end + 1');
select is((select status||' '||period_start||'..'||period_end||' total '||total_amount from results where label='x6' and passenger_id='e2000000-0000-0000-0000-000000000005'),
 'CLOSED 2025-03-02..2025-03-31 total 6.00','new passenger: the first cycle starts at the first ride or compensation');
select is((select reference_month from public.monthly_charges where passenger_id='e2000000-0000-0000-0000-000000000005'),date '2025-03-02','new passenger: reference_month = period_start');
select is((select status||'|'||coalesce(charge_id::text,'-')||'|'||coalesce(total_amount::text,'-') from results where label='x6' and passenger_id='e2000000-0000-0000-0000-000000000004'),
 'NO_MOVEMENT|-|-','Z without movement: NO_MOVEMENT');
select is((select count(*) from public.monthly_charges where passenger_id='e2000000-0000-0000-0000-000000000004'),1::bigint,'NO_MOVEMENT does not create a zero charge');

set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000004';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'e2000000-0000-0000-0000-000000000006','2025-01-10',10);
insert into results select 'x7',* from public.close_cycle('2025-03-31');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'e2000000-0000-0000-0000-000000000007','2025-02-05',10);
-- end_date ANTERIOR ao último fim de P1 (31/mar): P1 vem SKIPPED e P2, que ainda abre ciclo, CLOSED.
insert into results select 'x7b',* from public.preview_cycle('2025-03-15');
select is((select status||'|'||reason||'|'||period_end||'|'||coalesce(charge_id::text,'-') from results where label='x7b' and passenger_id='e2000000-0000-0000-0000-000000000006'),
 'SKIPPED|ALREADY_CLOSED_UNTIL|2025-03-31|-','mix: end_date BEFORE the last end is SKIPPED too, with the last period_end');
select is((select status||' '||period_start||'..'||period_end||' total '||total_amount from results where label='x7b' and passenger_id='e2000000-0000-0000-0000-000000000007'),
 'CLOSED 2025-02-05..2025-03-15 total 10.00','mix: the passenger still opening a cycle is CLOSED up to the earlier end_date');
select is((select count(*) from public.monthly_charges where passenger_id='e2000000-0000-0000-0000-000000000006'),1::bigint,'mix: no new cycle for the skipped passenger');
insert into results select 'x8',* from public.close_cycle('2025-03-31');
select is((select status||'|'||reason||'|'||period_end||'|'||coalesce(charge_id::text,'-') from results where label='x8' and passenger_id='e2000000-0000-0000-0000-000000000006'),
 'SKIPPED|ALREADY_CLOSED_UNTIL|2025-03-31|-','mix: end_date equal to the last end is SKIPPED, with the last period_end');
select is((select status||' '||period_start||'..'||period_end||' total '||total_amount from results where label='x8' and passenger_id='e2000000-0000-0000-0000-000000000007'),
 'CLOSED 2025-02-05..2025-03-31 total 10.00','mix: the other passenger is still closed');
select is((select count(*) from public.monthly_charges where passenger_id='e2000000-0000-0000-0000-000000000006'),1::bigint,'mix: the skipped passenger got no new charge');
select is(pg_temp.err($$select * from public.close_cycle('2025-03-31')$$),
 '23514|INVALID_CYCLE_END|Todos os passageiros já estão fechados até esta data.','all skipped: INVALID_CYCLE_END with a Portuguese hint');
select is(pg_temp.err($$select * from public.preview_cycle('2025-03-15')$$),
 '23514|INVALID_CYCLE_END|Todos os passageiros já estão fechados até esta data.','all skipped (earlier end_date): preview rejects too');
select is((select count(*) from public.monthly_charges where user_id=auth.uid()),2::bigint,'all skipped: nothing was created');

-- 6. Validações de end_date (O5 / T) ---------------------------------------------------------
set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000005';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'e2000000-0000-0000-0000-000000000008','2025-06-01',10);
select is(pg_temp.err($$select * from public.close_cycle(null)$$),'23514|INVALID_CYCLE_END|Informe uma data de fim válida para o ciclo.','close_cycle: null end_date');
select is(pg_temp.err($$select * from public.close_cycle('infinity')$$),'23514|INVALID_CYCLE_END|Informe uma data de fim válida para o ciclo.','close_cycle: infinite end_date');
select is(pg_temp.err($$select * from public.close_cycle('-infinity')$$),'23514|INVALID_CYCLE_END|Informe uma data de fim válida para o ciclo.','close_cycle: -infinity end_date');
select is(pg_temp.err(format('select * from public.close_cycle(%L)',pg_temp.today()+1)),'23514|FUTURE_DATE|A data de fim do ciclo não pode ser futura.','close_cycle: tomorrow is FUTURE_DATE');
select is(pg_temp.err($$select * from public.preview_cycle(null)$$),'23514|INVALID_CYCLE_END|Informe uma data de fim válida para o ciclo.','preview_cycle: null end_date');
select is(pg_temp.err($$select * from public.preview_cycle('infinity')$$),'23514|INVALID_CYCLE_END|Informe uma data de fim válida para o ciclo.','preview_cycle: infinite end_date');
select is(pg_temp.err(format('select * from public.preview_cycle(%L)',pg_temp.today()+1)),'23514|FUTURE_DATE|A data de fim do ciclo não pode ser futura.','preview_cycle: tomorrow is FUTURE_DATE');
select is((select count(*) from public.monthly_charges where user_id=auth.uid()),0::bigint,'rejected calls created nothing');
insert into results select 'x9',* from public.close_cycle(pg_temp.today());
select is((select status||' '||period_start||'..'||(period_end=pg_temp.today())::text from results where label='x9'),
 'CLOSED 2025-06-01..true','end_date equal to today is accepted');

-- 7. preview_cycle igual ao close_cycle e sem gravar (O6) ----------------------------------------
set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000006';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000009','2025-03-01',5),
 (auth.uid(),'e2000000-0000-0000-0000-000000000010','2025-03-05',5);
insert into results select 'closed-march',* from public.close_cycle('2025-03-31');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'e2000000-0000-0000-0000-000000000009','2025-04-01',10),
 (auth.uid(),'e2000000-0000-0000-0000-000000000009','2025-04-10',20),
 (auth.uid(),'e2000000-0000-0000-0000-000000000011','2025-04-05',7);
insert into public.received_rides(user_id,passenger_id,received_date,amount) values(auth.uid(),'e2000000-0000-0000-0000-000000000011','2025-04-06',2);
select pg_temp.fotografa('q1-march','e2000000-0000-0000-0000-000000000009','2025-03-01');
insert into counts_before select
 (select count(*) from public.monthly_charges where user_id=auth.uid()),
 (select count(*) from public.monthly_charge_events where user_id=auth.uid()),
 (select count(*) from public.rides where user_id=auth.uid());
insert into results select 'prev',* from public.preview_cycle('2025-04-30');
select is((select count(*) from public.monthly_charges where user_id=auth.uid()),(select charges from counts_before),'preview: the number of charges does not change');
select is((select count(*) from public.monthly_charge_events where user_id=auth.uid()),(select events from counts_before),'preview: the number of events does not change');
select is((select count(*) from public.rides where user_id=auth.uid()),(select rides from counts_before),'preview: rides untouched');
select is((select count(*) from results where label='prev' and charge_id is not null),0::bigint,'preview: no charge id, nothing was created');
select is((select string_agg(status,',' order by passenger_id) from results where label='prev'),'CLOSED,NO_MOVEMENT,CLOSED','preview: CLOSED, NO_MOVEMENT and CLOSED for Q1, Q2 and Q3');
select is((select status||' '||period_start||'..'||period_end||' total '||total_amount from results where label='prev' and passenger_id='e2000000-0000-0000-0000-000000000011'),
 'CLOSED 2025-04-05..2025-04-30 total 5.00','preview: the new passenger total already nets the compensation');
insert into results select 'close',* from public.close_cycle('2025-04-30');
select is((select count(*) from public.monthly_charges where user_id=auth.uid()),(select charges+2 from counts_before),'close_cycle then creates the two charges that preview announced');
select is((select count(*) from (
 (select passenger_id,status,reason,period_start,period_end,total_amount from results where label='prev'
  except select passenger_id,status,reason,period_start,period_end,total_amount from results where label='close')
 union all
 (select passenger_id,status,reason,period_start,period_end,total_amount from results where label='close'
  except select passenger_id,status,reason,period_start,period_end,total_amount from results where label='prev')) d),0::bigint,
 'preview returns the same summary as close_cycle (except charge_id)');
select is((select count(*) from results where label='close' and status='CLOSED' and charge_id is not null),2::bigint,'close_cycle fills charge_id for the CLOSED rows');
select ok((select charge=(select to_jsonb(c) from public.monthly_charges c where c.passenger_id='e2000000-0000-0000-0000-000000000009' and c.reference_month='2025-03-01')
 from snap where label='q1-march'),'close_cycle leaves the previous cycle identical');

-- 8. Permissões ---------------------------------------------------------------------------------
set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000009';
select throws_ok($$select * from public.close_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','linked passenger cannot close_cycle');
select throws_ok($$select * from public.preview_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','linked passenger cannot preview_cycle');
set local request.jwt.claim.sub='e1000000-0000-0000-0000-000000000008';
select throws_ok($$select * from public.close_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','user without a responsible account cannot close_cycle');
select throws_ok($$select * from public.preview_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','user without a responsible account cannot preview_cycle');
reset role;
set local role anon;
select throws_ok($$select * from public.close_cycle('2025-12-06')$$,'42501',null,'anonymous cannot close_cycle');
select throws_ok($$select * from public.preview_cycle('2025-12-06')$$,'42501',null,'anonymous cannot preview_cycle');
reset role;
select is((select count(*) from public.monthly_charges where user_id='e1000000-0000-0000-0000-000000000001'),3::bigint,'denied calls created nothing for the first owner');

select * from finish();
rollback;
