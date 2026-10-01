-- =============================================================================
-- 01 · Base: tipos, utilidades, cantinas, perfiles, miembros y funciones de permisos
-- =============================================================================

-- ---------- Tipos ----------
create type public.rol_miembro      as enum ('duena', 'ayudante');
create type public.unidad           as enum ('kg', 'g', 'l', 'ml', 'u');
create type public.categoria_insumo as enum ('Almacén', 'Carnes', 'Verdulería', 'Lácteos y huevos',
                                             'Panadería', 'Bebidas', 'Golosinas y snacks', 'Otros');
create type public.tipo_receta      as enum ('plato', 'postre', 'preparacion');
create type public.modo_receta      as enum ('porcion', 'olla');
create type public.tipo_producto    as enum ('menu', 'insumo_reventa', 'receta');
create type public.tipo_mov_cuenta  as enum ('cargo', 'pago');
create type public.medio_pago       as enum ('efectivo', 'transferencia');
create type public.tipo_mov_caja    as enum ('venta_contado', 'cobro_cuenta', 'compra', 'gasto_fijo',
                                             'otro_ingreso', 'otro_egreso');
create type public.subcat_gasto     as enum ('Sueldos', 'Gas', 'Otros');
create type public.origen_caja      as enum ('manual', 'cierre_dia', 'cuenta_corriente');

-- ---------- Utilidades ----------
-- Fecha de hoy en Montevideo (los defaults de fecha la usan, no la del servidor).
create function public.hoy_mvd() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Montevideo')::date
$$;

create function public.tg_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Perfiles (1 por usuario de Auth) ----------
create table public.perfiles (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  nombre          text not null default '',
  es_admin_global boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger perfiles_updated_at before update on public.perfiles
  for each row execute function public.tg_updated_at();

-- Al crear un usuario en Auth se crea su perfil (nombre desde user_metadata.nombre).
create function public.tg_crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (user_id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''))
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger auth_users_crear_perfil after insert on auth.users
  for each row execute function public.tg_crear_perfil();

-- ---------- Cantinas ----------
create table public.cantinas (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null check (length(trim(nombre)) > 0),
  pedidos_por_defecto integer not null default 0 check (pedidos_por_defecto >= 0),
  objetivo_costo_pct  numeric(5,2) not null default 35 check (objetivo_costo_pct > 0 and objetivo_costo_pct <= 100),
  -- Módulos ocultos (sección 4). Solo el Administrador los cambia.
  modulos             jsonb not null default '{
                        "caja": true,
                        "listas_precio": false,
                        "medio_pago": false,
                        "dias_fijos": false,
                        "terminos": false,
                        "precio_por_plato": false,
                        "cierre_dia": false
                      }'::jsonb check (jsonb_typeof(modulos) = 'object'),
  -- Términos renombrados ({"alumno": "Cliente", ...}). Solo el Administrador los cambia.
  terminos            jsonb not null default '{}'::jsonb check (jsonb_typeof(terminos) = 'object'),
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at          timestamptz not null default now()
);
create trigger cantinas_updated_at before update on public.cantinas
  for each row execute function public.tg_updated_at();

-- ---------- Miembros ----------
create table public.miembros (
  id          uuid primary key default gen_random_uuid(),
  cantina_id  uuid not null references public.cantinas (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  rol         public.rol_miembro not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (cantina_id, user_id)
);
create index miembros_user_idx on public.miembros (user_id);
create trigger miembros_updated_at before update on public.miembros
  for each row execute function public.tg_updated_at();

-- ---------- Funciones de permisos ----------
-- security definer: leen perfiles/miembros sin pasar por RLS (evita recursión en las políticas).
create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.es_admin_global from public.perfiles p where p.user_id = auth.uid()),
    false)
$$;

create function public.rol_en(p_cantina uuid) returns public.rol_miembro
language sql stable security definer set search_path = '' as $$
  select m.rol from public.miembros m
  where m.cantina_id = p_cantina and m.user_id = auth.uid()
$$;

-- Miembro de la cantina (cualquier rol) o Administrador.
create function public.es_miembro(p_cantina uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.miembros m
    where m.cantina_id = p_cantina and m.user_id = auth.uid())
$$;

-- Dueña de la cantina o Administrador: ve costos, precios de compra y caja.
create function public.puede_gestionar(p_cantina uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_admin() or exists (
    select 1 from public.miembros m
    where m.cantina_id = p_cantina and m.user_id = auth.uid() and m.rol = 'duena')
$$;

create function public.modulo_activo(p_cantina uuid, p_modulo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select (c.modulos ->> p_modulo)::boolean from public.cantinas c where c.id = p_cantina), false)
$$;

-- Usuarios que comparten alguna cantina con el usuario actual (para mostrar nombres).
create function public.comparte_cantina(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros a
    join public.miembros b on b.cantina_id = a.cantina_id
    where a.user_id = auth.uid() and b.user_id = p_user)
$$;

-- La Dueña puede editar los datos de su cantina, pero módulos y términos solo el Administrador.
-- (Los scripts con service role no pasan por acá: current_user no es 'authenticated'.)
create function public.tg_cantinas_proteger() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not public.es_admin()
     and (new.modulos is distinct from old.modulos or new.terminos is distinct from old.terminos) then
    raise exception 'Solo el administrador puede cambiar los módulos y los términos.'
      using errcode = '42501';
  end if;
  return new;
end $$;
create trigger cantinas_proteger before update on public.cantinas
  for each row execute function public.tg_cantinas_proteger();

-- ---------- RLS ----------
alter table public.perfiles enable row level security;
alter table public.cantinas enable row level security;
alter table public.miembros enable row level security;

create policy perfiles_select on public.perfiles for select to authenticated
  using (user_id = auth.uid() or public.es_admin() or public.comparte_cantina(user_id));
-- Solo la columna "nombre" se puede actualizar (ver grants en la migración de permisos).
create policy perfiles_update on public.perfiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy cantinas_select on public.cantinas for select to authenticated
  using (public.es_miembro(id));
create policy cantinas_insert on public.cantinas for insert to authenticated
  with check (public.es_admin());
create policy cantinas_update on public.cantinas for update to authenticated
  using (public.puede_gestionar(id)) with check (public.puede_gestionar(id));
create policy cantinas_delete on public.cantinas for delete to authenticated
  using (public.es_admin());

create policy miembros_select on public.miembros for select to authenticated
  using (user_id = auth.uid() or public.puede_gestionar(cantina_id));
create policy miembros_admin on public.miembros for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
