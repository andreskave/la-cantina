// Postgres en memoria (PGlite) con un "auth" mínimo que imita a Supabase, para
// probar las migraciones, la RLS y las funciones sin servidor ni Docker.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRACIONES = join(import.meta.dirname, '..', 'migrations')

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  grant usage on schema auth, public to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`

export type Db = PGlite & {
  /** Corre fn con la sesión de ese usuario (rol authenticated + auth.uid()). */
  como<T>(userId: string, fn: () => Promise<T>): Promise<T>
  crearUsuario(nombre: string, opts?: { admin?: boolean }): Promise<string>
}

export async function crearDb(): Promise<Db> {
  const pg = new PGlite()
  await pg.exec(AUTH_STUB)
  for (const f of readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRACIONES, f), 'utf8')
    // Las que usan extensiones propias de Supabase (pg_cron, pg_net, Vault) no corren acá.
    if (sql.startsWith('-- pglite:omitir')) continue
    try {
      await pg.exec(sql)
    } catch (e) {
      throw new Error(`Falló la migración ${f}: ${(e as Error).message}`)
    }
  }
  const db = pg as Db
  db.como = async (userId, fn) => {
    await pg.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
    await pg.exec('set role authenticated')
    try {
      return await fn()
    } finally {
      await pg.exec('reset role')
      await pg.query(`select set_config('request.jwt.claim.sub', '', false)`)
    }
  }
  db.crearUsuario = async (nombre, opts = {}) => {
    const { rows } = await pg.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('nombre', $2::text)) returning id`,
      [`${nombre.toLowerCase()}@test.uy`, nombre],
    )
    const id = rows[0].id
    if (opts.admin) await pg.query('update public.perfiles set es_admin_global = true where user_id = $1', [id])
    return id
  }
  return db
}
