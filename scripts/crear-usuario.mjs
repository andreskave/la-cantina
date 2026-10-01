// Crea un usuario y lo agrega a una cantina con un rol. Provisorio hasta la Fase 7,
// en la que el Administrador lo hace desde la app.
//
//   node --env-file=.env.local scripts/crear-usuario.mjs --email x@mail.com --nombre "Marta" --rol duena
//   node --env-file=.env.local scripts/crear-usuario.mjs --email y@mail.com --nombre "Lucía" --rol ayudante --cantina "La Cantina"
//
// Contraseña: variable USUARIO_PASSWORD o se genera una y se muestra una sola vez.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    nombre: { type: 'string' },
    rol: { type: 'string' },
    cantina: { type: 'string', default: 'La Cantina' },
  },
})
if (!values.email || !values.nombre || !['duena', 'ayudante'].includes(values.rol ?? '')) {
  console.error('Uso: node --env-file=.env.local scripts/crear-usuario.mjs --email x@mail.com --nombre "Nombre" --rol duena|ayudante [--cantina "La Cantina"]')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const { data: cantinas, error: ec } = await sb.from('cantinas').select('id').eq('nombre', values.cantina)
if (ec) throw ec
if (cantinas.length !== 1) {
  console.error(`No encontré una única cantina llamada "${values.cantina}".`)
  process.exit(1)
}

let user = null
for (let page = 1; !user; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  if (error) throw error
  user = data.users.find((x) => x.email?.toLowerCase() === values.email.toLowerCase()) ?? null
  if (data.users.length < 200) break
}

let clave = null
if (!user) {
  clave = process.env.USUARIO_PASSWORD || randomBytes(9).toString('base64url')
  const { data, error } = await sb.auth.admin.createUser({
    email: values.email, password: clave, email_confirm: true, user_metadata: { nombre: values.nombre },
  })
  if (error) throw error
  user = data.user
}

const { error: em } = await sb.from('miembros')
  .upsert({ cantina_id: cantinas[0].id, user_id: user.id, rol: values.rol }, { onConflict: 'cantina_id,user_id' })
if (em) throw em

console.log(`Listo: ${values.email} es ${values.rol} en "${values.cantina}".`)
if (clave && !process.env.USUARIO_PASSWORD) console.log(`Contraseña generada (guardala, no se vuelve a mostrar): ${clave}`)
