-- Marca como extensível (ciclo em aberto) a ÚLTIMA cobrança de cada passageiro, quando ela é
-- um mês inteiro. Só a coluna extensible muda; total, pago, revisão e eventos não são tocados.
--
-- QUANDO RODAR: só DEPOIS das migrações 0014 e 0015 e do front novo estarem em produção.
-- Antes disso a coluna não existe e o script falha sem alterar nada.
--
-- COMO: no SQL Editor do Supabase (ou psql), com backup feito. Rode o script inteiro: ele abre
-- uma transação, mostra a conferência, atualiza, mostra de novo e confirma. Para só olhar,
-- troque o "commit;" do fim por "rollback;".
--
-- Critério (a) "última cobrança" = a de maior period_end do passageiro (os ciclos de um
-- passageiro nunca se sobrepõem, então não há empate).
-- Critério (b) "mês inteiro" = começa no dia 1 e termina no último dia do mesmo mês.
-- Critério (c) a cobrança é a de novembro de 2026 (period_start = 2026-11-01): nenhuma outra
-- cobrança de mês inteiro, por mais recente que seja para o passageiro, é marcada.
-- O UPDATE usa o id exato escolhido pela consulta; só atua se ainda for false (rodar de novo
-- não muda nada). O índice one_extensible_charge_per_passenger impede dois por passageiro.

begin;

-- 1. Antes
select c.id, c.reference_month, c.period_start, c.period_end, c.extensible,
       c.total_amount, c.paid_amount, c.revision
from public.monthly_charges c
order by c.passenger_id, c.period_end;

-- 2. Marcação
with ultima as (
  select distinct on (c.passenger_id) c.id, c.period_start, c.period_end
  from public.monthly_charges c
  order by c.passenger_id, c.period_end desc
),
alvo as (
  select u.id from ultima u
  where u.period_start = date '2026-11-01'
    and u.period_start = date_trunc('month', u.period_start)::date
    and u.period_end = (date_trunc('month', u.period_start) + interval '1 month - 1 day')::date
)
update public.monthly_charges c
set extensible = true
from alvo
where c.id = alvo.id and c.extensible = false
returning c.id, c.passenger_id, c.period_start, c.period_end;

-- 3. Depois
select c.id, c.reference_month, c.period_start, c.period_end, c.extensible,
       c.total_amount, c.paid_amount, c.revision
from public.monthly_charges c
order by c.passenger_id, c.period_end;

commit;
