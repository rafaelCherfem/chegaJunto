-- Disposable LOCAL Supabase only. Entire fixture/test transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id, email) values
('10000000-0000-0000-0000-000000000001','owner-a@example.test'),
('10000000-0000-0000-0000-000000000002','owner-b@example.test'),
('10000000-0000-0000-0000-000000000003','passenger-a@example.test'),
('10000000-0000-0000-0000-000000000004','passenger-b@example.test'),
('10000000-0000-0000-0000-000000000005','unlinked@example.test');
insert into public.responsible_accounts(user_id) values
('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into public.passengers(id,user_id,name,default_daily_rate) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Passenger A',10),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Passenger B',10);
insert into public.passenger_accounts(user_id,passenger_id,owner_user_id) values
('10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
insert into public.rides(id,user_id,passenger_id,ride_date,rate_charged) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','2025-01-01',10),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','2025-01-01',10);
insert into public.received_rides(user_id,passenger_id,received_date,amount)
select user_id,id,'2025-01-01',2 from public.passengers;
insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount)
select user_id,id,'2025-01-01',8 from public.passengers;
insert into public.passenger_invites(passenger_id,owner_user_id,token_hash)
select id,user_id,encode(extensions.digest(repeat(right(id::text,1),64),'sha256'),'hex') from public.passengers;

select ok(not has_table_privilege('authenticated','public.responsible_accounts','INSERT'), 'responsibility cannot be self assigned');
select ok(not has_table_privilege('authenticated','public.passenger_accounts','INSERT'), 'links can only be inserted through controlled operations');
select ok(not has_function_privilege('anon','public.redeem_passenger_invite(text)','EXECUTE'), 'anonymous RPC execution denied');
select ok(has_function_privilege('authenticated','public.redeem_passenger_invite(text)','EXECUTE'), 'authenticated RPC allowed');
select is((select prosecdef from pg_proc where oid='public.is_responsible()'::regprocedure),false,'role helper is invoker');

