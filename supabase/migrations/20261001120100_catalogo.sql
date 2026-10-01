-- =============================================================================
-- 02 · Catálogo: listas de precio, proveedores, insumos, historial de precios,
--      recetas, ingredientes, productos de venta y precios de venta
-- =============================================================================
-- Convención multi-cantina: cada tabla tiene unique (cantina_id, id) y las FK entre
-- tablas de datos son compuestas (cantina_id, x_id). Así es imposible relacionar
-- filas de cantinas distintas, aunque alguien adivine un uuid.

-- ---------- Listas de precio ----------
-- Sin el módulo listas_precio existe una sola: "General" (es_default), creada con la cantina.
create table public.listas_precio (
  id             uuid primary key default gen_random_uuid(),
  cantina_id     uuid not null references public.cantinas (id) on delete cascade,
  nombre         text not null check (length(trim(nombre)) > 0),
  factor_porcion numeric(6,3) not null default 1 check (factor_porcion > 0),
  es_default     boolean not null default false,
  orden          integer not null default 0,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (cantina_id, id)
);
create unique index listas_precio_un_default on public.listas_precio (cantina_id) where es_default;

-- ---------- Proveedores ----------
create table public.proveedores (
  id          uuid primary key default gen_random_uuid(),
  cantina_id  uuid not null references public.cantinas (id) on delete cascade,
  nombre      text not null check (length(trim(nombre)) > 0),
  telefono    text,
  notas       text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (cantina_id, id)
);
create unique index proveedores_nombre_un on public.proveedores (cantina_id, lower(nombre));

-- ---------- Insumos (sin precios: los precios están en insumo_precios) ----------
create table public.insumos (
  id              uuid primary key default gen_random_uuid(),
  cantina_id      uuid not null references public.cantinas (id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) > 0),
  categoria       public.categoria_insumo not null default 'Otros',
  proveedor_id    uuid,
  cantidad_compra numeric(12,3) not null check (cantidad_compra > 0),
  unidad_compra   public.unidad not null,
  merma_pct       numeric(5,2) not null default 0 check (merma_pct >= 0 and merma_pct <= 95),
  es_reventa      boolean not null default false,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (cantina_id, id),
  foreign key (cantina_id, proveedor_id) references public.proveedores (cantina_id, id)
    on delete set null (proveedor_id)
);
create unique index insumos_nombre_un on public.insumos (cantina_id, lower(nombre));
create index insumos_proveedor_idx on public.insumos (proveedor_id);

-- ---------- Historial de precios de compra (solo Dueña/Admin) ----------
-- Precio vigente = última fila por fecha. Una fila por insumo y día: si se cambia
-- dos veces el mismo día, la app hace upsert sobre (insumo_id, fecha).
create table public.insumo_precios (
  id          uuid primary key default gen_random_uuid(),
  cantina_id  uuid not null references public.cantinas (id) on delete cascade,
  insumo_id   uuid not null,
  fecha       date not null default public.hoy_mvd(),
  cantidad    numeric(12,3) not null check (cantidad > 0),
  unidad      public.unidad not null,
  precio_cent bigint not null check (precio_cent >= 0),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (cantina_id, id),
  unique (insumo_id, fecha),
  foreign key (cantina_id, insumo_id) references public.insumos (cantina_id, id) on delete cascade
);

-- ---------- Recetas ----------
create table public.recetas (
  id             uuid primary key default gen_random_uuid(),
  cantina_id     uuid not null references public.cantinas (id) on delete cascade,
  nombre         text not null check (length(trim(nombre)) > 0),
  tipo           public.tipo_receta not null,
  modo           public.modo_receta,           -- solo plato y postre
  porciones      integer,                      -- solo modo olla
  rinde_cantidad numeric(12,3),                -- solo preparación (puede faltar: queda "Falta: cuánto rinde")
  rinde_unidad   public.unidad,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (cantina_id, id),
  constraint recetas_modo_ck check ((tipo = 'preparacion') = (modo is null)),
  constraint recetas_porciones_ck check (
    (modo = 'olla' and porciones >= 1) or (modo is distinct from 'olla' and porciones is null)),
  constraint recetas_rinde_ck check (
    (tipo = 'preparacion' or (rinde_cantidad is null and rinde_unidad is null))
    and (rinde_cantidad is null or rinde_cantidad > 0)
    and (rinde_unidad is null or rinde_unidad in ('l', 'kg', 'u')))
);
create unique index recetas_nombre_un on public.recetas (cantina_id, lower(nombre));

