import { describe, expect, it } from 'vitest'
import { crearCosteo, type InsumoCosteo, type RecetaCosteo } from './costeo'
import { habilesMes, proximosHabiles, semanasDelMes, serialExcel, sumarDias } from './fechas'
import {
  congelarDia, copiarMesAnterior, estadoDia, precioEn, preciosQueCambiaron, resumenMes, semaforo,
  type CostoCongelado, type DiaMenu,
} from './menu'

const dia = (fecha: string, extra: Partial<DiaMenu> = {}): DiaMenu => ({
  fecha, plato_receta_id: null, plato_texto: null, postre_receta_id: null, postre_texto: null,
  pedidos: null, sin_cocina: false, motivo: null, ...extra,
})

describe('calendario', () => {
  it('octubre 2026: arranca jueves 1, las semanas de borde quedan con días vacíos', () => {
    const s = semanasDelMes('2026-10')
    expect(s[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02'])
    expect(s.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'])
    expect(habilesMes('2026-10')).toHaveLength(22)
  })
  it('mes que empieza en sábado (agosto 2026) arranca el lunes 3', () => {
    expect(semanasDelMes('2026-08')[0]).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'])
  })
  it('próximos días hábiles saltean el fin de semana', () => {
    expect(proximosHabiles('2026-10-01', 5)).toEqual(['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
  })
  it('fechas de Excel sin corrimiento', () => {
    expect(serialExcel('2026-10-15')).toBe(46310)
    expect(serialExcel('1900-03-01')).toBe(61)
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('copiar mes anterior', () => {
  it('copia en orden a los días hábiles vacíos, sin pisar ni copiar pedidos', () => {
    const dias = [
      dia('2026-09-01', { plato_receta_id: 'a', pedidos: 50 }),
      dia('2026-09-02', { sin_cocina: true, motivo: 'Paro' }),
      dia('2026-09-03', { plato_texto: 'Guiso', postre_receta_id: 'f' }),
      dia('2026-10-01', { sin_cocina: true, motivo: 'Feriado' }),
    ]
    const copia = copiarMesAnterior('2026-10', dias)
    expect(copia.map((d) => d.fecha)).toEqual(['2026-10-02', '2026-10-05'])
    expect(copia[0]).toMatchObject({ plato_receta_id: 'a', pedidos: null })
    expect(copia[1]).toMatchObject({ plato_texto: 'Guiso', postre_receta_id: 'f' })
  })
})

describe('costo de cada día', () => {
  const tallarines = (precio: number): InsumoCosteo => ({ id: 't', nombre: 'Tallarines', merma_pct: 0, precio: { cantidad: 1, unidad: 'kg', precio_cent: precio * 100 } })
  const flanIns: InsumoCosteo = { id: 'l', nombre: 'Leche', merma_pct: 0, precio: { cantidad: 1, unidad: 'l', precio_cent: 4500 } }
  const recetas: RecetaCosteo[] = [
    { id: 'p', nombre: 'Tallarines', tipo: 'plato', modo: 'porcion', porciones: null, rinde_cantidad: null, rinde_unidad: null, ingredientes: [{ insumo_id: 't', cantidad: 120, unidad: 'g' }] },
    { id: 'f', nombre: 'Flan', tipo: 'postre', modo: 'olla', porciones: 10, rinde_cantidad: null, rinde_unidad: null, ingredientes: [{ insumo_id: 'l', cantidad: 1, unidad: 'l' }] },
  ]
  const nombres = new Map(recetas.map((r) => [r.id, r]))
  const hoy = '2026-10-15'
  const dias = [dia('2026-10-14', { plato_receta_id: 'p', postre_receta_id: 'f' }), dia('2026-10-16', { plato_receta_id: 'p', postre_receta_id: 'f' })]

  it('al cambiar un precio hoy, los días pasados mantienen su costo y los futuros se actualizan', () => {
    const antes = crearCosteo([tallarines(300), flanIns], recetas)
    // El cron de anoche congeló el 14 con los precios de ese momento: 36 + 4,50.
    const fila = congelarDia(dias[0], antes, new Map([['t', tallarines(300)], ['l', flanIns]]))!
    expect(fila.costo_total_cent).toBe(4050)
    expect(fila.detalle.lineas.map((l) => [l.nombre, l.cantidad_base, l.unidad_base])).toEqual([['Tallarines', 120, 'g'], ['Leche', 100, 'ml']])
    const congelados = new Map<string, CostoCongelado>([['2026-10-14', { fecha: '2026-10-14', ...fila }]])

    const despues = crearCosteo([tallarines(400), flanIns], recetas)
    const ctx = { hoy, costeo: despues, recetas: nombres, congelados }
    const pasado = estadoDia('2026-10-14', dias[0], ctx)
    const futuro = estadoDia('2026-10-16', dias[1], ctx)
    expect(pasado).toMatchObject({ tipo: 'menu', costo_cent: 4050, congelado: true })
    expect(futuro).toMatchObject({ tipo: 'menu', costo_cent: 4800 + 450, congelado: false })
  })

  it('día pasado sin congelar o con plato escrito a mano → Sin costear', () => {
    const c = crearCosteo([tallarines(300), flanIns], recetas)
    const ctx = { hoy, costeo: c, recetas: nombres, congelados: new Map() }
    expect(estadoDia('2026-10-14', dias[0], ctx)).toMatchObject({ costo_cent: null })
    const aMano = dia('2026-10-20', { plato_texto: 'Guiso de lentejas', postre_receta_id: 'f' })
    expect(estadoDia('2026-10-20', aMano, ctx)).toMatchObject({ costo_cent: null, plato: { nombre: 'Guiso de lentejas', aMano: true } })
    expect(congelarDia(aMano, c, new Map())).toBeNull()
  })

  it('un día sin cocina muestra solo el motivo', () => {
    const ctx = { hoy, costeo: null, recetas: nombres, congelados: new Map() }
    expect(estadoDia('2026-10-12', dia('2026-10-12', { sin_cocina: true, motivo: 'Feriado' }), ctx)).toEqual({ tipo: 'sin_cocina', fecha: '2026-10-12', motivo: 'Feriado' })
    expect(estadoDia('2026-10-13', undefined, ctx)).toEqual({ tipo: 'vacio', fecha: '2026-10-13' })
  })

  it('sin costeo (ayudante) no hay costos', () => {
    const e = estadoDia('2026-10-16', dias[1], { hoy, costeo: null, recetas: nombres, congelados: new Map() })
    expect(e).toMatchObject({ tipo: 'menu', costo_cent: null, plato: { nombre: 'Tallarines' } })
  })
})

describe('semáforo, precio del menú, resumen y precios que cambiaron', () => {
  it('semáforo según el objetivo', () => {
    expect(semaforo(9100, 26000, 35)).toBe('ok')
    expect(semaforo(9200, 26000, 35)).toBe('warn')
    expect(semaforo(null, 26000, 35)).toBe('warn')
    expect(semaforo(5000, null, 35)).toBe('mute')
  })
  it('precio vigente en cada fecha', () => {
    const h = [{ vigente_desde: '2026-03-01', precio_cent: 24000 }, { vigente_desde: '2026-10-10', precio_cent: 26000 }]
    expect(precioEn('2026-10-09', h)).toBe(24000)
    expect(precioEn('2026-10-10', h)).toBe(26000)
    expect(precioEn('2026-01-01', h)).toBeNull()
  })
  it('resumen del mes', () => {
    const r = resumenMes([
      { tipo: 'menu', fecha: 'a', plato: null, postre: null, pedidos: 50, costo_cent: 8000, congelado: true },
      { tipo: 'menu', fecha: 'b', plato: null, postre: null, pedidos: null, costo_cent: null, congelado: false },
      { tipo: 'sin_cocina', fecha: 'c', motivo: 'Feriado' },
      { tipo: 'vacio', fecha: 'd' },
    ], () => 26000, 60)
    expect(r).toEqual({ costoPromedio: 8000, gananciaPromedio: 18000, diasCargados: 2, diasConCocina: 3, diasSinCostear: 1, menusEstimados: 110 })
  })
  it('precios que cambiaron en los últimos 30 días, comparando precio por unidad', () => {
    const h = [
      { insumo_id: 'a', fecha: '2026-08-01', cantidad: 1, unidad: 'kg' as const, precio_cent: 30000 },
      { insumo_id: 'a', fecha: '2026-10-01', cantidad: 5, unidad: 'kg' as const, precio_cent: 165000 },
      { insumo_id: 'b', fecha: '2026-06-01', cantidad: 1, unidad: 'kg' as const, precio_cent: 100 },
      { insumo_id: 'b', fecha: '2026-07-01', cantidad: 1, unidad: 'kg' as const, precio_cent: 200 },
      { insumo_id: 'c', fecha: '2026-10-05', cantidad: 1, unidad: 'l' as const, precio_cent: 100 },
    ]
    const r = preciosQueCambiaron(h, '2026-10-15')
    expect(r).toHaveLength(1)
    expect(r[0].insumo_id).toBe('a')
    expect(r[0].variacion).toBeCloseTo(0.1)
  })
})
