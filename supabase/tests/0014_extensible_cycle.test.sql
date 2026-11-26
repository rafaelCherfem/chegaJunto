-- Disposable local database only. Synthetic fixture; entire transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

-- Um responsável (e um passageiro) por cenário, para um close_cycle não mexer nos outros.
-- Diária de 270 em 05/11 = "total 270" etc. Todas as datas são de 2025 (nunca futuras).
--  O1 A: total 270, pago 90, sem mais movimento     O2 B: total sobe para 400, pago 90
--  O3 C: adiantou 270, total sobe para 400          O4 D: compensação baixa o total para 250
--  O5 E: pago exatamente igual ao total             O6 F: encerra antes do period_end antigo
--  O7 G: sem movimento novo, revisão, preview       O8 H: última cobrança não extensível
--  O9 I: total vivo, pay_charge e cancel            O10 J: close_month recusa (O11: sem extensível)
--  O12 K: validações da data                         O13 L: todos pulados
insert into auth.users(id,email)
 select ('f1000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid, 'x'||n||'@example.test' from generate_series(1,13) n;
insert into auth.users(id,email) values
 ('f1000000-0000-0000-0000-000000000098','passenger-login@example.test'),
 ('f1000000-0000-0000-0000-000000000099','unlinked@example.test');
insert into public.responsible_accounts(user_id)
 select ('f1000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid from generate_series(1,13) n;
insert into public.passengers(id,user_id,name,default_daily_rate)
 select ('f2000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid,
        ('f1000000-0000-0000-0000-0000000000'||lpad(n::text,2,'0'))::uuid, 'P'||n, 10 from generate_series(1,13) n;
insert into public.passenger_accounts(user_id,passenger_id,owner_user_id) values
 ('f1000000-0000-0000-0000-000000000098','f2000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001');

create temporary table results(label text, passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric, paid_amount numeric, amount_due numeric, refund_due numeric);
grant select,insert on results to authenticated;
create temporary table snap(label text, charge jsonb, events jsonb);
grant select,insert on snap to authenticated;
create temporary table counts(label text, charges bigint, events bigint, rides bigint, received bigint);
grant select,insert on counts to authenticated;

-- Última cobrança do passageiro (maior period_end).
create function pg_temp.last(pid uuid) returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where c.passenger_id=pid order by c.period_end desc limit 1 $$;
create function pg_temp.pay(pid uuid) returns void language sql as $$
 select public.pay_charge(c.id,c.revision) from public.monthly_charges c where c.id=(pg_temp.last(pid)).id $$;
create function pg_temp.err(q text) returns text language plpgsql as $$
declare h text; begin execute q; return 'no error';
exception when others then get stacked diagnostics h = pg_exception_hint;
 return sqlstate||'|'||sqlerrm||'|'||coalesce(h,'');
end $$;
create function pg_temp.today() returns date language sql as $$
 select (clock_timestamp() at time zone 'America/Sao_Paulo')::date $$;
create function pg_temp.reopens(pid uuid) returns bigint language sql as $$
 select count(*) from public.monthly_charge_events e where e.passenger_id=pid and e.kind='REOPEN' $$;
create function pg_temp.fotografa(lbl text, pid uuid) returns void language sql as $$
 insert into snap select lbl, to_jsonb(c),
  (select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb) from public.monthly_charge_events e where e.monthly_charge_id=c.id)
 from public.monthly_charges c where c.id=(pg_temp.last(pid)).id $$;
create function pg_temp.contagem(lbl text, owner uuid) returns void language sql as $$
 insert into counts select lbl,
  (select count(*) from public.monthly_charges where user_id=owner),
  (select count(*) from public.monthly_charge_events where user_id=owner),
  (select count(*) from public.rides where user_id=owner),
  (select count(*) from public.received_rides where user_id=owner) $$;

-- Estrutura e permissões --------------------------------------------------------------------
select has_column('public','monthly_charges','extensible','monthly_charges.extensible exists');
select col_type_is('public','monthly_charges','extensible','boolean','extensible is boolean');
select col_not_null('public','monthly_charges','extensible','extensible is not null');
select col_default_is('public','monthly_charges','extensible','false','extensible defaults to false');
select is((select count(*) from public.monthly_charges where extensible),0::bigint,'no existing row is extensible after the migration');
select ok(has_function_privilege('authenticated','public.close_cycle(date)','EXECUTE')
 and has_function_privilege('authenticated','public.preview_cycle(date)','EXECUTE'),'authenticated can call close_cycle and preview_cycle');
select ok(not has_function_privilege('anon','public.close_cycle(date)','EXECUTE')
 and not has_function_privilege('anon','public.preview_cycle(date)','EXECUTE'),'anon cannot call close_cycle nor preview_cycle');
select ok(not has_function_privilege('public','public.close_cycle(date)','EXECUTE')
 and not has_function_privilege('public','public.preview_cycle(date)','EXECUTE'),'public cannot call close_cycle nor preview_cycle');
select ok(not has_function_privilege('anon','public.cycle_plan(uuid,date)','EXECUTE')
 and not has_function_privilege('authenticated','public.cycle_plan(uuid,date)','EXECUTE'),'cycle_plan is internal');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
 where oid in ('public.close_cycle(date)'::regprocedure,'public.preview_cycle(date)'::regprocedure,'public.cycle_plan(uuid,date)'::regprocedure)),
 'cycle functions are definer with a safe search_path');
