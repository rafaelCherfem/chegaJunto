-- RideLedger — ciclo extensível (etapa 3 do fechamento por ciclos).
--
-- Um ciclo extensível fica aberto e cresce até o responsável encerrá-lo. Enquanto isso o
-- total gravado é "vivo": soma diárias e compensações de period_start em diante, sem limite
-- superior. Encerrar estende o ciclo (period_end = data escolhida) e deixa de ser extensível.
--
-- 1. monthly_charges.extensible boolean not null default false. SEM backfill: nenhuma
--    cobrança existente muda. A marcação da cobrança real é um UPDATE manual, depois.
--    Um índice parcial garante no máximo um ciclo extensível por passageiro.
-- 2. reconcile_charge_by_id e refresh_existing_charges reconhecem o ciclo extensível.
--    Cobrança não extensível: cálculo e gatilho idênticos aos da 0011 e da 0012.
-- 3. cycle_plan devolve EXTENDED para quem tem a última cobrança (maior period_end)
--    extensível. close_cycle estende; nunca cria cobrança nova para esse passageiro.
-- 4. preview_cycle e close_cycle ganham paid_amount, amount_due e refund_due ao FINAL das
--    colunas atuais (mesmos nomes e ordem). Mudou o tipo de retorno: DROP e CREATE.
-- 5. close_month recusa quando existe ciclo extensível do mesmo responsável.
--
-- pay_charge, cancel_charge_payment e reconcile_charge não mudam: passam por
-- reconcile_charge_by_id e usam o mesmo cálculo.
begin;

-- 1. Coluna. Sem backfill, sem data fixa.
alter table public.monthly_charges add column extensible boolean not null default false;
create unique index one_extensible_charge_per_passenger on public.monthly_charges(passenger_id) where extensible;

-- 2a. Recálculo por id. Só a linha do total muda: extensível soma até o fim dos tempos.
-- Como não existe diária futura, 9999-12-31 equivale a "sem limite superior".
create or replace function public.reconcile_charge_by_id(owner_id uuid, target_charge uuid)
returns public.monthly_charges language plpgsql security definer set search_path='' as $$
declare c public.monthly_charges; total numeric(10,2); begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id for update;
 if not found then
  raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501';
 end if;
 total := public.charge_period_total(owner_id,c.passenger_id,c.period_start,
  case when c.extensible then date '9999-12-31' else c.period_end end);
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

-- 2b. Gatilho. A cobrança afetada é a que contém a data ou, se extensível, a que começa
-- até a data. Para não extensível o conjunto é o mesmo da 0012 (no máximo uma cobrança).
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
  for charge in
   select c.id from public.monthly_charges c
   where c.user_id=owner_id and c.passenger_id=passenger
    and (daterange(c.period_start,c.period_end,'[]') @> affected_date
     or (c.extensible and affected_date >= c.period_start))
   order by c.period_start
  loop
   if not (charge = any(seen)) then
    seen:=seen||charge;
    perform public.reconcile_charge_by_id(owner_id,charge);
   end if;
  end loop;
 end loop;
 return null;
end $$;
revoke all on function public.refresh_existing_charges() from public,anon,authenticated;

-- 3 e 4. Plano de fechamento, close_cycle e preview_cycle. O tipo de retorno muda
-- (colunas novas no fim), então as três são recriadas e as permissões reaplicadas.
drop function public.close_cycle(date);
drop function public.preview_cycle(date);
drop function public.cycle_plan(uuid,date);

-- Colunas novas, sempre depois das antigas:
--   paid_amount  o que já foi recebido do ciclo (null onde não há cobrança afetada).
--   amount_due   o que falta receber; 0 se o ciclo está quitado (charge_settled).
--   refund_due   saldo a devolver: o que passou do total (ou, no total negativo, do que se deve).
create function public.cycle_plan(owner_id uuid, end_date date)
returns table(passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric,
 paid_amount numeric, amount_due numeric, refund_due numeric)
