// Caja (sección 6.8): plata que entró y salió.

export type TipoCaja = 'venta_contado' | 'cobro_cuenta' | 'compra' | 'gasto_fijo' | 'otro_ingreso' | 'otro_egreso'
export type Subcategoria = 'Sueldos' | 'Gas' | 'Otros'
export type MedioPago = 'efectivo' | 'transferencia'

export type MovCaja = {
  id: string
  fecha: string
  tipo: TipoCaja
  subcategoria: Subcategoria | null
  proveedor_id: string | null
  concepto: string
  importe_cent: number
  medio_pago: MedioPago | null
  origen: 'manual' | 'cierre_dia' | 'cuenta_corriente'
  anulado: boolean
}

export const TIPO_CAJA_TXT: Record<TipoCaja, string> = {
  venta_contado: 'Venta al contado',
  cobro_cuenta: 'Cobro de cuenta',
  compra: 'Compra',
  gasto_fijo: 'Gasto fijo',
  otro_ingreso: 'Otro ingreso',
  otro_egreso: 'Otro egreso',
}

export const esIngreso = (t: TipoCaja) => t === 'venta_contado' || t === 'cobro_cuenta' || t === 'otro_ingreso'
export const conSigno = (m: Pick<MovCaja, 'tipo' | 'importe_cent'>) => (esIngreso(m.tipo) ? m.importe_cent : -m.importe_cent)

export type ResumenCaja = {
  contado: number
  cobros: number
  otrosIngresos: number
  ingresos: number
  compras: number
  gastosFijos: Record<Subcategoria, number>
  gastosFijosTotal: number
  otrosEgresos: number
  egresos: number
  resultado: number
  porMedio: Record<MedioPago | 'sin_dato', number>
}

/** Totales del período. Los anulados no cuentan. */
export function resumenCaja(movs: MovCaja[]): ResumenCaja {
  const r: ResumenCaja = {
    contado: 0, cobros: 0, otrosIngresos: 0, ingresos: 0, compras: 0,
    gastosFijos: { Sueldos: 0, Gas: 0, Otros: 0 }, gastosFijosTotal: 0, otrosEgresos: 0, egresos: 0, resultado: 0,
    porMedio: { efectivo: 0, transferencia: 0, sin_dato: 0 },
  }
  for (const m of movs) {
    if (m.anulado) continue
    const x = m.importe_cent
    switch (m.tipo) {
      case 'venta_contado': r.contado += x; break
      case 'cobro_cuenta': r.cobros += x; break
      case 'otro_ingreso': r.otrosIngresos += x; break
      case 'compra': r.compras += x; break
      case 'gasto_fijo': r.gastosFijos[m.subcategoria ?? 'Otros'] += x; r.gastosFijosTotal += x; break
      case 'otro_egreso': r.otrosEgresos += x; break
    }
    r.porMedio[m.medio_pago ?? 'sin_dato'] += conSigno(m)
  }
  r.ingresos = r.contado + r.cobros + r.otrosIngresos
  r.egresos = r.compras + r.gastosFijosTotal + r.otrosEgresos
  r.resultado = r.ingresos - r.egresos
  return r
}

/**
 * Venta de menús al contado que propone el cierre del día:
 * (menús pedidos − menús anotados en cuentas) × precio del menú. Nunca negativa.
 */
export function propuestaCierre(pedidos: number, anotados: number, precio_cent: number): { menus: number; importe_cent: number } {
  const menus = Math.max(0, Math.round(pedidos - anotados))
  return { menus, importe_cent: menus * precio_cent }
}

/** Con listas de precio: la misma cuenta lista por lista, cada una con su precio. */
export function propuestaCierrePorLista(filas: { pedidos: number; anotados: number; precio_cent: number }[]): { menus: number; importe_cent: number } {
  return filas.map((f) => propuestaCierre(f.pedidos, f.anotados, f.precio_cent))
    .reduce((a, x) => ({ menus: a.menus + x.menus, importe_cent: a.importe_cent + x.importe_cent }), { menus: 0, importe_cent: 0 })
}
