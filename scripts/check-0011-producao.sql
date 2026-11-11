-- ATENÇÃO: rodar só no Studio da produção, somente leitura (apenas SELECT).
-- Não rode isto por CLI nem contra o banco local de outra pessoa; é a checagem
-- de antes de aplicar a migração 0011 (período próprio nas cobranças).
-- No Studio, execute UMA consulta por vez: ele mostra só o último resultado.
-- Resultado esperado de (a), (b) e (c): zeros / nenhuma linha. (d) é para conferência.

-- (a) cobranças duplicadas, fora do dia 1 ou com meses sobrepostos (esperado: tudo 0)
select 'duplicada (passageiro + mês)' as problema, count(*) as qtd
from (select 1 from public.monthly_charges group by passenger_id, reference_month having count(*) > 1) d
union all
select 'reference_month fora do dia 1', count(*)
from public.monthly_charges where extract(day from reference_month) <> 1
union all
select 'meses sobrepostos do mesmo passageiro', count(*)
from public.monthly_charges a
join public.monthly_charges b on a.passenger_id = b.passenger_id and a.id < b.id
 and daterange(a.reference_month, (a.reference_month + interval '1 month')::date)
  && daterange(b.reference_month, (b.reference_month + interval '1 month')::date);

-- (b) diárias/compensações dentro do intervalo cobrado do passageiro, mas fora de qualquer mês cobrado (esperado: nenhuma linha)
with bounds as (
  select passenger_id, min(reference_month) as first_m, max((reference_month + interval '1 month')::date) as end_excl
  from public.monthly_charges group by passenger_id),
movs as (
  select 'diária' as tipo, passenger_id, ride_date as d, rate_charged as valor from public.rides
  union all
  select 'compensação', passenger_id, received_date, amount from public.received_rides)
select m.tipo, p.name, m.passenger_id, m.d as data, m.valor
from movs m
join bounds b using (passenger_id)
left join public.passengers p on p.id = m.passenger_id
where m.d >= b.first_m and m.d < b.end_excl
  and not exists (select 1 from public.monthly_charges c
    where c.passenger_id = m.passenger_id and m.d >= c.reference_month and m.d < (c.reference_month + interval '1 month')::date)
order by p.name, m.d;

-- (c) diárias/compensações anteriores à primeira cobrança do passageiro (esperado: nenhuma linha)
with bounds as (
  select passenger_id, min(reference_month) as first_m from public.monthly_charges group by passenger_id),
movs as (
  select 'diária' as tipo, passenger_id, ride_date as d, rate_charged as valor from public.rides
  union all
  select 'compensação', passenger_id, received_date, amount from public.received_rides)
select m.tipo, p.name, m.passenger_id, m.d as data, m.valor, b.first_m as primeira_cobranca
from movs m
join bounds b using (passenger_id)
left join public.passengers p on p.id = m.passenger_id
where m.d < b.first_m
order by p.name, m.d;

-- (d) cobranças por passageiro e mês, com total e pago
select p.name, c.passenger_id, c.reference_month,
       count(*) as qtd, sum(c.total_amount) as total, sum(c.paid_amount) as pago,
       bool_and(c.paid) as quitada, max(c.revision) as revision
from public.monthly_charges c
left join public.passengers p on p.id = c.passenger_id
group by p.name, c.passenger_id, c.reference_month
order by p.name, c.reference_month;
