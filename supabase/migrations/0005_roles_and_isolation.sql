-- Stage 2: explicit responsibility and relational isolation.
-- Apply only through the historical chain on a disposable, empty database.
-- No implicit backfill of responsibility from existing application data.
begin;

create table public.responsible_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.responsible_accounts enable row level security;
revoke all on public.responsible_accounts from public, anon, authenticated;
grant select on public.responsible_accounts to authenticated;
grant all on public.responsible_accounts to service_role;
create policy responsible_self_select on public.responsible_accounts
  for select to authenticated using (user_id = auth.uid());

-- Invoker is sufficient: a caller may read only their own grant.
create function public.is_responsible()
returns boolean language sql stable security invoker set search_path = ''
as $$ select exists (select 1 from public.responsible_accounts where user_id = auth.uid()) $$;
revoke all on function public.is_responsible() from public, anon;
grant execute on function public.is_responsible() to authenticated;

-- Lock the same auth identity for both types of grant, preventing concurrent
-- administrative owner assignment and passenger redemption from creating both.
create function public.enforce_exclusive_account_role()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from auth.users where id = new.user_id for update;
  if tg_table_name = 'responsible_accounts' then
    if exists (select 1 from public.passenger_accounts where user_id = new.user_id) then
      raise exception 'A conta já possui vínculo de passageiro.' using errcode = '23514';
    end if;
  else
    if exists (select 1 from public.responsible_accounts where user_id = new.user_id) then
      raise exception 'A conta responsável não pode ser passageiro.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_exclusive_account_role() from public, anon, authenticated;
create trigger responsible_exclusive_role before insert on public.responsible_accounts
for each row execute function public.enforce_exclusive_account_role();
create trigger passenger_exclusive_role before insert on public.passenger_accounts
for each row execute function public.enforce_exclusive_account_role();

alter table public.passengers add constraint passengers_id_user_id_key unique (id, user_id);
alter table public.passengers add constraint passengers_responsible_fk
foreign key (user_id) references public.responsible_accounts(user_id) on delete restrict;

-- RESTRICT replaces destructive passenger cascades for financial/access children.
-- Complete delete workflow and ride_flags history retention remain later work.
alter table public.rides drop constraint rides_passenger_id_fkey;
alter table public.rides add constraint rides_passenger_owner_fk
foreign key (passenger_id, user_id) references public.passengers(id, user_id) on delete restrict;
alter table public.received_rides drop constraint received_rides_passenger_id_fkey;
alter table public.received_rides add constraint received_rides_passenger_owner_fk
foreign key (passenger_id, user_id) references public.passengers(id, user_id) on delete restrict;
alter table public.monthly_charges drop constraint monthly_charges_passenger_id_fkey;
alter table public.monthly_charges add constraint monthly_charges_passenger_owner_fk
foreign key (passenger_id, user_id) references public.passengers(id, user_id) on delete restrict;
alter table public.passenger_invites drop constraint passenger_invites_passenger_id_fkey;
alter table public.passenger_invites add constraint invites_passenger_owner_fk
foreign key (passenger_id, owner_user_id) references public.passengers(id, user_id) on delete restrict;
alter table public.passenger_accounts drop constraint passenger_accounts_passenger_id_fkey;
alter table public.passenger_accounts add constraint accounts_passenger_owner_fk
foreign key (passenger_id, owner_user_id) references public.passengers(id, user_id) on delete restrict;

-- UPDATE cannot transfer identity, ownership, relationship or authorship.
create function public.prevent_relationship_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare field text;
begin
  foreach field in array tg_argv loop
    if (pg_catalog.to_jsonb(new) -> field) is distinct from (pg_catalog.to_jsonb(old) -> field) then
      raise exception 'Identidade e vínculo não podem ser alterados.' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.prevent_relationship_update() from public, anon, authenticated;
