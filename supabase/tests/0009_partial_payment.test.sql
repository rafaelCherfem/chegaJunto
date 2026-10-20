begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values('91000000-0000-0000-0000-000000000001','partial@example.test');
insert into public.responsible_accounts(user_id) values('91000000-0000-0000-0000-000000000001');
insert into public.passengers(id,user_id,name,default_daily_rate)
values('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Partial fixture',10);
create function pg_temp.c() returns public.monthly_charges language sql as $$
 select c from public.monthly_charges c where passenger_id='92000000-0000-0000-0000-000000000001' and reference_month='2025-03-01' $$;
create temporary table snapshots(label text primary key,event_id uuid);
grant select,insert on snapshots to authenticated;
set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-0000-0000-000000000001';
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'92000000-0000-0000-0000-000000000001','2025-03-03',10);
select lives_ok($$select public.close_month('2025-03-01')$$,'close with one ride');
select ok((public.pay_charge((pg_temp.c()).id,(pg_temp.c()).revision)).paid,'pay first ride');
insert into snapshots select 'first',(pg_temp.c()).active_payment_id;
select is((pg_temp.c()).paid_amount,10::numeric,'received 10');

-- Nova diária depois do pagamento: só a diferença é cobrada.
insert into public.rides(user_id,passenger_id,ride_date,rate_charged)
values(auth.uid(),'92000000-0000-0000-0000-000000000001','2025-03-04',10);
select is((pg_temp.c()).total_amount,20::numeric,'total grows to 20');
select is((pg_temp.c()).paid_amount,10::numeric,'amount received is preserved');
select ok(not (pg_temp.c()).paid,'month reopens with a balance');
select ok((public.pay_charge((pg_temp.c()).id,(pg_temp.c()).revision)).paid,'pay only the difference');
select is((select signed_amount from public.monthly_charge_events where id=(pg_temp.c()).active_payment_id),10::numeric,'second payment is only the difference');
select is((pg_temp.c()).paid_amount,20::numeric,'total received 20');
select is((select count(*) from public.monthly_charge_events where kind='PAYMENT'),2::bigint,'two payments registered');

-- Cancelar o último pagamento estorna só aquela parcela.
insert into snapshots select 'second',(pg_temp.c()).active_payment_id;
select ok(not (public.cancel_charge_payment((pg_temp.c()).id,(select event_id from snapshots where label='second'))).paid,'cancel last payment reopens');
select is((pg_temp.c()).paid_amount,10::numeric,'first payment kept after cancel');
select ok((public.pay_charge((pg_temp.c()).id,(pg_temp.c()).revision)).paid,'pay again after cancel');

-- Total abaixo do recebido: quitado, sem nova cobrança.
delete from public.rides where ride_date='2025-03-04';
select is((pg_temp.c()).total_amount,10::numeric,'total falls to 10');
select is((pg_temp.c()).paid_amount,20::numeric,'received stays 20 (10 to refund)');
select ok((pg_temp.c()).paid,'settled when received exceeds total');
select throws_ok($$select public.pay_charge((pg_temp.c()).id,(pg_temp.c()).revision)$$,'23514','NO_OBLIGATION','cannot charge when refund is due');

-- Caso zero com valor recebido.
delete from public.rides;
select is((pg_temp.c()).total_amount,0::numeric,'total zero');
select ok((pg_temp.c()).paid,'zero total is settled');
select is((pg_temp.c()).paid_amount,20::numeric,'received kept for refund');
select * from finish();
rollback;
