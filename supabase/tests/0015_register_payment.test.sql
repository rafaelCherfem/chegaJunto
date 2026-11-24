-- Disposable local database only. Synthetic fixture; entire transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Um responsável (e um passageiro) por cenário. Datas fixas de 2025.
-- "Prep": diária de 90 em 05/11, close_month, pay_charge (pago 90), diária de 180 em 20/11
-- => total vivo 270, pago 90, falta 180, ciclo 01/11 a 30/11 (extensible = false).
--  O1 registra 100            O2 registra o que falta      O3 dois adiantamentos e desfazer
--  O4 desfazer após recálculo O5 acima do que falta        O6 valores inválidos
--  O7 total zero, O8 negativo, O9 quitado                  O10/O11 diária nova depois do adiantamento
--  O12 ciclo encerrado por close_cycle                     O13 pay_charge depois do registro
--  O14 encerra (EXTENDED) depois de adiantar               O15 adiantou demais e encerra
--  O16 revisão velha e repetição                           O17 cobrança de outro responsável
insert into auth.users(id,email)
 select ('d1000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid, 'x'||n||'@example.test' from generate_series(1,17) n;
insert into auth.users(id,email) values
 ('d1000000-0000-0000-0000-000000000098','passenger-login@example.test'),
 ('d1000000-0000-0000-0000-000000000099','unlinked@example.test');
insert into public.responsible_accounts(user_id)
 select ('d1000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid from generate_series(1,17) n;
insert into public.passengers(id,user_id,name,default_daily_rate)
 select ('d2000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid,
        ('d1000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid, 'P'||n, 10 from generate_series(1,17) n;
insert into public.passenger_accounts(user_id,passenger_id,owner_user_id) values
 ('d1000000-0000-0000-0000-000000000098','d2000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001');

create temporary table results(label text, passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric, paid_amount numeric, amount_due numeric, refund_due numeric);
grant select,insert on results to authenticated;
create temporary table foreign_charge(id uuid);
grant select,insert on foreign_charge to authenticated;
create temporary table snap(label text, charge jsonb, events jsonb);
grant select,insert on snap to authenticated;

create function pg_temp.p(n int) returns uuid language sql as $$
 select ('d2000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid $$;
create function pg_temp.last(pid uuid) returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where c.passenger_id=pid order by c.period_end desc limit 1 $$;
-- Prep do cenário (ver cabeçalho). Roda como o responsável da sessão.
create function pg_temp.prep(pid uuid) returns void language plpgsql as $$ begin
 insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pid,'2025-11-05',90);
 perform public.close_month('2025-11-01');
 perform public.pay_charge((pg_temp.last(pid)).id,(pg_temp.last(pid)).revision);
 insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pid,'2025-11-20',180);
end $$;
create function pg_temp.reg(pid uuid, amount numeric) returns void language plpgsql as $$ begin
 perform public.register_payment((pg_temp.last(pid)).id,amount,(pg_temp.last(pid)).revision);
end $$;
-- Pagamento vigente mais recente que não foi cancelado.
create function pg_temp.latest_live(pid uuid) returns uuid language sql as $$
 select e.id from public.monthly_charge_events e where e.passenger_id=pid and e.kind='PAYMENT'
  and not exists(select 1 from public.monthly_charge_events x where x.related_payment_id=e.id and x.kind='CANCEL')
 order by e.revision desc limit 1 $$;
create function pg_temp.undo(pid uuid) returns void language plpgsql as $$ begin
 perform public.cancel_charge_payment((pg_temp.last(pid)).id,pg_temp.latest_live(pid));
end $$;
create function pg_temp.err(q text) returns text language plpgsql as $$
declare h text; begin execute q; return 'no error';
exception when others then get stacked diagnostics h = pg_exception_hint;
 return sqlstate||'|'||sqlerrm||'|'||coalesce(h,'');
end $$;
create function pg_temp.reg_sql(pid uuid, amount text, rev bigint) returns text language sql as $$
 select format('select public.register_payment(%L,%s,%s)',(pg_temp.last(pid)).id,amount,coalesce(rev::text,'null')) $$;
create function pg_temp.fotografa(lbl text, pid uuid) returns void language sql as $$
 insert into snap select lbl, to_jsonb(c),
  (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.monthly_charge_events e where e.passenger_id=pid)
 from public.monthly_charges c where c.id=(pg_temp.last(pid)).id $$;
create function pg_temp.nada_mudou(lbl text, pid uuid) returns boolean language sql as $$
 select (select charge from snap where label=lbl)=(select to_jsonb(c) from public.monthly_charges c where c.id=(pg_temp.last(pid)).id)
  and (select events from snap where label=lbl)=(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.monthly_charge_events e where e.passenger_id=pid) $$;

-- Estrutura e permissões --------------------------------------------------------------------
select ok(has_function_privilege('authenticated','public.register_payment(uuid,numeric,bigint)','EXECUTE'),'authenticated can call register_payment');
select ok(not has_function_privilege('anon','public.register_payment(uuid,numeric,bigint)','EXECUTE'),'anon cannot call register_payment');
select ok(not has_function_privilege('public','public.register_payment(uuid,numeric,bigint)','EXECUTE'),'public cannot call register_payment');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.register_payment(uuid,numeric,bigint)'::regprocedure),
 'register_payment is definer with a safe search_path');
select is((select pg_get_function_arguments('public.register_payment(uuid,numeric,bigint)'::regprocedure)),
 'target_charge uuid, payment_amount numeric, expected_revision bigint','register_payment signature');

set local role authenticated;

-- 1. Total vivo 270, pago 90: registra 100 ---------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000001';
do $$ begin perform pg_temp.prep(pg_temp.p(1)); end $$;
select is((pg_temp.last(pg_temp.p(1))).total_amount||'|'||(pg_temp.last(pg_temp.p(1))).paid_amount,'270.00|90.00','1: total 270 and paid 90 before');
insert into foreign_charge select (pg_temp.last(pg_temp.p(1))).id;
select pg_temp.fotografa('c1-before',pg_temp.p(1));
do $$ begin perform pg_temp.reg(pg_temp.p(1),100); end $$;
select is((pg_temp.last(pg_temp.p(1))).paid_amount,190.00::numeric,'1: paid 190');
select is((pg_temp.last(pg_temp.p(1))).total_amount-(pg_temp.last(pg_temp.p(1))).paid_amount,80.00::numeric,'1: 80 still due');
select is((pg_temp.last(pg_temp.p(1))).paid,false,'1: paid = false');
select is((pg_temp.last(pg_temp.p(1))).revision,((select charge->>'revision' from snap where label='c1-before')::bigint)+1,'1: revision +1');
select is((pg_temp.last(pg_temp.p(1))).active_payment_id,null::uuid,'1: active_payment_id stays null');
select is((select e.kind||'|'||e.signed_amount||'|'||coalesce(e.related_payment_id::text,'null')||'|'||e.revision
  from public.monthly_charge_events e where e.passenger_id=pg_temp.p(1) and e.kind='PAYMENT' order by e.occurred_at desc,e.revision desc limit 1),
 'PAYMENT|100.00|null|'||(select charge->>'revision' from snap where label='c1-before'),'1: one PAYMENT event, signed 100, no related payment, at the confirmed revision');
select is((pg_temp.last(pg_temp.p(1))).paid_at,(select e.occurred_at from public.monthly_charge_events e where e.passenger_id=pg_temp.p(1) and e.kind='PAYMENT' order by e.revision desc limit 1),'1: paid_at is the event occurred_at');
select ok(not exists(select 1 from snap s, jsonb_array_elements(s.events) e where s.label='c1-before'
  and not exists(select 1 from public.monthly_charge_events x where to_jsonb(x)=e)),'1 audit: earlier events untouched (append-only)');
select is((select count(*) from public.monthly_charge_events where passenger_id=pg_temp.p(1) and kind='REOPEN'),1::bigint,'1 audit: still only the REOPEN from the prep');

-- 2. Registra exatamente o que falta -----------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000002';
do $$ begin perform pg_temp.prep(pg_temp.p(2)); perform pg_temp.reg(pg_temp.p(2),180); end $$;
select is((pg_temp.last(pg_temp.p(2))).paid||'|'||(pg_temp.last(pg_temp.p(2))).paid_amount,'true|270.00','2: paying exactly the outstanding settles the charge');
select is((pg_temp.last(pg_temp.p(2))).total_amount-(pg_temp.last(pg_temp.p(2))).paid_amount,0.00::numeric,'2: nothing due');

-- 3. Dois adiantamentos seguidos (50 e 30) e desfazer um por vez ---------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000003';
do $$ begin perform pg_temp.prep(pg_temp.p(3)); perform pg_temp.reg(pg_temp.p(3),50); perform pg_temp.reg(pg_temp.p(3),30); end $$;
select is((pg_temp.last(pg_temp.p(3))).paid_amount,170.00::numeric,'3: paid 90+50+30');
select is((select count(distinct revision) from public.monthly_charge_events where passenger_id=pg_temp.p(3) and kind='PAYMENT' and signed_amount in (50,30)),2::bigint,'3: the two advances have distinct revisions');
do $$ begin perform pg_temp.undo(pg_temp.p(3)); end $$;
select is((pg_temp.last(pg_temp.p(3))).paid_amount,140.00::numeric,'3: first undo removes the 30');
do $$ begin perform pg_temp.undo(pg_temp.p(3)); end $$;
select is((pg_temp.last(pg_temp.p(3))).paid_amount,90.00::numeric,'3: second undo removes the 50');
select is((select string_agg(e.signed_amount::text,',' order by e.revision) from public.monthly_charge_events e where e.passenger_id=pg_temp.p(3) and e.kind='CANCEL'),'30.00,50.00','3: CANCEL events in the right order');

-- 4. Desfazer depois de um recálculo ------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000004';
do $$ begin perform pg_temp.prep(pg_temp.p(4)); perform pg_temp.reg(pg_temp.p(4),50); end $$;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pg_temp.p(4),'2025-11-25',40);
select is((pg_temp.last(pg_temp.p(4))).total_amount||'|'||(pg_temp.last(pg_temp.p(4))).paid_amount,'310.00|140.00','4: recalculation raises the total and keeps what was paid');
do $$ begin perform pg_temp.undo(pg_temp.p(4)); end $$;
select is((pg_temp.last(pg_temp.p(4))).total_amount||'|'||(pg_temp.last(pg_temp.p(4))).paid_amount,'310.00|90.00','4: undo after the recalculation removes only the 50');

-- 5. Valor acima do que falta ----------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000005';
do $$ begin perform pg_temp.prep(pg_temp.p(5)); end $$;
select pg_temp.fotografa('c5',pg_temp.p(5));
select throws_ok(pg_temp.reg_sql(pg_temp.p(5),'180.01',(pg_temp.last(pg_temp.p(5))).revision),'23514','PAYMENT_EXCEEDS_OUTSTANDING','5: above the outstanding is refused');
select alike(pg_temp.err(pg_temp.reg_sql(pg_temp.p(5),'180.01',(pg_temp.last(pg_temp.p(5))).revision)),'%180.00%','5: the HINT carries the outstanding value');
select ok(pg_temp.nada_mudou('c5',pg_temp.p(5)),'5: no event and no change');

-- 6. Valores inválidos --------------------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000006';
do $$ begin perform pg_temp.prep(pg_temp.p(6)); end $$;
select pg_temp.fotografa('c6',pg_temp.p(6));
select throws_ok(pg_temp.reg_sql(pg_temp.p(6),'0',(pg_temp.last(pg_temp.p(6))).revision),'23514','INVALID_PAYMENT_AMOUNT','6: zero');
select throws_ok(pg_temp.reg_sql(pg_temp.p(6),'-5',(pg_temp.last(pg_temp.p(6))).revision),'23514','INVALID_PAYMENT_AMOUNT','6: negative');
select throws_ok(pg_temp.reg_sql(pg_temp.p(6),'null',(pg_temp.last(pg_temp.p(6))).revision),'23514','INVALID_PAYMENT_AMOUNT','6: null');
select throws_ok(pg_temp.reg_sql(pg_temp.p(6),'''NaN''::numeric',(pg_temp.last(pg_temp.p(6))).revision),'23514','INVALID_PAYMENT_AMOUNT','6: NaN');
select throws_ok(pg_temp.reg_sql(pg_temp.p(6),'''Infinity''::numeric',(pg_temp.last(pg_temp.p(6))).revision),'23514','INVALID_PAYMENT_AMOUNT','6: infinity');
select throws_ok(pg_temp.reg_sql(pg_temp.p(6),'10.123',(pg_temp.last(pg_temp.p(6))).revision),'23514','INVALID_PAYMENT_AMOUNT','6: three decimal places');
select alike(pg_temp.err(pg_temp.reg_sql(pg_temp.p(6),'0',(pg_temp.last(pg_temp.p(6))).revision)),'%duas casas%','6: the HINT is in Portuguese');
select lives_ok(pg_temp.reg_sql(pg_temp.p(6),'10.10',(pg_temp.last(pg_temp.p(6))).revision),'6: two decimal places are fine');
select ok(not pg_temp.nada_mudou('c6',pg_temp.p(6)),'6: and only that last valid call changed anything');

-- 7, 8, 9. Sem obrigação ----------------------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000007';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pg_temp.p(7),'2025-11-05',0);
do $$ begin perform public.close_month('2025-11-01'); end $$;
select is((pg_temp.last(pg_temp.p(7))).total_amount,0.00::numeric,'7: live total zero');
select throws_ok(pg_temp.reg_sql(pg_temp.p(7),'10',(pg_temp.last(pg_temp.p(7))).revision),'23514','NO_OBLIGATION','7: total zero is NO_OBLIGATION');
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000008';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pg_temp.p(8),'2025-11-05',10);
insert into public.received_rides(user_id,passenger_id,received_date,amount) values(auth.uid(),pg_temp.p(8),'2025-11-06',30);
do $$ begin perform public.close_month('2025-11-01'); end $$;
select is((pg_temp.last(pg_temp.p(8))).total_amount,-20.00::numeric,'8: negative live total');
select throws_ok(pg_temp.reg_sql(pg_temp.p(8),'5',(pg_temp.last(pg_temp.p(8))).revision),'23514','NO_OBLIGATION','8: negative total (you owe the passenger) is NO_OBLIGATION');
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000009';
do $$ begin perform pg_temp.prep(pg_temp.p(9)); perform pg_temp.reg(pg_temp.p(9),180); end $$;
select throws_ok(pg_temp.reg_sql(pg_temp.p(9),'1',(pg_temp.last(pg_temp.p(9))).revision),'23514','NO_OBLIGATION','9: already settled is NO_OBLIGATION');

-- 10, 11. Diária nova depois do adiantamento ----------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000010';
do $$ begin perform pg_temp.prep(pg_temp.p(10)); perform pg_temp.reg(pg_temp.p(10),100); end $$;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pg_temp.p(10),'2025-11-25',50);
select is((pg_temp.last(pg_temp.p(10))).total_amount||'|'||(pg_temp.last(pg_temp.p(10))).paid_amount||'|'||(pg_temp.last(pg_temp.p(10))).paid,'320.00|190.00|false','10: the total rises, the paid amount is preserved');
select is((pg_temp.last(pg_temp.p(10))).total_amount-(pg_temp.last(pg_temp.p(10))).paid_amount,130.00::numeric,'10: the amount due rises to 130');
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000011';
do $$ begin perform pg_temp.prep(pg_temp.p(11)); perform pg_temp.reg(pg_temp.p(11),180); end $$;
select is((pg_temp.last(pg_temp.p(11))).paid,true,'11: settled before the new ride');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pg_temp.p(11),'2025-11-25',40);
select is((pg_temp.last(pg_temp.p(11))).paid||'|'||(pg_temp.last(pg_temp.p(11))).total_amount||'|'||(pg_temp.last(pg_temp.p(11))).paid_amount,'false|310.00|270.00','11: paid goes back to false, 40 due');
select is((select count(*) from public.monthly_charge_events where passenger_id=pg_temp.p(11) and kind='REOPEN'),1::bigint,'11 audit: no extra REOPEN (register_payment leaves no active payment)');

-- 12. Ciclo já encerrado (close_cycle) --------------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000012';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pg_temp.p(12),'2025-11-05',90);
insert into results select 'c12',* from public.close_cycle('2025-11-30');
select is((pg_temp.last(pg_temp.p(12))).extensible,false,'12: the cycle is closed, not extensible');
do $$ begin perform pg_temp.reg(pg_temp.p(12),40); end $$;
select is((pg_temp.last(pg_temp.p(12))).paid_amount||'|'||(pg_temp.last(pg_temp.p(12))).paid,'40.00|false','12: free-amount payment works on a closed cycle');

-- 13. pay_charge depois do registro ------------------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000013';
do $$ begin perform pg_temp.prep(pg_temp.p(13)); perform pg_temp.reg(pg_temp.p(13),100); end $$;
select is((pg_temp.last(pg_temp.p(13))).active_payment_id,null::uuid,'13: no active payment after register_payment');
do $$ begin perform public.pay_charge((pg_temp.last(pg_temp.p(13))).id,(pg_temp.last(pg_temp.p(13))).revision); end $$;
select is((select e.signed_amount from public.monthly_charge_events e where e.passenger_id=pg_temp.p(13) and e.kind='PAYMENT' order by e.occurred_at desc,e.revision desc limit 1),80.00::numeric,'13: pay_charge pays exactly the 80 that was missing');
select is((pg_temp.last(pg_temp.p(13))).paid||'|'||(pg_temp.last(pg_temp.p(13))).paid_amount,'true|270.00','13: settled');
select isnt((pg_temp.last(pg_temp.p(13))).active_payment_id,null::uuid,'13: pay_charge sets active_payment_id as before');

-- 14. Encerra (EXTENDED) depois de adiantar -------------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000014';
do $$ begin perform pg_temp.prep(pg_temp.p(14)); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id=pg_temp.p(14); set local role authenticated;
do $$ begin perform pg_temp.reg(pg_temp.p(14),100); end $$;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),pg_temp.p(14),'2025-12-02',130);
select is((pg_temp.last(pg_temp.p(14))).total_amount||'|'||(pg_temp.last(pg_temp.p(14))).paid_amount,'400.00|190.00','14: live total 400, advance preserved');
select pg_temp.fotografa('c14',pg_temp.p(14));
insert into results select 'c14',* from public.close_cycle('2025-12-02');
select is((select status||'|'||total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='c14'),'EXTENDED|400.00|190.00|210.00|0.00','14: closing keeps the paid amount; due = final total - paid');
select is((pg_temp.last(pg_temp.p(14))).paid_amount||'|'||(pg_temp.last(pg_temp.p(14))).paid,'190.00|false','14: stored paid amount preserved, not settled');
select is((select count(*) from public.monthly_charge_events where passenger_id=pg_temp.p(14) and kind='REOPEN'),1::bigint,'14 audit: no duplicated REOPEN');
select ok(not exists(select 1 from snap s, jsonb_array_elements(s.events) e where s.label='c14'
  and not exists(select 1 from public.monthly_charge_events x where to_jsonb(x)=e)),'14 audit: earlier events untouched');
