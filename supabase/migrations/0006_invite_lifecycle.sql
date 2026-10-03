begin;
create extension if not exists pgcrypto with schema extensions;
alter table public.passenger_invites add column token_hash text;
alter table public.passenger_invites add column expires_at timestamptz default (now()+interval '168 hours');
alter table public.passenger_invites add column revoked_at timestamptz;
-- Invalidate weak legacy invitations and remove cleartext permanently.
update public.passenger_invites set token_hash=encode(extensions.digest(code,'sha256'),'hex'),
  expires_at=created_at+interval '168 hours', revoked_at=case when not used then clock_timestamp() else null end;
alter table public.passenger_invites drop column code;
alter table public.passenger_invites alter column token_hash set not null;
alter table public.passenger_invites alter column expires_at set not null;
alter table public.passenger_invites add constraint invite_hash_format check(token_hash ~ '^[0-9a-f]{64}$');
alter table public.passenger_invites add constraint invite_hash_unique unique(token_hash);
alter table public.passenger_invites add constraint invite_expiry check(expires_at=created_at+interval '168 hours');
alter table public.passenger_invites add constraint invite_state check(
  used=(used_at is not null) and used=(used_by is not null) and not(used and revoked_at is not null)
  and (used_at is null or (used_at>=created_at and used_at<expires_at))
  and (revoked_at is null or revoked_at>=created_at));
create unique index invite_one_pending on public.passenger_invites(passenger_id) where not used and revoked_at is null;
drop policy invites_responsible_insert on public.passenger_invites;
drop policy invites_responsible_delete on public.passenger_invites;
revoke insert,update,delete on public.passenger_invites from authenticated;

create function public.create_passenger_invite(target_passenger uuid, invite_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_created timestamptz;
begin
  if v_user is null then raise exception 'SESSION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.responsible_accounts where user_id=v_user) then
    raise exception 'ACCOUNT_INCOMPATIBLE' using errcode='42501'; end if;
  if invite_token is null or invite_token !~ '^[0-9a-f]{64}$' then raise exception 'INVITE_INVALID'; end if;
  -- All invitation RPCs lock the target passenger before the invitation.
  perform 1 from public.passengers where id=target_passenger and user_id=v_user for update;
  if not found then raise exception 'INVITE_INVALID' using errcode='42501'; end if;
  if exists(select 1 from public.passenger_accounts where passenger_id=target_passenger) then
    raise exception 'ACCOUNT_INCOMPATIBLE' using errcode='23514'; end if;
  v_created:=clock_timestamp();
  update public.passenger_invites set revoked_at=v_created where passenger_id=target_passenger and not used and revoked_at is null;
  insert into public.passenger_invites(passenger_id,owner_user_id,token_hash,created_at,expires_at)
    values(target_passenger,v_user,encode(extensions.digest(invite_token,'sha256'),'hex'),v_created,v_created+interval '168 hours') returning id into v_id;
  return v_id;
end $$;

create function public.revoke_passenger_invite(target_invite uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_passenger uuid; v_invite public.passenger_invites%rowtype;
begin
  if v_user is null then raise exception 'SESSION_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.responsible_accounts where user_id=v_user) then
    raise exception 'ACCOUNT_INCOMPATIBLE' using errcode='42501'; end if;
  select passenger_id into v_passenger from public.passenger_invites where id=target_invite and owner_user_id=v_user;
  if not found then raise exception 'INVITE_INVALID' using errcode='42501'; end if;
  perform 1 from public.passengers where id=v_passenger and user_id=v_user for update;
  select * into v_invite from public.passenger_invites where id=target_invite and owner_user_id=v_user for update;
  if v_invite.used then raise exception 'INVITE_USED'; end if;
  if v_invite.revoked_at is not null then return; end if;
  update public.passenger_invites set revoked_at=clock_timestamp() where id=target_invite;
end $$;

create or replace function public.redeem_passenger_invite(invite_code text)
returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_passenger uuid; v_invite public.passenger_invites%rowtype; v_now timestamptz;
begin
  if v_user is null then raise exception 'SESSION_REQUIRED' using errcode='42501'; end if;
  perform 1 from auth.users where id=v_user for update;
  if exists(select 1 from public.responsible_accounts where user_id=v_user) or exists(select 1 from public.passenger_accounts where user_id=v_user) then
    raise exception 'ACCOUNT_INCOMPATIBLE' using errcode='23514'; end if;
  if invite_code is null or invite_code !~ '^[0-9a-f]{64}$' then raise exception 'INVITE_INVALID'; end if;
  select passenger_id into v_passenger from public.passenger_invites where token_hash=encode(extensions.digest(invite_code,'sha256'),'hex');
  if not found then raise exception 'INVITE_INVALID'; end if;
  perform 1 from public.passengers where id=v_passenger for update;
  select i.* into v_invite from public.passenger_invites i join public.passengers p on p.id=i.passenger_id and p.user_id=i.owner_user_id
    join public.responsible_accounts r on r.user_id=i.owner_user_id
    where i.token_hash=encode(extensions.digest(invite_code,'sha256'),'hex') for update of i;
  if not found then raise exception 'INVITE_INVALID'; end if;
  if v_invite.used then raise exception 'INVITE_USED'; end if;
  if v_invite.revoked_at is not null then raise exception 'INVITE_REVOKED'; end if;
  v_now:=clock_timestamp();
  if v_now>=v_invite.expires_at then raise exception 'INVITE_EXPIRED'; end if;
  -- The existing UNIQUE(passenger_id) is another barrier against a second link.
  insert into public.passenger_accounts(user_id,passenger_id,owner_user_id) values(v_user,v_invite.passenger_id,v_invite.owner_user_id);
  update public.passenger_invites set used=true,used_at=v_now,used_by=v_user where id=v_invite.id;
end $$;
revoke all on function public.create_passenger_invite(uuid,text) from public,anon;
revoke all on function public.revoke_passenger_invite(uuid) from public,anon;
revoke all on function public.redeem_passenger_invite(text) from public,anon;
grant execute on function public.create_passenger_invite(uuid,text) to authenticated;
grant execute on function public.revoke_passenger_invite(uuid) to authenticated;
grant execute on function public.redeem_passenger_invite(text) to authenticated;
commit;