-- ---------- Ingredientes ----------
-- Exactamente uno de insumo_id / preparacion_id. Las cantidades son por porción o por
-- olla según recetas.modo. La compatibilidad de unidades NO se valida acá: una unidad
-- incompatible deja la línea "incompleta" (lo marca la librería de costeo).
create table public.receta_ingredientes (
  id             uuid primary key default gen_random_uuid(),
  cantina_id     uuid not null references public.cantinas (id) on delete cascade,
  receta_id      uuid not null,
  insumo_id      uuid,
  preparacion_id uuid,
  cantidad       numeric(14,4) not null check (cantidad >= 0),
  unidad         public.unidad not null,
  orden          integer not null default 0,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (cantina_id, id),
  constraint receta_ingredientes_uno_ck check (num_nonnulls(insumo_id, preparacion_id) = 1),
  constraint receta_ingredientes_no_si_misma_ck check (preparacion_id is distinct from receta_id),
  foreign key (cantina_id, receta_id)      references public.recetas (cantina_id, id) on delete cascade,
  foreign key (cantina_id, insumo_id)      references public.insumos (cantina_id, id) on delete restrict,
  foreign key (cantina_id, preparacion_id) references public.recetas (cantina_id, id) on delete restrict
);
create index receta_ingredientes_receta_idx on public.receta_ingredientes (receta_id, orden);
create index receta_ingredientes_insumo_idx on public.receta_ingredientes (insumo_id);
create index receta_ingredientes_prep_idx   on public.receta_ingredientes (preparacion_id);

-- Solo preparaciones como sub-receta, y sin ciclos (A usa B y B usa A, a cualquier profundidad).
create function public.tg_receta_ingrediente_validar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.preparacion_id is null then
    return new;
  end if;
  if not exists (select 1 from public.recetas r where r.id = new.preparacion_id and r.tipo = 'preparacion') then
    raise exception 'Solo se pueden usar preparaciones como ingrediente de otra receta.'
      using errcode = '23514';
  end if;
  if exists (
    with recursive baja (id) as (
      select new.preparacion_id
      union
      select ri.preparacion_id
      from public.receta_ingredientes ri
      join baja on ri.receta_id = baja.id
      where ri.preparacion_id is not null and ri.id <> new.id
    )
    select 1 from baja where baja.id = new.receta_id
  ) then
    raise exception 'Esta preparación ya usa la receta que estás editando: se formaría un círculo.'
      using errcode = '23514', hint = 'ciclo';
  end if;
  return new;
end $$;
create trigger receta_ingredientes_validar before insert or update on public.receta_ingredientes
  for each row execute function public.tg_receta_ingrediente_validar();

-- Una preparación que se usa en otras recetas no puede pasar a ser plato o postre.
create function public.tg_recetas_tipo_en_uso() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.tipo = 'preparacion' and new.tipo <> 'preparacion'
     and exists (select 1 from public.receta_ingredientes ri where ri.preparacion_id = new.id) then
    raise exception 'Esta preparación se usa en otras recetas. Sacala de esas recetas antes de cambiarle el tipo.'
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger recetas_tipo_en_uso before update of tipo on public.recetas
  for each row execute function public.tg_recetas_tipo_en_uso();

-- ---------- Productos de venta ----------
-- Lo que se puede anotar en una cuenta o vender: el menú del día (uno por cantina,
-- creado con la cantina), un insumo de reventa o una receta con precio.
create table public.productos_venta (
  id          uuid primary key default gen_random_uuid(),
  cantina_id  uuid not null references public.cantinas (id) on delete cascade,
  tipo        public.tipo_producto not null,
  insumo_id   uuid,
  receta_id   uuid,
  nombre      text not null check (length(trim(nombre)) > 0),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (cantina_id, id),
  constraint productos_venta_ref_ck check (
       (tipo = 'menu'           and insumo_id is null     and receta_id is null)
    or (tipo = 'insumo_reventa' and insumo_id is not null and receta_id is null)
    or (tipo = 'receta'         and receta_id is not null and insumo_id is null)),
  foreign key (cantina_id, insumo_id) references public.insumos (cantina_id, id) on delete cascade,
  foreign key (cantina_id, receta_id) references public.recetas (cantina_id, id) on delete cascade
);
create unique index productos_venta_un_menu on public.productos_venta (cantina_id) where tipo = 'menu';
create unique index productos_venta_un_insumo on public.productos_venta (insumo_id) where insumo_id is not null;
create unique index productos_venta_un_receta on public.productos_venta (receta_id) where receta_id is not null;

