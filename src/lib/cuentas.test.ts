import { describe, expect, it } from 'vitest'
import { aPlana, estadoCuenta, imputar, nombreEstadoCuenta, partidasAbiertas, saldo, slug, type Movimiento } from './cuentas'

let n = 0
const mov = (tipo: 'cargo' | 'pago', fecha: string, pesos: number, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${String(++n).padStart(3, '0')}`, alumno_id: 'a', fecha, tipo, concepto: tipo === 'cargo' ? 'Menú' : 'Pago',
  cantidad: 1, importe_cent: pesos * 100, medio_pago: null, anulado: false, anulado_motivo: null,
  cargado_at: `${fecha}T12:00:00Z`, ...extra,
})

// Mismos casos que los tests de la base (sección 13): las dos implementaciones tienen que coincidir.
describe('imputación a lo más viejo', () => {
  it('cargos de $250, $250 y $90; pago de $400 → día 1 pagado, día 2 con $100, día 3 completo', () => {
    const movs = [mov('cargo', '2026-10-01', 250), mov('cargo', '2026-10-02', 250), mov('cargo', '2026-10-03', 90), mov('pago', '2026-10-03', 400)]
    expect(partidasAbiertas(movs).map((p) => [p.cargo.fecha, p.pendiente_cent])).toEqual([['2026-10-02', 10000], ['2026-10-03', 9000]])
    expect(saldo(movs)).toBe(19000)
  })

  it('pago de $1.000 con deuda de $590 → $410 a favor; un cargo nuevo de $250 queda pagado solo', () => {
    const movs = [mov('cargo', '2026-10-01', 250), mov('cargo', '2026-10-02', 250), mov('cargo', '2026-10-03', 90), mov('pago', '2026-10-03', 1000)]
    expect(imputar(movs).aFavor).toBe(41000)
    movs.push(mov('cargo', '2026-10-05', 250))
    expect(partidasAbiertas(movs)).toEqual([])
    expect(saldo(movs)).toBe(-16000)
  })

  it('anular el cargo del día 1 reimputa el pago a los días 2 y 3', () => {
    const dia1 = mov('cargo', '2026-10-01', 250)
    const movs = [dia1, mov('cargo', '2026-10-02', 250), mov('cargo', '2026-10-03', 90), mov('pago', '2026-10-03', 400)]
    dia1.anulado = true
    expect(partidasAbiertas(movs)).toEqual([])
    expect(imputar(movs).aFavor).toBe(6000)
  })

  it('a igual fecha manda el momento de carga', () => {
    const tarde = mov('cargo', '2026-10-01', 100, { cargado_at: '2026-10-01T15:00:00Z' })
    const temprano = mov('cargo', '2026-10-01', 100, { cargado_at: '2026-10-01T09:00:00Z' })
    const movs = [tarde, temprano, mov('pago', '2026-10-02', 100)]
    expect(partidasAbiertas(movs).map((p) => p.cargo.id)).toEqual([tarde.id])
  })

  it('un pago anterior a los cargos deja saldo a favor que se aplica después', () => {
    const movs = [mov('pago', '2026-09-30', 300), mov('cargo', '2026-10-01', 250), mov('cargo', '2026-10-02', 250)]
    expect(partidasAbiertas(movs).map((p) => p.pendiente_cent)).toEqual([20000])
  })
})

describe('estado de cuenta', () => {
  it('total a pagar y saldo a favor', () => {
    const movs = [mov('cargo', '2026-10-01', 250), mov('pago', '2026-10-01', 100)]
    const e = estadoCuenta({ cantina: 'La Cantina', alumno: 'Juan', responsable: null, emision: '2026-10-15', partidas: partidasAbiertas(movs).map(aPlana), saldo_cent: saldo(movs) })
    expect(e).toMatchObject({ total_cent: 15000, aFavor_cent: 0, partidas: [{ fecha: '2026-10-01', importe_cent: 25000, pendiente_cent: 15000 }] })
    const af = estadoCuenta({ cantina: 'X', alumno: 'Y', responsable: null, emision: '2026-10-15', partidas: [], saldo_cent: -5000 })
    expect(af).toMatchObject({ total_cent: 0, aFavor_cent: 5000 })
  })
  it('nombre de archivo', () => {
    expect(slug('Juan Pérez')).toBe('juan-perez')
    expect(slug('  María José Núñez! ')).toBe('maria-jose-nunez')
    expect(nombreEstadoCuenta('Juan Pérez', '2026-10-15', 'pdf')).toBe('estado-cuenta-juan-perez-2026-10-15.pdf')
  })
})