create trigger responsible_identity_immutable before update on public.responsible_accounts
for each row execute function public.prevent_relationship_update('user_id');
create trigger passenger_identity_immutable before update on public.passengers
for each row execute function public.prevent_relationship_update('id', 'user_id');
create trigger ride_relationship_immutable before update on public.rides
for each row execute function public.prevent_relationship_update('id', 'user_id', 'passenger_id');
create trigger received_relationship_immutable before update on public.received_rides
for each row execute function public.prevent_relationship_update('id', 'user_id', 'passenger_id');
create trigger charge_relationship_immutable before update on public.monthly_charges
for each row execute function public.prevent_relationship_update('id', 'user_id', 'passenger_id');
create trigger invite_relationship_immutable before update on public.passenger_invites
for each row execute function public.prevent_relationship_update('id', 'owner_user_id', 'passenger_id');
create trigger account_relationship_immutable before update on public.passenger_accounts
for each row execute function public.prevent_relationship_update('user_id', 'owner_user_id', 'passenger_id');
create trigger flag_relationship_immutable before update on public.ride_flags
for each row execute function public.prevent_relationship_update('id', 'ride_id', 'flagged_by');

-- Remove every historical policy on precisely the seven application tables.
do $$
declare policy record;
begin
  for policy in select tablename, policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in (
      'passengers','rides','received_rides','monthly_charges',
      'passenger_invites','passenger_accounts','ride_flags')
  loop
    execute pg_catalog.format('drop policy %I on public.%I', policy.policyname, policy.tablename);
  end loop;
end;
$$;
revoke all on public.passengers from public, anon, authenticated;
revoke all on public.rides from public, anon, authenticated;
revoke all on public.received_rides from public, anon, authenticated;
revoke all on public.monthly_charges from public, anon, authenticated;
revoke all on public.passenger_invites from public, anon, authenticated;
revoke all on public.passenger_accounts from public, anon, authenticated;
revoke all on public.ride_flags from public, anon, authenticated;
grant select, insert, update, delete on public.passengers to authenticated;
create policy passengers_responsible_select on public.passengers for select to authenticated using (public.is_responsible() and user_id = auth.uid());
create policy passengers_responsible_insert on public.passengers for insert to authenticated with check (public.is_responsible() and user_id = auth.uid());
create policy passengers_responsible_update on public.passengers for update to authenticated using (public.is_responsible() and user_id = auth.uid()) with check (public.is_responsible() and user_id = auth.uid());
create policy passengers_responsible_delete on public.passengers for delete to authenticated using (public.is_responsible() and user_id = auth.uid());
grant select, insert, update, delete on public.rides to authenticated;
create policy rides_responsible_select on public.rides for select to authenticated using (public.is_responsible() and user_id = auth.uid());
create policy rides_responsible_insert on public.rides for insert to authenticated with check (public.is_responsible() and user_id = auth.uid());
create policy rides_responsible_update on public.rides for update to authenticated using (public.is_responsible() and user_id = auth.uid()) with check (public.is_responsible() and user_id = auth.uid());
create policy rides_responsible_delete on public.rides for delete to authenticated using (public.is_responsible() and user_id = auth.uid());
grant select, insert, update, delete on public.received_rides to authenticated;
create policy received_rides_responsible_select on public.received_rides for select to authenticated using (public.is_responsible() and user_id = auth.uid());
create policy received_rides_responsible_insert on public.received_rides for insert to authenticated with check (public.is_responsible() and user_id = auth.uid());
create policy received_rides_responsible_update on public.received_rides for update to authenticated using (public.is_responsible() and user_id = auth.uid()) with check (public.is_responsible() and user_id = auth.uid());
create policy received_rides_responsible_delete on public.received_rides for delete to authenticated using (public.is_responsible() and user_id = auth.uid());
grant select, insert, update, delete on public.monthly_charges to authenticated;
create policy monthly_charges_responsible_select on public.monthly_charges for select to authenticated using (public.is_responsible() and user_id = auth.uid());
create policy monthly_charges_responsible_insert on public.monthly_charges for insert to authenticated with check (public.is_responsible() and user_id = auth.uid());
create policy monthly_charges_responsible_update on public.monthly_charges for update to authenticated using (public.is_responsible() and user_id = auth.uid()) with check (public.is_responsible() and user_id = auth.uid());
create policy monthly_charges_responsible_delete on public.monthly_charges for delete to authenticated using (public.is_responsible() and user_id = auth.uid());
grant select, insert, delete on public.passenger_invites to authenticated;
create policy invites_responsible_select on public.passenger_invites for select to authenticated
using (public.is_responsible() and owner_user_id = auth.uid());
create policy invites_responsible_insert on public.passenger_invites for insert to authenticated
with check (public.is_responsible() and owner_user_id = auth.uid() and not used and used_by is null and used_at is null);
create policy invites_responsible_delete on public.passenger_invites for delete to authenticated
using (public.is_responsible() and owner_user_id = auth.uid());

