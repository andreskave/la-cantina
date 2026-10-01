-- =============================================================================
-- 11 · Fase 7: precios por lista y por plato, días fijos, menús por lista y borrado general
-- =============================================================================

-- ---------- Precios ----------

-- Precio de venta de un producto para una lista, con la lista por defecto como respaldo
-- (si un producto no tiene precio en "Grandes", se cobra el de "General").
create function public.precio_producto(p_producto uuid, p_lista uuid, p_fecha date) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(
    public.precio_vigente(p_producto, p_lista, p_fecha),
    public.precio_vigente(p_producto, (select l.id from public.listas_precio l
                                        join public.productos_venta pv on pv.cantina_id = l.cantina_id
                                        where pv.id = p_producto and l.es_default), p_fecha))
$$;

-- Precio del menú de un día para una lista. Con el módulo precio_por_plato, si el plato
-- de ese día tiene precio de venta propio, vale ese; si no, el precio del menú.
create function public.precio_menu(p_cantina uuid, p_fecha date, p_lista uuid) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  v_menu uuid;
  v_plato uuid;
  v_precio bigint;
begin
  select id into v_menu from public.productos_venta where cantina_id = p_cantina and tipo = 'menu';
  if public.modulo_activo(p_cantina, 'precio_por_plato') then
    select pv.id into v_plato
    from public.menu_dias md
    join public.productos_venta pv on pv.receta_id = md.plato_receta_id and pv.activo
    where md.cantina_id = p_cantina and md.fecha = p_fecha and not md.sin_cocina;
    if v_plato is not null then
      v_precio := public.precio_producto(v_plato, p_lista, p_fecha);
    end if;
  end if;
  return coalesce(v_precio, public.precio_producto(v_menu, p_lista, p_fecha));
end $$;

-- Lista con la que se le cobra a un alumno (la suya si el módulo está activo; si no, la General).
create function public.lista_de_alumno(p_alumno uuid) returns uuid
language sql stable set search_path = '' as $$
  select case when public.modulo_activo(a.cantina_id, 'listas_precio') and a.lista_id is not null
              then a.lista_id else public.lista_default(a.cantina_id) end
  from public.alumnos a where a.id = p_alumno
$$;