select is((select proargnames from pg_proc where oid='public.close_cycle(date)'::regprocedure),
 array['end_date','passenger_id','status','reason','charge_id','period_start','period_end','total_amount','paid_amount','amount_due','refund_due'],
 'close_cycle keeps the old columns, in order, and appends the new ones');
select is((select proargnames from pg_proc where oid='public.preview_cycle(date)'::regprocedure),
 array['end_date','passenger_id','status','reason','charge_id','period_start','period_end','total_amount','paid_amount','amount_due','refund_due'],
 'preview_cycle keeps the old columns, in order, and appends the new ones');

set local role authenticated;

-- Prepara um ciclo extensível: diária(s) de novembro, close_month, pagamento opcional, marca.
-- A marcação é um UPDATE privilegiado (o cliente não grava em monthly_charges).

-- A. Total 270, pago 90, sem mais movimento --------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000001';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000001','2025-11-05',90);
do $$ begin perform public.close_month('2025-11-01'); end $$;
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000001'); end $$;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000001','2025-11-20',180);
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000001'; set local role authenticated;
select is((pg_temp.last('f2000000-0000-0000-0000-000000000001')).total_amount,270.00::numeric,'A: total 270 before closing');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000001')).paid_amount,90.00::numeric,'A: paid 90 before closing');
insert into results select 'a',* from public.close_cycle('2025-11-30');
select is((select status||'|'||period_start||'|'||period_end||'|'||total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='a'),
 'EXTENDED|2025-11-01|2025-11-30|270.00|90.00|180.00|0.00','A: summary EXTENDED, total 270, paid 90, due 180');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000001')).paid,false,'A: still unpaid');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000001')).paid_amount,90.00::numeric,'A: paid_amount preserved');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000001')).extensible,false,'A: no longer extensible');
select is((select count(*) from public.monthly_charges where passenger_id='f2000000-0000-0000-0000-000000000001'),1::bigint,'A: no new charge was created');
select is((select charge_id from results where label='a'),(pg_temp.last('f2000000-0000-0000-0000-000000000001')).id,'A: the summary carries the extended charge id');

-- B. Total sobe para 400, pago 90 -----------------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000002';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000002','2025-11-05',90);
do $$ begin perform public.close_month('2025-11-01'); end $$;
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000002'); end $$;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000002','2025-11-20',180);
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000002'; set local role authenticated;
-- Total vivo: diária depois do period_end antigo atualiza o total gravado.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000002','2025-12-02',130);
select is((pg_temp.last('f2000000-0000-0000-0000-000000000002')).total_amount,400.00::numeric,'B: a ride after the old period_end updates the stored total (live total)');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000002')).paid_amount,90.00::numeric,'B: paid_amount kept by the live total');
insert into results select 'b',* from public.close_cycle('2025-12-02');
select is((select status||'|'||period_start||'|'||period_end||'|'||total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='b'),
 'EXTENDED|2025-11-01|2025-12-02|400.00|90.00|310.00|0.00','B: total 400, paid 90, due 310');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000002')).period_end,'2025-12-02'::date,'B: period extended to the chosen date');

-- C. Adiantou 270 e o total sobe para 400 ---------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000003';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000003','2025-11-05',270);
do $$ begin perform public.close_month('2025-11-01'); end $$;
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000003'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000003'; set local role authenticated;
select is((pg_temp.last('f2000000-0000-0000-0000-000000000003')).paid,true,'C: paid before the new ride');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000003','2025-12-02',130);
select is((pg_temp.last('f2000000-0000-0000-0000-000000000003')).paid,false,'C: reopened by the live total');
select is(pg_temp.reopens('f2000000-0000-0000-0000-000000000003'),1::bigint,'C: exactly one REOPEN before closing');
do $$ begin perform pg_temp.fotografa('c-before','f2000000-0000-0000-0000-000000000003'); end $$;
insert into results select 'c',* from public.close_cycle('2025-12-02');
select is((select status||'|'||total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='c'),
 'EXTENDED|400.00|270.00|130.00|0.00','C: total 400, paid 270, due 130');
