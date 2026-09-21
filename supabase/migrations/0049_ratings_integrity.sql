-- GarageGo — una calificación siempre queda asociada a la cochera de su reserva.
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run
--
-- Idempotente: CREATE OR REPLACE + DROP/CREATE TRIGGER + constraint condicional. Re-correr OK.
--
-- ── El agujero (auditoría técnica 2026-09-13, hallazgo 2.3, crítico) ─────────────────────
-- `ratings_insert_own` (0001) valida que la reserva sea del usuario y esté 'completed', pero
-- NO que `ratings.parking_lot_id` sea la cochera de esa reserva. El trigger de la 0011
-- recalcula el promedio con el `parking_lot_id` que manda el cliente. Resultado: con una sola
-- reserva completada en cualquier lado, se puede poner un 1 (o un 5) a la cochera de otro.
-- El insert tampoco impide mandar `created_at` o las columnas de moderación de la 0044
-- (`is_hidden`, `hidden_*`).
--
-- ── Arreglo ──────────────────────────────────────────────────────────────────────────────
-- Trigger BEFORE INSERT que ignora lo que mande el cliente en esas columnas y las completa
-- desde el servidor. Se prefiere a endurecer la policy porque la app no tiene que cambiar y
-- porque además normaliza los campos que la policy no podría controlar.

create or replace function public.normalize_rating_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id uuid;
begin
  select b.parking_lot_id into v_lot_id from public.bookings b where b.id = new.booking_id;
  if v_lot_id is null then
    raise exception 'Reserva no encontrada';
  end if;

  new.parking_lot_id := v_lot_id;
  new.created_at     := now();
  new.is_hidden      := false;
  new.hidden_reason  := null;
  new.hidden_at      := null;
  new.hidden_by      := null;
  -- La policy ya exige user_id = auth.uid(); esto cubre además inserts sin policy de por medio
  -- que vengan con sesión. Sin sesión (postgres / service_role) se respeta lo que viene.
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists ratings_normalize_insert on public.ratings;
create trigger ratings_normalize_insert
  before insert on public.ratings
  for each row execute function public.normalize_rating_insert();

-- Largo máximo del comentario. NOT VALID: no revisa filas viejas (no se quiere que la migración
-- falle por un comentario largo histórico), pero sí se aplica a todo insert/update nuevo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ratings_comment_length' and conrelid = 'public.ratings'::regclass
  ) then
    alter table public.ratings
      add constraint ratings_comment_length check (comment is null or char_length(comment) <= 1000) not valid;
  end if;
end;
$$;

-- Reparación única: si alguna calificación quedó colgada de una cochera que no era la de su
-- reserva, se la devuelve a la correcta y se recalculan TODOS los promedios. El trigger de la
-- 0011 recalcula por fila; acá se hace de una vez para cubrir también la cochera de origen.
update public.ratings r
set parking_lot_id = b.parking_lot_id
from public.bookings b
where b.id = r.booking_id
  and r.parking_lot_id <> b.parking_lot_id;

update public.parking_lots p
set rating_avg = coalesce(
  (select round(avg(r.score)::numeric, 2) from public.ratings r where r.parking_lot_id = p.id),
  0
);