-- anotar_consumo: igual que antes, pero el precio sale de precio_producto / precio_menu.
create or replace function public.anotar_consumo(
  p_client_uuid  uuid,
  p_alumno_id    uuid,
  p_producto_id  uuid default null,
  p_cantidad     numeric default 1,
  p_fecha        date default null,
  p_concepto     text default null,
  p_importe_cent bigint default null,
  p_cargado_at   timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_alumno record;
  v_prod record;
  v_lista uuid;
  v_precio bigint;
  v_fecha date := coalesce(p_fecha, public.hoy_mvd());
begin
  select m.id into v_id from public.cuenta_movimientos m where m.client_uuid = p_client_uuid;
  if v_id is not null then
    return v_id;
  end if;

  select a.id, a.cantina_id, a.lista_id, a.activo into v_alumno from public.alumnos a where a.id = p_alumno_id;
  if v_alumno.id is null or not public.es_miembro(v_alumno.cantina_id) then
    raise exception 'No encontramos esa cuenta.' using errcode = '42501';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad tiene que ser mayor a cero.' using errcode = '22023';
  end if;

  if p_producto_id is null then
    if not public.puede_gestionar(v_alumno.cantina_id) then
      raise exception 'Solo la dueña puede anotar consumos con importe libre.' using errcode = '42501';
    end if;
    if length(trim(coalesce(p_concepto, ''))) = 0 or coalesce(p_importe_cent, 0) <= 0 then
      raise exception 'Escribí qué consumió y el importe.' using errcode = '22023';
    end if;
    insert into public.cuenta_movimientos
      (cantina_id, alumno_id, fecha, tipo, concepto, cantidad, precio_unit_cent, importe_cent,
       cargado_at, client_uuid)
    values
      (v_alumno.cantina_id, p_alumno_id, v_fecha, 'cargo', trim(p_concepto), 1, p_importe_cent, p_importe_cent,
       coalesce(p_cargado_at, now()), p_client_uuid)
    on conflict (client_uuid) do nothing
    returning id into v_id;
  else
    select pv.id, pv.nombre, pv.activo, pv.tipo into v_prod
    from public.productos_venta pv
    where pv.id = p_producto_id and pv.cantina_id = v_alumno.cantina_id;
    if v_prod.id is null or not v_prod.activo then
      raise exception 'Ese producto ya no está a la venta.' using errcode = '22023';
    end if;

    v_lista := public.lista_de_alumno(p_alumno_id);
    v_precio := case when v_prod.tipo = 'menu' then public.precio_menu(v_alumno.cantina_id, v_fecha, v_lista)
                     else public.precio_producto(p_producto_id, v_lista, v_fecha) end;
    if v_precio is null or v_precio <= 0 then
      raise exception '"%" no tiene precio de venta cargado. Pedile a la dueña que lo cargue.', v_prod.nombre
        using errcode = '22023';
    end if;

    insert into public.cuenta_movimientos
      (cantina_id, alumno_id, fecha, tipo, producto_id, lista_id, concepto, cantidad,
       precio_unit_cent, importe_cent, cargado_at, client_uuid)
    values
      (v_alumno.cantina_id, p_alumno_id, v_fecha, 'cargo', p_producto_id, v_lista,
       case when public.puede_gestionar(v_alumno.cantina_id) and length(trim(coalesce(p_concepto, ''))) > 0
            then trim(p_concepto) else v_prod.nombre end,
       p_cantidad, v_precio, round(v_precio * p_cantidad)::bigint,
       coalesce(p_cargado_at, now()), p_client_uuid)
    on conflict (client_uuid) do nothing
    returning id into v_id;
  end if;

  if v_id is null then
    select m.id into v_id from public.cuenta_movimientos m where m.client_uuid = p_client_uuid;
  end if;
  return v_id;
end $$;

-- ---------- Menús anotados en cuentas, por lista (cierre del día con listas) ----------
create function public.menus_en_cuentas_por_lista(p_cantina uuid, p_fecha date)
returns table (lista_id uuid, cantidad numeric)
language sql stable set search_path = '' as $$
  select coalesce(m.lista_id, public.lista_default(p_cantina)), sum(m.cantidad)
  from public.cuenta_movimientos m
  join public.productos_venta pv on pv.id = m.producto_id and pv.tipo = 'menu'
  where m.cantina_id = p_cantina and m.fecha = p_fecha and m.tipo = 'cargo' and not m.anulado
  group by 1
$$;

-- ---------- Días fijos ----------
-- Anota el menú a los alumnos que tienen ese día de la semana como fijo, si ese día hay
-- menú y todavía no tienen un menú anotado. Es idempotente: el client_uuid sale del alumno
-- y la fecha, así que correrlo dos veces no duplica. Devuelve cuántos anotó.
create function public.anotar_dias_fijos(p_cantina uuid, p_fecha date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_fecha date := coalesce(p_fecha, public.hoy_mvd());
  v_menu uuid;
  v_hay_menu boolean;
  v_al record;
  v_lista uuid;
  v_precio bigint;
  v_uuid uuid;
  v_n integer := 0;
begin
  -- Desde la app (hay un usuario logueado) solo la Dueña o el Admin. El cron corre sin
  -- usuario. Ojo: en una función security definer current_user es el dueño de la función,
  -- por eso se mira auth.uid() y no current_user.
  if auth.uid() is not null and not public.puede_gestionar(p_cantina) then
    raise exception 'Solo la dueña puede anotar los días fijos.' using errcode = '42501';
  end if;
  if not public.modulo_activo(p_cantina, 'dias_fijos') then
    return 0;
  end if;
  select exists (
    select 1 from public.menu_dias md
    where md.cantina_id = p_cantina and md.fecha = v_fecha and not md.sin_cocina
      and (md.plato_receta_id is not null or md.plato_texto is not null or md.postre_receta_id is not null or md.postre_texto is not null)
  ) into v_hay_menu;
  if not v_hay_menu then
    return 0;
  end if;
  select id into v_menu from public.productos_venta where cantina_id = p_cantina and tipo = 'menu';

  for v_al in
    select a.id from public.alumnos a
    join public.alumno_dias_fijos f on f.alumno_id = a.id and f.dia_semana = extract(isodow from v_fecha)
    where a.cantina_id = p_cantina and a.activo
  loop
    v_uuid := md5('dias-fijos:' || v_al.id || ':' || v_fecha)::uuid;
    continue when exists (select 1 from public.cuenta_movimientos m where m.client_uuid = v_uuid)
               or exists (select 1 from public.cuenta_movimientos m
                          where m.alumno_id = v_al.id and m.fecha = v_fecha and m.producto_id = v_menu
                            and m.tipo = 'cargo' and not m.anulado);
    v_lista := public.lista_de_alumno(v_al.id);
    v_precio := public.precio_menu(p_cantina, v_fecha, v_lista);
    continue when v_precio is null or v_precio <= 0;
    insert into public.cuenta_movimientos
      (cantina_id, alumno_id, fecha, tipo, producto_id, lista_id, concepto, cantidad, precio_unit_cent, importe_cent, client_uuid)
    select p_cantina, v_al.id, v_fecha, 'cargo', v_menu, v_lista, pv.nombre, 1, v_precio, v_precio, v_uuid
    from public.productos_venta pv where pv.id = v_menu
    on conflict (client_uuid) do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Para el cron: todas las cantinas con el módulo prendido.
create function public.anotar_dias_fijos_todas(p_fecha date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_c uuid;
  v_n integer := 0;
begin
  for v_c in select c.id from public.cantinas c where public.modulo_activo(c.id, 'dias_fijos') loop
    v_n := v_n + public.anotar_dias_fijos(v_c, p_fecha);
  end loop;
  return v_n;
end $$;

-- ---------- Borrado general (solo Administrador) ----------

-- Vacía los datos de una cantina y deja la cantina, sus usuarios, módulos y listas.
create function public.vaciar_cantina(p_cantina uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede borrar datos.' using errcode = '42501';
  end if;
  delete from public.imputaciones where cantina_id = p_cantina;
  delete from public.cuenta_movimientos where cantina_id = p_cantina;
  delete from public.alumno_dias_fijos where cantina_id = p_cantina;
  delete from public.alumnos where cantina_id = p_cantina;
  delete from public.caja_movimientos where cantina_id = p_cantina;
  delete from public.menu_dias where cantina_id = p_cantina;   -- arrastra pedidos por lista y costos congelados
  delete from public.precios_venta where cantina_id = p_cantina
    and producto_id in (select id from public.productos_venta where cantina_id = p_cantina and tipo <> 'menu');
  delete from public.productos_venta where cantina_id = p_cantina and tipo <> 'menu';
  delete from public.receta_ingredientes where cantina_id = p_cantina;
  delete from public.recetas where cantina_id = p_cantina;
  delete from public.insumos where cantina_id = p_cantina;     -- arrastra su historial de precios
  delete from public.proveedores where cantina_id = p_cantina;
end $$;

-- Borra la cantina entera (con todos sus datos y membresías).
create function public.borrar_cantina(p_cantina uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el administrador puede borrar una cantina.' using errcode = '42501';
  end if;
  delete from public.cantinas where id = p_cantina;
end $$;

revoke execute on function
  public.precio_producto(uuid, uuid, date), public.precio_menu(uuid, date, uuid), public.lista_de_alumno(uuid),
  public.menus_en_cuentas_por_lista(uuid, date), public.anotar_dias_fijos(uuid, date), public.anotar_dias_fijos_todas(date),
  public.vaciar_cantina(uuid), public.borrar_cantina(uuid)
from public, anon;
grant execute on function
  public.precio_producto(uuid, uuid, date), public.precio_menu(uuid, date, uuid), public.lista_de_alumno(uuid),
  public.menus_en_cuentas_por_lista(uuid, date), public.anotar_dias_fijos(uuid, date),
  public.vaciar_cantina(uuid), public.borrar_cantina(uuid)
to authenticated;
grant execute on all functions in schema public to service_role;
