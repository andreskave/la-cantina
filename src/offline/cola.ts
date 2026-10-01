// Cola de altas sin conexión: consumos, pagos y movimientos de caja. Cada alta lleva su
// client_uuid; el servidor ignora los repetidos, así que reintentar nunca duplica.
import type { Api } from '../datos/tipos'
import { mensajeError } from '../lib/errores'
import { baseLocal, type Pendiente } from './baseLocal'

/** ¿Falló por falta de conexión (y conviene reintentar) o porque el servidor lo rechazó? */
export function esErrorDeRed(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed|network error|err_internet_disconnected|timeout/i.test(msg)
}

/** Error de negocio con un mensaje ya pensado para mostrar (mensajeError lo respeta). */
export class ErrorNegocio extends Error {
  code = 'P0001'
}

export const encolar = (p: Pendiente) => baseLocal.cola.put(p)
export const quitar = (uuid: string) => baseLocal.cola.delete(uuid)

export type ResultadoEnvio = 'ok' | 'red' | { error: string }

export async function enviar(api: Api, p: Pendiente): Promise<ResultadoEnvio> {
  try {
    if (p.tipo === 'consumo') await api.anotarConsumo(p.datos)
    else if (p.tipo === 'pago') await api.registrarPago(p.datos)
    else await api.guardarMovCaja(p.cantina_id, p.datos)
    return 'ok'
  } catch (e) {
    return esErrorDeRed(e) ? 'red' : { error: mensajeError(e) }
  }
}

let enCurso: Promise<{ enviados: number; rechazados: number }> | null = null

/**
 * Envía los pendientes en el orden en que se cargaron. Si se corta la conexión, frena y
 * deja el resto para después. Los que el servidor rechaza quedan marcados para que la
 * persona los revise. Nunca corre dos veces a la vez.
 */
export function procesarCola(api: Api): Promise<{ enviados: number; rechazados: number }> {
  if (enCurso) return enCurso
  enCurso = (async () => {
    let enviados = 0, rechazados = 0
    try {
      await api.prepararEnvio?.()
      const lista = await baseLocal.cola.where('creado_at').above('').toArray()
      for (const p of lista.filter((x) => x.estado === 'pendiente')) {
        const r = await enviar(api, p)
        if (r === 'red') break
        if (r === 'ok') { await quitar(p.client_uuid); enviados++ }
        else {
          await baseLocal.cola.update(p.client_uuid, { estado: 'rechazado', error: r.error, intentos: p.intentos + 1 })
          rechazados++
        }
      }
    } catch (e) {
      if (!esErrorDeRed(e)) console.error('Cola: error inesperado', e)
    }
    return { enviados, rechazados }
  })().finally(() => { enCurso = null })
  return enCurso
}
