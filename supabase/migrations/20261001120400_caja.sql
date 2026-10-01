-- =============================================================================
-- 05 · Caja: movimientos (solo Dueña/Admin) y cobros automáticos de cuentas
-- =============================================================================
-- importe_cent siempre positivo; si suma o resta lo define el tipo:
--   ingresos: venta_contado, cobro_cuenta, otro_ingreso
--   egresos:  compra, gasto_fijo, otro_egreso

create table public.caja_movimientos (
  id             uuid primary key default gen_random_uuid(),
  cantina_id     uuid not null references public.cantinas (id) on delete cascade,
  fecha          date not null default public.hoy_mvd(),
  tipo           public.tipo_mov_caja not null,
  subcategoria   public.subcat_gasto,           -- solo gasto_fijo
  proveedor_id   uuid,                          -- solo compra
  concepto       text not null default '',
  importe_cent   bigint not null check (importe_cent > 0),
  medio_pago     public.medio_pago,             -- módulo medio_pago
  origen         public.origen_caja not null default 'manual',
  ref_id         uuid,                          -- cuenta_movimientos.id si origen = cuenta_corriente
  anulado        boolean not null default false,
  anulado_motivo text,
  client_uuid    uuid unique,                   -- idempotencia de la cola offline
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (cantina_id, id),
  constraint caja_subcat_ck check ((tipo = 'gasto_fijo') = (subcategoria is not null)),
  constraint caja_proveedor_ck check (proveedor_id is null or tipo = 'compra'),
  constraint caja_origen_ck check ((origen = 'cuenta_corriente') = (tipo = 'cobro_cuenta')),
  foreign key (cantina_id, proveedor_id) references public.proveedores (cantina_id, id) on delete set null (proveedor_id)
);
create index caja_movimientos_fecha_idx on public.caja_movimientos (cantina_id, fecha);
create unique index caja_movimientos_ref_un on public.caja_movimientos (ref_id) where origen = 'cuenta_corriente';

create trigger caja_movimientos_updated_at before update on public.caja_movimientos
  for each row execute function public.tg_updated_at();

-- Cada pago de cuenta corriente crea su cobro en Caja (aunque el módulo caja esté
-- apagado, así el historial está completo al encenderlo). Si el pago se anula, el cobro también.
create function public.tg_cuenta_mov_caja() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo <> 'pago' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.caja_movimientos
      (cantina_id, fecha, tipo, concepto, importe_cent, medio_pago, origen, ref_id, created_by, anulado, anulado_motivo)
    select new.cantina_id, new.fecha, 'cobro_cuenta', 'Cobro: ' || a.nombre, new.importe_cent,
           new.medio_pago, 'cuenta_corriente', new.id, new.created_by, new.anulado, new.anulado_motivo
    from public.alumnos a where a.id = new.alumno_id;
  elsif new.anulado is distinct from old.anulado then
    update public.caja_movimientos
       set anulado = new.anulado, anulado_motivo = new.anulado_motivo
     where origen = 'cuenta_corriente' and ref_id = new.id;
  end if;
  return null;
end $$;
create trigger cuenta_movimientos_caja after insert or update of anulado on public.cuenta_movimientos
  for each row execute function public.tg_cuenta_mov_caja();

alter table public.caja_movimientos enable row level security;

-- Solo Dueña/Admin. Los cobros automáticos (origen cuenta_corriente) no se crean,
-- editan ni borran a mano: se manejan anulando el pago en la cuenta.
create policy caja_select on public.caja_movimientos for select to authenticated
  using (public.puede_gestionar(cantina_id));
create policy caja_insert on public.caja_movimientos for insert to authenticated
  with check (public.puede_gestionar(cantina_id) and origen <> 'cuenta_corriente');
create policy caja_update on public.caja_movimientos for update to authenticated
  using (public.puede_gestionar(cantina_id) and origen <> 'cuenta_corriente')
  with check (public.puede_gestionar(cantina_id) and origen <> 'cuenta_corriente');
create policy caja_delete on public.caja_movimientos for delete to authenticated
  using (public.puede_gestionar(cantina_id) and origen <> 'cuenta_corriente');
