-- Serve para provar que a migração 0014 não muda nenhum dado existente. Banco LOCAL apenas;
-- não aplique contra produção e não contém dados.
--
-- Uso, com o banco local em 0013 (a 0014 ainda não aplicada) e com os dados do seed:
--   1) docker exec -i supabase_db_rideledger psql -U postgres -v ON_ERROR_STOP=1 -v fase=antes  < scripts/validate-0014-data.sql
--   2) npx supabase migration up --local
--   3) docker exec -i supabase_db_rideledger psql -U postgres -v ON_ERROR_STOP=1 -v fase=depois < scripts/validate-0014-data.sql
-- Tudo precisa sair com ok = t. A fase "depois" apaga o schema temporário validation_0014.

select :'fase' = 'antes' as fase_antes, :'fase' = 'depois' as fase_depois \gset

\if :fase_antes
  drop schema if exists validation_0014 cascade;
  create schema validation_0014;
  -- Só as colunas financeiras que a 0014 não pode tocar.
  create table validation_0014.charges as
    select id, total_amount, paid, paid_amount, revision, paid_at, active_payment_id
    from public.monthly_charges;
  create table validation_0014.events as select * from public.monthly_charge_events;
  select 'foto tirada' as item,
         (select count(*) from validation_0014.charges) as cobrancas,
         (select count(*) from validation_0014.events) as eventos,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from validation_0014.charges c) as hash_cobrancas,
         (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from validation_0014.events e) as hash_eventos;
\elif :fase_depois
  select 'cobranças: mesma quantidade' as item,
         (select count(*) from validation_0014.charges) as antes,
         (select count(*) from public.monthly_charges) as depois,
         (select count(*) from validation_0014.charges) = (select count(*) from public.monthly_charges) as ok;

  select 'cobranças: hash das colunas financeiras' as item,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from validation_0014.charges c) as hash_antes,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), ''))
            from (select id, total_amount, paid, paid_amount, revision, paid_at, active_payment_id
                  from public.monthly_charges) c) as hash_depois,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from validation_0014.charges c)
         = (select md5(coalesce(string_agg(c::text, '|' order by c.id), ''))
              from (select id, total_amount, paid, paid_amount, revision, paid_at, active_payment_id
                    from public.monthly_charges) c) as ok;

  select 'eventos: contagem e hash' as item,
         (select count(*) from validation_0014.events) as antes,
         (select count(*) from public.monthly_charge_events) as depois,
         (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from public.monthly_charge_events e) as hash_depois,
         (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from validation_0014.events e)
         = (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from public.monthly_charge_events e)
         and not exists (select * from validation_0014.events except select * from public.monthly_charge_events)
         and not exists (select * from public.monthly_charge_events except select * from validation_0014.events) as ok;

  select 'nenhuma cobrança nasce extensível' as item,
         count(*) as linhas, count(*) filter (where extensible) as extensiveis,
         count(*) filter (where extensible) = 0 as ok
  from public.monthly_charges;

  drop schema validation_0014 cascade;
\else
  \echo 'Informe -v fase=antes ou -v fase=depois'
  \quit
\endif
