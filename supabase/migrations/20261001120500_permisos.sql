-- =============================================================================
-- 06 · Permisos de tablas y funciones (las filas las filtra RLS; esto define qué
--      operaciones existen para cada rol de Postgres)
-- =============================================================================

-- Sin sesión no se accede a nada (no hay registro público ni datos públicos).
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Perfiles: el usuario solo cambia su nombre. es_admin_global solo por script (service role).
revoke insert, update, delete on public.perfiles from authenticated;
grant update (nombre) on public.perfiles to authenticated;

-- Cuentas corrientes: solo lectura directa; altas y anulaciones por funciones.
revoke insert, update, delete on public.cuenta_movimientos from authenticated;
revoke insert, update, delete on public.imputaciones       from authenticated;

-- Vistas: solo lectura.
revoke insert, update, delete on public.cuenta_saldos, public.partidas_abiertas, public.insumo_precio_vigente
  from authenticated;

-- Funciones: nada para anon; a authenticated solo las que usa la app o las políticas.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on function
  public.hoy_mvd(),
  public.es_admin(),
  public.rol_en(uuid),
  public.es_miembro(uuid),
  public.puede_gestionar(uuid),
  public.modulo_activo(uuid, text),
  public.comparte_cantina(uuid),
  public.precio_vigente(uuid, uuid, date),
  public.anotar_consumo(uuid, uuid, uuid, numeric, date, text, bigint, timestamptz),
  public.registrar_pago(uuid, uuid, bigint, date, public.medio_pago, text, timestamptz),
  public.anular_movimiento(uuid, text)
to authenticated;

grant execute on all functions in schema public to service_role;
