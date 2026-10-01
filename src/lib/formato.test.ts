import { describe, expect, it } from 'vitest'
import { fechaLarga, hoyISO, mesNombre, numero, pesos } from './formato'

describe('pesos', () => {
  it('formatea centésimos como $ 1.234,50', () => {
    expect(pesos(123450)).toBe('$ 1.234,50')
    expect(pesos(9000)).toBe('$ 90,00')
    expect(pesos(5)).toBe('$ 0,05')
    expect(pesos(0)).toBe('$ 0,00')
    expect(pesos(123456789)).toBe('$ 1.234.567,89')
    expect(pesos(-41000)).toBe('-$ 410,00')
    expect(pesos(10n ** 12n)).toBe('$ 10.000.000.000,00')
  })
  it('sin centésimos redondea a pesos', () => {
    expect(pesos(1300000, { sinCentesimos: true })).toBe('$ 13.000')
    expect(pesos(6111, { sinCentesimos: true })).toBe('$ 61')
    expect(pesos(6150, { sinCentesimos: true })).toBe('$ 62')
  })
  it('valores faltantes', () => {
    expect(pesos(null)).toBe('—')
    expect(pesos(Number.NaN)).toBe('—')
  })
})

describe('numero', () => {
  it('usa coma decimal y punto de miles', () => {
    expect(numero(7.2)).toBe('7,2')
    expect(numero(1250)).toBe('1.250')
    expect(numero(0.125, 3)).toBe('0,125')
    expect(numero(120)).toBe('120')
  })
})

describe('fechas', () => {
  it('dice setiembre, no septiembre', () => {
    expect(mesNombre('2026-09')).toBe('setiembre 2026')
    expect(fechaLarga('2026-09-15')).toBe('martes 15 de setiembre')
  })
  it('hoy se calcula en hora de Montevideo', () => {
    // 2 de octubre 01:30 UTC = 1 de octubre 22:30 en Montevideo (UTC-3)
    expect(hoyISO(new Date('2026-10-02T01:30:00Z'))).toBe('2026-10-01')
  })
})