select is(pg_temp.reopens('f2000000-0000-0000-0000-000000000003'),1::bigint,'C audit: closing the cycle does not duplicate the REOPEN');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000003')).revision,((select charge->>'revision' from snap where label='c-before')::bigint)+1,
 'C audit: the revision rises by one when the period changes');
select ok(not exists(select 1 from snap s, jsonb_array_elements(s.events) e where s.label='c-before'
  and not exists(select 1 from public.monthly_charge_events x where to_jsonb(x)=e)),'C audit: earlier events are untouched (append-only)');

-- D. Pago 270 e uma compensação baixa o total para 250 ----------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000004';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000004','2025-11-05',270);
do $$ begin perform public.close_month('2025-11-01'); end $$;
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000004'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000004'; set local role authenticated;
insert into public.received_rides(user_id,passenger_id,received_date,amount) values(auth.uid(),'f2000000-0000-0000-0000-000000000004','2025-12-02',20);
select is((pg_temp.last('f2000000-0000-0000-0000-000000000004')).total_amount,250.00::numeric,'D: the compensation lowers the live total to 250');
insert into results select 'd',* from public.close_cycle('2025-12-02');
select is((select total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='d'),'250.00|270.00|0.00|20.00','D: refund of 20, nothing due');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000004')).paid,true,'D: paid = true');

-- E. Pago exatamente igual ao total -----------------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000005';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000005','2025-11-05',270);
do $$ begin perform public.close_month('2025-11-01'); end $$;
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000005'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000005'; set local role authenticated;
insert into results select 'e',* from public.close_cycle('2025-11-30');
select is((select total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='e'),'270.00|270.00|0.00|0.00','E: paid equals total, nothing due, no refund');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000005')).paid,true,'E: paid = true');

-- F. Encerra antes do period_end antigo (25/11, com diária em 28/11) ---------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000006';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'f2000000-0000-0000-0000-000000000006','2025-11-05',270),
 (auth.uid(),'f2000000-0000-0000-0000-000000000006','2025-11-28',30);
do $$ begin perform public.close_month('2025-11-01'); end $$;
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000006'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000006'; set local role authenticated;
select is((pg_temp.last('f2000000-0000-0000-0000-000000000006')).paid_amount,300.00::numeric,'F: paid 300 before closing early');
insert into results select 'f',* from public.close_cycle('2025-11-25');
select is((select status||'|'||period_end||'|'||total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='f'),
 'EXTENDED|2025-11-25|270.00|300.00|0.00|30.00','F: total without the 28/11 ride; paid above the total becomes a refund of 30');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000006')).period_end,'2025-11-25'::date,'F: the period shrank to the chosen date');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000006')).paid,true,'F: paid = true (settled with a refund)');
insert into results select 'f2',* from public.close_cycle('2025-11-30');
select is((select status||'|'||period_start||'|'||period_end||'|'||total_amount||'|'||paid_amount||'|'||amount_due from results where label='f2'),
 'CLOSED|2025-11-26|2025-11-30|30.00|0.00|30.00','F: the 28/11 ride goes to the next cycle, which starts the next day, with nothing paid');

