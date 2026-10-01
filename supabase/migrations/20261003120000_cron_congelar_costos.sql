-- pglite:omitir (usa pg_cron, pg_net y Vault, que solo existen en Supabase)
-- =============================================================================
-- 08 · Fase 2: congelamiento diario del costo del menú
-- =============================================================================
-- Todos los días a las 00:15 de Montevideo (03:15 UTC; Uruguay no tiene horario de
-- verano desde 2015) llama a la Edge Function congelar-costos, que congela el día
-- anterior de cada cantina.
--
-- ANTES de aplicar esta migración hay que guardar dos secretos en Vault (SQL editor):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'service_role_key');
-- y desplegar la función:  npx supabase functions deploy congelar-costos

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'congelar-costos-diario',
  '15 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/congelar-costos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
