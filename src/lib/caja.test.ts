import { describe, expect, it } from 'vitest'
import { propuestaCierre, propuestaCierrePorLista, resumenCaja, type MovCaja } from './caja'

let n = 0
const mov = (tipo: MovCaja['tipo'], pesos: number, extra: Partial<MovCaja> = {}): MovCaja => ({
  id: String(++n), fecha: '2026-10-07', tipo, subcategoria: tipo === 'gasto_fijo' ? 'Otros' : null, proveedor_id: null,
  concepto: '', importe_cent: pesos * 100, medio_pago: null, origen: tipo === 'cobro_cuenta' ? 'cuenta_corriente' : 'manual',
  anulado: false, ...extra,
})

describe('cierre del día', () => {
  it('60 menús pedidos, 10 anotados en cuentas y precio $ 260 → propone $ 13.000', () => {
    expect(propuestaCierre(60, 10, 26000)).toEqual({ menus: 50, importe_cent: 1300000 })
  })
  it('con listas: cada lista con sus pedidos, sus menús en cuentas y su precio', () => {
    // General: 40 pedidos, 10 en cuentas, $ 260 · Grandes: 20 pedidos, 25 en cuentas (de más), $ 320
    expect(propuestaCierrePorLista([{ pedidos: 40, anotados: 10, precio_cent: 26000 }, { pedidos: 20, anotados: 25, precio_cent: 32000 }]))
      .toEqual({ menus: 30, importe_cent: 780000 })
  })
  it('nunca propone un importe negativo', () => {
    expect(propuestaCierre(5, 8, 26000)).toEqual({ menus: 0, importe_cent: 0 })
  })
})

describe('resumen de caja', () => {
  it('ingresos (contado + cobros), compras, gastos fijos y resultado', () => {
    const r = resumenCaja([
      mov('venta_contado', 13000, { medio_pago: 'efectivo' }), mov('cobro_cuenta', 2600, { medio_pago: 'transferencia' }),
      mov('otro_ingreso', 500), mov('compra', 4200, { medio_pago: 'efectivo' }), mov('gasto_fijo', 9000, { subcategoria: 'Sueldos' }),
      mov('gasto_fijo', 1200, { subcategoria: 'Gas' }), mov('otro_egreso', 300),
      mov('cobro_cuenta', 99999, { anulado: true }),
    ])
    expect(r.ingresos).toBe(1610000)
    expect(r.egresos).toBe(1470000)
    expect(r.resultado).toBe(140000)
    expect(r.gastosFijos).toEqual({ Sueldos: 900000, Gas: 120000, Otros: 0 })
    expect(r.porMedio).toEqual({ efectivo: 880000, transferencia: 260000, sin_dato: 500 * 100 - 900000 - 120000 - 30000 })
  })
})
