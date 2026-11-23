-- Golden de compatibilidade do fechamento mensal.
--
-- Monta um histórico com close_month, recalculate_charge, diárias e compensações
-- (inserir, mudar a data entre meses, mudar o valor, apagar), pagamento parcial e
-- saldo a devolver, e compara o estado das cobranças depois de cada passo com
-- valores gravados rodando este mesmo arquivo contra o banco na migração 0011,
-- antes de qualquer mudança da 0012. Se o comportamento do caminho mensal mudar,
-- o diff aparece linha a linha.
--
-- O que entra no golden: total, valor pago, situação, revision, se há pagamento
-- ativo, se há data de pagamento e a contagem de eventos por tipo. Timestamps ficam
-- de fora de propósito (dependem do relógio).
--
-- Regra de montagem: nenhuma data é inserida ou movida para antes do primeiro ciclo
-- do passageiro, para o cenário valer antes e depois da rejeição de retroativas.
-- Banco local descartável; a transação inteira é desfeita no fim.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,email) values
 ('c1000000-0000-0000-0000-000000000001','golden-owner@example.test'),
 ('c1000000-0000-0000-0000-000000000002','golden-other@example.test');
insert into public.responsible_accounts(user_id) values
 ('c1000000-0000-0000-0000-000000000001'),('c1000000-0000-0000-0000-000000000002');
insert into public.passengers(id,user_id,name,default_daily_rate) values
 ('c2000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','Golden P',10),
 ('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000001','Golden Q',20),
 ('c2000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000002','Golden foreign',10);

create temporary table trace(seq serial primary key,line text not null);

-- Fotografia das cobranças do dono. Roda como definidor para ler a tabela e
-- escrever no rastro, qualquer que seja o papel de quem chama.
create function pg_temp.snap(label text) returns void language sql security definer set search_path='' as $$
 insert into pg_temp.trace(line)
 select label||' | '||p.name||' '||c.reference_month
  ||' | total='||c.total_amount||' paid_amount='||c.paid_amount||' paid='||c.paid||' rev='||c.revision
  ||' active='||(c.active_payment_id is not null)||' paid_at='||(c.paid_at is not null)
  ||' events='||coalesce((select string_agg(x.k||':'||x.n,',' order by x.k)
     from (select e.kind k,count(*) n from public.monthly_charge_events e where e.monthly_charge_id=c.id group by e.kind) x),'-')
 from public.monthly_charges c join public.passengers p on p.id=c.passenger_id
 where c.user_id='c1000000-0000-0000-0000-000000000001'
 order by p.name,c.reference_month
$$;
create function pg_temp.note(line text) returns void language sql security definer set search_path='' as $$
 insert into pg_temp.trace(line) values(line)
$$;
create function pg_temp.c(pid uuid, ref date) returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where passenger_id=pid and reference_month=ref $$;
create function pg_temp.last_payment(pid uuid, ref date) returns uuid language sql as $$
 select e.id from public.monthly_charge_events e where e.monthly_charge_id=(pg_temp.c(pid,ref)).id and e.kind='PAYMENT'
 order by e.revision desc,e.occurred_at desc limit 1 $$;

set local role authenticated;
set local request.jwt.claim.sub='c1000000-0000-0000-0000-000000000001';

-- 1. Movimento inicial, ainda sem nenhum fechamento.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2024-12-30',10),
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2024-12-31',10),
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-01-01',10),
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-01-15',10),
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-02-10',10),
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-03-05',10),
 (auth.uid(),'c2000000-0000-0000-0000-000000000002','2025-01-12',20);
insert into public.received_rides(user_id,passenger_id,received_date,amount) values
 (auth.uid(),'c2000000-0000-0000-0000-000000000002','2025-01-10',7);
select pg_temp.snap('01 before any close');

-- 2. close_month: só quem tem movimento no mês recebe cobrança.
select pg_temp.note('02 close_month 2024-12 returns '||coalesce((select string_agg(p.name||'='||r.total_amount,',' order by p.name)
 from public.close_month('2024-12-01') r join public.passengers p on p.id=r.passenger_id),'nothing'));
select pg_temp.note('03 close_month 2025-01 returns '||coalesce((select string_agg(p.name||'='||r.total_amount,',' order by p.name)
 from public.close_month('2025-01-01') r join public.passengers p on p.id=r.passenger_id),'nothing'));
select pg_temp.snap('03 after closing Dec and Jan');
select pg_temp.note('04 close_month 2025-01 again returns '||(select count(*) from public.close_month('2025-01-01'))||' rows');
select pg_temp.snap('04 close repeated');

