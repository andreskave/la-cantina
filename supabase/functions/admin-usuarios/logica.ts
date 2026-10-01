// Alta y administración de usuarios (solo Administrador). Sin dependencias de Deno ni de
// Supabase: index.ts le pasa los "puertos" reales y los tests, unos falsos.

export type Rol = 'duena' | 'ayudante'

export interface Puertos {
  /** user_id del dueño del token si es Administrador; null si no. */
  adminDelToken(token: string): Promise<string | null>
  buscarPorEmail(email: string): Promise<{ id: string } | null>
  crearUsuario(email: string, nombre: string, clave: string): Promise<string>
  cambiarClave(userId: string, clave: string): Promise<void>
  miembros(cantina: string): Promise<{ user_id: string; rol: Rol }[]>
  datosUsuarios(ids: string[]): Promise<Map<string, { email: string; nombre: string }>>
  ponerMiembro(cantina: string, userId: string, rol: Rol): Promise<void>
  quitarMiembro(cantina: string, userId: string): Promise<void>
}

export type Pedido =
  | { accion: 'listar'; cantina_id: string }
  | { accion: 'crear'; cantina_id: string; email: string; nombre: string; rol: Rol }
  | { accion: 'cambiar_rol'; cantina_id: string; user_id: string; rol: Rol }
  | { accion: 'quitar'; cantina_id: string; user_id: string }
  | { accion: 'nueva_clave'; user_id: string }

export type Respuesta = { status: number; cuerpo: unknown }

const error = (status: number, mensaje: string): Respuesta => ({ status, cuerpo: { error: mensaje } })
const esRol = (r: unknown): r is Rol => r === 'duena' || r === 'ayudante'
const esUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s)

/** Contraseña temporal fácil de dictar: sin letras que se confunden (l, 1, O, 0). */
export function generarClave(aleatorio: (n: number) => Uint8Array): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'
  const b = aleatorio(10)
  const s = [...b].map((x) => abc[x % abc.length]).join('')
  return `${s.slice(0, 5)}-${s.slice(5)}`
}

export async function manejar(p: Puertos, token: string | null, pedido: unknown, clave: () => string): Promise<Respuesta> {
  if (!token || !(await p.adminDelToken(token))) return error(403, 'Solo el administrador puede administrar usuarios.')
  if (!pedido || typeof pedido !== 'object' || !('accion' in pedido)) return error(400, 'Pedido inválido.')
  const x = pedido as Pedido

  switch (x.accion) {
    case 'listar': {
      if (!esUuid(x.cantina_id)) return error(400, 'Falta la cantina.')
      const ms = await p.miembros(x.cantina_id)
      const datos = await p.datosUsuarios(ms.map((m) => m.user_id))
      const usuarios = ms.map((m) => ({ user_id: m.user_id, rol: m.rol, email: datos.get(m.user_id)?.email ?? '', nombre: datos.get(m.user_id)?.nombre ?? '' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      return { status: 200, cuerpo: { usuarios } }
    }
    case 'crear': {
      const email = String(x.email ?? '').trim().toLowerCase()
      const nombre = String(x.nombre ?? '').trim()
      if (!esUuid(x.cantina_id)) return error(400, 'Falta la cantina.')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(400, 'Revisá el email.')
      if (!esRol(x.rol)) return error(400, 'Elegí si es dueña o ayudante.')
      const existente = await p.buscarPorEmail(email)
      if (existente) {
        // Ya tiene usuario (por ejemplo, de otra cantina): se lo agrega con este rol.
        await p.ponerMiembro(x.cantina_id, existente.id, x.rol)
        return { status: 200, cuerpo: { user_id: existente.id, clave_temporal: null, ya_existia: true } }
      }
      if (!nombre) return error(400, 'Escribí el nombre.')
      const c = clave()
      const id = await p.crearUsuario(email, nombre, c)
      await p.ponerMiembro(x.cantina_id, id, x.rol)
      return { status: 200, cuerpo: { user_id: id, clave_temporal: c, ya_existia: false } }
    }
    case 'cambiar_rol': {
      if (!esUuid(x.cantina_id) || !esUuid(x.user_id) || !esRol(x.rol)) return error(400, 'Pedido inválido.')
      await p.ponerMiembro(x.cantina_id, x.user_id, x.rol)
      return { status: 200, cuerpo: { ok: true } }
    }
    case 'quitar': {
      if (!esUuid(x.cantina_id) || !esUuid(x.user_id)) return error(400, 'Pedido inválido.')
      await p.quitarMiembro(x.cantina_id, x.user_id)
      return { status: 200, cuerpo: { ok: true } }
    }
    case 'nueva_clave': {
      if (!esUuid(x.user_id)) return error(400, 'Pedido inválido.')
      const c = clave()
      await p.cambiarClave(x.user_id, c)
      return { status: 200, cuerpo: { clave_temporal: c } }
    }
    default:
      return error(400, 'Acción desconocida.')
  }
}
