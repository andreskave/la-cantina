import { describe, expect, it } from 'vitest'
import { generarClave, manejar, type Puertos, type Rol } from '../functions/admin-usuarios/logica'

const C = '11111111-1111-4111-8111-111111111111'

function falsos() {
  const usuarios = new Map<string, { email: string; nombre: string; clave: string }>([
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { email: 'admin@x.uy', nombre: 'Admin', clave: 'x' }],
    ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', { email: 'marta@x.uy', nombre: 'Marta', clave: 'x' }],
  ])
  const miembros = new Map<string, Rol>() // `${cantina}|${user}` → rol
  let n = 0
  const p: Puertos = {
    adminDelToken: async (t) => (t === 'token-admin' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : null),
    buscarPorEmail: async (e) => { for (const [id, u] of usuarios) if (u.email === e) return { id }; return null },
    crearUsuario: async (email, nombre, clave) => {
      const id = `cccccccc-cccc-4ccc-8ccc-${String(++n).padStart(12, '0')}`
      usuarios.set(id, { email, nombre, clave })
      return id
    },
    cambiarClave: async (id, clave) => { usuarios.get(id)!.clave = clave },
    miembros: async (c) => [...miembros].filter(([k]) => k.startsWith(c)).map(([k, rol]) => ({ user_id: k.split('|')[1], rol })),
    datosUsuarios: async (ids) => new Map(ids.map((id) => [id, { email: usuarios.get(id)!.email, nombre: usuarios.get(id)!.nombre }])),
    ponerMiembro: async (c, u, r) => { miembros.set(`${c}|${u}`, r) },
    quitarMiembro: async (c, u) => { miembros.delete(`${c}|${u}`) },
  }
  return { p, usuarios, miembros }
}

describe('Edge Function admin-usuarios', () => {
  it('rechaza a quien no es Administrador', async () => {
    const { p } = falsos()
    expect((await manejar(p, 'token-de-la-duena', { accion: 'listar', cantina_id: C }, () => 'x')).status).toBe(403)
    expect((await manejar(p, null, { accion: 'listar', cantina_id: C }, () => 'x')).status).toBe(403)
  })

  it('crea un usuario nuevo con contraseña temporal y lo agrega a la cantina', async () => {
    const { p, usuarios, miembros } = falsos()
    const r = await manejar(p, 'token-admin', { accion: 'crear', cantina_id: C, email: ' Lucia@X.uy ', nombre: 'Lucía', rol: 'ayudante' }, () => 'abcde-fghjk')
    expect(r.status).toBe(200)
    const { user_id, clave_temporal } = r.cuerpo as { user_id: string; clave_temporal: string }
    expect(clave_temporal).toBe('abcde-fghjk')
    expect(usuarios.get(user_id)).toMatchObject({ email: 'lucia@x.uy', nombre: 'Lucía', clave: 'abcde-fghjk' })
    expect(miembros.get(`${C}|${user_id}`)).toBe('ayudante')
  })

  it('si el email ya existe, solo lo agrega a la cantina (sin tocar su contraseña)', async () => {
    const { p, usuarios } = falsos()
    const r = await manejar(p, 'token-admin', { accion: 'crear', cantina_id: C, email: 'marta@x.uy', nombre: '', rol: 'duena' }, () => 'nueva')
    expect(r.cuerpo).toMatchObject({ clave_temporal: null, ya_existia: true })
    expect(usuarios.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')!.clave).toBe('x')
  })

  it('lista, cambia rol, quita y genera contraseña nueva', async () => {
    const { p, usuarios } = falsos()
    const marta = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    await manejar(p, 'token-admin', { accion: 'crear', cantina_id: C, email: 'marta@x.uy', nombre: '', rol: 'ayudante' }, () => 'x')
    await manejar(p, 'token-admin', { accion: 'cambiar_rol', cantina_id: C, user_id: marta, rol: 'duena' }, () => 'x')
    const lista = await manejar(p, 'token-admin', { accion: 'listar', cantina_id: C }, () => 'x')
    expect(lista.cuerpo).toEqual({ usuarios: [{ user_id: marta, rol: 'duena', email: 'marta@x.uy', nombre: 'Marta' }] })
    const nc = await manejar(p, 'token-admin', { accion: 'nueva_clave', user_id: marta }, () => 'otra1-clave')
    expect(nc.cuerpo).toEqual({ clave_temporal: 'otra1-clave' })
    expect(usuarios.get(marta)!.clave).toBe('otra1-clave')
    await manejar(p, 'token-admin', { accion: 'quitar', cantina_id: C, user_id: marta }, () => 'x')
    expect((await manejar(p, 'token-admin', { accion: 'listar', cantina_id: C }, () => 'x')).cuerpo).toEqual({ usuarios: [] })
  })

  it('valida los datos', async () => {
    const { p } = falsos()
    expect((await manejar(p, 'token-admin', { accion: 'crear', cantina_id: C, email: 'no-es-email', nombre: 'X', rol: 'duena' }, () => 'x')).cuerpo).toEqual({ error: 'Revisá el email.' })
    expect((await manejar(p, 'token-admin', { accion: 'crear', cantina_id: C, email: 'a@b.uy', nombre: 'X', rol: 'jefa' }, () => 'x')).status).toBe(400)
    expect((await manejar(p, 'token-admin', { accion: 'borrar_todo' }, () => 'x')).status).toBe(400)
  })

  it('contraseñas temporales sin caracteres que se confunden', () => {
    const c = generarClave((n) => Uint8Array.from({ length: n }, (_, i) => i * 7))
    expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/)
    expect(c).not.toMatch(/[lo01]/)
  })
})
