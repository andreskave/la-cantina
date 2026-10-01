import { describe, expect, it } from 'vitest'
import { estadoFila, filaVacia, parseCategoria, parseNumeroUY, parsePegado, parseUnidad } from './cargaRapida'

describe('números con formato uruguayo', () => {
  it.each([
    ['1.300', 1300], ['1.250,50', 1250.5], ['$ 300', 300], ['$300', 300], ['2,5', 2.5], ['2.5', 2.5],
    ['1.300.000', 1300000], ['12', 12], ['0,75', 0.75],
  ])('%s → %d', (t, n) => expect(parseNumeroUY(t)).toBe(n))
  it('texto inválido → NaN', () => {
    expect(parseNumeroUY('')).toBeNaN()
    expect(parseNumeroUY('abc')).toBeNaN()
  })
})

describe('sinónimos de unidad y categorías', () => {
  it('unidades', () => {
    expect(parseUnidad('kilo')).toBe('kg')
    expect(parseUnidad('Gr.')).toBe('g')
    expect(parseUnidad('lt')).toBe('l')
    expect(parseUnidad('cc')).toBe('ml')
    expect(parseUnidad('unidad')).toBe('u')
    expect(parseUnidad('docena')).toBe('docena')
    expect(parseUnidad('bolsa')).toBeNull()
  })
  it('categorías por prefijo y sin tildes', () => {
    expect(parseCategoria('verdu')).toBe('Verdulería')
    expect(parseCategoria('lacteos')).toBe('Lácteos y huevos')
    expect(parseCategoria('almacen')).toBe('Almacén')
    expect(parseCategoria('xx')).toBeNull()
  })
})

describe('pegar desde Excel', () => {
  it('columnas separadas por tab, con encabezado', () => {
    const f = parsePegado('Nombre\tCantidad\tUnidad\tPrecio\nTallarines\t1\tkg\t300\tAlmacén\nJugo 200 ml\t12\tu\t$ 1.300\tBebidas\t50')
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ nombre: 'Tallarines', cantidad: '1', unidad: 'kg', precio: '300', categoria: 'Almacén' })
    expect(f[1]).toMatchObject({ nombre: 'Jugo 200 ml', cantidad: '12', unidad: 'u', precio: '1300', categoria: 'Bebidas', venta: '50' })
  })
  it('separado por ; o |, y cantidad con unidad en una columna', () => {
    expect(parsePegado('Cebolla; 1 kilo; 55; verdu')[0]).toMatchObject({ nombre: 'Cebolla', cantidad: '1', unidad: 'kg', precio: '55', categoria: 'Verdulería' })
    expect(parsePegado('Leche | 1 | lt | 45,50')[0]).toMatchObject({ unidad: 'l', precio: '45.5' })
  })
  it('línea libre "Tallarines 1 kg 300"', () => {
    expect(parsePegado('Tallarines 1 kg 300')[0]).toMatchObject({ nombre: 'Tallarines', cantidad: '1', unidad: 'kg', precio: '300' })
    expect(parsePegado('Carne picada 2 kilos $ 1.250,50')[0]).toMatchObject({ nombre: 'Carne picada', cantidad: '2', unidad: 'kg', precio: '1250.5' })
  })
  it('docena = 12 u', () => {
    expect(parsePegado('Huevos\t2\tdocena\t240')[0]).toMatchObject({ cantidad: '24', unidad: 'u' })
  })
  it('marca la unidad desconocida', () => {
    expect(parsePegado('Harina\t1\tbolsa\t80')[0]).toMatchObject({ unidad: 'kg', unidadDudosa: true })
  })
})

describe('estado de cada fila', () => {
  const existentes = new Map([['tallarines', 'id-1']])
  it('nuevo, ya existe, falta el precio', () => {
    expect(estadoFila({ ...filaVacia(), nombre: 'Arroz', precio: '80' }, existentes)).toMatchObject({ tipo: 'nuevo', texto: 'Nuevo' })
    expect(estadoFila({ ...filaVacia(), nombre: ' TALLARINES ', precio: '310' }, existentes))
      .toMatchObject({ tipo: 'actualiza', texto: 'Ya existe: se actualiza el precio', existenteId: 'id-1' })
    expect(estadoFila({ ...filaVacia(), nombre: 'Arroz' }, existentes)).toMatchObject({ tipo: 'falta_precio', texto: 'Falta el precio' })
    expect(estadoFila(filaVacia(), existentes)).toEqual({ tipo: 'vacia' })
  })
})
