import { describe, expect, it } from 'vitest'
import { crearCosteo, type RecetaCosteo } from './costeo'
import { armarLista, fechasDeRango, redondearCompra, textoCantidad, textoParaCopiar, textoRango, type InsumoCompra } from './compras'
import type { DiaMenu } from './menu'

const dia = (fecha: string, extra: Partial<DiaMenu> = {}): DiaMenu => ({
  fecha, plato_receta_id: null, plato_texto: null, postre_receta_id: null, postre_texto: null,
  pedidos: null, sin_cocina: false, motivo: null, ...extra,
})

const ins = (id: string, nombre: string, cantidad: number, unidad: InsumoCompra['unidad_compra'], merma = 0, categoria: InsumoCompra['categoria'] = 'Almacén'): InsumoCompra =>
  ({ id, nombre, categoria, proveedor_id: null, cantidad_compra: cantidad, unidad_compra: unidad, merma_pct: merma })

describe('rangos', () => {
  it('esta semana va de hoy al viernes; la próxima de lunes a viernes', () => {
    expect(fechasDeRango('esta', '2026-10-07')).toEqual(['2026-10-07', '2026-10-09'])
    expect(fechasDeRango('proxima', '2026-10-07')).toEqual(['2026-10-12', '2026-10-16'])
  })
  it('un sábado, "esta semana" es la que empieza el lunes', () => {
    expect(fechasDeRango('esta', '2026-10-10')).toEqual(['2026-10-12', '2026-10-16'])
  })
  it('texto del rango', () => {
    expect(textoRango('2026-10-05', '2026-10-09')).toBe('del lunes 5 al viernes 9 de octubre')
    expect(textoRango('2026-09-28', '2026-10-02')).toBe('del lunes 28 de setiembre al viernes 2 de octubre')
  })
})

describe('redondeo y unidades', () => {
  it('hacia arriba a 1 decimal; unidades a entero', () => {
    expect(redondearCompra(7.2, 'kg')).toBe(7.2)
    expect(redondearCompra(7.21, 'kg')).toBe(7.3)
    expect(redondearCompra(12.1, 'u')).toBe(13)
    expect(redondearCompra(12, 'u')).toBe(12)
  })
  it('se muestra en la unidad de compra, pasada a la más legible', () => {
    expect(textoCantidad(7200, 'kg')).toBe('7,2 kg')
    expect(textoCantidad(1150, 'ml')).toBe('1,2 l')
    expect(textoCantidad(340, 'kg')).toBe('340 g')
  })
})

