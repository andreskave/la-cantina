-- pglite:omitir (usa pg_cron, que solo existe en Supabase)
-- =============================================================================
-- 12 · Fase 7: días fijos automáticos
-- =============================================================================
-- Todos los días hábiles a las 9:00 de Montevideo (12:00 UTC) anota el menú a los alumnos
-- con días fijos, en las cantinas que tienen el módulo prendido. Corre dentro de la base:
-- no necesita Edge Function ni secretos. Si se corre dos veces, no duplica.
create extension if not exists pg_cron;

select cron.schedule(
  'dias-fijos-diario',
  '0 12 * * 1-5',
  $$ select public.anotar_dias_fijos_todas(); $$
);
