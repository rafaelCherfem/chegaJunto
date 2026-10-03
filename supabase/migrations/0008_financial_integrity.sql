-- Financial authority and append-only settlement audit. Local empty-chain validation.
begin;
alter table public.rides add constraint rides_finite_amount check(rate_charged <> 'NaN'::numeric);
alter table public.passengers add constraint passenger_finite_rate check(default_daily_rate <> 'NaN'::numeric);
alter table public.received_rides add constraint received_finite_amount check(amount <> 'NaN'::numeric);
alter table public.monthly_charges add constraint charges_finite_amount check(total_amount <> 'NaN'::numeric and paid_amount <> 'NaN'::numeric);
-- Existing settlements require an explicit migration plan; never invent history.
do $$ begin
 if exists(select 1 from public.monthly_charges where paid or paid_amount <> 0 or paid_at is not null) then
  raise exception 'Existing settlements require explicit historical migration.';
 end if;
end $$;
alter table public.monthly_charges drop constraint monthly_charges_paid_amount_check;
alter table public.monthly_charges add column revision bigint not null default 1 check(revision > 0),
 add column active_payment_id uuid,
 add column recalculated_at timestamptz not null default clock_timestamp(),
 add constraint charge_audit_identity unique(id,user_id,passenger_id,reference_month);
create table public.monthly_charge_events (
 id uuid primary key default gen_random_uuid(),
 monthly_charge_id uuid not null,
 user_id uuid not null,
 passenger_id uuid not null,
 reference_month date not null,
 revision bigint not null check(revision > 0),
 kind text not null check(kind in ('PAYMENT','CANCEL','REOPEN')),
 signed_amount numeric(10,2) not null check(signed_amount <> 0),
 related_payment_id uuid references public.monthly_charge_events(id) on delete restrict,
 occurred_at timestamptz not null default clock_timestamp(),
 foreign key(monthly_charge_id,user_id,passenger_id,reference_month)
 references public.monthly_charges(id,user_id,passenger_id,reference_month) on delete restrict,
 check((kind='PAYMENT') = (related_payment_id is null))
);
create unique index one_payment_per_revision on public.monthly_charge_events(monthly_charge_id,revision) where kind='PAYMENT';
create unique index one_cancel_per_payment on public.monthly_charge_events(related_payment_id) where kind='CANCEL';
create unique index one_reopen_per_payment on public.monthly_charge_events(related_payment_id) where kind='REOPEN';
alter table public.monthly_charges add foreign key(active_payment_id) references public.monthly_charge_events(id) on delete restrict;
alter table public.monthly_charge_events enable row level security;
revoke all on public.monthly_charge_events from public,anon,authenticated;
grant select on public.monthly_charge_events to authenticated;
create policy financial_history_owner on public.monthly_charge_events for select to authenticated
 using(public.is_responsible() and user_id=auth.uid());
revoke insert,update,delete on public.monthly_charges from authenticated;

create function public.financial_lock(owner_id uuid) returns void
language plpgsql security invoker set search_path='' as $$ begin
 if current_setting('transaction_isolation') <> 'read committed' then
  raise exception 'FINANCIAL_ISOLATION' using errcode='40001';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,806));
end $$;
create function public.financial_owner() returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); begin
 if owner_id is null or not exists(select 1 from public.responsible_accounts where user_id=owner_id) then
  raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501';
 end if;
 perform public.financial_lock(owner_id);
 return owner_id;
end $$;
create function public.financial_month(month_date date) returns void
language plpgsql security invoker set search_path='' as $$ begin
 if month_date is null or not pg_catalog.isfinite(month_date) or month_date < date '0001-01-01'
 or month_date > date '9999-12-01' or extract(day from month_date) <> 1 then
  raise exception 'INVALID_COMPETENCE' using errcode='23514';
 end if;
end $$;

-- Internal only. Every caller holds the owner lock before accessing a charge.
create function public.reconcile_charge(owner_id uuid, target_passenger uuid, month_date date)
returns public.monthly_charges language plpgsql security definer set search_path='' as $$
declare c public.monthly_charges; total numeric; begin
 perform public.financial_month(month_date);
 if not exists(select 1 from public.passengers where id=target_passenger and user_id=owner_id) then
  raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501';
 end if;
 select coalesce((select sum(rate_charged) from public.rides where user_id=owner_id and passenger_id=target_passenger
  and ride_date>=month_date and ride_date<(month_date+interval '1 month')::date),0)
 -coalesce((select sum(amount) from public.received_rides where user_id=owner_id and passenger_id=target_passenger
  and received_date>=month_date and received_date<(month_date+interval '1 month')::date),0) into total;
 select * into c from public.monthly_charges where user_id=owner_id and passenger_id=target_passenger and reference_month=month_date for update;
 if not found then
  insert into public.monthly_charges(user_id,passenger_id,reference_month,total_amount,paid)
  values(owner_id,target_passenger,month_date,total,total=0) returning * into c;
 elsif c.total_amount<>total then
  if c.active_payment_id is not null then
   insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id)
   values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'REOPEN',c.paid_amount,c.active_payment_id);
  end if;
  update public.monthly_charges set total_amount=total,revision=revision+1,paid=(total=0),paid_amount=0,paid_at=null,
   active_payment_id=null,recalculated_at=clock_timestamp() where id=c.id returning * into c;
 else
  update public.monthly_charges set paid=case when total=0 then true else paid end,recalculated_at=clock_timestamp()
   where id=c.id returning * into c;
 end if;
 return c;
