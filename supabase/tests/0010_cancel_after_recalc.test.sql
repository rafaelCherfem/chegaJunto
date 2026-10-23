begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('a1000000-0000-0000-0000-000000000001','cancel@example.test');
insert into public.responsible_accounts(user_id) values('a1000000-0000-0000-0000-000000000001');
insert into public.passengers(id,user_id,name,default_daily_rate)
values('a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Cancel fixture',15);
create function pg_temp.c(month_date date) returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where passenger_id='a2000000-0000-0000-0000-000000000001' and reference_month=month_date $$;
create function pg_temp.event_time(event_id uuid) returns timestamptz language sql as $$
 select occurred_at from public.monthly_charge_events where id=event_id $$;
create temporary table snapshots(label text primary key,event_id uuid);
grant select,insert on snapshots to authenticated;

-- Histórico legado montado direto nas tabelas, como ficou em produção. O REOPEN
-- da regra antiga (0008) zerou paid_amount; os REOPEN seguintes são da 0009.
-- Junho: P15 r1, REOPEN r1, P12 r3, REOPEN r3, P15 r4, REOPEN r4. Total 12, recebido 27.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-02',12);
insert into public.monthly_charges(id,user_id,passenger_id,reference_month,total_amount,paid,paid_amount,paid_at,revision)
values('a3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-01',12,true,27,'2025-06-20 12:00+00',5);
insert into public.monthly_charge_events(id,monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id,occurred_at) values
('a4000000-0000-0000-0000-000000000601','a3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-01',1,'PAYMENT',15,null,'2025-06-10 12:00+00'),
('a4000000-0000-0000-0000-000000000602','a3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-01',1,'REOPEN',15,'a4000000-0000-0000-0000-000000000601','2025-06-12 12:00+00'),
('a4000000-0000-0000-0000-000000000603','a3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-01',3,'PAYMENT',12,null,'2025-06-12 12:05+00'),
('a4000000-0000-0000-0000-000000000604','a3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-01',3,'REOPEN',12,'a4000000-0000-0000-0000-000000000603','2025-06-18 12:00+00'),
('a4000000-0000-0000-0000-000000000605','a3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-01',4,'PAYMENT',15,null,'2025-06-18 12:05+00'),
('a4000000-0000-0000-0000-000000000606','a3000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-06-01',4,'REOPEN',27,'a4000000-0000-0000-0000-000000000605','2025-06-20 12:00+00');

-- Julho: o histórico do item 3, literal: PAYMENT, REOPEN, PAYMENT e um PAYMENT novo.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-07-02',27);
insert into public.monthly_charges(id,user_id,passenger_id,reference_month,total_amount,paid,paid_amount,paid_at,revision)
values('a3000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-07-01',27,true,27,'2025-07-18 12:05+00',4);
insert into public.monthly_charge_events(id,monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id,occurred_at) values
('a4000000-0000-0000-0000-000000000701','a3000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-07-01',1,'PAYMENT',15,null,'2025-07-10 12:00+00'),
('a4000000-0000-0000-0000-000000000702','a3000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-07-01',1,'REOPEN',15,'a4000000-0000-0000-0000-000000000701','2025-07-12 12:00+00'),
('a4000000-0000-0000-0000-000000000703','a3000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-07-01',3,'PAYMENT',12,null,'2025-07-12 12:05+00'),
('a4000000-0000-0000-0000-000000000704','a3000000-0000-0000-0000-000000000007','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-07-01',4,'PAYMENT',15,null,'2025-07-18 12:05+00');

-- Agosto: histórico incoerente em que desfazer trocaria o sinal do recebido.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values('a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-08-02',5);
insert into public.monthly_charges(id,user_id,passenger_id,reference_month,total_amount,paid,paid_amount,paid_at,revision)
values('a3000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-08-01',5,true,5,'2025-08-12 12:00+00',3);
insert into public.monthly_charge_events(id,monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id,occurred_at) values
('a4000000-0000-0000-0000-000000000801','a3000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-08-01',1,'PAYMENT',-5,null,'2025-08-10 12:00+00'),
('a4000000-0000-0000-0000-000000000802','a3000000-0000-0000-0000-000000000008','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','2025-08-01',2,'PAYMENT',10,null,'2025-08-12 12:00+00');

