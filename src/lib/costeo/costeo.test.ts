import { describe, expect, it } from 'vitest'
import {
  ajustarOlla, costoBaseInsumo, crearCosteo, equivalencia, normalizar, ollaAPorcion, porcionAOlla,
  type InsumoCosteo, type RecetaCosteo, type Unidad,
} from '.'

const ins = (id: string, nombre: string, cantidad: number, unidad: Unidad, precio: number | null, merma = 0): InsumoCosteo => ({
  id, nombre, merma_pct: merma, precio: precio === null ? null : { cantidad, unidad, precio_cent: precio * 100 },
})

const plato = (id: string, nombre: string, ingredientes: RecetaCosteo['ingredientes'], modo: 'porcion' | 'olla' = 'porcion', porciones: number | null = null): RecetaCosteo => ({
  id, nombre, tipo: 'plato', modo, porciones, rinde_cantidad: null, rinde_unidad: null, ingredientes,
})

const prep = (id: string, nombre: string, ingredientes: RecetaCosteo['ingredientes'], rinde: number | null, rindeU: 'l' | 'kg' | 'u' | null = 'l'): RecetaCosteo => ({
  id, nombre, tipo: 'preparacion', modo: null, porciones: null, rinde_cantidad: rinde, rinde_unidad: rindeU, ingredientes,
})

describe('costo de insumos', () => {
  it('1 kg de tallarines a $300 → 300 g = $90,00', () => {
    const t = ins('t', 'Tallarines', 1, 'kg', 300)
    const c = crearCosteo([t], [plato('p', 'Tallarines solos', [{ insumo_id: 't', cantidad: 300, unidad: 'g' }])])
    expect(c.receta('p')!.porcion_cent).toBeCloseTo(9000, 6)
  })

  it('merma: 1 kg de cebolla a $55 con 10% → $0,0611 por g útil y $61,11 por kg útil', () => {
    const cb = costoBaseInsumo(ins('c', 'Cebolla', 1, 'kg', 55, 10))!
    expect(cb / 100).toBeCloseTo(0.0611, 4)
    expect((cb * 1000) / 100).toBeCloseTo(61.11, 2)
  })

  it('sin precio → null', () => {
    expect(costoBaseInsumo(ins('x', 'X', 1, 'kg', null))).toBeNull()
  })
})

