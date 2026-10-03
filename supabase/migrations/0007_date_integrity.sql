begin;
-- Fail closed on incompatible existing dates; never rewrite history silently.
do $$
begin
  if exists(select 1 from public.rides where ride_date > (clock_timestamp() at time zone 'America/Sao_Paulo')::date)
    or exists(select 1 from public.received_rides where received_date > (clock_timestamp() at time zone 'America/Sao_Paulo')::date) then
    raise exception 'Existing future dates require review before migration.' using errcode='23514';
  end if;
end $$;
alter table public.rides add constraint rides_calendar_date check(
  isfinite(ride_date) and ride_date >= date '0001-01-01' and ride_date <= date '9999-12-31');
alter table public.received_rides add constraint received_calendar_date check(
  isfinite(received_date) and received_date >= date '0001-01-01' and received_date <= date '9999-12-31');
alter table public.monthly_charges add constraint charges_canonical_month check(
  isfinite(reference_month) and reference_month >= date '0001-01-01' and reference_month <= date '9999-12-01'
  and extract(day from reference_month)=1);

-- Time-dependent admission belongs in a trigger, not an immutable CHECK.
create function public.enforce_record_calendar_date()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_date date;
begin
  if tg_table_name='rides' then v_date:=new.ride_date;
  else v_date:=new.received_date; end if;
  if v_date > (pg_catalog.clock_timestamp() at time zone 'America/Sao_Paulo')::date then
    raise exception 'FUTURE_DATE' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.enforce_record_calendar_date() from public,anon,authenticated;
create trigger ride_calendar_admission before insert or update of ride_date on public.rides
for each row execute function public.enforce_record_calendar_date();
create trigger received_calendar_admission before insert or update of received_date on public.received_rides
for each row execute function public.enforce_record_calendar_date();
commit;
