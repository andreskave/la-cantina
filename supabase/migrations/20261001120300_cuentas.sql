-- =============================================================================
-- 04 · Cuentas corrientes: alumnos, movimientos, imputación de pagos y funciones
-- =============================================================================
-- Los movimientos NO se insertan ni modifican directo desde la app: se hace todo con
-- las funciones anotar_consumo, registrar_pago y anular_movimiento, que validan el rol,
-- ponen el importe desde el servidor y son idempotentes por client_uuid (cola offline).

create table public.alumnos (
  id                   uuid primary key default gen_random_uuid(),
  cantina_id           uuid not null references public.cantinas (id) on delete cascade,
  nombre               text not null check (length(trim(nombre)) > 0),
  responsable_nombre   text,
  responsable_telefono text,
  lista_id             uuid,       -- módulo listas_precio; null = lista por defecto
  activo               boolean not null default true,
  notas                text,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at           timestamptz not null default now(),
  unique (cantina_id, id),
  foreign key (cantina_id, lista_id) references public.listas_precio (cantina_id, id) on delete set null (lista_id)
);

-- Módulo dias_fijos. dia_semana ISO: 1 = lunes … 5 = viernes.
create table public.alumno_dias_fijos (
  id          uuid primary key default gen_random_uuid(),
  cantina_id  uuid not null references public.cantinas (id) on delete cascade,
  alumno_id   uuid not null,
  dia_semana  smallint not null check (dia_semana between 1 and 5),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (cantina_id, id),
  unique (alumno_id, dia_semana),
  foreign key (cantina_id, alumno_id) references public.alumnos (cantina_id, id) on delete cascade
);

create table public.cuenta_movimientos (
  id               uuid primary key default gen_random_uuid(),
  cantina_id       uuid not null references public.cantinas (id) on delete cascade,
  alumno_id        uuid not null,
  fecha            date not null default public.hoy_mvd(),
  tipo             public.tipo_mov_cuenta not null,
  producto_id      uuid,                       -- null en pagos y en consumos "Otro"
  lista_id         uuid,                       -- lista con la que se tomó el precio
  concepto         text not null check (length(trim(concepto)) > 0),
  cantidad         numeric(10,3) not null default 1 check (cantidad > 0),
  precio_unit_cent bigint check (precio_unit_cent >= 0),
  importe_cent     bigint not null check (importe_cent > 0),
  medio_pago       public.medio_pago,          -- módulo medio_pago; null si está apagado
  anulado          boolean not null default false,
  anulado_motivo   text,
  anulado_at       timestamptz,
  anulado_por      uuid references auth.users (id) on delete set null,
  cargado_at       timestamptz not null default now(),  -- momento de carga (desempata el orden de imputación)
  client_uuid      uuid not null unique,                -- idempotencia de la cola offline
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (cantina_id, id),
  constraint cuenta_mov_producto_ck check (tipo = 'cargo' or producto_id is null),
  constraint cuenta_mov_anulado_ck check (not anulado or length(trim(coalesce(anulado_motivo, ''))) > 0),
  foreign key (cantina_id, alumno_id)   references public.alumnos (cantina_id, id) on delete restrict,
  foreign key (cantina_id, producto_id) references public.productos_venta (cantina_id, id) on delete set null (producto_id),
  foreign key (cantina_id, lista_id)    references public.listas_precio (cantina_id, id) on delete set null (lista_id)
);
create index cuenta_mov_alumno_idx on public.cuenta_movimientos (alumno_id, fecha, cargado_at);
create index cuenta_mov_fecha_idx  on public.cuenta_movimientos (cantina_id, fecha);

-- Qué parte de cada pago cubre cada cargo. Solo la escribe reimputar_alumno().
create table public.imputaciones (
  id           uuid primary key default gen_random_uuid(),
  cantina_id   uuid not null references public.cantinas (id) on delete cascade,
  alumno_id    uuid not null,
  pago_id      uuid not null,
  cargo_id     uuid not null,
  importe_cent bigint not null check (importe_cent > 0),
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  unique (cantina_id, id),
  foreign key (cantina_id, alumno_id) references public.alumnos (cantina_id, id) on delete cascade,
  foreign key (cantina_id, pago_id)   references public.cuenta_movimientos (cantina_id, id) on delete cascade,
  foreign key (cantina_id, cargo_id)  references public.cuenta_movimientos (cantina_id, id) on delete cascade
);
create index imputaciones_alumno_idx on public.imputaciones (alumno_id);
create index imputaciones_cargo_idx  on public.imputaciones (cargo_id);
create index imputaciones_pago_idx   on public.imputaciones (pago_id);

create trigger alumnos_updated_at            before update on public.alumnos            for each row execute function public.tg_updated_at();
create trigger alumno_dias_fijos_updated_at  before update on public.alumno_dias_fijos  for each row execute function public.tg_updated_at();
create trigger cuenta_movimientos_updated_at before update on public.cuenta_movimientos for each row execute function public.tg_updated_at();

