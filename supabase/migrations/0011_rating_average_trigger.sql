-- GarageGo — recalcula parking_lots.rating_avg automáticamente al calificar (Fase 7)
-- Ejecutar en Supabase Dashboard > SQL Editor > New query > Run

create or replace function public.update_parking_lot_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parking_lot_id uuid;
begin
  v_parking_lot_id := coalesce(new.parking_lot_id, old.parking_lot_id);

  update public.parking_lots
  set rating_avg = coalesce(
    (select round(avg(score)::numeric, 2) from public.ratings where parking_lot_id = v_parking_lot_id),
    0
  )
  where id = v_parking_lot_id;

  return coalesce(new, old);
end;
$$;

create trigger on_rating_change
  after insert or update or delete on public.ratings
  for each row execute function public.update_parking_lot_rating();
