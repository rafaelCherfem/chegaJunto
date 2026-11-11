-- RideLedger — cobrança identificada por período (etapa 1 do fechamento por ciclos).
--
-- Cada cobrança passa a carregar o próprio intervalo de datas (period_start e
-- period_end, ambos inclusivos). Hoje todo ciclo ainda é um mês de calendário e
-- close_month continua funcionando exatamente como antes; esta migração só
-- prepara o terreno para ciclos livres nas próximas etapas.
--
-- reference_month NÃO é renomeado: ele está na chave que liga os eventos
-- financeiros (0008) às cobranças e dentro das funções de pagamento. Passa a ser
-- um campo legado, imutável e sempre igual a period_start.
--
-- Nada em monthly_charge_events é alterado (trilha append-only).
-- pay_charge e cancel_charge_payment continuam exatamente como na 0009/0010.
begin;

create extension if not exists btree_gist with schema extensions;

-- 1. Período em cada cobrança. O backfill só toca as duas colunas novas.
alter table public.monthly_charges
 add column period_start date,
 add column period_end date;

update public.monthly_charges
 set period_start = reference_month,
     period_end = ((reference_month + interval '1 month')::date - 1);

alter table public.monthly_charges
 alter column period_start set not null,
 alter column period_end set not null;

-- Inserção no formato antigo (só reference_month) continua válida: o período
-- vira o mês de calendário de reference_month.
create function public.default_charge_period() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.period_start := coalesce(new.period_start, new.reference_month);
 new.period_end := coalesce(new.period_end,
  ((pg_catalog.date_trunc('month', new.period_start) + interval '1 month')::date - 1));
 return new;
end $$;
revoke all on function public.default_charge_period() from public,anon,authenticated;
create trigger charge_period_defaults before insert on public.monthly_charges
for each row execute function public.default_charge_period();

-- 2. Datas válidas e invariante reference_month = period_start.
alter table public.monthly_charges
 add constraint charges_period_valid check(
  isfinite(period_start) and isfinite(period_end)
  and period_start >= date '0001-01-01' and period_end <= date '9999-12-31'
  and period_start <= period_end),
 add constraint charges_reference_is_period_start check(reference_month = period_start);

create trigger charge_reference_immutable before update on public.monthly_charges
for each row execute function public.prevent_relationship_update('reference_month');

-- 3. A cobrança deixa de ter de começar no dia 1.
alter table public.monthly_charges drop constraint charges_canonical_month;

-- 4. Ciclos do mesmo passageiro não podem se sobrepor (intervalo fechado nas duas pontas).
alter table public.monthly_charges
 add constraint charges_no_overlap exclude using gist (
  passenger_id with =,
  daterange(period_start, period_end, '[]') with &&);

-- 5. Total do período: diárias menos compensações entre as duas datas, inclusive.
create function public.charge_period_total(owner_id uuid, target_passenger uuid, start_date date, end_date date)
returns numeric language sql stable set search_path='' as $$
 select coalesce((select sum(rate_charged) from public.rides where user_id=owner_id and passenger_id=target_passenger
  and ride_date>=start_date and ride_date<=end_date),0)
 -coalesce((select sum(amount) from public.received_rides where user_id=owner_id and passenger_id=target_passenger
  and received_date>=start_date and received_date<=end_date),0)
$$;
revoke all on function public.charge_period_total(uuid,uuid,date,date) from public,anon,authenticated;

-- Recalcula uma cobrança existente pelo id, com a mesma regra da 0009
-- (pagamento parcial preservado, só a diferença é cobrada).
create function public.reconcile_charge_by_id(owner_id uuid, target_charge uuid)
returns public.monthly_charges language plpgsql security definer set search_path='' as $$
declare c public.monthly_charges; total numeric(10,2); begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id for update;
 if not found then
  raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501';
 end if;
 total := public.charge_period_total(owner_id,c.passenger_id,c.period_start,c.period_end);
 if c.total_amount<>total then
  -- Audita a mudança de valor sobre o pagamento vigente, uma vez por pagamento.
  if c.active_payment_id is not null and c.paid_amount <> 0 then
   insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id)
   values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'REOPEN',c.paid_amount,c.active_payment_id);
  end if;
  -- paid_amount permanece: o que foi recebido continua recebido.
  update public.monthly_charges set total_amount=total,revision=revision+1,
   paid=public.charge_settled(total,c.paid_amount),
   paid_at=case when c.paid_amount=0 then null else c.paid_at end,
   active_payment_id=null,recalculated_at=clock_timestamp() where id=c.id returning * into c;
 else
  update public.monthly_charges set paid=public.charge_settled(total,c.paid_amount),recalculated_at=clock_timestamp()
   where id=c.id returning * into c;
 end if;
 return c;
end $$;
revoke all on function public.reconcile_charge_by_id(uuid,uuid) from public,anon,authenticated;

-- Mesma assinatura da 0009: acha a cobrança por (passageiro, reference_month) e
-- delega ao recálculo por id; se não existe, cria o ciclo mensal.
-- A busca vem antes da validação do dia 1: pay_charge e cancel_charge_payment
-- chamam esta função com o reference_month da cobrança, que em ciclos livres
-- (próximas etapas) pode não ser dia 1. Cobrança existente já pertence ao dono
-- (FK composta), então a checagem de passageiro só importa na criação.
create or replace function public.reconcile_charge(owner_id uuid, target_passenger uuid, month_date date)
returns public.monthly_charges language plpgsql security definer set search_path='' as $$
declare c public.monthly_charges; total numeric(10,2); last_day date; begin
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
 insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount,paid)
 values(owner_id,target_passenger,month_date,month_date,last_day,total,total=0) returning * into c;
 return c;
end $$;
revoke all on function public.reconcile_charge(uuid,uuid,date) from public,anon,authenticated;

commit;
