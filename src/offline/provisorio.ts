// Cómo quedan las cuentas y la caja contando lo que todavía no se envió. Puro.
import type { MovCaja } from '../lib/caja'
import type { Movimiento } from '../lib/cuentas'
import type { Pendiente } from './baseLocal'

const activos = (ps: Pendiente[]) => ps.filter((p) => p.estado === 'pendiente')

/** Cuánto cambia el saldo de un alumno con sus pendientes (consumos suman, pagos restan). */
export function deltaSaldo(pendientes: Pendiente[], alumno: string): number {
  return activos(pendientes).reduce((a, p) => {
    if (p.alumno_id !== alumno) return a
    if (p.tipo === 'consumo') return a + p.importe_cent
    if (p.tipo === 'pago') return a - p.importe_cent
    return a
  }, 0)
}

export const tienePendientes = (pendientes: Pendiente[], alumno: string) =>
  activos(pendientes).some((p) => p.alumno_id === alumno)

/** Los pendientes de un alumno como movimientos, para listarlos y recalcular partidas. */
export function movimientosPendientes(pendientes: Pendiente[], alumno: string): Movimiento[] {
  return activos(pendientes).filter((p) => p.alumno_id === alumno && (p.tipo === 'consumo' || p.tipo === 'pago')).map((p) => ({
    id: p.client_uuid,
    alumno_id: alumno,
    fecha: p.datos.fecha,
    tipo: p.tipo === 'consumo' ? 'cargo' : 'pago',
    concepto: p.concepto,
    cantidad: p.tipo === 'consumo' ? p.datos.cantidad : 1,
    importe_cent: p.importe_cent,
    medio_pago: null,
    anulado: false,
    anulado_motivo: null,
    cargado_at: p.creado_at,
  }))
}

/** Movimientos de caja todavía no enviados en un rango de fechas. */
export function cajaPendiente(pendientes: Pendiente[], desde: string, hasta: string): MovCaja[] {
  const out: MovCaja[] = []
  for (const p of activos(pendientes)) {
    if (p.tipo !== 'caja' || p.datos.fecha < desde || p.datos.fecha > hasta) continue
    const d = p.datos
    out.push({
      id: p.client_uuid, fecha: d.fecha, tipo: d.tipo, subcategoria: d.subcategoria, proveedor_id: d.proveedor_id,
      concepto: d.concepto, importe_cent: d.importe_cent, medio_pago: d.medio_pago, origen: 'manual', anulado: false,
    })
  }
  return out
}
