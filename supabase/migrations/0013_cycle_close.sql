-- RideLedger — fechamento por ciclo livre (etapa 2 do fechamento por ciclos).
--
-- cycle_plan(owner, end_date)  interna: calcula o plano de fechamento, sem gravar.
-- close_cycle(end_date)        grava o plano (uma cobrança por passageiro com movimento).
-- preview_cycle(end_date)      devolve o mesmo resumo, sem gravar.
--
-- Para cada passageiro do responsável que tenha cobrança, diária ou compensação:
--   início = fim do último ciclo + 1; sem ciclo, a menor data entre diárias e compensações.
--   SKIPPED     o último ciclo já termina em end_date ou depois (reason ALREADY_CLOSED_UNTIL;
--               period_end devolve o fim desse último ciclo).
--   NO_MOVEMENT nada entre o início e end_date: não cria cobrança zerada.
--   CLOSED      cria a cobrança com reference_month = period_start = início e period_end = end_date.
-- Se todos os passageiros forem SKIPPED, INVALID_CYCLE_END. Se só alguns forem, o resumo sai
-- normal e os demais são fechados.
--
-- close_month, recalculate_charge, pay_charge e cancel_charge_payment não mudam.
-- Nenhuma tabela, coluna ou dado é alterado.
begin;

-- Plano de fechamento. Não grava nada: é o que preview_cycle devolve e o que close_cycle
-- executa. As validações de end_date ficam aqui para valerem igual nos dois.
-- Quem chama já validou o responsável e já segura o lock do dono (financial_owner).
create function public.cycle_plan(owner_id uuid, end_date date)
returns table(passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric)
language plpgsql security definer set search_path='' as $$
declare total_passengers bigint; skipped_passengers bigint; begin
 if end_date is null or not pg_catalog.isfinite(end_date) or end_date < date '0001-01-01' then
  raise exception 'INVALID_CYCLE_END' using errcode='23514',
   hint='Informe uma data de fim válida para o ciclo.';
 end if;
 if end_date > (pg_catalog.clock_timestamp() at time zone 'America/Sao_Paulo')::date then
  raise exception 'FUTURE_DATE' using errcode='23514',
   hint='A data de fim do ciclo não pode ser futura.';
 end if;

 -- Todos os passageiros já fechados até end_date não têm o que fechar.
 select count(*), count(*) filter (where lc.last_end >= end_date) into total_passengers, skipped_passengers
 from (select u.passenger_id, (select max(m.period_end) from public.monthly_charges m
        where m.user_id=owner_id and m.passenger_id=u.passenger_id) as last_end
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
   select m.passenger_id, max(m.period_end) as last_end from public.monthly_charges m
   where m.user_id=owner_id group by m.passenger_id),
 first_movement as (
   select d.passenger_id, min(d.moved_on) as first_date from (
     select r.passenger_id, r.ride_date as moved_on from public.rides r where r.user_id=owner_id
     union all select x.passenger_id, x.received_date from public.received_rides x where x.user_id=owner_id) d
   group by d.passenger_id),
 starts as (
   select c.passenger_id, l.last_end,
    case when l.last_end is not null then l.last_end + 1 else f.first_date end as start_date
   from candidates c
   left join last_cycle l on l.passenger_id=c.passenger_id
   left join first_movement f on f.passenger_id=c.passenger_id),
 classified as (
   select s.passenger_id, s.last_end, s.start_date,
    case when s.last_end >= end_date then 'SKIPPED'
     when exists(select 1 from public.rides r where r.user_id=owner_id and r.passenger_id=s.passenger_id
       and r.ride_date >= s.start_date and r.ride_date <= end_date)
      or exists(select 1 from public.received_rides x where x.user_id=owner_id and x.passenger_id=s.passenger_id
       and x.received_date >= s.start_date and x.received_date <= end_date) then 'CLOSED'
     else 'NO_MOVEMENT' end as outcome
   from starts s)
 select k.passenger_id, k.outcome,
  case when k.outcome='SKIPPED' then 'ALREADY_CLOSED_UNTIL' end,
  null::uuid,
  case when k.outcome<>'SKIPPED' then k.start_date end,
  case when k.outcome='SKIPPED' then k.last_end else end_date end,
  case when k.outcome='CLOSED'
   then public.charge_period_total(owner_id,k.passenger_id,k.start_date,end_date)::numeric(10,2) end
 from classified k
 order by k.passenger_id;
end $$;
revoke all on function public.cycle_plan(uuid,date) from public,anon,authenticated;

create function public.close_cycle(end_date date)
returns table(passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric)
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); planned record; created public.monthly_charges; begin
 for planned in select * from public.cycle_plan(owner_id,end_date) p order by p.passenger_id loop
  passenger_id:=planned.passenger_id; status:=planned.status; reason:=planned.reason;
  charge_id:=null; period_start:=planned.period_start; period_end:=planned.period_end;
  total_amount:=planned.total_amount;
  if planned.status='CLOSED' then
   -- Mesma criação do reconcile_charge: pago só se o total é zero. Pagamento parcial e saldo
   -- a devolver passam a valer nos recálculos seguintes (reconcile_charge_by_id).
   insert into public.monthly_charges(user_id,passenger_id,reference_month,period_start,period_end,total_amount,paid)
   values(owner_id,planned.passenger_id,planned.period_start,planned.period_start,planned.period_end,
    planned.total_amount,planned.total_amount=0) returning * into created;
   charge_id:=created.id; total_amount:=created.total_amount;
  end if;
  return next;
 end loop;
end $$;

create function public.preview_cycle(end_date date)
returns table(passenger_id uuid, status text, reason text, charge_id uuid,
 period_start date, period_end date, total_amount numeric)
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); begin
 return query select * from public.cycle_plan(owner_id,end_date);
end $$;

revoke all on function public.close_cycle(date),public.preview_cycle(date) from public,anon;
grant execute on function public.close_cycle(date),public.preview_cycle(date) to authenticated;

commit;