-- Superuser bypasses RLS, so these failures specifically prove composite FKs.
-- An unbound passenger avoids unrelated UNIQUE(passenger_id) failures.
insert into public.passengers(id,user_id,name,default_daily_rate) values
('20000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000002','Unbound FK fixture',10);
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',10)','23503',null,'privileged cross relation rejected: rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',2)','23503',null,'privileged cross relation rejected: received_rides');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',8)','23503',null,'privileged cross relation rejected: monthly_charges');
select throws_ok('insert into public.passenger_invites(owner_user_id,passenger_id,token_hash) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000009'',''c068c4358ff67c75f8e071fa839f1bfc9d242eaa0515cfc46f0bd4dbf0c15c9a'')','23503',null,'privileged cross relation rejected: passenger_invites');
select throws_ok('insert into public.passenger_accounts(owner_user_id,passenger_id,user_id) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000009'',''10000000-0000-0000-0000-000000000005'')','23503',null,'privileged cross relation rejected: passenger_accounts');
select throws_ok($$insert into public.responsible_accounts(user_id) values('10000000-0000-0000-0000-000000000003')$$,'23514',null,'passenger cannot acquire responsibility');
select throws_ok($$insert into public.passenger_accounts(user_id,passenger_id,owner_user_id) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$$,'23514',null,'responsible cannot acquire passenger role');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select ok(public.is_responsible(),'owner 1 recognized');
select is((select count(*) from public.passengers where user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'owner 1 cannot read foreign passengers');
select is((select count(*) from public.rides where user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'owner 1 cannot read foreign rides');
select is((select count(*) from public.received_rides where user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'owner 1 cannot read foreign received_rides');
select is((select count(*) from public.monthly_charges where user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'owner 1 cannot read foreign monthly_charges');
select is((select count(*) from public.passenger_invites where owner_user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'owner 1 cannot read foreign passenger_invites');
select is((select count(*) from public.passenger_accounts where owner_user_id='10000000-0000-0000-0000-000000000002'),0::bigint,'owner 1 cannot read foreign passenger_accounts');
select lives_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',10)','owner 1 can insert own rides');
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''2025-03-01'',10)','23503',null,'owner 1 cross passenger rejected: rides');
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',10)','42501',null,'owner 1 identity spoof rejected: rides');
select throws_ok('update public.rides set passenger_id=''20000000-0000-0000-0000-000000000002'' where user_id=''10000000-0000-0000-0000-000000000001''','23514',null,'relationship is immutable: rides');
select throws_ok('update public.rides set user_id=''10000000-0000-0000-0000-000000000002'' where user_id=''10000000-0000-0000-0000-000000000001''','23514',null,'owner identity is immutable: rides');
select lives_ok('update public.rides set passenger_id=passenger_id where user_id=''10000000-0000-0000-0000-000000000001''','owner 1 can update own rides');
select lives_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',2)','owner 1 can insert own received_rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''2025-03-01'',2)','23503',null,'owner 1 cross passenger rejected: received_rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',2)','42501',null,'owner 1 identity spoof rejected: received_rides');
select throws_ok('update public.received_rides set passenger_id=''20000000-0000-0000-0000-000000000002'' where user_id=''10000000-0000-0000-0000-000000000001''','23514',null,'relationship is immutable: received_rides');
select throws_ok('update public.received_rides set user_id=''10000000-0000-0000-0000-000000000002'' where user_id=''10000000-0000-0000-0000-000000000001''','23514',null,'owner identity is immutable: received_rides');
select lives_ok('update public.received_rides set passenger_id=passenger_id where user_id=''10000000-0000-0000-0000-000000000001''','owner 1 can update own received_rides');
select lives_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',8)','owner 1 can insert own monthly_charges');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''2025-03-01'',8)','23503',null,'owner 1 cross passenger rejected: monthly_charges');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',8)','42501',null,'owner 1 identity spoof rejected: monthly_charges');
select throws_ok('update public.monthly_charges set passenger_id=''20000000-0000-0000-0000-000000000002'' where user_id=''10000000-0000-0000-0000-000000000001''','23514',null,'relationship is immutable: monthly_charges');
select throws_ok('update public.monthly_charges set user_id=''10000000-0000-0000-0000-000000000002'' where user_id=''10000000-0000-0000-0000-000000000001''','23514',null,'owner identity is immutable: monthly_charges');
select lives_ok('update public.monthly_charges set passenger_id=passenger_id where user_id=''10000000-0000-0000-0000-000000000001''','owner 1 can update own monthly_charges');
select throws_ok('insert into public.passenger_invites(owner_user_id,passenger_id,token_hash) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''own-invite-1'')','42501',null,'owner 1 cannot bypass invite creation RPC');
select throws_ok('insert into public.passenger_invites(owner_user_id,passenger_id,token_hash) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''c068c4358ff67c75f8e071fa839f1bfc9d242eaa0515cfc46f0bd4dbf0c15c9a'')','42501',null,'owner 1 cross passenger rejected: passenger_invites');
select throws_ok('insert into public.passenger_invites(owner_user_id,passenger_id,token_hash) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''c068c4358ff67c75f8e071fa839f1bfc9d242eaa0515cfc46f0bd4dbf0c15c9a'')','42501',null,'owner 1 identity spoof rejected: passenger_invites');
select lives_ok('insert into public.passengers(user_id,name,default_daily_rate) values(''10000000-0000-0000-0000-000000000001'',''Synthetic extra'',10)','owner 1 can create passenger');
select lives_ok('update public.passengers set name=''Synthetic updated'' where id=''20000000-0000-0000-0000-000000000001''','owner 1 can update passenger');
select throws_ok('update public.passengers set user_id=''10000000-0000-0000-0000-000000000002'' where id=''20000000-0000-0000-0000-000000000001''','23514',null,'passenger ownership immutable');
select throws_ok('delete from public.passengers where id=''20000000-0000-0000-0000-000000000001''','23503',null,'dependencies restrict passenger deletion');
select throws_ok('select public.redeem_passenger_invite(''1111111111111111111111111111111111111111111111111111111111111111'')','23514',null,'owner cannot redeem into passenger');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select ok(public.is_responsible(),'owner 2 recognized');
select is((select count(*) from public.passengers where user_id='10000000-0000-0000-0000-000000000001'),0::bigint,'owner 2 cannot read foreign passengers');
select is((select count(*) from public.rides where user_id='10000000-0000-0000-0000-000000000001'),0::bigint,'owner 2 cannot read foreign rides');
select is((select count(*) from public.received_rides where user_id='10000000-0000-0000-0000-000000000001'),0::bigint,'owner 2 cannot read foreign received_rides');
select is((select count(*) from public.monthly_charges where user_id='10000000-0000-0000-0000-000000000001'),0::bigint,'owner 2 cannot read foreign monthly_charges');
select is((select count(*) from public.passenger_invites where owner_user_id='10000000-0000-0000-0000-000000000001'),0::bigint,'owner 2 cannot read foreign passenger_invites');
select is((select count(*) from public.passenger_accounts where owner_user_id='10000000-0000-0000-0000-000000000001'),0::bigint,'owner 2 cannot read foreign passenger_accounts');
select lives_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',10)','owner 2 can insert own rides');
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000001'',''2025-03-01'',10)','23503',null,'owner 2 cross passenger rejected: rides');
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',10)','42501',null,'owner 2 identity spoof rejected: rides');
select throws_ok('update public.rides set passenger_id=''20000000-0000-0000-0000-000000000001'' where user_id=''10000000-0000-0000-0000-000000000002''','23514',null,'relationship is immutable: rides');
select throws_ok('update public.rides set user_id=''10000000-0000-0000-0000-000000000001'' where user_id=''10000000-0000-0000-0000-000000000002''','23514',null,'owner identity is immutable: rides');
select lives_ok('update public.rides set passenger_id=passenger_id where user_id=''10000000-0000-0000-0000-000000000002''','owner 2 can update own rides');
select lives_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',2)','owner 2 can insert own received_rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000001'',''2025-03-01'',2)','23503',null,'owner 2 cross passenger rejected: received_rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',2)','42501',null,'owner 2 identity spoof rejected: received_rides');
select throws_ok('update public.received_rides set passenger_id=''20000000-0000-0000-0000-000000000001'' where user_id=''10000000-0000-0000-0000-000000000002''','23514',null,'relationship is immutable: received_rides');
select throws_ok('update public.received_rides set user_id=''10000000-0000-0000-0000-000000000001'' where user_id=''10000000-0000-0000-0000-000000000002''','23514',null,'owner identity is immutable: received_rides');
select lives_ok('update public.received_rides set passenger_id=passenger_id where user_id=''10000000-0000-0000-0000-000000000002''','owner 2 can update own received_rides');
select lives_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',8)','owner 2 can insert own monthly_charges');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000001'',''2025-03-01'',8)','23503',null,'owner 2 cross passenger rejected: monthly_charges');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',8)','42501',null,'owner 2 identity spoof rejected: monthly_charges');
select throws_ok('update public.monthly_charges set passenger_id=''20000000-0000-0000-0000-000000000001'' where user_id=''10000000-0000-0000-0000-000000000002''','23514',null,'relationship is immutable: monthly_charges');
select throws_ok('update public.monthly_charges set user_id=''10000000-0000-0000-0000-000000000001'' where user_id=''10000000-0000-0000-0000-000000000002''','23514',null,'owner identity is immutable: monthly_charges');
select lives_ok('update public.monthly_charges set passenger_id=passenger_id where user_id=''10000000-0000-0000-0000-000000000002''','owner 2 can update own monthly_charges');
select throws_ok('insert into public.passenger_invites(owner_user_id,passenger_id,token_hash) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000002'',''own-invite-2'')','42501',null,'owner 2 cannot bypass invite creation RPC');
select throws_ok('insert into public.passenger_invites(owner_user_id,passenger_id,token_hash) values(''10000000-0000-0000-0000-000000000002'',''20000000-0000-0000-0000-000000000001'',''c068c4358ff67c75f8e071fa839f1bfc9d242eaa0515cfc46f0bd4dbf0c15c9a'')','42501',null,'owner 2 cross passenger rejected: passenger_invites');
select throws_ok('insert into public.passenger_invites(owner_user_id,passenger_id,token_hash) values(''10000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000001'',''c068c4358ff67c75f8e071fa839f1bfc9d242eaa0515cfc46f0bd4dbf0c15c9a'')','42501',null,'owner 2 identity spoof rejected: passenger_invites');
select lives_ok('insert into public.passengers(user_id,name,default_daily_rate) values(''10000000-0000-0000-0000-000000000002'',''Synthetic extra'',10)','owner 2 can create passenger');
select lives_ok('update public.passengers set name=''Synthetic updated'' where id=''20000000-0000-0000-0000-000000000002''','owner 2 can update passenger');
select throws_ok('update public.passengers set user_id=''10000000-0000-0000-0000-000000000001'' where id=''20000000-0000-0000-0000-000000000002''','23514',null,'passenger ownership immutable');
select throws_ok('delete from public.passengers where id=''20000000-0000-0000-0000-000000000002''','23503',null,'dependencies restrict passenger deletion');
select throws_ok('select public.redeem_passenger_invite(''2222222222222222222222222222222222222222222222222222222222222222'')','23514',null,'owner cannot redeem into passenger');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000003';
select ok(not public.is_responsible(),'passenger 1 is not responsible');
select is((select count(*) from public.passengers where id='20000000-0000-0000-0000-000000000001'),1::bigint,'passenger 1 reads own passenger');
select ok((select count(*) from public.rides where passenger_id='20000000-0000-0000-0000-000000000001') > 0,'passenger reads own rides');
select is((select count(*) from public.rides where passenger_id='20000000-0000-0000-0000-000000000002'),0::bigint,'passenger cannot read foreign rides');
select ok((select count(*) from public.received_rides where passenger_id='20000000-0000-0000-0000-000000000001') > 0,'passenger reads own received_rides');
select is((select count(*) from public.received_rides where passenger_id='20000000-0000-0000-0000-000000000002'),0::bigint,'passenger cannot read foreign received_rides');
select is((select count(*) from public.passengers where id='20000000-0000-0000-0000-000000000002'),0::bigint,'passenger cannot read foreign passenger');
select is((select count(*) from public.monthly_charges),0::bigint,'charges remain responsible-only');
select is((select count(*) from public.passenger_invites),0::bigint,'passenger cannot read invite codes');
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000003'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',10)','42501',null,'passenger cannot administer rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000003'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',2)','42501',null,'passenger cannot administer received_rides');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000003'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',8)','42501',null,'passenger cannot administer monthly_charges');
select lives_ok('insert into public.ride_flags(ride_id,flagged_by) values(''30000000-0000-0000-0000-000000000001'',''10000000-0000-0000-0000-000000000003'')','passenger can flag own ride');
select throws_ok('insert into public.ride_flags(ride_id,flagged_by) values(''30000000-0000-0000-0000-000000000002'',''10000000-0000-0000-0000-000000000003'')','42501',null,'passenger cannot flag foreign ride');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000004';
select ok(not public.is_responsible(),'passenger 2 is not responsible');
select is((select count(*) from public.passengers where id='20000000-0000-0000-0000-000000000002'),1::bigint,'passenger 2 reads own passenger');
select ok((select count(*) from public.rides where passenger_id='20000000-0000-0000-0000-000000000002') > 0,'passenger reads own rides');
select is((select count(*) from public.rides where passenger_id='20000000-0000-0000-0000-000000000001'),0::bigint,'passenger cannot read foreign rides');
select ok((select count(*) from public.received_rides where passenger_id='20000000-0000-0000-0000-000000000002') > 0,'passenger reads own received_rides');
select is((select count(*) from public.received_rides where passenger_id='20000000-0000-0000-0000-000000000001'),0::bigint,'passenger cannot read foreign received_rides');
select is((select count(*) from public.passengers where id='20000000-0000-0000-0000-000000000001'),0::bigint,'passenger cannot read foreign passenger');
select is((select count(*) from public.monthly_charges),0::bigint,'charges remain responsible-only');
select is((select count(*) from public.passenger_invites),0::bigint,'passenger cannot read invite codes');
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000004'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',10)','42501',null,'passenger cannot administer rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000004'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',2)','42501',null,'passenger cannot administer received_rides');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000004'',''20000000-0000-0000-0000-000000000002'',''2025-02-01'',8)','42501',null,'passenger cannot administer monthly_charges');
select lives_ok('insert into public.ride_flags(ride_id,flagged_by) values(''30000000-0000-0000-0000-000000000002'',''10000000-0000-0000-0000-000000000004'')','passenger can flag own ride');
select throws_ok('insert into public.ride_flags(ride_id,flagged_by) values(''30000000-0000-0000-0000-000000000001'',''10000000-0000-0000-0000-000000000004'')','42501',null,'passenger cannot flag foreign ride');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select ok(not public.is_responsible(),'unlinked has no responsible role');
select throws_ok($$insert into public.passengers(user_id,name,default_daily_rate) values('10000000-0000-0000-0000-000000000005','Forbidden',10)$$,'42501',null,'unlinked cannot create passenger');
select throws_ok('insert into public.rides(user_id,passenger_id,ride_date,rate_charged) values(''10000000-0000-0000-0000-000000000005'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',10)','42501',null,'unlinked cannot create rides');
select throws_ok('insert into public.received_rides(user_id,passenger_id,received_date,amount) values(''10000000-0000-0000-0000-000000000005'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',2)','42501',null,'unlinked cannot create received_rides');
select throws_ok('insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount) values(''10000000-0000-0000-0000-000000000005'',''20000000-0000-0000-0000-000000000001'',''2025-02-01'',8)','42501',null,'unlinked cannot create monthly_charges');
select is((select count(*) from public.passengers),0::bigint,'unlinked has no rows: passengers');
select is((select count(*) from public.rides),0::bigint,'unlinked has no rows: rides');
select is((select count(*) from public.received_rides),0::bigint,'unlinked has no rows: received_rides');
select is((select count(*) from public.monthly_charges),0::bigint,'unlinked has no rows: monthly_charges');
select is((select count(*) from public.passenger_invites),0::bigint,'unlinked has no rows: passenger_invites');
select is((select count(*) from public.passenger_accounts),0::bigint,'unlinked has no rows: passenger_accounts');
select is((select count(*) from public.ride_flags),0::bigint,'unlinked has no rows: ride_flags');
select is((select count(*) from public.responsible_accounts),0::bigint,'unlinked has no rows: responsible_accounts');
-- A duplicate passenger association must fail without consuming the invite.
select throws_ok($$select public.redeem_passenger_invite('1111111111111111111111111111111111111111111111111111111111111111')$$,'23505',null,'cannot overwrite an existing passenger link');