-- ---------- Precios de venta (los leen todos los roles) ----------
-- Fuente única de precios de venta, incluido el del menú del día por lista.
-- Con vigencia: un precio nuevo no cambia lo ya anotado ni la ganancia de días pasados.
create table public.precios_venta (
  id             uuid primary key default gen_random_uuid(),
  cantina_id     uuid not null references public.cantinas (id) on delete cascade,
  producto_id    uuid not null,
  lista_id       uuid not null,
  precio_cent    bigint not null check (precio_cent >= 0),
  vigente_desde  date not null default public.hoy_mvd(),
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at     timestamptz not null default now(),
  unique (cantina_id, id),
  unique (producto_id, lista_id, vigente_desde),
  foreign key (cantina_id, producto_id) references public.productos_venta (cantina_id, id) on delete cascade,
  foreign key (cantina_id, lista_id)    references public.listas_precio (cantina_id, id) on delete cascade
);

-- Precio de venta vigente a una fecha.
create function public.precio_vigente(p_producto uuid, p_lista uuid, p_fecha date default public.hoy_mvd())
returns bigint
language sql stable set search_path = '' as $$
  select pv.precio_cent from public.precios_venta pv
  where pv.producto_id = p_producto and pv.lista_id = p_lista and pv.vigente_desde <= p_fecha
  order by pv.vigente_desde desc
  limit 1
$$;

-- Al crear una cantina: lista "General" y producto "Menú del día".
create function public.tg_cantina_inicial() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.listas_precio (cantina_id, nombre, es_default, created_by)
  values (new.id, 'General', true, new.created_by);
  insert into public.productos_venta (cantina_id, tipo, nombre, created_by)
  values (new.id, 'menu', 'Menú del día', new.created_by);
  return new;
end $$;
create trigger cantinas_inicial after insert on public.cantinas
  for each row execute function public.tg_cantina_inicial();

-- ---------- Vista: precio de compra vigente por insumo (hereda RLS de insumo_precios) ----------
create view public.insumo_precio_vigente with (security_invoker = true) as
select distinct on (ip.insumo_id)
  ip.insumo_id, ip.cantina_id, ip.fecha, ip.cantidad, ip.unidad, ip.precio_cent
from public.insumo_precios ip
order by ip.insumo_id, ip.fecha desc;

-- ---------- updated_at ----------
create trigger listas_precio_updated_at       before update on public.listas_precio       for each row execute function public.tg_updated_at();
create trigger proveedores_updated_at         before update on public.proveedores         for each row execute function public.tg_updated_at();
create trigger insumos_updated_at             before update on public.insumos             for each row execute function public.tg_updated_at();
create trigger insumo_precios_updated_at      before update on public.insumo_precios      for each row execute function public.tg_updated_at();
create trigger recetas_updated_at             before update on public.recetas             for each row execute function public.tg_updated_at();
create trigger receta_ingredientes_updated_at before update on public.receta_ingredientes for each row execute function public.tg_updated_at();
create trigger productos_venta_updated_at     before update on public.productos_venta     for each row execute function public.tg_updated_at();
create trigger precios_venta_updated_at       before update on public.precios_venta       for each row execute function public.tg_updated_at();

-- ---------- RLS ----------
-- Lectura: cualquier miembro. Escritura: Dueña o Admin.
-- Excepción: insumo_precios, que el ayudante no puede ni leer.
alter table public.listas_precio       enable row level security;
alter table public.proveedores         enable row level security;
alter table public.insumos             enable row level security;
alter table public.insumo_precios      enable row level security;
alter table public.recetas             enable row level security;
alter table public.receta_ingredientes enable row level security;
alter table public.productos_venta     enable row level security;
alter table public.precios_venta       enable row level security;

create policy listas_precio_select on public.listas_precio for select to authenticated using (public.es_miembro(cantina_id));
create policy listas_precio_write  on public.listas_precio for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy proveedores_select on public.proveedores for select to authenticated using (public.es_miembro(cantina_id));
create policy proveedores_write  on public.proveedores for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy insumos_select on public.insumos for select to authenticated using (public.es_miembro(cantina_id));
create policy insumos_write  on public.insumos for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy insumo_precios_gestion on public.insumo_precios for all to authenticated
  using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy recetas_select on public.recetas for select to authenticated using (public.es_miembro(cantina_id));
create policy recetas_write  on public.recetas for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy receta_ingredientes_select on public.receta_ingredientes for select to authenticated using (public.es_miembro(cantina_id));
create policy receta_ingredientes_write  on public.receta_ingredientes for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy productos_venta_select on public.productos_venta for select to authenticated using (public.es_miembro(cantina_id));
create policy productos_venta_write  on public.productos_venta for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy precios_venta_select on public.precios_venta for select to authenticated using (public.es_miembro(cantina_id));
create policy precios_venta_write  on public.precios_venta for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));