select is((pg_temp.last(pg_temp.p(14))).revision,((select charge->>'revision' from snap where label='c14')::bigint)+1,'14 audit: closing bumps the revision once');
do $$ begin perform pg_temp.undo(pg_temp.p(14)); end $$;
select is((pg_temp.last(pg_temp.p(14))).paid_amount,90.00::numeric,'14: undo after the cycle was closed removes the 100');

-- 15. Adiantou demais e encerra ---------------------------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000015';
do $$ begin perform pg_temp.prep(pg_temp.p(15)); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id=pg_temp.p(15); set local role authenticated;
do $$ begin perform pg_temp.reg(pg_temp.p(15),180); end $$;
insert into public.received_rides(user_id,passenger_id,received_date,amount) values(auth.uid(),pg_temp.p(15),'2025-12-02',20);
insert into results select 'c15',* from public.close_cycle('2025-12-02');
select is((select total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='c15'),'250.00|270.00|0.00|20.00','15: advanced too much, closing leaves a refund of 20');
select is((pg_temp.last(pg_temp.p(15))).paid,true,'15: settled with a refund');

-- 16. Revisão velha e repetição ------------------------------------------------------------------------------------------
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000016';
do $$ begin perform pg_temp.prep(pg_temp.p(16)); end $$;
select pg_temp.fotografa('c16',pg_temp.p(16));
select throws_ok(pg_temp.reg_sql(pg_temp.p(16),'10',(pg_temp.last(pg_temp.p(16))).revision-1),'40001','STALE_OBLIGATION','16: old revision is STALE_OBLIGATION');
select throws_ok(pg_temp.reg_sql(pg_temp.p(16),'10',null),'40001','STALE_OBLIGATION','16: null revision is STALE_OBLIGATION');
select ok(pg_temp.nada_mudou('c16',pg_temp.p(16)),'16: a stale call changes nothing');
create temporary table rep(q text);
grant select,insert on rep to authenticated;
insert into rep select pg_temp.reg_sql(pg_temp.p(16),'10',(pg_temp.last(pg_temp.p(16))).revision);
select lives_ok((select q from rep),'16: the first request goes through');
select throws_ok((select q from rep),'40001','STALE_OBLIGATION','16: repeating the same request with the same revision is STALE_OBLIGATION');
select is((select count(*) from public.monthly_charge_events where passenger_id=pg_temp.p(16) and kind='PAYMENT' and signed_amount=10),1::bigint,'16: the payment was not duplicated');
select is((pg_temp.last(pg_temp.p(16))).paid_amount,100.00::numeric,'16: paid 90+10');

-- 17. Cobrança de outro responsável ----------------------------------------------------------------------------------------
select throws_ok(format('select public.register_payment(%L,10,1)',(select id from foreign_charge)),'42501','FINANCIAL_FORBIDDEN',
 '17: a charge of another responsible cannot be paid');
select throws_ok(format('select public.register_payment(%L,10,1)','00000000-0000-0000-0000-000000000000'),'42501','FINANCIAL_FORBIDDEN','17: unknown charge is FINANCIAL_FORBIDDEN');

-- Permissões ----------------------------------------------------------------------------------------------------------------
reset role; set local role authenticated;
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000098';
select throws_ok(format('select public.register_payment(%L,10,1)',gen_random_uuid()),'42501','FINANCIAL_FORBIDDEN','linked passenger cannot register_payment');
set local request.jwt.claim.sub='d1000000-0000-0000-0000-000000000099';
select throws_ok(format('select public.register_payment(%L,10,1)',gen_random_uuid()),'42501','FINANCIAL_FORBIDDEN','user without a responsible account cannot register_payment');
reset role;
set local role anon;
select throws_ok(format('select public.register_payment(%L,10,1)',gen_random_uuid()),'42501',null,'anonymous cannot register_payment');
reset role;

select * from finish();
rollback;