-- ---------- Imputación: pagos a los cargos más viejos primero ----------
-- Recalcula desde cero todas las imputaciones del alumno. Orden: fecha, momento de
-- carga e id (para que siempre dé lo mismo). El sobrante de pagos queda como saldo a
-- favor y se aplica solo a los cargos siguientes, también del más viejo al más nuevo.
create function public.reimputar_alumno(p_alumno uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cantina uuid;
  c_ids uuid[];  c_imp bigint[];
  p_ids uuid[];  p_imp bigint[];
  i int := 1;  j int := 1;
  pend_c bigint;  disp_p bigint;  x bigint;
begin
  -- Serializa recalculos concurrentes del mismo alumno.
  select a.cantina_id into v_cantina from public.alumnos a where a.id = p_alumno for update;
  if v_cantina is null then
    return;
  end if;

  delete from public.imputaciones where alumno_id = p_alumno;

  select coalesce(array_agg(m.id order by m.fecha, m.cargado_at, m.id), '{}'),
         coalesce(array_agg(m.importe_cent order by m.fecha, m.cargado_at, m.id), '{}')
    into c_ids, c_imp
  from public.cuenta_movimientos m
  where m.alumno_id = p_alumno and m.tipo = 'cargo' and not m.anulado;

  select coalesce(array_agg(m.id order by m.fecha, m.cargado_at, m.id), '{}'),
         coalesce(array_agg(m.importe_cent order by m.fecha, m.cargado_at, m.id), '{}')
    into p_ids, p_imp
  from public.cuenta_movimientos m
  where m.alumno_id = p_alumno and m.tipo = 'pago' and not m.anulado;

  if cardinality(c_ids) = 0 or cardinality(p_ids) = 0 then
    return;
  end if;

  pend_c := c_imp[1];
  disp_p := p_imp[1];
  while i <= cardinality(c_ids) and j <= cardinality(p_ids) loop
    x := least(pend_c, disp_p);
    insert into public.imputaciones (cantina_id, alumno_id, pago_id, cargo_id, importe_cent)
    values (v_cantina, p_alumno, p_ids[j], c_ids[i], x);
    pend_c := pend_c - x;
    disp_p := disp_p - x;
    if pend_c = 0 then
      i := i + 1;
      if i <= cardinality(c_ids) then pend_c := c_imp[i]; end if;
    end if;
    if disp_p = 0 then
      j := j + 1;
      if j <= cardinality(p_ids) then disp_p := p_imp[j]; end if;
    end if;
  end loop;
end $$;

create function public.tg_cuenta_mov_reimputar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.reimputar_alumno(new.alumno_id);
  return null;
end $$;
create trigger cuenta_movimientos_reimputar
  after insert or update of anulado, importe_cent, fecha on public.cuenta_movimientos
  for each row execute function public.tg_cuenta_mov_reimputar();

-- Los movimientos no se borran: se anulan. Ni la Dueña ni el Admin pueden borrarlos
-- desde la app (solo el borrado general de una cantina entera, por cascade).
create function public.tg_cuenta_mov_no_borrar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    raise exception 'Los movimientos de cuenta no se borran: se anulan.' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger cuenta_movimientos_no_borrar before delete on public.cuenta_movimientos
  for each row execute function public.tg_cuenta_mov_no_borrar();

-- ---------- Vistas (heredan la RLS de las tablas) ----------
-- saldo_cent > 0: debe · < 0: saldo a favor.
create view public.cuenta_saldos with (security_invoker = true) as
select a.id as alumno_id, a.cantina_id,
       coalesce(sum(m.importe_cent) filter (where m.tipo = 'cargo'), 0)::bigint as cargos_cent,
       coalesce(sum(m.importe_cent) filter (where m.tipo = 'pago'), 0)::bigint  as pagos_cent,
       (coalesce(sum(m.importe_cent) filter (where m.tipo = 'cargo'), 0)
        - coalesce(sum(m.importe_cent) filter (where m.tipo = 'pago'), 0))::bigint as saldo_cent
from public.alumnos a
left join public.cuenta_movimientos m on m.alumno_id = a.id and not m.anulado
group by a.id, a.cantina_id;

-- Cargos con saldo pendiente mayor a cero.
create view public.partidas_abiertas with (security_invoker = true) as
select m.id as cargo_id, m.alumno_id, m.cantina_id, m.fecha, m.concepto, m.cargado_at,
       m.importe_cent,
       (m.importe_cent - coalesce(sum(i.importe_cent), 0))::bigint as pendiente_cent
from public.cuenta_movimientos m
left join public.imputaciones i on i.cargo_id = m.id
where m.tipo = 'cargo' and not m.anulado
group by m.id
having m.importe_cent - coalesce(sum(i.importe_cent), 0) > 0;

-- ---------- Funciones que usa la app ----------

-- Anota un consumo. Con producto: el precio lo pone el servidor (precio vigente de la
-- lista del alumno). Sin producto ("Otro"): concepto e importe libres, solo Dueña/Admin.
-- Devuelve el id del movimiento (el existente si el client_uuid ya se había enviado).
create function public.anotar_consumo(
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
    select pv.id, pv.nombre, pv.activo into v_prod
    from public.productos_venta pv
    where pv.id = p_producto_id and pv.cantina_id = v_alumno.cantina_id;
    if v_prod.id is null or not v_prod.activo then
      raise exception 'Ese producto ya no está a la venta.' using errcode = '22023';
    end if;

    select l.id into v_lista from public.listas_precio l
    where l.cantina_id = v_alumno.cantina_id and l.es_default;
    if public.modulo_activo(v_alumno.cantina_id, 'listas_precio') and v_alumno.lista_id is not null then
      v_lista := v_alumno.lista_id;
    end if;

    v_precio := public.precio_vigente(p_producto_id, v_lista, v_fecha);
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

  if v_id is null then  -- llegó otro envío con el mismo client_uuid al mismo tiempo
    select m.id into v_id from public.cuenta_movimientos m where m.client_uuid = p_client_uuid;
  end if;
  return v_id;
end $$;

-- Registra un pago. Solo Dueña/Admin. Crea su cobro_cuenta en Caja (trigger en la migración de caja).
create function public.registrar_pago(
  p_client_uuid  uuid,
  p_alumno_id    uuid,
  p_importe_cent bigint,
  p_fecha        date default null,
  p_medio_pago   public.medio_pago default null,
  p_concepto     text default null,
  p_cargado_at   timestamptz default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_cantina uuid;
begin
  select m.id into v_id from public.cuenta_movimientos m where m.client_uuid = p_client_uuid;
  if v_id is not null then
    return v_id;
  end if;

  select a.cantina_id into v_cantina from public.alumnos a where a.id = p_alumno_id;
  if v_cantina is null or not public.es_miembro(v_cantina) then
    raise exception 'No encontramos esa cuenta.' using errcode = '42501';
  end if;
  if not public.puede_gestionar(v_cantina) then
    raise exception 'Solo la dueña puede registrar pagos.' using errcode = '42501';
  end if;
  if coalesce(p_importe_cent, 0) <= 0 then
    raise exception 'El importe del pago tiene que ser mayor a cero.' using errcode = '22023';
  end if;

  insert into public.cuenta_movimientos
    (cantina_id, alumno_id, fecha, tipo, concepto, cantidad, importe_cent, medio_pago, cargado_at, client_uuid)
  values
    (v_cantina, p_alumno_id, coalesce(p_fecha, public.hoy_mvd()), 'pago',
     coalesce(nullif(trim(p_concepto), ''), 'Pago'), 1, p_importe_cent,
     case when public.modulo_activo(v_cantina, 'medio_pago') then p_medio_pago end,
     coalesce(p_cargado_at, now()), p_client_uuid)
  on conflict (client_uuid) do nothing
  returning id into v_id;

  if v_id is null then
    select m.id into v_id from public.cuenta_movimientos m where m.client_uuid = p_client_uuid;
  end if;
  return v_id;
end $$;

-- Anula un cargo o un pago (solo Dueña/Admin). Se reimputa todo el alumno.
create function public.anular_movimiento(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_mov record;
begin
  select m.id, m.cantina_id, m.anulado into v_mov from public.cuenta_movimientos m where m.id = p_id;
  if v_mov.id is null or not public.es_miembro(v_mov.cantina_id) then
    raise exception 'No encontramos ese movimiento.' using errcode = '42501';
  end if;
  if not public.puede_gestionar(v_mov.cantina_id) then
    raise exception 'Solo la dueña puede anular movimientos.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Escribí el motivo de la anulación.' using errcode = '22023';
  end if;
  if v_mov.anulado then
    return;
  end if;
  update public.cuenta_movimientos
     set anulado = true, anulado_motivo = trim(p_motivo), anulado_at = now(), anulado_por = auth.uid()
   where id = p_id;
end $$;

-- ---------- RLS ----------
alter table public.alumnos            enable row level security;
alter table public.alumno_dias_fijos  enable row level security;
alter table public.cuenta_movimientos enable row level security;
alter table public.imputaciones       enable row level security;

create policy alumnos_select on public.alumnos for select to authenticated using (public.es_miembro(cantina_id));
create policy alumnos_write  on public.alumnos for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy alumno_dias_fijos_select on public.alumno_dias_fijos for select to authenticated using (public.es_miembro(cantina_id));
create policy alumno_dias_fijos_write  on public.alumno_dias_fijos for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

-- Solo lectura desde la app: las altas y anulaciones van por las funciones de arriba.
create policy cuenta_movimientos_select on public.cuenta_movimientos for select to authenticated using (public.es_miembro(cantina_id));
create policy imputaciones_select       on public.imputaciones       for select to authenticated using (public.es_miembro(cantina_id));