select is(
 (select array_agg(l.id order by l.revision desc) from public.charge_live_payments('a3000000-0000-0000-0000-000000000006',27) l),
 array['a4000000-0000-0000-0000-000000000605','a4000000-0000-0000-0000-000000000603']::uuid[],
 'live payments stop where the sum reaches paid_amount; the payment zeroed by the old REOPEN is left out');
select is(
 (select count(*) from public.charge_live_payments('a3000000-0000-0000-0000-000000000006',0)),
 0::bigint,'nothing is live when nothing was received');

set local role authenticated;
set local request.jwt.claim.sub='a1000000-0000-0000-0000-000000000001';

select throws_ok($$select public.charge_live_payments('a3000000-0000-0000-0000-000000000006',27)$$,'42501',null,'clients cannot call the helper');

-- Legado realista (junho).
select throws_ok($$select public.cancel_charge_payment('a3000000-0000-0000-0000-000000000006','a4000000-0000-0000-0000-000000000601')$$,
 '40001','STALE_OBLIGATION','june: payment zeroed by the old REOPEN is never cancelable');
select throws_ok($$select public.cancel_charge_payment('a3000000-0000-0000-0000-000000000006','a4000000-0000-0000-0000-000000000603')$$,
 '40001','STALE_OBLIGATION','june: older live payment waits for the newer one');
select ok((public.cancel_charge_payment('a3000000-0000-0000-0000-000000000006','a4000000-0000-0000-0000-000000000605')).paid,
 'june: undoing the last 15 keeps it settled');
select is((pg_temp.c('2025-06-01')).paid_amount,12::numeric,'june: 12 received after undoing 15');
select is((pg_temp.c('2025-06-01')).paid_at,'2025-06-12 12:05+00'::timestamptz,'june: paid_at falls back to the 12 payment');
select ok(not (public.cancel_charge_payment('a3000000-0000-0000-0000-000000000006','a4000000-0000-0000-0000-000000000603')).paid,
 'june: undoing the 12 reopens');
select is((pg_temp.c('2025-06-01')).paid_amount,0::numeric,'june: nothing received');
select is((pg_temp.c('2025-06-01')).paid_at,null::timestamptz,'june: no payment date');
select throws_ok($$select public.cancel_charge_payment('a3000000-0000-0000-0000-000000000006','a4000000-0000-0000-0000-000000000601')$$,
 '40001','STALE_OBLIGATION','june: the zeroed payment stays out after the chain is undone');
select is((pg_temp.c('2025-06-01')).paid_amount,0::numeric,'june: paid_amount never goes negative');

-- Item 3, literal (julho).
select throws_ok($$select public.cancel_charge_payment('a3000000-0000-0000-0000-000000000007','a4000000-0000-0000-0000-000000000701')$$,
 '40001','STALE_OBLIGATION','july: payment zeroed by the old REOPEN is never cancelable');
select ok((public.cancel_charge_payment('a3000000-0000-0000-0000-000000000007','a4000000-0000-0000-0000-000000000704')).paid is false,
 'july: undoing the new 15 leaves 12 of 27');
select is((pg_temp.c('2025-07-01')).paid_amount,12::numeric,'july: 12 received');
select is((pg_temp.c('2025-07-01')).paid_at,'2025-07-12 12:05+00'::timestamptz,'july: paid_at falls back to the 12 payment');
select ok(not (public.cancel_charge_payment('a3000000-0000-0000-0000-000000000007','a4000000-0000-0000-0000-000000000703')).paid,
 'july: undoing the 12 reopens');
select is((pg_temp.c('2025-07-01')).paid_amount,0::numeric,'july: nothing received, never negative');
select throws_ok($$select public.cancel_charge_payment('a3000000-0000-0000-0000-000000000007','a4000000-0000-0000-0000-000000000701')$$,
 '40001','STALE_OBLIGATION','july: the zeroed payment stays out');

-- Sinal trocado (agosto).
select throws_ok($$select public.cancel_charge_payment('a3000000-0000-0000-0000-000000000008','a4000000-0000-0000-0000-000000000802')$$,
 '23514','PAYMENT_HISTORY_MISMATCH','august: refuses when the remainder would change sign');
select is((pg_temp.c('2025-08-01')).paid_amount,5::numeric,'august: nothing written');