language plpgsql security definer set search_path='' as $$
declare total_passengers bigint; skipped_passengers bigint; earliest_blocked date; begin
 if end_date is null or not pg_catalog.isfinite(end_date) or end_date < date '0001-01-01' then
  raise exception 'INVALID_CYCLE_END' using errcode='23514',
   hint='Informe uma data de fim válida para o ciclo.';
 end if;
 if end_date > (pg_catalog.clock_timestamp() at time zone 'America/Sao_Paulo')::date then
  raise exception 'FUTURE_DATE' using errcode='23514',
   hint='A data de fim do ciclo não pode ser futura.';
 end if;

 -- Ciclo extensível não pode terminar antes de começar.
 select max(m.period_start) into earliest_blocked from public.monthly_charges m
 where m.user_id=owner_id and m.extensible and m.period_start > end_date
  and m.period_end = (select max(x.period_end) from public.monthly_charges x
   where x.user_id=owner_id and x.passenger_id=m.passenger_id);
 if earliest_blocked is not null then
  raise exception 'INVALID_CYCLE_END' using errcode='23514',
   hint='A data de fim não pode ser anterior ao início do ciclo em aberto ('||to_char(earliest_blocked,'YYYY-MM-DD')||').';
 end if;

 -- Todos os passageiros já fechados até end_date não têm o que fechar.
 -- Quem tem ciclo extensível nunca é pulado: o ciclo ainda pode ser encerrado.
 select count(*), count(*) filter (where lc.last_end >= end_date and not lc.last_ext)
 into total_passengers, skipped_passengers
 from (select u.passenger_id,
        (select max(m.period_end) from public.monthly_charges m
          where m.user_id=owner_id and m.passenger_id=u.passenger_id) as last_end,
        coalesce((select m.extensible from public.monthly_charges m
          where m.user_id=owner_id and m.passenger_id=u.passenger_id
          order by m.period_end desc limit 1),false) as last_ext
       from (select m.passenger_id from public.monthly_charges m where m.user_id=owner_id
             union select r.passenger_id from public.rides r where r.user_id=owner_id
             union select x.passenger_id from public.received_rides x where x.user_id=owner_id) u) lc;
 if total_passengers > 0 and skipped_passengers = total_passengers then
  raise exception 'INVALID_CYCLE_END' using errcode='23514',
   hint='Todos os passageiros já estão fechados até esta data.';
 end if;

 return query
 with candidates as (
   select m.passenger_id from public.monthly_charges m where m.user_id=owner_id
   union select r.passenger_id from public.rides r where r.user_id=owner_id
   union select x.passenger_id from public.received_rides x where x.user_id=owner_id),
 last_cycle as (
   select distinct on (m.passenger_id) m.passenger_id, m.id as last_id, m.period_start as last_start,
    m.period_end as last_end, m.extensible as last_ext, m.paid_amount as last_paid
   from public.monthly_charges m where m.user_id=owner_id
   order by m.passenger_id, m.period_end desc),
 first_movement as (
   select d.passenger_id, min(d.moved_on) as first_date from (
     select r.passenger_id, r.ride_date as moved_on from public.rides r where r.user_id=owner_id
     union all select x.passenger_id, x.received_date from public.received_rides x where x.user_id=owner_id) d
   group by d.passenger_id),
 starts as (
   select c.passenger_id, l.last_id, l.last_end, coalesce(l.last_ext,false) as is_ext, l.last_paid,
    case when l.last_ext then l.last_start
     when l.last_end is not null then l.last_end + 1 else f.first_date end as start_date
   from candidates c
   left join last_cycle l on l.passenger_id=c.passenger_id
   left join first_movement f on f.passenger_id=c.passenger_id),
 classified as (
   select s.passenger_id, s.last_id, s.last_end, s.last_paid, s.start_date,
    case when s.is_ext then 'EXTENDED'
     when s.last_end >= end_date then 'SKIPPED'
     when exists(select 1 from public.rides r where r.user_id=owner_id and r.passenger_id=s.passenger_id
       and r.ride_date >= s.start_date and r.ride_date <= end_date)
      or exists(select 1 from public.received_rides x where x.user_id=owner_id and x.passenger_id=s.passenger_id
       and x.received_date >= s.start_date and x.received_date <= end_date) then 'CLOSED'
     else 'NO_MOVEMENT' end as outcome
   from starts s),
 priced as (
   select k.*, case when k.outcome in ('CLOSED','EXTENDED')
     then public.charge_period_total(owner_id,k.passenger_id,k.start_date,end_date)::numeric(10,2) end as new_total,
    case when k.outcome='EXTENDED' then k.last_paid when k.outcome='CLOSED' then 0::numeric(10,2) end as new_paid
   from classified k)
 select p.passenger_id, p.outcome,
  case when p.outcome='SKIPPED' then 'ALREADY_CLOSED_UNTIL' end,
  case when p.outcome='EXTENDED' then p.last_id end,
  case when p.outcome<>'SKIPPED' then p.start_date end,
  case when p.outcome='SKIPPED' then p.last_end else end_date end,
  p.new_total,
  p.new_paid,
  case when p.new_total is null then null
   when public.charge_settled(p.new_total,p.new_paid) then 0::numeric(10,2) else (p.new_total-p.new_paid)::numeric(10,2) end,
  case when p.new_total is null then null
   when p.new_total>=0 then greatest(p.new_paid-p.new_total,0)::numeric(10,2)
   else greatest(p.new_total-p.new_paid,0)::numeric(10,2) end
 from priced p
 order by p.passenger_id;
