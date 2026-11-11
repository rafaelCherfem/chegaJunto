-- Serve para comparar antes e depois da migração 0011 num banco LOCAL com dump
-- de produção restaurado. Não aplique contra produção e não contém dados.
--
-- Uso, com o banco local em 0010 (a 0011 ainda não aplicada):
--   1) docker exec -i supabase_db_rideledger psql -U postgres -v ON_ERROR_STOP=1 -v fase=antes  < scripts/validate-0011-backfill.sql
--   2) npx supabase migration up --local
--   3) docker exec -i supabase_db_rideledger psql -U postgres -v ON_ERROR_STOP=1 -v fase=depois < scripts/validate-0011-backfill.sql
-- Tudo precisa sair com ok = t. A fase "depois" apaga o schema temporário validation_0011.

select :'fase' = 'antes' as fase_antes, :'fase' = 'depois' as fase_depois \gset

\if :fase_antes
  drop schema if exists validation_0011 cascade;
  create schema validation_0011;
  create table validation_0011.charges as
    select id, user_id, passenger_id, reference_month, total_amount, paid, paid_amount,
           revision, paid_at, active_payment_id, recalculated_at, created_at
    from public.monthly_charges;
  create table validation_0011.events as select * from public.monthly_charge_events;
  select 'foto tirada' as item, count(*) as cobrancas,
         (select count(*) from validation_0011.events) as eventos
  from validation_0011.charges;
\elif :fase_depois
  select 'cobranças: mesma quantidade' as item,
         (select count(*) from validation_0011.charges) as antes,
         (select count(*) from public.monthly_charges) as depois,
         (select count(*) from validation_0011.charges) = (select count(*) from public.monthly_charges) as ok;

  select 'colunas financeiras idênticas' as item,
         not exists (
           select 1 from validation_0011.charges s
           join public.monthly_charges c using (id)
           where (s.user_id, s.passenger_id, s.reference_month, s.total_amount, s.paid, s.paid_amount,
                  s.revision, s.paid_at, s.active_payment_id, s.recalculated_at, s.created_at)
             is distinct from
                 (c.user_id, c.passenger_id, c.reference_month, c.total_amount, c.paid, c.paid_amount,
                  c.revision, c.paid_at, c.active_payment_id, c.recalculated_at, c.created_at)
         ) and not exists (
           select 1 from validation_0011.charges s where not exists (select 1 from public.monthly_charges c where c.id = s.id)
         ) as ok;

  select 'eventos idênticos' as item,
         (select count(*) from validation_0011.events) as antes,
         (select count(*) from public.monthly_charge_events) as depois,
         not exists (select * from validation_0011.events except select * from public.monthly_charge_events)
         and not exists (select * from public.monthly_charge_events except select * from validation_0011.events) as ok;

  select 'period_start = reference_month e period_end = último dia do mês' as item,
         count(*) as linhas, min(period_start) as primeiro_inicio, max(period_end) as ultimo_fim,
         coalesce(bool_and(
           period_start = reference_month
           and period_end = (date_trunc('month', reference_month) + interval '1 month - 1 day')::date
         ), true) as ok
  from public.monthly_charges;

  drop schema validation_0011 cascade;
\else
  \echo 'Informe -v fase=antes ou -v fase=depois'
  \quit
\endif