reset role;
insert into public.passengers(id,user_id,name,default_daily_rate) values
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Fresh synthetic invite',10);
insert into public.passenger_invites(passenger_id,owner_user_id,token_hash) values
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','79bd7d7fd684b399857c582b1b7172ddf277d4fe1b027ec52b28da3ae381e675');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000005';
select throws_ok($$insert into public.responsible_accounts(user_id) values('10000000-0000-0000-0000-000000000005')$$,'42501',null,'client cannot self grant role');
select throws_ok($$insert into public.passenger_accounts(user_id,passenger_id,owner_user_id) values('10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001')$$,'42501',null,'client cannot manufacture link');
select lives_ok($$select public.redeem_passenger_invite('3333333333333333333333333333333333333333333333333333333333333333')$$,'valid invite grants passenger access');
select is((select passenger_id from public.passenger_accounts where user_id=auth.uid()),'20000000-0000-0000-0000-000000000003'::uuid,'RPC links the intended passenger');
select ok(not public.is_responsible(),'redemption never grants responsibility');
select throws_ok($$select public.redeem_passenger_invite('3333333333333333333333333333333333333333333333333333333333333333')$$,'23514',null,'linked user cannot redeem again');
reset role;
select ok((select used from public.passenger_invites where token_hash='79bd7d7fd684b399857c582b1b7172ddf277d4fe1b027ec52b28da3ae381e675'),'RPC consumes invite');
select is((select used_by from public.passenger_invites where token_hash='79bd7d7fd684b399857c582b1b7172ddf277d4fe1b027ec52b28da3ae381e675'),'10000000-0000-0000-0000-000000000005'::uuid,'RPC records the correct account');
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
select is((select count(*) from public.ride_flags where ride_id='30000000-0000-0000-0000-000000000002'),0::bigint,'owner cannot read foreign flags');
select lives_ok('update public.ride_flags set resolved=true, resolved_at=now() where ride_id=''30000000-0000-0000-0000-000000000001''','owner resolves own flag');
select ok((select resolved from public.ride_flags where ride_id='30000000-0000-0000-0000-000000000001'),'own flag actually changed');
select throws_ok('update public.ride_flags set ride_id=''30000000-0000-0000-0000-000000000002'' where ride_id=''30000000-0000-0000-0000-000000000001''','23514',null,'owner cannot move flag to another ride');
select lives_ok('update public.passengers set default_daily_rate=12 where id=''20000000-0000-0000-0000-000000000001''','authorized passenger update');
select is((select default_daily_rate from public.passengers where id='20000000-0000-0000-0000-000000000001'),12::numeric,'authorized update actually changed row');
with changed as (update public.passengers set name='Forbidden' where user_id<>auth.uid() returning id) select is((select count(*) from changed),0::bigint,'foreign passenger update changes no rows');
with removed as (delete from public.rides where user_id<>auth.uid() returning id) select is((select count(*) from removed),0::bigint,'foreign ride delete changes no rows');
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000002';
select is((select count(*) from public.ride_flags where ride_id='30000000-0000-0000-0000-000000000001'),0::bigint,'owner cannot read foreign flags');
select lives_ok('update public.ride_flags set resolved=true, resolved_at=now() where ride_id=''30000000-0000-0000-0000-000000000002''','owner resolves own flag');
select ok((select resolved from public.ride_flags where ride_id='30000000-0000-0000-0000-000000000002'),'own flag actually changed');
select throws_ok('update public.ride_flags set ride_id=''30000000-0000-0000-0000-000000000001'' where ride_id=''30000000-0000-0000-0000-000000000002''','23514',null,'owner cannot move flag to another ride');
select lives_ok('update public.passengers set default_daily_rate=12 where id=''20000000-0000-0000-0000-000000000002''','authorized passenger update');
select is((select default_daily_rate from public.passengers where id='20000000-0000-0000-0000-000000000002'),12::numeric,'authorized update actually changed row');
with changed as (update public.passengers set name='Forbidden' where user_id<>auth.uid() returning id) select is((select count(*) from changed),0::bigint,'foreign passenger update changes no rows');
with removed as (delete from public.rides where user_id<>auth.uid() returning id) select is((select count(*) from removed),0::bigint,'foreign ride delete changes no rows');
reset role;
reset role;
set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok('select * from public.passengers','42501',null,'anonymous access denied: passengers');
select throws_ok('select * from public.rides','42501',null,'anonymous access denied: rides');
select throws_ok('select * from public.received_rides','42501',null,'anonymous access denied: received_rides');
select throws_ok('select * from public.monthly_charges','42501',null,'anonymous access denied: monthly_charges');
select throws_ok('select * from public.passenger_invites','42501',null,'anonymous access denied: passenger_invites');
select throws_ok('select * from public.passenger_accounts','42501',null,'anonymous access denied: passenger_accounts');
select throws_ok('select * from public.ride_flags','42501',null,'anonymous access denied: ride_flags');
select throws_ok('select * from public.responsible_accounts','42501',null,'anonymous access denied: responsible_accounts');
reset role;
select * from finish();
rollback;