-- G. Sem movimento novo; revisão; preview sem gravar ------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000007';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000007','2025-11-05',270);
do $$ begin perform public.close_month('2025-11-01'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000007'; set local role authenticated;
do $$ begin perform pg_temp.fotografa('g-before','f2000000-0000-0000-0000-000000000007'); end $$;
do $$ begin perform pg_temp.contagem('g-before','f1000000-0000-0000-0000-000000000007'); end $$;
insert into results select 'g-prev',* from public.preview_cycle('2025-11-30');
do $$ begin perform pg_temp.contagem('g-after-preview','f1000000-0000-0000-0000-000000000007'); end $$;
select is((select count(*) from (select charges,events,rides,received from counts where label='g-before'
  except select charges,events,rides,received from counts where label='g-after-preview') d),0::bigint,'G: preview_cycle writes nothing (counts before and after)');
select ok((select charge from snap where label='g-before')=(select to_jsonb(c) from public.monthly_charges c where c.passenger_id='f2000000-0000-0000-0000-000000000007'),
 'G: preview_cycle leaves the charge row identical');
select is((select status||'|'||total_amount||'|'||paid_amount from results where label='g-prev'),'EXTENDED|270.00|0.00','G: preview says EXTENDED with the same total, with no new movement');
insert into results select 'g',* from public.close_cycle('2025-11-30');
select is((select count(*) from (select passenger_id,status,reason,charge_id,period_start,period_end,total_amount,paid_amount,amount_due,refund_due from results where label='g-prev'
  except select passenger_id,status,reason,charge_id,period_start,period_end,total_amount,paid_amount,amount_due,refund_due from results where label='g') d),0::bigint,
 'G: preview_cycle returns exactly what close_cycle then does');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000007')).total_amount,270.00::numeric,'G: total unchanged');
select is((select count(*) from public.monthly_charges where passenger_id='f2000000-0000-0000-0000-000000000007'),1::bigint,'G: close_cycle never creates a new charge for an extensible passenger');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000007')).revision,((select charge->>'revision' from snap where label='g-before')::bigint)+1,'G: the revision rose even with an equal total');
select throws_ok(format('select public.pay_charge(%L,%s)',(pg_temp.last('f2000000-0000-0000-0000-000000000007')).id,(select charge->>'revision' from snap where label='g-before')),
 '40001','STALE_OBLIGATION','G: a confirmation made before the cycle was closed falls into STALE_OBLIGATION');

-- H. Última cobrança NÃO extensível: ciclo novo no dia seguinte, pago zero --------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000008';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000008','2025-11-05',100);
do $$ begin perform public.close_month('2025-11-01'); end $$;
select is((pg_temp.last('f2000000-0000-0000-0000-000000000008')).extensible,false,'H: close_month creates non-extensible charges');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000008','2025-12-03',50);
select is((pg_temp.last('f2000000-0000-0000-0000-000000000008')).total_amount,100.00::numeric,'H: a non-extensible charge ignores rides after its period_end (identical to before)');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000008')).revision,1::bigint,'H: and its revision does not move');
do $$ begin perform pg_temp.fotografa('h-before','f2000000-0000-0000-0000-000000000008'); end $$;
insert into results select 'h',* from public.close_cycle('2025-12-05');
select is((select status||'|'||period_start||'|'||period_end||'|'||total_amount||'|'||paid_amount||'|'||amount_due||'|'||refund_due from results where label='h'),
 'CLOSED|2025-12-01|2025-12-05|50.00|0.00|50.00|0.00','H: a new cycle on the next day, nothing paid');
select is((select count(*) from public.monthly_charges where passenger_id='f2000000-0000-0000-0000-000000000008'),2::bigint,'H: a second charge exists');
select is((select extensible from public.monthly_charges where id=(select charge_id from results where label='h')),false,'H: close_cycle creates non-extensible charges');
select ok((select charge from snap where label='h-before')=(select to_jsonb(c) from public.monthly_charges c where c.passenger_id='f2000000-0000-0000-0000-000000000008' and c.period_start='2025-11-01'),
 'H: the November charge stays identical');

-- I. Total vivo: pay_charge paga o que falta; cancel_charge_payment desfaz um por vez ----------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000009';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000009','2025-11-05',270);
do $$ begin perform public.close_month('2025-11-01'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000009'; set local role authenticated;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000009','2025-12-02',130);
select is((pg_temp.last('f2000000-0000-0000-0000-000000000009')).total_amount,400.00::numeric,'I: live total 400 after a ride past the old period_end');
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000009'); end $$;
select is((pg_temp.last('f2000000-0000-0000-0000-000000000009')).paid_amount,400.00::numeric,'I: pay_charge pays exactly the outstanding 400');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000009','2025-12-03',50);
select is((pg_temp.last('f2000000-0000-0000-0000-000000000009')).total_amount,450.00::numeric,'I: live total 450');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000009')).paid,false,'I: reopened for the missing 50');
do $$ begin perform pg_temp.pay('f2000000-0000-0000-0000-000000000009'); end $$;
select is((select signed_amount from public.monthly_charge_events where passenger_id='f2000000-0000-0000-0000-000000000009' and kind='PAYMENT' order by revision desc limit 1),50.00::numeric,'I: the second payment is exactly the 50 that was missing');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000009')).paid_amount,450.00::numeric,'I: paid 450');
do $$ begin perform public.cancel_charge_payment((pg_temp.last('f2000000-0000-0000-0000-000000000009')).id,(pg_temp.last('f2000000-0000-0000-0000-000000000009')).active_payment_id); end $$;
select is((pg_temp.last('f2000000-0000-0000-0000-000000000009')).paid_amount||'|'||(pg_temp.last('f2000000-0000-0000-0000-000000000009')).total_amount,'400.00|450.00','I: first cancel undoes only the 50; the total does not go back to the old value');
do $$ begin perform public.cancel_charge_payment((pg_temp.last('f2000000-0000-0000-0000-000000000009')).id,
 (select e.id from public.monthly_charge_events e where e.passenger_id='f2000000-0000-0000-0000-000000000009' and e.kind='PAYMENT'
   and not exists(select 1 from public.monthly_charge_events x where x.related_payment_id=e.id and x.kind='CANCEL') order by e.revision desc limit 1)); end $$;
