-- RideLedger — pagamento de valor livre (etapa B2).
--
-- register_payment(target_charge, payment_amount, expected_revision) registra um adiantamento
-- ou pagamento parcial de qualquer valor, em ciclo extensível ou já encerrado.
--
-- Mesmas proteções do pay_charge: lock por dono (financial_owner), cobrança do dono e
-- reconcile_charge_by_id ANTES de conferir a revisão (o total vivo entra primeiro).
-- Grava um evento PAYMENT (signed_amount = valor, related_payment_id nulo) com a revisão
-- confirmada e sobe a revisão da cobrança em uma unidade (one_payment_per_revision exige).
-- paid_amount soma o valor, paid vem de charge_settled, paid_at recebe o occurred_at do evento.
-- active_payment_id NÃO é preenchido: ele continua sendo o "pagamento integral vigente" do
-- pay_charge. Desfazer segue por cancel_charge_payment + charge_live_payments, um por vez.
--
-- Nenhuma tabela, coluna ou dado é alterado. pay_charge e cancel_charge_payment não mudam.
begin;

create function public.register_payment(target_charge uuid, payment_amount numeric, expected_revision bigint)
returns public.monthly_charges
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=public.financial_owner(); c public.monthly_charges; payment uuid; paid_time timestamptz;
 outstanding numeric(10,2); begin
 select * into c from public.monthly_charges where id=target_charge and user_id=owner_id;
 if not found then raise exception 'FINANCIAL_FORBIDDEN' using errcode='42501'; end if;
 -- Total vivo primeiro; só depois a revisão.
 c:=public.reconcile_charge_by_id(owner_id,c.id);
 if expected_revision is null or c.revision<>expected_revision then
  raise exception 'STALE_OBLIGATION' using errcode='40001';
 end if;

 -- Valor: numeric puro, sem arredondar sozinho. Nulo, NaN, infinito, <= 0 ou mais de 2 casas.
 if payment_amount is null or payment_amount::text in ('NaN','Infinity','-Infinity')
  or payment_amount <= 0 or payment_amount <> pg_catalog.round(payment_amount,2) then
  raise exception 'INVALID_PAYMENT_AMOUNT' using errcode='23514',
   hint='Informe um valor maior que zero, com no máximo duas casas decimais.';
 end if;
 -- Nada a pagar: total zero ou negativo (o responsável deve ao passageiro) ou já quitado.
 if c.total_amount <= 0 or public.charge_settled(c.total_amount,c.paid_amount) then
  raise exception 'NO_OBLIGATION' using errcode='23514',
   hint='Não há nada a receber desta cobrança.';
 end if;
 outstanding:=c.total_amount-c.paid_amount;
 if payment_amount > outstanding then
  raise exception 'PAYMENT_EXCEEDS_OUTSTANDING' using errcode='23514',
   hint='O valor é maior que o que falta receber. Falta receber '||outstanding::text||'.';
 end if;

 begin
  insert into public.monthly_charge_events(monthly_charge_id,user_id,passenger_id,reference_month,revision,kind,signed_amount)
  values(c.id,c.user_id,c.passenger_id,c.reference_month,c.revision,'PAYMENT',payment_amount)
  returning id,occurred_at into payment,paid_time;
 exception when unique_violation then
  raise exception 'STALE_OBLIGATION' using errcode='40001';
 end;
 update public.monthly_charges set paid_amount=c.paid_amount+payment_amount,
  paid=public.charge_settled(c.total_amount,c.paid_amount+payment_amount),
  paid_at=paid_time,revision=c.revision+1
 where id=c.id returning * into c;
 return c;
end $$;

revoke all on function public.register_payment(uuid,numeric,bigint) from public,anon;
grant execute on function public.register_payment(uuid,numeric,bigint) to authenticated;

commit;
