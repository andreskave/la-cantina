import { describe, expect, it } from 'vitest'
import { listaCobro, precioEnLista, precioMenuDia } from './precios'

const productos: { id: string; tipo: string; receta_id: string | null; activo: boolean; precio_cent: number; precios_lista: Record<string, number> }[] = [
  { id: 'm', tipo: 'menu', receta_id: null, activo: true, precio_cent: 26000, precios_lista: { gen: 26000, gra: 32000 } },
  { id: 'a', tipo: 'insumo_reventa', receta_id: null, activo: true, precio_cent: 6000, precios_lista: { gen: 6000 } },
  { id: 'p', tipo: 'receta', receta_id: 'mila', activo: true, precio_cent: 30000, precios_lista: { gen: 30000 } },
]

describe('precios por lista y por plato', () => {
  it('lista del alumno solo con el módulo', () => {
    expect(listaCobro({ listas_precio: false }, 'gra')).toBeNull()
    expect(listaCobro({ listas_precio: true }, 'gra')).toBe('gra')
  })
  it('sin precio en la lista se usa el de la General', () => {
    expect(precioEnLista(productos[1], 'gra')).toBe(6000)
    expect(precioEnLista(productos[0], 'gra')).toBe(32000)
  })
  it('precio por plato: el del plato si tiene precio; si no, el del menú', () => {
    expect(precioMenuDia(productos, { precio_por_plato: true }, 'mila', null)).toBe(30000)
    expect(precioMenuDia(productos, { precio_por_plato: true }, 'guiso', null)).toBe(26000)
    expect(precioMenuDia(productos, { precio_por_plato: false }, 'mila', 'gra')).toBe(32000)
  })
})
