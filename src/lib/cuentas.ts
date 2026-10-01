// Cuentas corrientes (sección 6.6). La base hace la imputación real (reimputar_alumno);
// esta copia en TypeScript sigue exactamente las mismas reglas y la usan el modo demo y
// los saldos provisorios sin conexión.

export type Movimiento = {
  id: string
  alumno_id: string
  fecha: string
  tipo: 'cargo' | 'pago'
  concepto: string
  cantidad: number
  importe_cent: number
  medio_pago: 'efectivo' | 'transferencia' | null
  anulado: boolean
  anulado_motivo: string | null
  cargado_at: string
}

export type Partida = { cargo: Movimiento; pendiente_cent: number }

const orden = (a: Movimiento, b: Movimiento) =>
  a.fecha.localeCompare(b.fecha) || a.cargado_at.localeCompare(b.cargado_at) || a.id.localeCompare(b.id)

/**
 * Imputa los pagos a los cargos más viejos primero. Devuelve lo pendiente de cada cargo
 * y el saldo a favor (pagos que sobran). Los anulados no cuentan.
 */
export function imputar(movs: Movimiento[]): { pendiente: Map<string, number>; aFavor: number; imputaciones: { pago_id: string; cargo_id: string; importe_cent: number }[] } {
  const cargos = movs.filter((m) => m.tipo === 'cargo' && !m.anulado).sort(orden)
  const pagos = movs.filter((m) => m.tipo === 'pago' && !m.anulado).sort(orden)
  const pendiente = new Map(cargos.map((c) => [c.id, c.importe_cent]))
  const imputaciones: { pago_id: string; cargo_id: string; importe_cent: number }[] = []
  let i = 0
  let aFavor = 0
  for (const p of pagos) {
    let disp = p.importe_cent
    while (disp > 0 && i < cargos.length) {
      const c = cargos[i]
      const x = Math.min(disp, pendiente.get(c.id)!)
      imputaciones.push({ pago_id: p.id, cargo_id: c.id, importe_cent: x })
      pendiente.set(c.id, pendiente.get(c.id)! - x)
      disp -= x
      if (pendiente.get(c.id) === 0) i++
    }
    aFavor += disp
  }
  return { pendiente, aFavor, imputaciones }
}

/** Saldo: cargos − pagos (no anulados). Positivo = debe; negativo = a favor. */
export const saldo = (movs: Movimiento[]) =>
  movs.reduce((a, m) => (m.anulado ? a : a + (m.tipo === 'cargo' ? m.importe_cent : -m.importe_cent)), 0)

/** Cargos con saldo pendiente, del más viejo al más nuevo. */
export function partidasAbiertas(movs: Movimiento[]): Partida[] {
  const { pendiente } = imputar(movs)
  return movs.filter((m) => m.tipo === 'cargo' && !m.anulado && (pendiente.get(m.id) ?? 0) > 0)
    .sort(orden).map((cargo) => ({ cargo, pendiente_cent: pendiente.get(cargo.id)! }))
}

/** "Juan Pérez" → "juan-perez" (para nombres de archivo). */
export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alumno'

export type EstadoCuenta = {
  cantina: string
  alumno: string
  /** Cómo se llama al alumno en esta cantina (módulo términos). */
  etiqueta_alumno?: string
  responsable: string | null
  emision: string
  partidas: { fecha: string; concepto: string; importe_cent: number; pendiente_cent: number }[]
  /** Saldo a favor (si los pagos superan los cargos). */
  aFavor_cent: number
  /** Total a pagar (0 si está al día o a favor). */
  total_cent: number
}

export type PartidaPlana = { fecha: string; concepto: string; importe_cent: number; pendiente_cent: number }
export const aPlana = (p: Partida): PartidaPlana => ({ fecha: p.cargo.fecha, concepto: p.cargo.concepto, importe_cent: p.cargo.importe_cent, pendiente_cent: p.pendiente_cent })

export function estadoCuenta(args: { cantina: string; alumno: string; etiqueta_alumno?: string; responsable: string | null; emision: string; partidas: PartidaPlana[]; saldo_cent: number }): EstadoCuenta {
  return {
    cantina: args.cantina,
    alumno: args.alumno,
    etiqueta_alumno: args.etiqueta_alumno,
    responsable: args.responsable,
    emision: args.emision,
    partidas: args.partidas.map(({ fecha, concepto, importe_cent, pendiente_cent }) => ({ fecha, concepto, importe_cent, pendiente_cent })),
    aFavor_cent: args.saldo_cent < 0 ? -args.saldo_cent : 0,
    total_cent: Math.max(0, args.saldo_cent),
  }
}

export const nombreEstadoCuenta = (alumno: string, emision: string, ext: 'pdf' | 'png') => `estado-cuenta-${slug(alumno)}-${emision}.${ext}`
