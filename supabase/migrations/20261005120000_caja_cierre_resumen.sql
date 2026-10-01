-- =============================================================================
-- 10 · Fase 5: cierre del día y deuda de cuentas a una fecha
-- =============================================================================

-- Menús anotados en cuentas corrientes en un día (para no contarlos dos veces en el cierre).
create function public.menus_en_cuentas(p_cantina uuid, p_fecha date) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(m.cantidad), 0)
  from public.cuenta_movimientos m
  join public.productos_venta pv on pv.id = m.producto_id and pv.tipo = 'menu'
  where m.cantina_id = p_cantina and m.fecha = p_fecha and m.tipo = 'cargo' and not m.anulado
$$;

-- Guarda el cierre del día (módulo cierre_dia): reemplaza el cierre anterior de esa fecha
-- si lo había. Menús y kiosco quedan como dos ventas al contado separadas.
create function public.guardar_cierre_dia(
  p_cantina    uuid,
  p_fecha      date,
  p_menus_cent bigint,
  p_menus_cant integer,
  p_kiosco_cent bigint default 0,
  p_medio_pago public.medio_pago default null
) returns void
language plpgsql set search_path = '' as $$
begin
  if not public.puede_gestionar(p_cantina) then
    raise exception 'Solo la dueña puede hacer el cierre del día.' using errcode = '42501';
  end if;
  if not public.modulo_activo(p_cantina, 'cierre_dia') then
    raise exception 'El cierre del día no está activado para esta cantina.' using errcode = '22023';
  end if;
  if coalesce(p_menus_cent, 0) < 0 or coalesce(p_kiosco_cent, 0) < 0 then
    raise exception 'Los importes no pueden ser negativos.' using errcode = '22023';
  end if;

  delete from public.caja_movimientos
  where cantina_id = p_cantina and fecha = p_fecha and origen = 'cierre_dia';

  if coalesce(p_menus_cent, 0) > 0 then
    insert into public.caja_movimientos (cantina_id, fecha, tipo, concepto, importe_cent, medio_pago, origen)
    values (p_cantina, p_fecha, 'venta_contado',
            'Menús al contado' || case when p_menus_cant > 0 then ' (' || p_menus_cant || ')' else '' end,
            p_menus_cent, case when public.modulo_activo(p_cantina, 'medio_pago') then p_medio_pago end, 'cierre_dia');
  end if;
  if coalesce(p_kiosco_cent, 0) > 0 then
    insert into public.caja_movimientos (cantina_id, fecha, tipo, concepto, importe_cent, medio_pago, origen)
    values (p_cantina, p_fecha, 'venta_contado', 'Kiosco al contado', p_kiosco_cent,
            case when public.modulo_activo(p_cantina, 'medio_pago') then p_medio_pago end, 'cierre_dia');
  end if;
end $$;

-- Deuda total de cuentas corrientes a una fecha (para el resumen del mes): suma de lo que
-- debe cada alumno con los movimientos hasta ese día. Los saldos a favor no restan.
create function public.deuda_cuentas_al(p_cantina uuid, p_fecha date) returns bigint
language sql stable set search_path = '' as $$
  select coalesce(sum(greatest(s, 0)), 0)::bigint from (
    select sum(case when m.tipo = 'cargo' then m.importe_cent else -m.importe_cent end) as s
    from public.cuenta_movimientos m
    where m.cantina_id = p_cantina and m.fecha <= p_fecha and not m.anulado
    group by m.alumno_id
  ) t
$$;

revoke execute on function
  public.menus_en_cuentas(uuid, date),
  public.guardar_cierre_dia(uuid, date, bigint, integer, bigint, public.medio_pago),
  public.deuda_cuentas_al(uuid, date)
from public, anon;
grant execute on function
  public.menus_en_cuentas(uuid, date),
  public.guardar_cierre_dia(uuid, date, bigint, integer, bigint, public.medio_pago),
  public.deuda_cuentas_al(uuid, date)
to authenticated, service_role;
