-- Serve para provar que a migração 0015 não muda nenhum dado existente. Banco LOCAL apenas;
-- não aplique contra produção e não contém dados.
--
-- Uso, com o banco local em 0014 (a 0015 ainda não aplicada) e com os dados do seed:
--   1) docker exec -i supabase_db_rideledger psql -U postgres -v ON_ERROR_STOP=1 -v fase=antes  < scripts/validate-0015-data.sql
--   2) npx supabase migration up --local
--   3) docker exec -i supabase_db_rideledger psql -U postgres -v ON_ERROR_STOP=1 -v fase=depois < scripts/validate-0015-data.sql
-- Tudo precisa sair com ok = t. A fase "depois" apaga o schema temporário validation_0015.

select :'fase' = 'antes' as fase_antes, :'fase' = 'depois' as fase_depois \gset

\if :fase_antes
  drop schema if exists validation_0015 cascade;
  create schema validation_0015;
  -- A 0015 só cria uma função: nenhuma coluna pode mudar.
  create table validation_0015.charges as
    select * from public.monthly_charges;
  create table validation_0015.events as select * from public.monthly_charge_events;
  select 'foto tirada' as item,
         (select count(*) from validation_0015.charges) as cobrancas,
         (select count(*) from validation_0015.events) as eventos,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from validation_0015.charges c) as hash_cobrancas,
         (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from validation_0015.events e) as hash_eventos;
\elif :fase_depois
  select 'cobranças: mesma quantidade' as item,
         (select count(*) from validation_0015.charges) as antes,
         (select count(*) from public.monthly_charges) as depois,
         (select count(*) from validation_0015.charges) = (select count(*) from public.monthly_charges) as ok;

  select 'cobranças: hash da linha inteira' as item,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from validation_0015.charges c) as hash_antes,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), ''))
            from public.monthly_charges c) as hash_depois,
         (select md5(coalesce(string_agg(c::text, '|' order by c.id), '')) from validation_0015.charges c)
         = (select md5(coalesce(string_agg(c::text, '|' order by c.id), ''))
              from public.monthly_charges c) as ok;

  select 'eventos: contagem e hash' as item,
         (select count(*) from validation_0015.events) as antes,
         (select count(*) from public.monthly_charge_events) as depois,
         (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from public.monthly_charge_events e) as hash_depois,
         (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from validation_0015.events e)
         = (select md5(coalesce(string_agg(e::text, '|' order by e.id), '')) from public.monthly_charge_events e)
         and not exists (select * from validation_0015.events except select * from public.monthly_charge_events)
         and not exists (select * from public.monthly_charge_events except select * from validation_0015.events) as ok;

  select 'a função register_payment passou a existir' as item,
         to_regprocedure('public.register_payment(uuid,numeric,bigint)') is not null as ok;

  drop schema validation_0015 cascade;
\else
  \echo 'Informe -v fase=antes ou -v fase=depois'
  \quit
\endif
