-- RideLedger — recálculo por período, erro de domínio para ciclos sobrepostos e
-- rejeição de datas anteriores ao primeiro ciclo (etapa 2 do fechamento por ciclos).
--
-- 1. Diária ou compensação mexida passa a recalcular a cobrança cujo período
--    contém a data, e não mais "o mês de calendário da data". Com ciclos só
--    mensais o resultado é idêntico ao da 0008; com ciclos livres (1/nov a 6/dez)
--    a data cai no ciclo certo. Data fora de qualquer ciclo é ciclo em aberto:
--    nada é criado nem recalculado.
-- 2. Criar uma cobrança por cima de um ciclo existente deixa de vazar o erro cru
--    da exclusão (23P01) e vira CYCLE_OVERLAP, com texto em português no HINT.
-- 3. Diária ou compensação com data anterior ao primeiro ciclo do passageiro vira
--    BEFORE_FIRST_CYCLE (só para quem já tem ciclo; só ao inserir ou mudar a data).
--
-- Nenhuma tabela, coluna ou dado é alterado. pay_charge, cancel_charge_payment,
-- close_month e recalculate_charge continuam exatamente como estavam.
begin;

-- 1. Recálculo por período.
-- Cada data afetada (a antiga e a nova, no UPDATE) acha a cobrança do passageiro
-- cujo período a contém. A consulta usa o índice gist da exclusão da 0011.
-- Datas no mesmo ciclo recalculam uma vez só.
create or replace function public.refresh_existing_charges() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; owner_id uuid; passenger uuid; affected_date date; charge uuid; seen uuid[]:='{}'; begin
 -- Privileged fixtures/admin maintenance are outside normal client operations.
 if auth.uid() is null then return null; end if;
 for row_data in select value from jsonb_array_elements(
  case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new))
   when tg_op='DELETE' then jsonb_build_array(to_jsonb(old))
   else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end)
 loop
  owner_id:=(row_data->>'user_id')::uuid; passenger:=(row_data->>'passenger_id')::uuid;
  affected_date:=coalesce(row_data->>'ride_date',row_data->>'received_date')::date;
  select c.id into charge from public.monthly_charges c
  where c.user_id=owner_id and c.passenger_id=passenger
   and daterange(c.period_start,c.period_end,'[]') @> affected_date;
  if charge is not null and not (charge = any(seen)) then
   seen:=seen||charge;
   perform public.reconcile_charge_by_id(owner_id,charge);
  end if;
 end loop;
 return null;
end $$;
revoke all on function public.refresh_existing_charges() from public,anon,authenticated;

-- 2. Mesmo wrapper da 0011; só o ramo de criação muda. A busca por
-- (passageiro, reference_month) continua primeiro, então pay_charge e
-- cancel_charge_payment seguem passando por aqui sem tocar na criação.
create or replace function public.reconcile_charge(owner_id uuid, target_passenger uuid, month_date date)
returns public.monthly_charges language plpgsql security definer set search_path='' as $$
declare c public.monthly_charges; total numeric(10,2); last_day date; violated text; begin
 select * into c from public.monthly_charges where user_id=owner_id and passenger_id=target_passenger and reference_month=month_date;
 if found then
  return public.reconcile_charge_by_id(owner_id,c.id);
 end if;
 perform public.financial_month(month_date);
 if not exists(select 1 from public.passengers where id=target_passenger and user_id=owner_id) then
  raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501';
 end if;
 last_day := (month_date + interval '1 month')::date - 1;
 total := public.charge_period_total(owner_id,target_passenger,month_date,last_day);
 begin
  insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount,paid)
  values(owner_id,target_passenger,month_date,month_date,last_day,total,total=0) returning * into c;
 exception when exclusion_violation then
  get stacked diagnostics violated = constraint_name;
  if violated is distinct from 'charges_no_overlap' then raise; end if;
  raise exception 'CYCLE_OVERLAP' using errcode='23514',
   hint='Já existe um ciclo deste passageiro que cobre parte deste mês.';
 end;
 return c;
end $$;
revoke all on function public.reconcile_charge(uuid,uuid,date) from public,anon,authenticated;

-- 3. Diária ou compensação anterior ao primeiro ciclo do passageiro é rejeitada.
-- Só vale para quem já tem ciclo: sem nenhum fechamento, qualquer data (passada)
-- continua aceita. A regra olha o momento de gravar: inserir, ou mudar a data.
-- Editar o valor de um registro antigo que já existia não é bloqueado.
-- É definer porque lê monthly_charges, que o RLS de quem registra pode esconder.
create function public.reject_before_first_cycle() returns trigger
language plpgsql security definer set search_path='' as $$
declare new_date date; old_date date; first_start date; begin
 if tg_table_name='rides' then
  new_date:=new.ride_date;
  if tg_op='UPDATE' then old_date:=old.ride_date; end if;
 else
  new_date:=new.received_date;
  if tg_op='UPDATE' then old_date:=old.received_date; end if;
 end if;
 if tg_op='UPDATE' and new_date is not distinct from old_date then
  return new;
 end if;
 select min(c.reference_month) into first_start from public.monthly_charges c
 where c.user_id=new.user_id and c.passenger_id=new.passenger_id;
 if first_start is not null and new_date < first_start then
  raise exception 'BEFORE_FIRST_CYCLE' using errcode='23514',
   hint='Esta data é anterior ao primeiro fechamento deste passageiro (início em '||to_char(first_start,'YYYY-MM-DD')||').';
 end if;
 return new;
end $$;
revoke all on function public.reject_before_first_cycle() from public,anon,authenticated;
create trigger ride_before_first_cycle before insert or update of ride_date on public.rides
for each row execute function public.reject_before_first_cycle();
create trigger received_before_first_cycle before insert or update of received_date on public.received_rides
for each row execute function public.reject_before_first_cycle();

commit;
