-- =============================================================================
-- 07 · Fase 1: guardado atómico de insumos, recetas y precios de venta
-- =============================================================================
-- Son security invoker: corren con los permisos del usuario, así que la RLS sigue
-- mandando. Validan el rol al principio solo para dar un mensaje claro.

-- Fija el precio de venta de un producto en una lista a partir de hoy. Si es igual al
-- vigente no hace nada; si ya había un cambio hoy, lo reemplaza.
create function public.fijar_precio_venta(p_producto uuid, p_lista uuid, p_precio_cent bigint) returns void
language plpgsql set search_path = '' as $$
declare
  v_cantina uuid;
begin
  select pv.cantina_id into v_cantina from public.productos_venta pv where pv.id = p_producto;
  if v_cantina is null or not public.puede_gestionar(v_cantina) then
    raise exception 'Solo la dueña puede cambiar precios de venta.' using errcode = '42501';
  end if;
  if p_precio_cent is null or p_precio_cent < 0 then
    raise exception 'El precio de venta no puede ser negativo.' using errcode = '22023';
  end if;
  if public.precio_vigente(p_producto, p_lista, public.hoy_mvd()) is not distinct from p_precio_cent then
    return;
  end if;
  insert into public.precios_venta (cantina_id, producto_id, lista_id, precio_cent, vigente_desde)
  values (v_cantina, p_producto, p_lista, p_precio_cent, public.hoy_mvd())
  on conflict (producto_id, lista_id, vigente_desde) do update set precio_cent = excluded.precio_cent;
end $$;

-- Precio del menú del día en la lista por defecto (la "General").
create function public.fijar_precio_menu(p_cantina uuid, p_precio_cent bigint) returns void
language plpgsql set search_path = '' as $$
declare
  v_prod uuid;
  v_lista uuid;
begin
  select id into v_prod from public.productos_venta where cantina_id = p_cantina and tipo = 'menu';
  select id into v_lista from public.listas_precio where cantina_id = p_cantina and es_default;
  if v_prod is null or v_lista is null then
    raise exception 'No encontramos la cantina.' using errcode = '42501';
  end if;
  perform public.fijar_precio_venta(v_prod, v_lista, p_precio_cent);
end $$;

-- Lista por defecto de una cantina.
create function public.lista_default(p_cantina uuid) returns uuid
language sql stable set search_path = '' as $$
  select id from public.listas_precio where cantina_id = p_cantina and es_default
$$;