select is((pg_temp.last('f2000000-0000-0000-0000-000000000009')).paid_amount||'|'||(pg_temp.last('f2000000-0000-0000-0000-000000000009')).total_amount,'0.00|450.00','I: second cancel undoes the 400; still total 450');
select is((select count(*) from public.monthly_charge_events where passenger_id='f2000000-0000-0000-0000-000000000009' and kind='CANCEL'),2::bigint,'I: one CANCEL event per payment');

-- J. close_month recusa com ciclo extensível ---------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000010';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000010','2025-11-05',100);
do $$ begin perform public.close_month('2025-11-01'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000010'; set local role authenticated;
select throws_ok($$select * from public.close_month('2025-12-01')$$,'23514','EXTENSIBLE_CYCLE_OPEN','J: close_month refuses while there is an extensible cycle');
select alike(pg_temp.err($$select * from public.close_month('2025-12-01')$$),'%Encerre o ciclo%','J: the HINT is in Portuguese');
select is((select count(*) from public.monthly_charges where passenger_id='f2000000-0000-0000-0000-000000000010'),1::bigint,'J: no December month was created');
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000011';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000011','2025-11-05',100);
select is((select count(*) from public.close_month('2025-11-01')),1::bigint,'J: close_month still works for an owner with no extensible cycle');

-- K. Validações da data -------------------------------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000012';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000012','2025-11-05',100);
do $$ begin perform public.close_month('2025-11-01'); end $$;
reset role; update public.monthly_charges set extensible=true where passenger_id='f2000000-0000-0000-0000-000000000012'; set local role authenticated;
do $$ begin perform pg_temp.contagem('k-before','f1000000-0000-0000-0000-000000000012'); end $$;
select throws_ok($$select * from public.close_cycle('2025-10-31')$$,'23514','INVALID_CYCLE_END','K: end date before the period_start is INVALID_CYCLE_END');
select throws_ok($$select * from public.preview_cycle('2025-10-31')$$,'23514','INVALID_CYCLE_END','K: preview has the same validation');
select throws_ok(format('select * from public.close_cycle(%L)',pg_temp.today()+1),'23514','FUTURE_DATE','K: a future date is FUTURE_DATE for an extensible cycle');
select lives_ok(format('select * from public.preview_cycle(%L)',pg_temp.today()),'K: today is accepted');
do $$ begin perform pg_temp.contagem('k-after','f1000000-0000-0000-0000-000000000012'); end $$;
select is((select count(*) from (select charges,events,rides,received from counts where label='k-before'
  except select charges,events,rides,received from counts where label='k-after') d),0::bigint,'K: refused and preview calls wrote nothing');
select is((pg_temp.last('f2000000-0000-0000-0000-000000000012')).extensible,true,'K: the cycle is still open after the refusals');

-- L. Todos pulados continua INVALID_CYCLE_END ------------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000013';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(auth.uid(),'f2000000-0000-0000-0000-000000000013','2025-11-05',100);
do $$ begin perform public.close_month('2025-11-01'); end $$;
select throws_ok($$select * from public.close_cycle('2025-11-30')$$,'23514','INVALID_CYCLE_END','L: every passenger already closed until the date is still INVALID_CYCLE_END');

-- Permissões ------------------------------------------------------------------------------------------
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000098';
select throws_ok($$select * from public.close_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','linked passenger cannot close_cycle');
select throws_ok($$select * from public.preview_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','linked passenger cannot preview_cycle');
set local request.jwt.claim.sub='f1000000-0000-0000-0000-000000000099';
select throws_ok($$select * from public.close_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','user without a responsible account cannot close_cycle');
select throws_ok($$select * from public.preview_cycle('2025-12-06')$$,'42501','FINANCIAL_FORBIDDEN','user without a responsible account cannot preview_cycle');
reset role;
set local role anon;
select throws_ok($$select * from public.close_cycle('2025-12-06')$$,'42501',null,'anonymous cannot close_cycle');
select throws_ok($$select * from public.preview_cycle('2025-12-06')$$,'42501',null,'anonymous cannot preview_cycle');
reset role;

select * from finish();
rollback;
