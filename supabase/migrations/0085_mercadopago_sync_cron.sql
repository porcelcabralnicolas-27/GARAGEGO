-- GarageGo — barrido automático de Mercado Pago cada 5 minutos.
-- Requiere la 0084 y la Edge Function mp-sync desplegada.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE EXTENSION IF NOT EXISTS, CREATE OR REPLACE y el job se reprograma.
-- Re-correr OK.
--
-- ── Para qué ─────────────────────────────────────────────────────────────────────────────
-- El webhook de Mercado Pago confirma los pagos en segundos, pero puede no llegar (caída,
-- timeout, reintentos agotados), y un reembolso puede fallar (Mercado Pago no respondió). La
-- app ya llama a mp-sync al volver del checkout y al cancelar; este job cubre el resto: cada 5
-- minutos llama a mp-sync en modo barrido, que revisa las órdenes de las últimas 72 horas que no
-- se aplicaron y reintenta los reembolsos pendientes.
--
-- Usa pg_net (HTTP desde la base, la receta estándar de Supabase para programar Edge Functions)
-- y la clave compartida MP_SYNC_CRON_SECRET, que mp-sync exige en el header x-cron-secret.
--
-- ── ANTES de correr esta migración: guardar la clave en Vault (una sola vez) ─────────────
-- La clave NO va en este archivo (está en el repo). En otra consulta del SQL Editor, con el
-- mismo valor que se cargó en Supabase como MP_SYNC_CRON_SECRET:
--
--   select vault.create_secret('<el valor de MP_SYNC_CRON_SECRET>', 'mp_sync_cron_secret');
--
-- Si después se cambia la clave en Supabase, actualizarla también acá:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'mp_sync_cron_secret'),
--     '<el valor nuevo>');
--
-- ── Verificación ─────────────────────────────────────────────────────────────────────────
--   select public.run_mp_sync();                       -- devuelve el id del pedido HTTP
--   -- unos segundos después:
--   select status_code, content from net._http_response order by created desc limit 1;
--   -- tiene que dar 200 y un JSON con "mode":"sweep" (403 = la clave de Vault no coincide)
--   select jobname, schedule, active from cron.job where jobname = 'garagego-mp-sync';

create extension if not exists pg_net;


-- run_mp_sync: un pedido a mp-sync en modo barrido -------------------------------------
-- No espera la respuesta: pg_net la deja en net._http_response. Si falta la clave en Vault,
-- avisa y no llama (mp-sync respondería 403 de todos modos).

create or replace function public.run_mp_sync()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url constant text := 'https://rkrbjcchttidfppttrdq.supabase.co/functions/v1/mp-sync';
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'mp_sync_cron_secret';

  if v_secret is null then
    raise warning 'run_mp_sync: falta el secreto mp_sync_cron_secret en Vault (ver la 0085)';
    return null;
  end if;

  return net.http_post(
    url := v_url,
    body := '{"mode":"sweep"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.run_mp_sync() from public, anon, authenticated;


-- Job de pg_cron cada 5 minutos ----------------------------------------------------------

select cron.unschedule('garagego-mp-sync')
where exists (select 1 from cron.job where jobname = 'garagego-mp-sync');

select cron.schedule(
  'garagego-mp-sync',
  '*/5 * * * *',
  $$select public.run_mp_sync()$$
);