-- Alta o edición de un insumo, con su precio de compra y su precio de venta.
-- p: { id?, cantina_id, nombre, categoria, proveedor_id?, cantidad_compra, unidad_compra,
--      merma_pct?, es_reventa?, activo?, precio_cent?, precio_venta_cent? }
-- precio_cent ausente o null: no se toca el precio de compra. Si cambian precio, cantidad o
-- unidad respecto del vigente, se agrega una fila al historial (o se reemplaza la de hoy).
-- precio_venta_cent: solo se usa si es_reventa.
create function public.guardar_insumo(p jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_cantina uuid := (p ->> 'cantina_id')::uuid;
  v_reventa boolean := coalesce((p ->> 'es_reventa')::boolean, false);
  v_cant numeric := (p ->> 'cantidad_compra')::numeric;
  v_unidad public.unidad := (p ->> 'unidad_compra')::public.unidad;
  v_precio bigint := nullif(p ->> 'precio_cent', '')::bigint;
  v_venta bigint := nullif(p ->> 'precio_venta_cent', '')::bigint;
  v_ult record;
  v_prod uuid;
begin
  if v_cantina is null or not public.puede_gestionar(v_cantina) then
    raise exception 'Solo la dueña puede cargar insumos.' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.insumos (cantina_id, nombre, categoria, proveedor_id, cantidad_compra, unidad_compra,
                                merma_pct, es_reventa, activo)
    values (v_cantina, trim(p ->> 'nombre'), coalesce((p ->> 'categoria')::public.categoria_insumo, 'Otros'),
            nullif(p ->> 'proveedor_id', '')::uuid, v_cant, v_unidad,
            coalesce((p ->> 'merma_pct')::numeric, 0), v_reventa, coalesce((p ->> 'activo')::boolean, true))
    returning id into v_id;
  else
    update public.insumos set
      nombre          = trim(p ->> 'nombre'),
      categoria       = coalesce((p ->> 'categoria')::public.categoria_insumo, categoria),
      proveedor_id    = nullif(p ->> 'proveedor_id', '')::uuid,
      cantidad_compra = v_cant,
      unidad_compra   = v_unidad,
      merma_pct       = coalesce((p ->> 'merma_pct')::numeric, merma_pct),
      es_reventa      = v_reventa,
      activo          = coalesce((p ->> 'activo')::boolean, activo)
    where id = v_id and cantina_id = v_cantina;
    if not found then
      raise exception 'Ese insumo ya no existe. Actualizá la pantalla.' using errcode = '22023';
    end if;
  end if;

  if v_precio is not null then
    if v_precio < 0 then
      raise exception 'El precio no puede ser negativo.' using errcode = '22023';
    end if;
    select ip.cantidad, ip.unidad, ip.precio_cent into v_ult
    from public.insumo_precios ip where ip.insumo_id = v_id order by ip.fecha desc limit 1;
    if v_ult is null or (v_ult.cantidad, v_ult.unidad, v_ult.precio_cent) is distinct from (v_cant, v_unidad, v_precio) then
      insert into public.insumo_precios (cantina_id, insumo_id, fecha, cantidad, unidad, precio_cent)
      values (v_cantina, v_id, public.hoy_mvd(), v_cant, v_unidad, v_precio)
      on conflict (insumo_id, fecha) do update
        set cantidad = excluded.cantidad, unidad = excluded.unidad, precio_cent = excluded.precio_cent;
    end if;
  end if;

  if v_reventa then
    insert into public.productos_venta (cantina_id, tipo, insumo_id, nombre, activo)
    values (v_cantina, 'insumo_reventa', v_id, trim(p ->> 'nombre'), true)
    on conflict (insumo_id) where insumo_id is not null
      do update set nombre = excluded.nombre, activo = true
    returning id into v_prod;
    if v_venta is not null then
      perform public.fijar_precio_venta(v_prod, public.lista_default(v_cantina), v_venta);
    end if;
  else
    update public.productos_venta set activo = false where insumo_id = v_id and activo;
  end if;

  return v_id;
end $$;

-- Varios insumos en una sola transacción (carga rápida y "Actualizar precios").
create function public.guardar_insumos_lote(p jsonb) returns uuid[]
language plpgsql set search_path = '' as $$
declare
  v_ids uuid[] := '{}';
  v_item jsonb;
begin
  if jsonb_typeof(p) <> 'array' then
    raise exception 'Formato inválido.' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(p) loop
    v_ids := v_ids || public.guardar_insumo(v_item);
  end loop;
  return v_ids;
end $$;

-- Alta o edición de una receta con todos sus ingredientes (los reemplaza).
-- p: { id?, cantina_id, nombre, tipo, modo?, porciones?, rinde_cantidad?, rinde_unidad?, activo?,
--      ingredientes: [{ insumo_id? | preparacion_id?, cantidad, unidad }], precio_venta_cent? }
-- precio_venta_cent: número → se vende a ese precio; null → deja de venderse; ausente → no se toca.
create function public.guardar_receta(p jsonb) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_cantina uuid := (p ->> 'cantina_id')::uuid;
  v_tipo public.tipo_receta := (p ->> 'tipo')::public.tipo_receta;
  v_ing jsonb;
  v_orden int := 0;
  v_prod uuid;
begin
  if v_cantina is null or not public.puede_gestionar(v_cantina) then
    raise exception 'Solo la dueña puede editar recetas.' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.recetas (cantina_id, nombre, tipo, modo, porciones, rinde_cantidad, rinde_unidad, activo)
    values (v_cantina, trim(p ->> 'nombre'), v_tipo,
            case when v_tipo <> 'preparacion' then coalesce((p ->> 'modo')::public.modo_receta, 'porcion') end,
            case when v_tipo <> 'preparacion' and p ->> 'modo' = 'olla' then (p ->> 'porciones')::int end,
            case when v_tipo = 'preparacion' then nullif(p ->> 'rinde_cantidad', '')::numeric end,
            case when v_tipo = 'preparacion' then nullif(p ->> 'rinde_unidad', '')::public.unidad end,
            coalesce((p ->> 'activo')::boolean, true))
    returning id into v_id;
  else
    update public.recetas set
      nombre         = trim(p ->> 'nombre'),
      tipo           = v_tipo,
      modo           = case when v_tipo <> 'preparacion' then coalesce((p ->> 'modo')::public.modo_receta, 'porcion') end,
      porciones      = case when v_tipo <> 'preparacion' and p ->> 'modo' = 'olla' then (p ->> 'porciones')::int end,
      rinde_cantidad = case when v_tipo = 'preparacion' then nullif(p ->> 'rinde_cantidad', '')::numeric end,
      rinde_unidad   = case when v_tipo = 'preparacion' then nullif(p ->> 'rinde_unidad', '')::public.unidad end,
      activo         = coalesce((p ->> 'activo')::boolean, activo)
    where id = v_id and cantina_id = v_cantina;
    if not found then
      raise exception 'Esa receta ya no existe. Actualizá la pantalla.' using errcode = '22023';
    end if;
    delete from public.receta_ingredientes where receta_id = v_id;
  end if;

  for v_ing in select * from jsonb_array_elements(coalesce(p -> 'ingredientes', '[]'::jsonb)) loop
    insert into public.receta_ingredientes (cantina_id, receta_id, insumo_id, preparacion_id, cantidad, unidad, orden)
    values (v_cantina, v_id, nullif(v_ing ->> 'insumo_id', '')::uuid, nullif(v_ing ->> 'preparacion_id', '')::uuid,
            (v_ing ->> 'cantidad')::numeric, (v_ing ->> 'unidad')::public.unidad, v_orden);
    v_orden := v_orden + 1;
  end loop;

  if p ? 'precio_venta_cent' then
    if jsonb_typeof(p -> 'precio_venta_cent') = 'null' then
      update public.productos_venta set activo = false where receta_id = v_id and activo;
    else
      insert into public.productos_venta (cantina_id, tipo, receta_id, nombre, activo)
      values (v_cantina, 'receta', v_id, trim(p ->> 'nombre'), true)
      on conflict (receta_id) where receta_id is not null
        do update set nombre = excluded.nombre, activo = true
      returning id into v_prod;
      perform public.fijar_precio_venta(v_prod, public.lista_default(v_cantina), (p ->> 'precio_venta_cent')::bigint);
    end if;
  end if;

  return v_id;
end $$;

revoke execute on function
  public.fijar_precio_venta(uuid, uuid, bigint),
  public.fijar_precio_menu(uuid, bigint),
  public.lista_default(uuid),
  public.guardar_insumo(jsonb),
  public.guardar_insumos_lote(jsonb),
  public.guardar_receta(jsonb)
from public, anon;

grant execute on function
  public.fijar_precio_venta(uuid, uuid, bigint),
  public.fijar_precio_menu(uuid, bigint),
  public.lista_default(uuid),
  public.guardar_insumo(jsonb),
  public.guardar_insumos_lote(jsonb),
  public.guardar_receta(jsonb)
to authenticated, service_role;
