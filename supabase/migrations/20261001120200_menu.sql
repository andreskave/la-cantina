-- =============================================================================
-- 03 · Menú: días del menú, pedidos por lista y costos congelados
-- =============================================================================

create table public.menu_dias (
  id               uuid primary key default gen_random_uuid(),
  cantina_id       uuid not null references public.cantinas (id) on delete cascade,
  fecha            date not null,
  plato_receta_id  uuid,
  plato_texto      text,           -- "Escribir otro (sin costear)"
  postre_receta_id uuid,
  postre_texto     text,
  pedidos          integer check (pedidos >= 0),  -- null = usar cantinas.pedidos_por_defecto
  sin_cocina       boolean not null default false,
  motivo           text,           -- 'Feriado', 'Vacaciones', 'Paro' o texto libre
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (cantina_id, id),
  unique (cantina_id, fecha),
  constraint menu_dias_plato_ck  check (num_nonnulls(plato_receta_id, plato_texto) <= 1),
  constraint menu_dias_postre_ck check (num_nonnulls(postre_receta_id, postre_texto) <= 1),
  constraint menu_dias_motivo_ck check (not sin_cocina or length(trim(coalesce(motivo, ''))) > 0),
  foreign key (cantina_id, plato_receta_id)  references public.recetas (cantina_id, id) on delete restrict,
  foreign key (cantina_id, postre_receta_id) references public.recetas (cantina_id, id) on delete restrict
);
create index menu_dias_plato_idx  on public.menu_dias (plato_receta_id);
create index menu_dias_postre_idx on public.menu_dias (postre_receta_id);

-- Pedidos por lista (solo con el módulo listas_precio).
create table public.menu_dia_pedidos (
  id          uuid primary key default gen_random_uuid(),
  cantina_id  uuid not null references public.cantinas (id) on delete cascade,
  fecha       date not null,
  lista_id    uuid not null,
  pedidos     integer not null check (pedidos >= 0),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (cantina_id, id),
  unique (cantina_id, fecha, lista_id),
  foreign key (cantina_id, fecha)    references public.menu_dias (cantina_id, fecha) on delete cascade on update cascade,
  foreign key (cantina_id, lista_id) references public.listas_precio (cantina_id, id) on delete cascade
);

-- Costo congelado de cada día pasado (solo Dueña/Admin). Lo escribe la Edge Function
-- diaria (00:15 Montevideo) o "Recalcular este día". Sin fila = "Sin costear".
create table public.menu_dia_costos (
  id                uuid primary key default gen_random_uuid(),
  cantina_id        uuid not null references public.cantinas (id) on delete cascade,
  fecha             date not null,
  costo_plato_cent  bigint check (costo_plato_cent >= 0),
  costo_postre_cent bigint check (costo_postre_cent >= 0),
  costo_total_cent  bigint not null check (costo_total_cent >= 0),  -- por menú, lista General
  detalle           jsonb not null default '{}'::jsonb,              -- líneas: insumo, cantidad, precio usado
  congelado_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  unique (cantina_id, id),
  unique (cantina_id, fecha),
  foreign key (cantina_id, fecha) references public.menu_dias (cantina_id, fecha) on delete cascade on update cascade
);

create trigger menu_dias_updated_at        before update on public.menu_dias        for each row execute function public.tg_updated_at();
create trigger menu_dia_pedidos_updated_at before update on public.menu_dia_pedidos for each row execute function public.tg_updated_at();
create trigger menu_dia_costos_updated_at  before update on public.menu_dia_costos  for each row execute function public.tg_updated_at();

alter table public.menu_dias        enable row level security;
alter table public.menu_dia_pedidos enable row level security;
alter table public.menu_dia_costos  enable row level security;

create policy menu_dias_select on public.menu_dias for select to authenticated using (public.es_miembro(cantina_id));
create policy menu_dias_write  on public.menu_dias for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy menu_dia_pedidos_select on public.menu_dia_pedidos for select to authenticated using (public.es_miembro(cantina_id));
create policy menu_dia_pedidos_write  on public.menu_dia_pedidos for all    to authenticated using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));

create policy menu_dia_costos_gestion on public.menu_dia_costos for all to authenticated
  using (public.puede_gestionar(cantina_id)) with check (public.puede_gestionar(cantina_id));
