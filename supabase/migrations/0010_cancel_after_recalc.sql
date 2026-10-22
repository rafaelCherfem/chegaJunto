-- RideLedger — desfazer pagamento depois de recálculo.
--
-- Antes: o recálculo zerava active_payment_id e o pagamento não podia mais ser
-- desfeito. Numa cobrança com saldo a devolver, "Desmarcar pagamento" não fazia
-- nada.
--
-- Agora: o pagamento mais recente que ainda compõe paid_amount pode ser
-- desfeito, com ou sem recálculo no meio. Só aquela parcela é estornada, e
-- desfazer em sequência volta uma parcela por vez.
--
-- Pagamentos vigentes: os PAYMENT sem CANCEL, do mais novo para o mais antigo,
-- até a soma fechar com paid_amount. O REOPEN da regra antiga (0008) zerava
-- paid_amount, então os pagamentos anteriores a ele ficam fora da soma. O
-- REOPEN da 0009 é só auditoria e não interfere.
begin;

create function public.charge_live_payments(target_charge uuid, paid numeric)
returns table(id uuid, revision bigint, signed_amount numeric, occurred_at timestamptz)
language sql stable set search_path='' as $$
 with open_payments as (
  -- Pagamentos que não foram cancelados.
  select p.id, p.revision, p.signed_amount, p.occurred_at
  from public.monthly_charge_events p
  where p.monthly_charge_id = target_charge
   and p.kind = 'PAYMENT'
   and not exists (
    select 1 from public.monthly_charge_events x
    where x.related_payment_id = p.id and x.kind = 'CANCEL'
   )
 ),
 running as (
  -- Soma acumulada do mais novo para o mais antigo.
  select o.id, o.revision, o.signed_amount, o.occurred_at,
   sum(o.signed_amount) over (
    order by o.revision desc
    rows between unbounded preceding and current row
   ) as running_total
  from open_payments o
 ),
 window_start as (
  -- Primeiro ponto, vindo do mais novo, em que a soma fecha com paid_amount.
  -- Sem valor recebido, ou sem a soma fechar, não há pagamento vigente.
  select max(r.revision) as revision
  from running r
  where paid <> 0 and r.running_total = paid
 )
 select r.id, r.revision, r.signed_amount, r.occurred_at
 from running r
 join window_start w on r.revision >= w.revision
 order by r.revision desc
$$;
revoke all on function public.charge_live_payments(uuid,numeric) from public,anon,authenticated;

create or replace function public.cancel_charge_payment(target_charge uuid,target_payment uuid) returns public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare
 owner_id uuid := public.financial_owner();
 c public.monthly_charges;
 latest_id uuid;
 latest_revision bigint;
 latest_amount numeric(10,2);
 remaining numeric(10,2);
 previous_paid_at timestamptz;
begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id;
 if not found then raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501'; end if;
 c := public.reconcile_charge(owner_id,c.passenger_id,c.reference_month);
 if c.total_amount=0 and c.paid_amount=0 then raise exception 'NO_OBLIGATION' using errcode='23514'; end if;
 if target_payment is null then raise exception 'STALE_OBLIGATION' using errcode='40001'; end if;

 -- Repetir o cancelamento que acabou de acontecer não faz nada.
 if c.active_payment_id is null and exists(select 1 from public.monthly_charge_events
   where monthly_charge_id=c.id and related_payment_id=target_payment and kind='CANCEL') then
  return c;
 end if;

 -- Só o pagamento vigente mais recente pode ser desfeito.
 select l.id, l.revision, l.signed_amount into latest_id, latest_revision, latest_amount
 from public.charge_live_payments(c.id, c.paid_amount) l
 order by l.revision desc
 limit 1;
 if latest_id is distinct from target_payment then
  raise exception 'STALE_OBLIGATION' using errcode='40001';
 end if;

 -- O que sobra nunca troca de sinal em relação ao que foi recebido.
 remaining := c.paid_amount - latest_amount;
 if remaining <> 0 and sign(remaining) <> sign(c.paid_amount) then
  raise exception 'PAYMENT_HISTORY_MISMATCH' using errcode='23514';
 end if;

 -- paid_at passa a ser a data do pagamento vigente anterior.
 select l.occurred_at into previous_paid_at
 from public.charge_live_payments(c.id, c.paid_amount) l
 where l.revision < latest_revision
 order by l.revision desc
 limit 1;

 insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount,related_payment_id)
 values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'CANCEL',latest_amount,latest_id);
 update public.monthly_charges set
  paid = public.charge_settled(c.total_amount, remaining),
  paid_amount = remaining,
  paid_at = case when remaining = 0 then null else previous_paid_at end,
  active_payment_id = null,
  revision = revision + 1
 where id = c.id returning * into c;
 return c;
end $$;

revoke all on function public.cancel_charge_payment(uuid,uuid) from public,anon;
grant execute on function public.cancel_charge_payment(uuid,uuid) to authenticated;

commit;
