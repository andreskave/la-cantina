// Edge Function: el Administrador crea usuarios, los agrega a cantinas, cambia roles y
// genera contraseñas temporales. Usa la service role key (nunca llega al navegador).
import { createClient } from '@supabase/supabase-js'
import { generarClave, manejar, type Puertos, type Rol } from './logica.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// CLAVE_SERVICIO: la clave secreta del proyecto (ver congelar-costos).
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('CLAVE_SERVICIO') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ok = <T>(r: { data: T; error: unknown }): T => {
  if (r.error) throw r.error
  return r.data
}

const puertos: Puertos = {
  async adminDelToken(token) {
    const { data } = await sb.auth.getUser(token)
    if (!data.user) return null
    const perfil = ok(await sb.from('perfiles').select('es_admin_global').eq('user_id', data.user.id).maybeSingle())
    return perfil?.es_admin_global ? data.user.id : null
  },
  async buscarPorEmail(email) {
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw error
      const u = data.users.find((x) => x.email?.toLowerCase() === email)
      if (u) return { id: u.id }
      if (data.users.length < 200) return null
    }
  },
  async crearUsuario(email, nombre, clave) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: clave, email_confirm: true, user_metadata: { nombre } })
    if (error) throw error
    return data.user.id
  },
  async cambiarClave(userId, clave) {
    const { error } = await sb.auth.admin.updateUserById(userId, { password: clave })
    if (error) throw error
  },
  async miembros(cantina) {
    return ok(await sb.from('miembros').select('user_id, rol').eq('cantina_id', cantina)) as { user_id: string; rol: Rol }[]
  },
  async datosUsuarios(ids) {
    const out = new Map<string, { email: string; nombre: string }>()
    const perfiles = ok(await sb.from('perfiles').select('user_id, nombre').in('user_id', ids)) as { user_id: string; nombre: string }[]
    for (const id of ids) {
      const { data } = await sb.auth.admin.getUserById(id)
      out.set(id, { email: data.user?.email ?? '', nombre: perfiles.find((p) => p.user_id === id)?.nombre ?? '' })
    }
    return out
  },
  async ponerMiembro(cantina, userId, rol) {
    ok(await sb.from('miembros').upsert({ cantina_id: cantina, user_id: userId, rol }, { onConflict: 'cantina_id,user_id' }))
  },
  async quitarMiembro(cantina, userId) {
    ok(await sb.from('miembros').delete().eq('cantina_id', cantina).eq('user_id', userId))
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null
  try {
    const pedido = await req.json().catch(() => null)
    const r = await manejar(puertos, token, pedido, () => generarClave((n) => crypto.getRandomValues(new Uint8Array(n))))
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('admin-usuarios:', e)
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Error inesperado'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
})