-- Cenário A: pagar, recalcular para baixo (saldo a devolver) e desfazer em cadeia.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'a2000000-0000-0000-0000-000000000001','2025-04-01',15);
select lives_ok($$select public.close_month('2025-04-01')$$,'april: close with one ride');
select ok((public.pay_charge((pg_temp.c('2025-04-01')).id,(pg_temp.c('2025-04-01')).revision)).paid,'april: pay 15');
insert into snapshots select 'april-first',(pg_temp.c('2025-04-01')).active_payment_id;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'a2000000-0000-0000-0000-000000000001','2025-04-02',12);
select ok((public.pay_charge((pg_temp.c('2025-04-01')).id,(pg_temp.c('2025-04-01')).revision)).paid,'april: pay the 12 difference');
insert into snapshots select 'april-second',(pg_temp.c('2025-04-01')).active_payment_id;
insert into public.received_rides(user_id,passenger_id,received_date,amount)
values(auth.uid(),'a2000000-0000-0000-0000-000000000001','2025-04-03',15);
select is((pg_temp.c('2025-04-01')).total_amount,12::numeric,'april: total falls to 12');
select is((pg_temp.c('2025-04-01')).paid_amount,27::numeric,'april: 27 received, 15 to refund');
select ok((pg_temp.c('2025-04-01')).paid,'april: settled');
select is((pg_temp.c('2025-04-01')).active_payment_id,null::uuid,'april: no active payment after recalculation');
select throws_ok($$select public.cancel_charge_payment((pg_temp.c('2025-04-01')).id,(select event_id from snapshots where label='april-first'))$$,
 '40001','STALE_OBLIGATION','april: older payment waits for the newer one');
select ok((public.cancel_charge_payment((pg_temp.c('2025-04-01')).id,(select event_id from snapshots where label='april-second'))).paid,
 'april: undoing the 12 keeps it settled');
select is((pg_temp.c('2025-04-01')).paid_amount,15::numeric,'april: 15 received, 3 to refund');
select is((pg_temp.c('2025-04-01')).paid_at,pg_temp.event_time((select event_id from snapshots where label='april-first')),
 'april: paid_at falls back to the first payment');
select lives_ok($$select public.cancel_charge_payment((pg_temp.c('2025-04-01')).id,(select event_id from snapshots where label='april-second'))$$,
 'april: repeating the same cancel is a no-op');
select is((pg_temp.c('2025-04-01')).paid_amount,15::numeric,'april: repeat changed nothing');
select ok(not (public.cancel_charge_payment((pg_temp.c('2025-04-01')).id,(select event_id from snapshots where label='april-first'))).paid,
 'april: undoing the 15 reopens');
select is((pg_temp.c('2025-04-01')).paid_amount,0::numeric,'april: nothing received');
select is((select count(*) from public.monthly_charge_events where monthly_charge_id=(pg_temp.c('2025-04-01')).id and kind='CANCEL'),
 2::bigint,'april: one CANCEL per undone payment');
select ok((public.pay_charge((pg_temp.c('2025-04-01')).id,(pg_temp.c('2025-04-01')).revision)).paid,'april: can pay again');
select is((pg_temp.c('2025-04-01')).paid_amount,12::numeric,'april: pays the current 12');

-- Cenário B: pagar, recalcular e voltar, depois desfazer.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'a2000000-0000-0000-0000-000000000001','2025-05-01',10);
select lives_ok($$select public.close_month('2025-05-01')$$,'may: close with one ride');
select ok((public.pay_charge((pg_temp.c('2025-05-01')).id,(pg_temp.c('2025-05-01')).revision)).paid,'may: pay 10');
insert into snapshots select 'may',(pg_temp.c('2025-05-01')).active_payment_id;
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'a2000000-0000-0000-0000-000000000001','2025-05-02',10);
select ok(not (pg_temp.c('2025-05-01')).paid,'may: reopens at 20');
delete from public.rides where ride_date='2025-05-02';
select ok((pg_temp.c('2025-05-01')).paid,'may: back to 10, settled');
select is((pg_temp.c('2025-05-01')).active_payment_id,null::uuid,'may: no active payment');
select ok(not (public.cancel_charge_payment((pg_temp.c('2025-05-01')).id,(select event_id from snapshots where label='may'))).paid,
 'may: undo after recalculation reopens');
select is((pg_temp.c('2025-05-01')).paid_amount,0::numeric,'may: nothing received');
select is((select signed_amount from public.monthly_charge_events where related_payment_id=(select event_id from snapshots where label='may') and kind='CANCEL'),
 10::numeric,'may: CANCEL reverts 10');

select * from finish();
rollback;
