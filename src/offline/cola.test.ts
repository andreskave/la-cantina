import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseLocal, type Pendiente } from './baseLocal'
import { encolar, esErrorDeRed, procesarCola } from './cola'
import { deltaSaldo, movimientosPendientes } from './provisorio'
import type { Api } from '../datos/tipos'

let n = 0
function consumo(alumno: string, importe: number, extra: Partial<Pendiente> = {}): Pendiente {
  const uuid = `c-${++n}`
  return {
    client_uuid: uuid, cantina_id: 'k', creado_at: `2026-10-01T12:00:0${n % 10}.${String(n).padStart(3, '0')}Z`, estado: 'pendiente', error: null, intentos: 0,
    concepto: 'Menú del día', importe_cent: importe, alumno_id: alumno, tipo: 'consumo',
    datos: { client_uuid: uuid, alumno_id: alumno, producto_id: 'menu', cantidad: 1, fecha: '2026-10-01', cargado_at: '2026-10-01T12:00:00Z' },
    ...extra,
  } as Pendiente
}
function pago(alumno: string, importe: number): Pendiente {
  const uuid = `p-${++n}`
  return {
    client_uuid: uuid, cantina_id: 'k', creado_at: `2026-10-01T13:00:00.${String(n).padStart(3, '0')}Z`, estado: 'pendiente', error: null, intentos: 0,
    concepto: 'Pago', importe_cent: importe, alumno_id: alumno, tipo: 'pago',
    datos: { client_uuid: uuid, alumno_id: alumno, importe_cent: importe, fecha: '2026-10-01', cargado_at: '2026-10-01T13:00:00Z' },
  }
}

const apiFalsa = (comportamiento: (uuid: string) => 'ok' | 'red' | 'rechazo') => {
  const recibidos: string[] = []
  const responder = async (x: { client_uuid: string }) => {
    const c = comportamiento(x.client_uuid)
    if (c === 'red') throw new TypeError('Failed to fetch')
    if (c === 'rechazo') throw { code: '22023', message: '"Alfajor" no tiene precio de venta cargado.' }
    recibidos.push(x.client_uuid)
    return x.client_uuid
  }
  return { recibidos, api: { anotarConsumo: responder, registrarPago: responder, guardarMovCaja: async (_c: string, m: { client_uuid: string }) => responder(m) } as unknown as Api }
}

beforeEach(async () => { await baseLocal.cola.clear() })

describe('cola de envíos', () => {
  it('envía en orden y vacía la cola', async () => {
    const a = consumo('ana', 26000), b = pago('ana', 10000)
    await encolar(a); await encolar(b)
    const { api, recibidos } = apiFalsa(() => 'ok')
    expect(await procesarCola(api)).toEqual({ enviados: 2, rechazados: 0 })
    expect(recibidos).toEqual([a.client_uuid, b.client_uuid])
    expect(await baseLocal.cola.count()).toBe(0)
  })

  it('si se corta la conexión, frena y deja el resto para después', async () => {
    const a = consumo('ana', 26000), b = consumo('ana', 26000), c = consumo('ana', 26000)
    for (const p of [a, b, c]) await encolar(p)
    const { api } = apiFalsa((u) => (u === b.client_uuid ? 'red' : 'ok'))
    expect(await procesarCola(api)).toEqual({ enviados: 1, rechazados: 0 })
    expect((await baseLocal.cola.toArray()).map((p) => p.client_uuid)).toEqual([b.client_uuid, c.client_uuid])
  })

  it('lo que el servidor rechaza queda marcado con el motivo y no frena al resto', async () => {
    const a = consumo('ana', 6000), b = consumo('ana', 26000)
    await encolar(a); await encolar(b)
    const { api } = apiFalsa((u) => (u === a.client_uuid ? 'rechazo' : 'ok'))
    expect(await procesarCola(api)).toEqual({ enviados: 1, rechazados: 1 })
    const quedan = await baseLocal.cola.toArray()
    expect(quedan).toHaveLength(1)
    expect(quedan[0]).toMatchObject({ estado: 'rechazado', error: '"Alfajor" no tiene precio de venta cargado.', intentos: 1 })
    // Un rechazado no se reintenta solo.
    const segunda = apiFalsa(() => 'ok')
    expect(await procesarCola(segunda.api)).toEqual({ enviados: 0, rechazados: 0 })
  })

  it('reenviar el mismo client_uuid es seguro: va siempre el mismo', async () => {
    const a = consumo('ana', 26000)
    await encolar(a)
    await encolar(a)   // mismo uuid: la cola no lo duplica
    expect(await baseLocal.cola.count()).toBe(1)
  })

  it('no corre dos veces a la vez', async () => {
    await encolar(consumo('ana', 1))
    const lento = vi.fn(async (x: { client_uuid: string }) => { await new Promise((r) => setTimeout(r, 20)); return x.client_uuid })
    const api = { anotarConsumo: lento } as unknown as Api
    const [r1, r2] = await Promise.all([procesarCola(api), procesarCola(api)])
    expect(r1).toBe(r2)
    expect(lento).toHaveBeenCalledTimes(1)
  })
})

describe('saldos provisorios', () => {
  it('suma consumos y resta pagos pendientes del alumno; ignora rechazados', () => {
    const ps = [consumo('ana', 26000), pago('ana', 10000), consumo('beto', 26000), consumo('ana', 6000, { estado: 'rechazado' })]
    expect(deltaSaldo(ps, 'ana')).toBe(16000)
    expect(movimientosPendientes(ps, 'ana').map((m) => [m.tipo, m.importe_cent])).toEqual([['cargo', 26000], ['pago', 10000]])
  })
  it('reconoce errores de red', () => {
    expect(esErrorDeRed(new TypeError('Failed to fetch'))).toBe(true)
    expect(esErrorDeRed({ message: 'Solo la dueña puede registrar pagos.' })).toBe(false)
  })
})