-- 3. Diárias em mês fechado: inserir, mudar valor, mover entre meses, apagar.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-01-20',10);
select pg_temp.snap('05 insert ride in closed Jan');
update public.rides set rate_charged=12 where ride_date='2025-01-15' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('06 ride value changed in closed Jan');
update public.rides set ride_date='2025-02-15' where ride_date='2025-01-15' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('07 ride moved from closed Jan to open Feb');
update public.rides set ride_date='2025-01-16' where ride_date='2025-02-15' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('08 ride moved from open Feb back to closed Jan');
update public.rides set ride_date='2025-01-02' where ride_date='2024-12-31' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('09 ride moved from closed Dec to closed Jan (month boundary)');
update public.rides set ride_date='2024-12-31' where ride_date='2025-01-02' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('10 ride moved back from Jan to Dec');
update public.rides set ride_date='2024-12-29' where ride_date='2024-12-30' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('11 ride moved inside closed Dec');
delete from public.rides where ride_date='2025-01-20' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('12 ride deleted from closed Jan');

-- 4. Compensação em mês fechado: inserir, mover entre meses, apagar.
insert into public.received_rides(user_id,passenger_id,received_date,amount)
values(auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-01-18',4);
select pg_temp.snap('13 compensation inserted in closed Jan');
update public.received_rides set received_date='2025-02-18' where received_date='2025-01-18' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('14 compensation moved from closed Jan to open Feb');
update public.received_rides set received_date='2024-12-18' where received_date='2025-02-18' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('15 compensation moved from open Feb to closed Dec');
delete from public.received_rides where received_date='2024-12-18' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('16 compensation deleted from closed Dec');

-- 5. Pagamento parcial e saldo a devolver (P em janeiro).
select ok((public.pay_charge((pg_temp.c('c2000000-0000-0000-0000-000000000001','2025-01-01')).id,
 (pg_temp.c('c2000000-0000-0000-0000-000000000001','2025-01-01')).revision)).paid,'pay P January');
select pg_temp.snap('17 P Jan paid');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-01-25',10);
select pg_temp.snap('18 ride after payment: partial, only the difference is owed');
select ok((public.pay_charge((pg_temp.c('c2000000-0000-0000-0000-000000000001','2025-01-01')).id,
 (pg_temp.c('c2000000-0000-0000-0000-000000000001','2025-01-01')).revision)).paid,'pay the difference');
select pg_temp.snap('19 difference paid');
delete from public.rides where ride_date='2025-01-25' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('20 ride removed after full payment: refund balance');
insert into public.received_rides(user_id,passenger_id,received_date,amount)
values(auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-01-26',30);
select pg_temp.snap('21 compensation larger than the total: bigger refund balance');
select ok(not (public.cancel_charge_payment((pg_temp.c('c2000000-0000-0000-0000-000000000001','2025-01-01')).id,
 pg_temp.last_payment('c2000000-0000-0000-0000-000000000001','2025-01-01'))).paid,'undo the latest payment');
select pg_temp.snap('22 latest payment undone');
delete from public.received_rides where received_date='2025-01-26' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('23 compensation removed');

-- 6. Total negativo (Q em janeiro): a devolução é o pagamento negativo.
select ok((public.pay_charge((pg_temp.c('c2000000-0000-0000-0000-000000000002','2025-01-01')).id,
 (pg_temp.c('c2000000-0000-0000-0000-000000000002','2025-01-01')).revision)).paid,'pay Q January');
insert into public.received_rides(user_id,passenger_id,received_date,amount)
values(auth.uid(),'c2000000-0000-0000-0000-000000000002','2025-01-28',50);
select pg_temp.snap('24 Q Jan negative total, still owed back');
select ok((public.pay_charge((pg_temp.c('c2000000-0000-0000-0000-000000000002','2025-01-01')).id,
 (pg_temp.c('c2000000-0000-0000-0000-000000000002','2025-01-01')).revision)).paid,'refund Q');
select pg_temp.snap('25 Q Jan refunded');

-- 7. Mês aberto: nada é criado nem recalculado até alguém fechar.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-02-11',10),
 (auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-02-12',10);
update public.rides set ride_date='2025-02-13' where ride_date='2025-02-12' and passenger_id='c2000000-0000-0000-0000-000000000001';
update public.rides set ride_date='2025-03-13' where ride_date='2025-02-13' and passenger_id='c2000000-0000-0000-0000-000000000001';
delete from public.rides where ride_date='2025-02-11' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('26 open months untouched (no Feb or Mar charge yet)');

-- 8. recalculate_charge cria a cobrança do mês aberto e, depois dela, o gatilho a mantém.
select pg_temp.note('27 recalculate P Feb total '||(public.recalculate_charge('c2000000-0000-0000-0000-000000000001','2025-02-01')).total_amount);
select pg_temp.note('27 recalculate Q Feb total '||(public.recalculate_charge('c2000000-0000-0000-0000-000000000002','2025-02-01')).total_amount);
select pg_temp.snap('27 Feb charges created by recalculate_charge (Q empty and settled)');
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'c2000000-0000-0000-0000-000000000001','2025-02-20',10);
select pg_temp.snap('28 ride in Feb after its charge exists');
update public.rides set ride_date='2025-03-20' where ride_date='2025-02-20' and passenger_id='c2000000-0000-0000-0000-000000000001';
select pg_temp.snap('29 ride moved from closed Feb to open Mar');
select pg_temp.note('30 close_month 2025-03 returns '||coalesce((select string_agg(p.name||'='||r.total_amount,',' order by p.name)
 from public.close_month('2025-03-01') r join public.passengers p on p.id=r.passenger_id),'nothing'));
select pg_temp.snap('30 Mar closed (Q has no movement)');
select pg_temp.note('31 close_month 2025-02 returns '||(select count(*) from public.close_month('2025-02-01'))||' rows (existing Feb charges, none new)');
select pg_temp.snap('31 Feb closed again');

-- 9. Escrita privilegiada (sem sessão de cliente) não dispara o recálculo; recalculate_charge conserta.
reset role;
select set_config('request.jwt.claim.sub','',true);
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values('c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','2025-01-27',10);
select pg_temp.snap('32 privileged ride in closed Jan: charge stays stale');
set local role authenticated;
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',true);
select pg_temp.note('33 recalculate P Jan total '||(public.recalculate_charge('c2000000-0000-0000-0000-000000000001','2025-01-01')).total_amount);
select pg_temp.snap('33 recalculate_charge picked up the privileged ride');

-- 10. Limites que o fechamento mensal sempre teve.
select throws_ok($$select public.close_month('2025-01-02')$$,'23514','INVALID_COMPETENCE','close_month requires day 1');
select throws_ok($$select public.recalculate_charge('c2000000-0000-0000-0000-000000000001','2025-01-02')$$,'23514','INVALID_COMPETENCE','recalculate requires day 1 when no charge exists');
select throws_ok($$select public.recalculate_charge('c2000000-0000-0000-0000-000000000009','2025-01-01')$$,'42501','FINANCIAL_FORBIDDEN','foreign passenger rejected');
select throws_ok($$select public.pay_charge(gen_random_uuid(),1)$$,'42501','FINANCIAL_FORBIDDEN','unknown charge rejected');

reset role;
select set_config('request.jwt.claim.sub','',true);
select results_eq(
 $q$select line from pg_temp.trace order by seq$q$,
 $q$select l from regexp_split_to_table($g$
02 close_month 2024-12 returns Golden P=20.00
03 close_month 2025-01 returns Golden P=20.00,Golden Q=13.00
03 after closing Dec and Jan | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
03 after closing Dec and Jan | Golden P 2025-01-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
03 after closing Dec and Jan | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
04 close_month 2025-01 again returns 2 rows
04 close repeated | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
04 close repeated | Golden P 2025-01-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
04 close repeated | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
05 insert ride in closed Jan | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
05 insert ride in closed Jan | Golden P 2025-01-01 | total=30.00 paid_amount=0.00 paid=false rev=2 active=false paid_at=false events=-
05 insert ride in closed Jan | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
06 ride value changed in closed Jan | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
06 ride value changed in closed Jan | Golden P 2025-01-01 | total=32.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
06 ride value changed in closed Jan | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
07 ride moved from closed Jan to open Feb | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
07 ride moved from closed Jan to open Feb | Golden P 2025-01-01 | total=20.00 paid_amount=0.00 paid=false rev=4 active=false paid_at=false events=-
07 ride moved from closed Jan to open Feb | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
08 ride moved from open Feb back to closed Jan | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
08 ride moved from open Feb back to closed Jan | Golden P 2025-01-01 | total=32.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
08 ride moved from open Feb back to closed Jan | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
09 ride moved from closed Dec to closed Jan (month boundary) | Golden P 2024-12-01 | total=10.00 paid_amount=0.00 paid=false rev=2 active=false paid_at=false events=-
09 ride moved from closed Dec to closed Jan (month boundary) | Golden P 2025-01-01 | total=42.00 paid_amount=0.00 paid=false rev=6 active=false paid_at=false events=-
09 ride moved from closed Dec to closed Jan (month boundary) | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
10 ride moved back from Jan to Dec | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
10 ride moved back from Jan to Dec | Golden P 2025-01-01 | total=32.00 paid_amount=0.00 paid=false rev=7 active=false paid_at=false events=-
10 ride moved back from Jan to Dec | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
11 ride moved inside closed Dec | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
11 ride moved inside closed Dec | Golden P 2025-01-01 | total=32.00 paid_amount=0.00 paid=false rev=7 active=false paid_at=false events=-
11 ride moved inside closed Dec | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
12 ride deleted from closed Jan | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
12 ride deleted from closed Jan | Golden P 2025-01-01 | total=22.00 paid_amount=0.00 paid=false rev=8 active=false paid_at=false events=-
12 ride deleted from closed Jan | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
13 compensation inserted in closed Jan | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
13 compensation inserted in closed Jan | Golden P 2025-01-01 | total=18.00 paid_amount=0.00 paid=false rev=9 active=false paid_at=false events=-
13 compensation inserted in closed Jan | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
14 compensation moved from closed Jan to open Feb | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
14 compensation moved from closed Jan to open Feb | Golden P 2025-01-01 | total=22.00 paid_amount=0.00 paid=false rev=10 active=false paid_at=false events=-
14 compensation moved from closed Jan to open Feb | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
15 compensation moved from open Feb to closed Dec | Golden P 2024-12-01 | total=16.00 paid_amount=0.00 paid=false rev=4 active=false paid_at=false events=-
15 compensation moved from open Feb to closed Dec | Golden P 2025-01-01 | total=22.00 paid_amount=0.00 paid=false rev=10 active=false paid_at=false events=-
15 compensation moved from open Feb to closed Dec | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
16 compensation deleted from closed Dec | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
16 compensation deleted from closed Dec | Golden P 2025-01-01 | total=22.00 paid_amount=0.00 paid=false rev=10 active=false paid_at=false events=-
16 compensation deleted from closed Dec | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
17 P Jan paid | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
17 P Jan paid | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=10 active=true paid_at=true events=PAYMENT:1
17 P Jan paid | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
18 ride after payment: partial, only the difference is owed | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
18 ride after payment: partial, only the difference is owed | Golden P 2025-01-01 | total=32.00 paid_amount=22.00 paid=false rev=11 active=false paid_at=true events=PAYMENT:1,REOPEN:1
18 ride after payment: partial, only the difference is owed | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
19 difference paid | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
19 difference paid | Golden P 2025-01-01 | total=32.00 paid_amount=32.00 paid=true rev=11 active=true paid_at=true events=PAYMENT:2,REOPEN:1
19 difference paid | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
20 ride removed after full payment: refund balance | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
20 ride removed after full payment: refund balance | Golden P 2025-01-01 | total=22.00 paid_amount=32.00 paid=true rev=12 active=false paid_at=true events=PAYMENT:2,REOPEN:2
20 ride removed after full payment: refund balance | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
21 compensation larger than the total: bigger refund balance | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
21 compensation larger than the total: bigger refund balance | Golden P 2025-01-01 | total=-8.00 paid_amount=32.00 paid=false rev=13 active=false paid_at=true events=PAYMENT:2,REOPEN:2
21 compensation larger than the total: bigger refund balance | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
22 latest payment undone | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
22 latest payment undone | Golden P 2025-01-01 | total=-8.00 paid_amount=22.00 paid=false rev=14 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
22 latest payment undone | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
23 compensation removed | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
23 compensation removed | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
23 compensation removed | Golden Q 2025-01-01 | total=13.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
24 Q Jan negative total, still owed back | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
24 Q Jan negative total, still owed back | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
24 Q Jan negative total, still owed back | Golden Q 2025-01-01 | total=-37.00 paid_amount=13.00 paid=false rev=2 active=false paid_at=true events=PAYMENT:1,REOPEN:1
25 Q Jan refunded | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
25 Q Jan refunded | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
25 Q Jan refunded | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
26 open months untouched (no Feb or Mar charge yet) | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
26 open months untouched (no Feb or Mar charge yet) | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
26 open months untouched (no Feb or Mar charge yet) | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
27 recalculate P Feb total 10.00
27 recalculate Q Feb total 0.00
27 Feb charges created by recalculate_charge (Q empty and settled) | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
27 Feb charges created by recalculate_charge (Q empty and settled) | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
27 Feb charges created by recalculate_charge (Q empty and settled) | Golden P 2025-02-01 | total=10.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
27 Feb charges created by recalculate_charge (Q empty and settled) | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
27 Feb charges created by recalculate_charge (Q empty and settled) | Golden Q 2025-02-01 | total=0.00 paid_amount=0.00 paid=true rev=1 active=false paid_at=false events=-
28 ride in Feb after its charge exists | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
28 ride in Feb after its charge exists | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
28 ride in Feb after its charge exists | Golden P 2025-02-01 | total=20.00 paid_amount=0.00 paid=false rev=2 active=false paid_at=false events=-
28 ride in Feb after its charge exists | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
28 ride in Feb after its charge exists | Golden Q 2025-02-01 | total=0.00 paid_amount=0.00 paid=true rev=1 active=false paid_at=false events=-
29 ride moved from closed Feb to open Mar | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
29 ride moved from closed Feb to open Mar | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
29 ride moved from closed Feb to open Mar | Golden P 2025-02-01 | total=10.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
29 ride moved from closed Feb to open Mar | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
29 ride moved from closed Feb to open Mar | Golden Q 2025-02-01 | total=0.00 paid_amount=0.00 paid=true rev=1 active=false paid_at=false events=-
30 close_month 2025-03 returns Golden P=30.00
30 Mar closed (Q has no movement) | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
30 Mar closed (Q has no movement) | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
30 Mar closed (Q has no movement) | Golden P 2025-02-01 | total=10.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
30 Mar closed (Q has no movement) | Golden P 2025-03-01 | total=30.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
30 Mar closed (Q has no movement) | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
30 Mar closed (Q has no movement) | Golden Q 2025-02-01 | total=0.00 paid_amount=0.00 paid=true rev=1 active=false paid_at=false events=-
31 close_month 2025-02 returns 2 rows (existing Feb charges, none new)
31 Feb closed again | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
31 Feb closed again | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
31 Feb closed again | Golden P 2025-02-01 | total=10.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
31 Feb closed again | Golden P 2025-03-01 | total=30.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
31 Feb closed again | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
31 Feb closed again | Golden Q 2025-02-01 | total=0.00 paid_amount=0.00 paid=true rev=1 active=false paid_at=false events=-
32 privileged ride in closed Jan: charge stays stale | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
32 privileged ride in closed Jan: charge stays stale | Golden P 2025-01-01 | total=22.00 paid_amount=22.00 paid=true rev=15 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
32 privileged ride in closed Jan: charge stays stale | Golden P 2025-02-01 | total=10.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
32 privileged ride in closed Jan: charge stays stale | Golden P 2025-03-01 | total=30.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
32 privileged ride in closed Jan: charge stays stale | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
32 privileged ride in closed Jan: charge stays stale | Golden Q 2025-02-01 | total=0.00 paid_amount=0.00 paid=true rev=1 active=false paid_at=false events=-
33 recalculate P Jan total 32.00
33 recalculate_charge picked up the privileged ride | Golden P 2024-12-01 | total=20.00 paid_amount=0.00 paid=false rev=5 active=false paid_at=false events=-
33 recalculate_charge picked up the privileged ride | Golden P 2025-01-01 | total=32.00 paid_amount=22.00 paid=false rev=16 active=false paid_at=true events=CANCEL:1,PAYMENT:2,REOPEN:2
33 recalculate_charge picked up the privileged ride | Golden P 2025-02-01 | total=10.00 paid_amount=0.00 paid=false rev=3 active=false paid_at=false events=-
33 recalculate_charge picked up the privileged ride | Golden P 2025-03-01 | total=30.00 paid_amount=0.00 paid=false rev=1 active=false paid_at=false events=-
33 recalculate_charge picked up the privileged ride | Golden Q 2025-01-01 | total=-37.00 paid_amount=-37.00 paid=true rev=2 active=true paid_at=true events=PAYMENT:2,REOPEN:1
33 recalculate_charge picked up the privileged ride | Golden Q 2025-02-01 | total=0.00 paid_amount=0.00 paid=true rev=1 active=false paid_at=false events=-
$g$,E'\n') with ordinality as t(l,n) where l<>'' order by n$q$,
 'the monthly path produces exactly the history recorded on migration 0011');

select * from finish();
rollback;
