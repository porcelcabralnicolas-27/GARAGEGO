-- GarageGo — cierra la escritura directa sobre `bookings` y agrega unicidad contable.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: DROP POLICY IF EXISTS / REVOKE / CREATE UNIQUE INDEX IF NOT EXISTS. Re-correr OK.
--
-- ── El agujero (auditoría técnica 2026-09-13, hallazgo 2.2, crítico) ─────────────────────
-- Desde la 0001, `bookings` tiene dos policies de escritura para el cliente:
--   * bookings_insert_own  → `with check (user_id = auth.uid())`
--   * bookings_update      → dueño de la reserva o dueño de la cochera, SIN restricción de columnas
-- La app nunca las usa (todo pasa por las RPC create/start/complete/cancel_booking, que son
-- security definer), pero con la anon key que viaja en el bundle cualquiera puede:
--   * insertar una reserva sin pagar (POST /rest/v1/bookings), y confirmarla con confirm_booking;
--   * subir `total_price` de su reserva y después cancelarla: el reembolso usa ese valor, así que
--     recibe más de lo que pagó;
--   * poner `status = 'completed'` para habilitar la calificación, mover fecha/horario, etc.
--
-- Arreglo: el cliente solo LEE `bookings`. Toda escritura pasa por las RPC de dominio.

drop policy if exists bookings_insert_own on public.bookings;
drop policy if exists bookings_update on public.bookings;

-- Además de sacar las policies, se quita el privilegio: si mañana alguien agrega una policy de
-- escritura por error, sigue sin poder escribirse desde PostgREST.
revoke insert, update, delete on public.bookings from anon, authenticated;


-- ── confirm_booking ya no es invocable desde el cliente ──────────────────────────────────
-- Es código muerto desde Q1·A (2026-09-03): create_booking crea la reserva ya 'confirmed' y
-- la app no la llama. Combinada con el insert directo de arriba, dejaba confirmar reservas
-- que nunca se pagaron. La confirmación por pago de Mercado Pago va a tener su propia RPC,
-- otorgada solo al rol de servicio. No se borra para no romper nada que la referencie.

revoke execute on function public.confirm_booking(uuid) from public, anon, authenticated;


-- ── Unicidad contable (hallazgo 1.1 / recomendación 5.1) ─────────────────────────────────
-- Una reserva genera a lo sumo UN movimiento de cada tipo: un pago, un reembolso, una
-- acreditación al propietario y un cargo por excedente. Con esto, aunque una carrera entre
-- dos llamadas concurrentes pasara todas las validaciones, el segundo insert falla y la
-- transacción entera se revierte: no hay doble reembolso ni doble cobro.

do $$
declare
  v_dupes integer;
begin
  select count(*) into v_dupes
  from (
    select related_booking_id, type
    from public.wallet_transactions
    where related_booking_id is not null
      and type in ('booking_payment', 'refund', 'earning', 'overtime_charge')
    group by related_booking_id, type
    having count(*) > 1
  ) d;

  if v_dupes > 0 then
    raise exception
      'Hay % combinaciones (reserva, tipo) con movimientos duplicados. Revisarlas antes de correr esta migración: select related_booking_id, type, count(*) from public.wallet_transactions where related_booking_id is not null and type in (''booking_payment'',''refund'',''earning'',''overtime_charge'') group by 1, 2 having count(*) > 1;',
      v_dupes;
  end if;
end;
$$;

create unique index if not exists wallet_transactions_one_per_booking_type
  on public.wallet_transactions (related_booking_id, type)
  where related_booking_id is not null
    and type in ('booking_payment', 'refund', 'earning', 'overtime_charge');