end $$;
revoke all on function public.cycle_plan(uuid,date) from public,anon,authenticated;

create function public.close_cycle(end_date date)
returns table(passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric,
 paid_amount numeric, amount_due numeric, refund_due numeric)
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); planned record; before_row public.monthly_charges;
 c public.monthly_charges; begin
 for planned in select * from public.cycle_plan(owner_id,end_date) p order by p.passenger_id loop
  passenger_id:=planned.passenger_id; status:=planned.status; reason:=planned.reason;
  charge_id:=planned.charge_id; period_start:=planned.period_start; period_end:=planned.period_end;
  total_amount:=planned.total_amount; paid_amount:=planned.paid_amount;
  amount_due:=planned.amount_due; refund_due:=planned.refund_due;
  if planned.status='CLOSED' then
   -- Mesma criação da 0013: pago só se o total é zero. Nasce não extensível.
   insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount,paid,extensible)
   values(owner_id,planned.passenger_id,planned.period_start,planned.period_start,planned.period_end,
    planned.total_amount,planned.total_amount=0,false) returning * into c;
   charge_id:=c.id; total_amount:=c.total_amount;
  elsif planned.status='EXTENDED' then
   select * into before_row from public.monthly_charges m where m.id=planned.charge_id and m.user_id=owner_id for update;
   update public.monthly_charges m set period_end=end_date, extensible=false where m.id=before_row.id;
   -- Recalcula sobre o período novo; preserva paid_amount e grava REOPEN se havia pagamento vigente.
   c:=public.reconcile_charge_by_id(owner_id,before_row.id);
   -- O período mudou: confirmação velha tem de cair em STALE_OBLIGATION mesmo com o total igual.
   if c.revision = before_row.revision then
    update public.monthly_charges m set revision=m.revision+1 where m.id=c.id returning * into c;
   end if;
   total_amount:=c.total_amount; paid_amount:=c.paid_amount;
   amount_due:=case when public.charge_settled(c.total_amount,c.paid_amount) then 0::numeric(10,2) else (c.total_amount-c.paid_amount)::numeric(10,2) end;
   refund_due:=case when c.total_amount>=0 then greatest(c.paid_amount-c.total_amount,0)::numeric(10,2)
    else greatest(c.total_amount-c.paid_amount,0)::numeric(10,2) end;
  end if;
  if planned.status='CLOSED' then
   paid_amount:=c.paid_amount;
   amount_due:=case when public.charge_settled(c.total_amount,c.paid_amount) then 0::numeric(10,2) else (c.total_amount-c.paid_amount)::numeric(10,2) end;
   refund_due:=case when c.total_amount>=0 then greatest(c.paid_amount-c.total_amount,0)::numeric(10,2)
    else greatest(c.total_amount-c.paid_amount,0)::numeric(10,2) end;
  end if;
  return next;
 end loop;
end $$;

create function public.preview_cycle(end_date date)
returns table(passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric,
 paid_amount numeric, amount_due numeric, refund_due numeric)
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); begin
 return query select * from public.cycle_plan(owner_id,end_date);
end $$;

revoke all on function public.close_cycle(date),public.preview_cycle(date) from public,anon;
grant execute on function public.close_cycle(date),public.preview_cycle(date) to authenticated;

-- 5. close_month (corpo da 0008) recusa quando há ciclo extensível, para um app antigo em
-- cache não criar um mês por cima. Permissões preservadas pelo create or replace.
create or replace function public.close_month(month_date date) returns setof public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); target uuid; begin
 perform public.financial_month(month_date);
 if exists(select 1 from public.monthly_charges m where m.user_id=owner_id and m.extensible) then
  raise exception 'EXTENSIBLE_CYCLE_OPEN' using errcode='23514',
   hint='Existe um ciclo em aberto. Encerre o ciclo pela tela de cobranças antes de fechar um mês.';
 end if;
 for target in
  select passenger_id from public.monthly_charges where user_id=owner_id and reference_month=month_date
  union select passenger_id from public.rides where user_id=owner_id and ride_date>=month_date and ride_date<(month_date+interval '1 month')::date
  union select passenger_id from public.received_rides where user_id=owner_id and received_date>=month_date and received_date<(month_date+interval '1 month')::date
  order by 1
 loop return next public.reconcile_charge(owner_id,target,month_date); end loop;
end $$;

commit;
