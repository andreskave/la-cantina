-- =============================================================================
-- 09 · Fase 4: el consumo de menú queda anotado con el plato de ese día
-- =============================================================================
-- "Menú del día" → "Menú: Tallarines con tuco". Así el estado de cuenta que reciben
-- las familias dice qué comió el alumno. Solo cambia el concepto si quedó el nombre
-- genérico del producto (la Dueña puede escribir otro concepto y se respeta).

create function public.tg_cuenta_mov_concepto_menu() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prod record;
  v_plato text;
begin
  if new.tipo <> 'cargo' or new.producto_id is null then
    return new;
  end if;
  select pv.tipo, pv.nombre into v_prod from public.productos_venta pv where pv.id = new.producto_id;
  if v_prod.tipo is distinct from 'menu' or new.concepto is distinct from v_prod.nombre then
    return new;
  end if;
  select coalesce(r.nombre, nullif(trim(md.plato_texto), '')) into v_plato
  from public.menu_dias md
  left join public.recetas r on r.id = md.plato_receta_id
  where md.cantina_id = new.cantina_id and md.fecha = new.fecha and not md.sin_cocina;
  if v_plato is not null then
    new.concepto := 'Menú: ' || v_plato;
  end if;
  return new;
end $$;

create trigger cuenta_movimientos_concepto_menu before insert on public.cuenta_movimientos
  for each row execute function public.tg_cuenta_mov_concepto_menu();

revoke execute on function public.tg_cuenta_mov_concepto_menu() from public, anon, authenticated;
