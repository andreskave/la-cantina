// Crea el usuario Administrador y la primera cantina ("La Cantina", vacía).
//
//   node --env-file=.env.local scripts/crear-admin.mjs --email vos@mail.com --nombre "Tu nombre"
//
// Contraseña: variable ADMIN_PASSWORD o, si no está, se genera una y se muestra una sola vez.
// Usa la service role key: correlo solo en tu máquina. Se puede correr más de una vez.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    nombre: { type: 'string' },
    cantina: { type: 'string', default: 'La Cantina' },
  },
})
if (!values.email || !values.nombre) {
  console.error('Uso: node --env-file=.env.local scripts/crear-admin.mjs --email vos@mail.com --nombre "Tu nombre"')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

async function buscarUsuario(email) {
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u || data.users.length < 200) return u ?? null
  }
}

let user = await buscarUsuario(values.email)
let clave = null
if (user) {
  console.log(`El usuario ${values.email} ya existe; se marca como administrador.`)
} else {
  clave = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url')
  const { data, error } = await sb.auth.admin.createUser({
    email: values.email,
    password: clave,
    email_confirm: true,
    user_metadata: { nombre: values.nombre },
  })
  if (error) throw error
  user = data.user
}

const { error: ep } = await sb.from('perfiles')
  .upsert({ user_id: user.id, nombre: values.nombre, es_admin_global: true }, { onConflict: 'user_id' })
if (ep) throw ep

const { data: existentes, error: ec } = await sb.from('cantinas').select('id').eq('nombre', values.cantina)
if (ec) throw ec
if (existentes.length === 0) {
  const { error } = await sb.from('cantinas').insert({ nombre: values.cantina, created_by: user.id })
  if (error) throw error
  console.log(`Cantina "${values.cantina}" creada (vacía).`)
} else {
  console.log(`La cantina "${values.cantina}" ya existía.`)
}

console.log(`Listo. Administrador: ${values.email}`)
if (clave && !process.env.ADMIN_PASSWORD) console.log(`Contraseña generada (guardala, no se vuelve a mostrar): ${clave}`)