describe('costo de recetas', () => {
  const carne = ins('carne', 'Carne picada', 1, 'kg', 400)
  const tomate = ins('tom', 'Tomate triturado', 1, 'l', 120)
  const tallarines = ins('tal', 'Tallarines', 1, 'kg', 300)
  // Tuco: 1 kg carne + 2 l tomate = $640, rinde 3 l → $0,2133 por ml
  const tuco = prep('tuco', 'Tuco', [
    { insumo_id: 'carne', cantidad: 1, unidad: 'kg' },
    { insumo_id: 'tom', cantidad: 2, unidad: 'l' },
  ], 3)
  // Plato: 120 g tallarines ($36) + 150 ml tuco ($32) = $68
  const tct = plato('tct', 'Tallarines con tuco', [
    { insumo_id: 'tal', cantidad: 120, unidad: 'g' },
    { preparacion_id: 'tuco', cantidad: 150, unidad: 'ml' },
  ])

  it('preparación usada como ingrediente', () => {
    const c = crearCosteo([carne, tomate, tallarines], [tuco, tct])
    expect(c.receta('tuco')!.total_cent).toBeCloseTo(64000)
    expect(c.receta('tuco')!.por_base_cent).toBeCloseTo(64000 / 3000)
    expect(c.receta('tct')!.porcion_cent).toBeCloseTo(3600 + 3200)
    expect(c.receta('tct')!.completo).toBe(true)
  })

  it('cascada: si sube la carne picada, suben el Tuco y el plato', () => {
    const antes = crearCosteo([carne, tomate, tallarines], [tuco, tct])
    const despues = crearCosteo([ins('carne', 'Carne picada', 1, 'kg', 700), tomate, tallarines], [tuco, tct])
    expect(despues.receta('tuco')!.total_cent).toBeGreaterThan(antes.receta('tuco')!.total_cent)
    expect(despues.receta('tct')!.porcion_cent! - antes.receta('tct')!.porcion_cent!).toBeCloseTo((30000 / 3000) * 150)
    expect(antes.afectadas({ insumo_id: 'carne' }).map((r) => r.id).sort()).toEqual(['tct', 'tuco'])
  })

  it('ciclo: A usa B y B usa A → error y no se guarda', () => {
    const a = prep('a', 'Salsa A', [{ preparacion_id: 'b', cantidad: 100, unidad: 'ml' }], 1)
    const b = prep('b', 'Salsa B', [{ insumo_id: 'tom', cantidad: 1, unidad: 'l' }], 1)
    const c = crearCosteo([tomate], [a, b])
    // Al editar B para que use A:
    expect(c.cicloAlGuardar('b', [{ preparacion_id: 'a', cantidad: 50, unidad: 'ml' }])).toEqual(['Salsa B', 'Salsa A', 'Salsa B'])
    expect(c.cicloAlGuardar('a', [{ preparacion_id: 'a', cantidad: 1, unidad: 'ml' }])).toEqual(['Salsa A', 'Salsa A'])
    expect(c.cicloAlGuardar('b', [{ insumo_id: 'tom', cantidad: 1, unidad: 'l' }])).toBeNull()
    // Y si el ciclo ya estuviera guardado, el costo no se cuelga y queda incompleto:
    const conCiclo = crearCosteo([tomate], [a, prep('b', 'Salsa B', [{ preparacion_id: 'a', cantidad: 50, unidad: 'ml' }], 1)])
    const r = conCiclo.receta('a')!
    expect(r.completo).toBe(false)
    expect(r.ciclo).toBe(true)
  })

  it('unidad incompatible (insumo en kg cargado en ml) → línea incompleta, plato sin costear', () => {
    const c = crearCosteo([tallarines], [plato('p', 'P', [{ insumo_id: 'tal', cantidad: 100, unidad: 'ml' }])])
    const r = c.receta('p')!
    expect(r.completo).toBe(false)
    expect(r.lineas[0].costo_cent).toBeNull()
    expect(r.faltantes).toEqual(['Tallarines (unidad no compatible)'])
  })

  it('faltantes: sin precio y preparación sin rinde', () => {
    const sinRinde = prep('s', 'Puré', [{ insumo_id: 'tom', cantidad: 1, unidad: 'l' }], null)
    const c = crearCosteo([ins('tal', 'Tallarines', 1, 'kg', null), tomate], [sinRinde, plato('p', 'P', [
      { insumo_id: 'tal', cantidad: 100, unidad: 'g' },
      { preparacion_id: 's', cantidad: 100, unidad: 'g' },
    ])])
    expect(c.receta('p')!.faltantes).toEqual(['Tallarines (sin precio)', 'Puré (falta cuánto rinde)'])
  })

  it('un faltante dentro de una preparación se propaga al plato', () => {
    const c = crearCosteo([ins('carne', 'Carne picada', 1, 'kg', null), tomate, tallarines], [tuco, tct])
    const r = c.receta('tct')!
    expect(r.completo).toBe(false)
    expect(r.faltantes).toContain('Carne picada (sin precio)')
  })

  it('olla: costo por porción = total / porciones; cambiar porciones sube el costo por porción', () => {
    const ings = [{ insumo_id: 'tal', cantidad: 7.2, unidad: 'kg' as const }]
    const c60 = crearCosteo([tallarines], [plato('o', 'Olla', ings, 'olla', 60)])
    const c50 = crearCosteo([tallarines], [plato('o', 'Olla', ings, 'olla', 50)])
    expect(c60.receta('o')!.porcion_cent).toBeCloseTo(3600)
    expect(c50.receta('o')!.porcion_cent).toBeGreaterThan(c60.receta('o')!.porcion_cent!)
    expect(c50.receta('o')!.total_cent).toBeCloseTo(c60.receta('o')!.total_cent)
  })
})

describe('porción ↔ olla', () => {
  it('porción → olla de 60: 120 g pasa a 7,2 kg; olla → porción vuelve a 120 g', () => {
    const olla = porcionAOlla([{ cantidad: 120, unidad: 'g' as const }], 60)
    expect(olla).toEqual([{ cantidad: 7.2, unidad: 'kg' }])
    expect(ollaAPorcion(olla, 60)).toEqual([{ cantidad: 120, unidad: 'g' }])
  })

  it('ajustar la olla de 60 a 50 porciones', () => {
    expect(ajustarOlla([{ cantidad: 7.2, unidad: 'kg' as const }], 60, 50)).toEqual([{ cantidad: 6, unidad: 'kg' }])
  })

  it('normaliza a la unidad más legible', () => {
    expect(normalizar(7200, 'g')).toEqual({ cantidad: 7.2, unidad: 'kg' })
    expect(normalizar(0.12, 'kg')).toEqual({ cantidad: 120, unidad: 'g' })
    expect(normalizar(1500, 'ml')).toEqual({ cantidad: 1.5, unidad: 'l' })
    expect(normalizar(3, 'u')).toEqual({ cantidad: 3, unidad: 'u' })
  })

  it('equivalencia debajo de cada ingrediente', () => {
    expect(equivalencia({ cantidad: 7.2, unidad: 'kg' }, 'olla', 60)).toBe('por porción: 120 g')
    expect(equivalencia({ cantidad: 120, unidad: 'g' }, 'porcion', 60)).toBe('para 60 porciones: 7,2 kg')
  })
})
