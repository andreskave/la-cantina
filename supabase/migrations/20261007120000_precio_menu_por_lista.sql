-- =============================================================================
-- 13 · Precio del menú con listas de precio y precio por plato a la vez
-- =============================================================================
-- Decisión confirmada (punto 73): si el plato del día no tiene precio propio en la lista
-- del alumno, vale el precio del MENÚ de esa lista, no el del plato en la General.
-- Orden:
--   1. precio del plato en la lista        (solo con el módulo precio_por_plato)
--   2. precio del menú en la lista
--   3. precio del plato en la General      (solo con el módulo precio_por_plato)
--   4. precio del menú en la General
-- Para la lista General es lo mismo de antes: plato y, si no tiene, menú.

create or replace function public.precio_menu(p_cantina uuid, p_fecha date, p_lista uuid) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  v_general uuid := public.lista_default(p_cantina);
  v_lista uuid := coalesce(p_lista, v_general);
  v_menu uuid;
  v_plato uuid;
begin
  select id into v_menu from public.productos_venta where cantina_id = p_cantina and tipo = 'menu';
  if public.modulo_activo(p_cantina, 'precio_por_plato') then
    select pv.id into v_plato
    from public.menu_dias md
    join public.productos_venta pv on pv.receta_id = md.plato_receta_id and pv.activo
    where md.cantina_id = p_cantina and md.fecha = p_fecha and not md.sin_cocina;
  end if;
  return coalesce(
    case when v_plato is not null then public.precio_vigente(v_plato, v_lista, p_fecha) end,
    public.precio_vigente(v_menu, v_lista, p_fecha),
    case when v_plato is not null then public.precio_vigente(v_plato, v_general, p_fecha) end,
    public.precio_vigente(v_menu, v_general, p_fecha));
end $$;
