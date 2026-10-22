-- RideLedger — pagamento parcial na competência.
--
-- Antes: quando o total da competência mudava depois de um pagamento, o valor
-- já recebido era zerado e a cobrança voltava inteira. Registrar uma diária
-- depois de receber fazia o app cobrar de novo o que já tinha sido pago.
--
-- Agora: paid_amount é preservado no recálculo e só a diferença é cobrada.
-- Se o total cair abaixo do que já foi recebido, a cobrança fica quitada e a
-- diferença aparece como saldo a devolver ao passageiro.
begin;

-- Quitada quando não há mais nada a cobrar, nos dois sentidos: uma competência
-- negativa (o responsável deve ao passageiro) quita ao alcançar o total.
create function public.charge_settled(total numeric, paid numeric) returns boolean
language sql immutable set search_path='' as $$
 select case when total >= 0 then paid >= total else paid <= total end
$$;
revoke all on function public.charge_settled(numeric,numeric) from public,anon,authenticated;

create or replace function public.reconcile_charge(owner_id uuid, target_passenger uuid, month_date date)
returns public.monthly_charges language plpgsql security definer set search_path='' as $$
declare c public.monthly_charges; total numeric(10,2); begin
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

create or replace function public.pay_charge(target_charge uuid,expected_revision bigint) returns public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); c public.monthly_charges; payment uuid; paid_time timestamptz; outstanding numeric(10,2); begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id;
 if not found then raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501'; end if;
 c:=public.reconcile_charge(owner_id,c.passenger_id,c.reference_month);
 if expected_revision is null or c.revision<>expected_revision then raise exception 'STALE_OBLIGATION' using errcode='40001'; end if;
 -- Registra apenas o que falta, nunca o total novamente.
 if c.active_payment_id is not null then return c; end if;
 outstanding:=c.total_amount-c.paid_amount;
 if public.charge_settled(c.total_amount,c.paid_amount) then raise exception 'NO_OBLIGATION' using errcode='23514'; end if;
 insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount)
 values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'PAYMENT',outstanding)
 returning id,occurred_at into payment,paid_time;
 update public.monthly_charges set paid=true,paid_amount=c.paid_amount+outstanding,paid_at=paid_time,active_payment_id=payment
 where id=c.id returning * into c;
 return c;
end $$;

create or replace function public.cancel_charge_payment(target_charge uuid,target_payment uuid) returns public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); c public.monthly_charges; reverted numeric(10,2); remaining numeric(10,2); begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id;
 if not found then raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501'; end if;
 c:=public.reconcile_charge(owner_id,c.passenger_id,c.reference_month);
 if c.total_amount=0 and c.paid_amount=0 then raise exception 'NO_OBLIGATION' using errcode='23514'; end if;
 if target_payment is null then raise exception 'STALE_OBLIGATION' using errcode='40001'; end if;
 if c.active_payment_id is distinct from target_payment then
  if c.active_payment_id is null and exists(select 1 from public.monthly_charge_events
    where monthly_charge_id=c.id and related_payment_id=target_payment and kind='CANCEL') then return c; end if;
  raise exception 'STALE_OBLIGATION' using errcode='40001';
 end if;
 -- Estorna só o valor daquele pagamento; parcelas anteriores seguem registradas.
 select signed_amount into reverted from public.monthly_charge_events where id=target_payment;
 remaining:=c.paid_amount-reverted;
 insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id)
 values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'CANCEL',reverted,target_payment);
 update public.monthly_charges set paid=public.charge_settled(c.total_amount,remaining),paid_amount=remaining,
  paid_at=case when remaining=0 then null else c.paid_at end,
  active_payment_id=null,revision=revision+1
 where id=c.id returning * into c;
 return c;
end $$;

revoke all on function public.reconcile_charge(uuid,uuid,date) from public,anon,authenticated;
revoke all on function public.pay_charge(uuid,bigint),public.cancel_charge_payment(uuid,uuid) from public,anon;
grant execute on function public.pay_charge(uuid,bigint),public.cancel_charge_payment(uuid,uuid) to authenticated;

commit;