describe('lista de compras', () => {
  const insumos = [
    ins('tal', 'Tallarines', 1, 'kg'),
    ins('car', 'Carne picada', 1, 'kg', 0, 'Carnes'),
    ins('ceb', 'Cebolla', 1, 'kg', 10, 'Verdulería'),
    ins('jug', 'Jugo', 12, 'u', 0, 'Bebidas'),
  ]
  const recetas: RecetaCosteo[] = [
    { id: 'tuco', nombre: 'Tuco', tipo: 'preparacion', modo: null, porciones: null, rinde_cantidad: 3, rinde_unidad: 'l',
      ingredientes: [{ insumo_id: 'car', cantidad: 1, unidad: 'kg' }, { insumo_id: 'ceb', cantidad: 300, unidad: 'g' }] },
    { id: 'tct', nombre: 'Tallarines con tuco', tipo: 'plato', modo: 'porcion', porciones: null, rinde_cantidad: null, rinde_unidad: null,
      ingredientes: [{ insumo_id: 'tal', cantidad: 120, unidad: 'g' }, { preparacion_id: 'tuco', cantidad: 150, unidad: 'ml' }] },
    { id: 'jp', nombre: 'Jugo', tipo: 'postre', modo: 'porcion', porciones: null, rinde_cantidad: null, rinde_unidad: null,
      ingredientes: [{ insumo_id: 'jug', cantidad: 1, unidad: 'u' }] },
  ]
  const costeo = crearCosteo(insumos.map((i) => ({ id: i.id, nombre: i.nombre, merma_pct: i.merma_pct, precio: null })), recetas)
  const precios = new Map([['tal', { cantidad: 1, unidad: 'kg' as const, precio_cent: 30000 }]])

  const lista = armarLista({
    desde: '2026-10-05', hasta: '2026-10-09', pedidosDefault: 50, costeo, insumos, precios,
    dias: [
      dia('2026-10-05', { plato_receta_id: 'tct', postre_receta_id: 'jp', pedidos: 60 }),
      dia('2026-10-06', { plato_receta_id: 'tct' }),                                   // usa los 50 por defecto
      dia('2026-10-07', { plato_texto: 'Guiso', postre_receta_id: 'jp', pedidos: 13 }), // plato a mano: no entra
      dia('2026-10-08', { sin_cocina: true, motivo: 'Paro', plato_receta_id: 'tct' }),
      dia('2026-10-12', { plato_receta_id: 'tct', pedidos: 999 }),                      // fuera del rango
    ],
  })
  const item = (id: string) => lista.items.find((i) => i.insumo.id === id)!

  it('multiplica por los pedidos (o los de por defecto) y expande las preparaciones', () => {
    // Tallarines: 120 g × (60 + 50) = 13,2 kg
    expect(item('tal').texto).toBe('13,2 kg')
    // Carne: 150 ml de tuco por porción, tuco 3 l por 1 kg → 50 g × 110 = 5,5 kg
    expect(item('car').texto).toBe('5,5 kg')
  })

  it('suma la merma: cantidad a comprar = útil / (1 − merma)', () => {
    // Cebolla útil: 15 g × 110 = 1650 g → / 0,9 = 1833,3 g → 1,9 kg
    expect(item('ceb').cantidad_base).toBeCloseTo(1833.33, 1)
    expect(item('ceb').texto).toBe('1,9 kg')
  })

  it('muestra paquetes cuando la presentación no es 1', () => {
    // Jugo: 60 + 13 = 73 u → 7 paquetes de 12
    expect(item('jug')).toMatchObject({ texto: '73 u', paquetes: '7 × 12 u' })
    expect(item('tal').paquetes).toBeNull()
  })

  it('avisa los días a mano y los que usaron los pedidos por defecto', () => {
    expect(lista.aMano).toEqual([{ fecha: '2026-10-07', texto: 'Guiso' }])
    expect(lista.porDefecto).toEqual(['2026-10-06'])
    expect(lista.dias).toBe(3)
    expect(lista.menus).toBe(123)
  })

  it('costo estimado solo para insumos con precio', () => {
    expect(item('tal').costo_cent).toBeCloseTo(13.2 * 30000)
    expect(item('car').costo_cent).toBeNull()
  })

  it('sin pedidos ni valor por defecto, el día no entra y se avisa', () => {
    const l = armarLista({ desde: '2026-10-05', hasta: '2026-10-05', pedidosDefault: 0, costeo, insumos, precios: new Map(),
      dias: [dia('2026-10-05', { plato_receta_id: 'tct' })] })
    expect(l.items).toEqual([])
    expect(l.sinPedidos).toEqual(['2026-10-05'])
  })

  it('con listas de precio, las porciones grandes suman más', () => {
    // 60 menús el 5/10: 40 General (× 1) y 20 Grandes (× 1,3) → factor promedio 1,1
    const l = armarLista({ desde: '2026-10-05', hasta: '2026-10-05', pedidosDefault: 0, costeo, insumos, precios: new Map(),
      dias: [dia('2026-10-05', { plato_receta_id: 'tct', pedidos: 60 })], factorDia: () => (40 * 1 + 20 * 1.3) / 60 })
    // Tallarines: 120 g × 60 × 1,1 = 7,92 kg → 8 kg
    expect(l.items.find((i) => i.insumo.id === 'tal')!.texto).toBe('8 kg')
    expect(l.menus).toBe(60)
  })

  it('texto para WhatsApp', () => {
    expect(textoParaCopiar('Compras', [['Bebidas', [item('jug')]], ['Almacén', [item('tal')]]]))
      .toBe('Compras\n\n*Bebidas*\n- Jugo: 73 u (7 × 12 u)\n\n*Almacén*\n- Tallarines: 13,2 kg')
  })
})