grant select, delete on public.passenger_accounts to authenticated;
create policy accounts_self_select on public.passenger_accounts for select to authenticated
using (user_id = auth.uid());
create policy accounts_responsible_select on public.passenger_accounts for select to authenticated
using (public.is_responsible() and owner_user_id = auth.uid());
create policy accounts_responsible_delete on public.passenger_accounts for delete to authenticated
using (public.is_responsible() and owner_user_id = auth.uid());

create policy passengers_linked_select on public.passengers for select to authenticated
using (exists (select 1 from public.passenger_accounts pa where pa.user_id = auth.uid()
  and pa.passenger_id = passengers.id and pa.owner_user_id = passengers.user_id));
create policy rides_linked_select on public.rides for select to authenticated
using (exists (select 1 from public.passenger_accounts pa where pa.user_id = auth.uid()
  and pa.passenger_id = rides.passenger_id and pa.owner_user_id = rides.user_id));
create policy received_linked_select on public.received_rides for select to authenticated
using (exists (select 1 from public.passenger_accounts pa where pa.user_id = auth.uid()
  and pa.passenger_id = received_rides.passenger_id and pa.owner_user_id = received_rides.user_id));
-- monthly_charges stays owner-only: portal currently displays a preview.

grant select, insert, update, delete on public.ride_flags to authenticated;
create policy flags_linked_select on public.ride_flags for select to authenticated
using (flagged_by = auth.uid() and exists (
  select 1 from public.rides r join public.passenger_accounts pa
    on pa.passenger_id = r.passenger_id and pa.owner_user_id = r.user_id
  where r.id = ride_flags.ride_id and pa.user_id = auth.uid()));
create policy flags_linked_insert on public.ride_flags for insert to authenticated
with check (flagged_by = auth.uid() and not resolved and resolved_at is null and exists (
  select 1 from public.rides r join public.passenger_accounts pa
    on pa.passenger_id = r.passenger_id and pa.owner_user_id = r.user_id
  where r.id = ride_flags.ride_id and pa.user_id = auth.uid()));
create policy flags_responsible_select on public.ride_flags for select to authenticated
using (public.is_responsible() and exists (select 1 from public.rides r where r.id = ride_flags.ride_id and r.user_id = auth.uid()));
create policy flags_responsible_update on public.ride_flags for update to authenticated
using (public.is_responsible() and exists (select 1 from public.rides r where r.id = ride_flags.ride_id and r.user_id = auth.uid()))
with check (public.is_responsible() and exists (select 1 from public.rides r where r.id = ride_flags.ride_id and r.user_id = auth.uid()));
create policy flags_responsible_delete on public.ride_flags for delete to authenticated
using (public.is_responsible() and exists (select 1 from public.rides r where r.id = ride_flags.ride_id and r.user_id = auth.uid()));

-- Preserve the existing code-based invite contract. Only role/ownership and
-- execution security change; expiry/token/revocation UX are subsequent stages.
create or replace function public.redeem_passenger_invite(invite_code text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_invite public.passenger_invites%rowtype; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Usuário não autenticado.' using errcode = '42501'; end if;
  perform 1 from auth.users where id = v_user for update;
  if exists (select 1 from public.responsible_accounts where user_id = v_user)
    or exists (select 1 from public.passenger_accounts where user_id = v_user) then
    raise exception 'Esta conta já possui acesso associado.' using errcode = '23514';
  end if;
  select i.* into v_invite from public.passenger_invites i
    join public.passengers p on p.id = i.passenger_id and p.user_id = i.owner_user_id
    join public.responsible_accounts o on o.user_id = p.user_id
    where i.code = invite_code and not i.used for update of i;
  if not found then raise exception 'Código inválido ou já utilizado.'; end if;
  insert into public.passenger_accounts(user_id, passenger_id, owner_user_id)
    values(v_user, v_invite.passenger_id, v_invite.owner_user_id);
  update public.passenger_invites set used = true, used_by = v_user, used_at = now()
    where id = v_invite.id;
end;
$$;
revoke all on function public.redeem_passenger_invite(text) from public, anon;
grant execute on function public.redeem_passenger_invite(text) to authenticated;
commit;
