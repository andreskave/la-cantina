// Base local del dispositivo (IndexedDB): caché de datos para usar la app sin conexión y
// cola de altas que esperan para enviarse (sección 10).
import Dexie, { type Table } from 'dexie'
import type { MovCajaGuardar, NuevoConsumo, NuevoPago } from '../datos/tipos'

export type Pendiente = {
  client_uuid: string
  cantina_id: string
  creado_at: string
  estado: 'pendiente' | 'rechazado'
  /** Por qué el servidor lo rechazó (por ejemplo, un producto sin precio). */
  error: string | null
  intentos: number
  /** Para mostrarlo mientras tanto: el servidor pone el importe definitivo. */
  concepto: string
  importe_cent: number
  alumno_id: string | null
} & (
  | { tipo: 'consumo'; datos: NuevoConsumo }
  | { tipo: 'pago'; datos: NuevoPago }
  | { tipo: 'caja'; datos: MovCajaGuardar & { client_uuid: string } }
)

class BaseLocal extends Dexie {
  kv!: Table<{ clave: string; valor: string }, string>
  cola!: Table<Pendiente, string>

  constructor(nombre: string) {
    super(nombre)
    this.version(1).stores({ kv: 'clave', cola: 'client_uuid, cantina_id, creado_at' })
  }
}

// La demo usa otra base para no mezclar datos de prueba con los reales.
export const baseLocal = new BaseLocal(import.meta.env?.VITE_DEMO === '1' ? 'lacantina-demo' : 'lacantina')

/** Storage para la caché persistida de React Query. */
export const almacenKV = {
  getItem: async (clave: string) => (await baseLocal.kv.get(clave))?.valor ?? null,
  setItem: async (clave: string, valor: string) => { await baseLocal.kv.put({ clave, valor }) },
  removeItem: async (clave: string) => { await baseLocal.kv.delete(clave) },
}

/** Al cerrar sesión: no queda nada de la cuenta en el dispositivo. */
export async function borrarTodoLocal() {
  await Promise.all([baseLocal.kv.clear(), baseLocal.cola.clear()])
}