end $$;

create function public.close_month(month_date date) returns setof public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); target uuid; begin
 perform public.financial_month(month_date);
 for target in
  select passenger_id from public.monthly_charges where user_id=owner_id and reference_month=month_date
  union select passenger_id from public.rides where user_id=owner_id and ride_date>=month_date and ride_date<(month_date+interval '1 month')::date
  union select passenger_id from public.received_rides where user_id=owner_id and received_date>=month_date and received_date<(month_date+interval '1 month')::date
  order by 1
 loop return next public.reconcile_charge(owner_id,target,month_date); end loop;
end $$;
create function public.recalculate_charge(target_passenger uuid,month_date date) returns public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); begin
 return public.reconcile_charge(owner_id,target_passenger,month_date);
end $$;
create function public.pay_charge(target_charge uuid,expected_revision bigint) returns public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); c public.monthly_charges; payment uuid; paid_time timestamptz; begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id;
 if not found then raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501'; end if;
 c:=public.reconcile_charge(owner_id,c.passenger_id,c.reference_month);
 if expected_revision is null or c.revision<>expected_revision then raise exception 'STALE_OBLIGATION' using errcode='40001'; end if;
 if c.total_amount=0 then raise exception 'NO_OBLIGATION' using errcode='23514'; end if;
 if c.active_payment_id is not null then return c; end if;
 insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount)
 values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'PAYMENT',c.total_amount)
 returning id,occurred_at into payment,paid_time;
 update public.monthly_charges set paid=true,paid_amount=total_amount,paid_at=paid_time,active_payment_id=payment
 where id=c.id returning * into c;
 return c;
end $$;
create function public.cancel_charge_payment(target_charge uuid,target_payment uuid) returns public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); c public.monthly_charges; begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id;
 if not found then raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501'; end if;
 c:=public.reconcile_charge(owner_id,c.passenger_id,c.reference_month);
 if c.total_amount=0 then raise exception 'NO_OBLIGATION' using errcode='23514'; end if;
 if target_payment is null then raise exception 'STALE_OBLIGATION' using errcode='40001'; end if;
 if c.active_payment_id is distinct from target_payment then
  if c.active_payment_id is null and exists(select 1 from public.monthly_charge_events
    where monthly_charge_id=c.id and related_payment_id=target_payment and kind='CANCEL') then return c; end if;
  raise exception 'STALE_OBLIGATION' using errcode='40001';
 end if;
 insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id)
 values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'CANCEL',c.paid_amount,target_payment);
 update public.monthly_charges set paid=false,paid_amount=0,paid_at=null,active_payment_id=null,revision=revision+1
 where id=c.id returning * into c;
 return c;
end $$;

-- Statement lock precedes row locks for all normal authenticated ledger writes.
create function public.lock_financial_statement() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null then perform public.financial_lock(auth.uid()); end if;
 return null;
end $$;
create function public.refresh_existing_charges() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; owner_id uuid; passenger uuid; month_date date; begin
 -- Privileged fixtures/admin maintenance are outside normal client operations.
 if auth.uid() is null then return null; end if;
 for row_data in select value from jsonb_array_elements(
  case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new))
   when tg_op='DELETE' then jsonb_build_array(to_jsonb(old))
   else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end)
 loop
  owner_id:=(row_data->>'user_id')::uuid; passenger:=(row_data->>'passenger_id')::uuid;
  month_date:=date_trunc('month',coalesce(row_data->>'ride_date',row_data->>'received_date')::date)::date;
  if exists(select 1 from public.monthly_charges where user_id=owner_id and passenger_id=passenger and reference_month=month_date) then
   perform public.reconcile_charge(owner_id,passenger,month_date);
  end if;
 end loop;
 return null;
end $$;
create trigger financial_rides_lock before insert or update or delete on public.rides for each statement execute function public.lock_financial_statement();
create trigger financial_received_lock before insert or update or delete on public.received_rides for each statement execute function public.lock_financial_statement();
create trigger financial_rides_refresh after insert or update or delete on public.rides for each row execute function public.refresh_existing_charges();
create trigger financial_received_refresh after insert or update or delete on public.received_rides for each row execute function public.refresh_existing_charges();

revoke all on function public.financial_lock(uuid),public.financial_owner(),public.financial_month(date),public.reconcile_charge(uuid,uuid,date),
 public.lock_financial_statement(),public.refresh_existing_charges() from public,anon,authenticated;
revoke all on function public.close_month(date),public.recalculate_charge(uuid,date),public.pay_charge(uuid,bigint),public.cancel_charge_payment(uuid,uuid) from public,anon;
grant execute on function public.close_month(date),public.recalculate_charge(uuid,date),public.pay_charge(uuid,bigint),public.cancel_charge_payment(uuid,uuid) to authenticated;
commit;
