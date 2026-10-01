import { beforeAll, describe, expect, it } from 'vitest'
import { crearDb, type Db } from './db'

let db: Db
let duena: string, ayudante: string, cantina: string

const uno = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]
const filas = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

const guardarInsumo = (user: string, p: Record<string, unknown>) =>
  db.como(user, async () => (await uno<{ id: string }>(`select guardar_insumo($1::jsonb) id`, [JSON.stringify({ cantina_id: cantina, ...p })])).id)

const guardarReceta = (user: string, p: Record<string, unknown>) =>
  db.como(user, async () => (await uno<{ id: string }>(`select guardar_receta($1::jsonb) id`, [JSON.stringify({ cantina_id: cantina, ...p })])).id)

beforeAll(async () => {
  db = await crearDb()
  const admin = await db.crearUsuario('Admin', { admin: true })
  duena = await db.crearUsuario('Duena')
  ayudante = await db.crearUsuario('Ayudante')
  await db.como(admin, async () => {
    cantina = (await uno<{ id: string }>(`insert into cantinas (nombre) values ('La Cantina') returning id`)).id
    await db.query(`insert into miembros (cantina_id, user_id, rol) values ($1,$2,'duena'),($1,$3,'ayudante')`, [cantina, duena, ayudante])
  })
})

describe('guardar_insumo', () => {
  let tallarines: string

  it('crea el insumo y su primer precio', async () => {
    tallarines = await guardarInsumo(duena, { nombre: ' Tallarines ', categoria: 'Almacén', cantidad_compra: 1, unidad_compra: 'kg', precio_cent: 30000 })
    const i = await uno<{ nombre: string }>(`select nombre from insumos where id=$1`, [tallarines])
    expect(i.nombre).toBe('Tallarines')
    const p = await filas<{ precio_cent: string }>(`select precio_cent from insumo_precios where insumo_id=$1`, [tallarines])
    expect(p.map((x) => Number(x.precio_cent))).toEqual([30000])
  })

  it('el mismo día, otro precio reemplaza la fila de hoy; el mismo precio no agrega nada', async () => {
    await guardarInsumo(duena, { id: tallarines, nombre: 'Tallarines', cantidad_compra: 1, unidad_compra: 'kg', precio_cent: 32000 })
    await guardarInsumo(duena, { id: tallarines, nombre: 'Tallarines', cantidad_compra: 1, unidad_compra: 'kg', precio_cent: 32000 })
    const p = await filas<{ precio_cent: string }>(`select precio_cent from insumo_precios where insumo_id=$1`, [tallarines])
    expect(p.map((x) => Number(x.precio_cent))).toEqual([32000])
  })

  it('un cambio en otro día agrega una fila al historial', async () => {
    await db.query(`update insumo_precios set fecha = fecha - 10 where insumo_id=$1`, [tallarines])
    await guardarInsumo(duena, { id: tallarines, nombre: 'Tallarines', cantidad_compra: 5, unidad_compra: 'kg', precio_cent: 150000 })
    const p = await filas<{ cantidad: string }>(`select cantidad from insumo_precios where insumo_id=$1 order by fecha`, [tallarines])
    expect(p.map((x) => Number(x.cantidad))).toEqual([1, 5])
    const v = await uno<{ precio_cent: string }>(`select precio_cent from insumo_precio_vigente where insumo_id=$1`, [tallarines])
    expect(Number(v.precio_cent)).toBe(150000)
  })

  it('sin precio_cent no se toca el historial', async () => {
    await guardarInsumo(duena, { id: tallarines, nombre: 'Tallarines', categoria: 'Almacén', cantidad_compra: 5, unidad_compra: 'kg', merma_pct: 5 })
    expect(await filas(`select 1 from insumo_precios where insumo_id=$1`, [tallarines])).toHaveLength(2)
  })

  it('reventa: crea el producto con su precio de venta; al desmarcar queda inactivo', async () => {
    const jugo = await guardarInsumo(duena, { nombre: 'Jugo', categoria: 'Bebidas', cantidad_compra: 12, unidad_compra: 'u', precio_cent: 30000, es_reventa: true, precio_venta_cent: 5000 })
    const prod = await uno<{ id: string; activo: boolean }>(`select id, activo from productos_venta where insumo_id=$1`, [jugo])
    expect(prod.activo).toBe(true)
    const precio = await uno<{ p: string }>(`select precio_vigente($1, lista_default($2)) p`, [prod.id, cantina])
    expect(Number(precio.p)).toBe(5000)
    await guardarInsumo(duena, { id: jugo, nombre: 'Jugo', cantidad_compra: 12, unidad_compra: 'u', es_reventa: false })
    expect((await uno<{ activo: boolean }>(`select activo from productos_venta where insumo_id=$1`, [jugo])).activo).toBe(false)
  })

  it('el ayudante no puede guardar insumos', async () => {
    await expect(guardarInsumo(ayudante, { nombre: 'Arroz', cantidad_compra: 1, unidad_compra: 'kg', precio_cent: 1 }))
      .rejects.toThrow('Solo la dueña')
  })

  it('nombre repetido → error de unicidad', async () => {
    await expect(guardarInsumo(duena, { nombre: 'tallarines', cantidad_compra: 1, unidad_compra: 'kg' })).rejects.toThrow(/duplicate key/)
  })

  it('el lote es todo o nada', async () => {
    const lote = JSON.stringify([
      { cantina_id: cantina, nombre: 'Arroz', cantidad_compra: 1, unidad_compra: 'kg', precio_cent: 8000 },
      { cantina_id: cantina, nombre: 'Malo', cantidad_compra: -1, unidad_compra: 'kg', precio_cent: 1 },
    ])
    await expect(db.como(duena, () => db.query(`select guardar_insumos_lote($1::jsonb)`, [lote]))).rejects.toThrow()
    expect(await filas(`select 1 from insumos where nombre='Arroz'`)).toHaveLength(0)
    const ok = JSON.stringify([
      { cantina_id: cantina, nombre: 'Arroz', cantidad_compra: 1, unidad_compra: 'kg', precio_cent: 8000 },
      { cantina_id: cantina, nombre: 'Cebolla', categoria: 'Verdulería', cantidad_compra: 1, unidad_compra: 'kg', merma_pct: 10, precio_cent: 5500 },
    ])
    const r = await db.como(duena, () => uno<{ ids: string[] }>(`select guardar_insumos_lote($1::jsonb) ids`, [ok]))
    expect(r.ids).toHaveLength(2)
  })
})

describe('guardar_receta', () => {
  let carne: string, tuco: string, plato: string

  beforeAll(async () => {
    carne = await guardarInsumo(duena, { nombre: 'Carne picada', categoria: 'Carnes', cantidad_compra: 1, unidad_compra: 'kg', precio_cent: 40000 })
  })

  it('crea una preparación y un plato que la usa', async () => {
    tuco = await guardarReceta(duena, { nombre: 'Tuco', tipo: 'preparacion', rinde_cantidad: 3, rinde_unidad: 'l',
      ingredientes: [{ insumo_id: carne, cantidad: 1, unidad: 'kg' }] })
    plato = await guardarReceta(duena, { nombre: 'Tallarines con tuco', tipo: 'plato', modo: 'olla', porciones: 60,
      ingredientes: [{ preparacion_id: tuco, cantidad: 9, unidad: 'l' }] })
    const r = await uno<{ modo: string; porciones: number; rinde_cantidad: null }>(`select modo, porciones, rinde_cantidad from recetas where id=$1`, [plato])
    expect(r).toEqual({ modo: 'olla', porciones: 60, rinde_cantidad: null })
  })

  it('reemplaza los ingredientes en orden', async () => {
    await guardarReceta(duena, { id: plato, nombre: 'Tallarines con tuco', tipo: 'plato', modo: 'porcion',
      ingredientes: [{ insumo_id: carne, cantidad: 50, unidad: 'g' }, { preparacion_id: tuco, cantidad: 150, unidad: 'ml' }] })
    const ings = await filas<{ orden: number; cantidad: string }>(`select orden, cantidad from receta_ingredientes where receta_id=$1 order by orden`, [plato])
    expect(ings.map((i) => [i.orden, Number(i.cantidad)])).toEqual([[0, 50], [1, 150]])
    expect((await uno<{ porciones: null }>(`select porciones from recetas where id=$1`, [plato])).porciones).toBeNull()
  })

  it('un ciclo hace fallar todo el guardado y no deja la receta a medias', async () => {
    const salsa = await guardarReceta(duena, { nombre: 'Salsa', tipo: 'preparacion', rinde_cantidad: 1, rinde_unidad: 'l',
      ingredientes: [{ preparacion_id: tuco, cantidad: 100, unidad: 'ml' }] })
    await expect(guardarReceta(duena, { id: tuco, nombre: 'Tuco', tipo: 'preparacion', rinde_cantidad: 3, rinde_unidad: 'l',
      ingredientes: [{ insumo_id: carne, cantidad: 1, unidad: 'kg' }, { preparacion_id: salsa, cantidad: 1, unidad: 'l' }] }))
      .rejects.toThrow('círculo')
    expect(await filas(`select 1 from receta_ingredientes where receta_id=$1`, [tuco])).toHaveLength(1)
  })

  it('precio de venta de una receta (tortas fritas por unidad)', async () => {
    const tf = await guardarReceta(duena, { nombre: 'Tortas fritas', tipo: 'postre', modo: 'olla', porciones: 40,
      ingredientes: [], precio_venta_cent: 2500 })
    const prod = await uno<{ id: string; tipo: string }>(`select id, tipo from productos_venta where receta_id=$1`, [tf])
    expect(prod.tipo).toBe('receta')
    await guardarReceta(duena, { id: tf, nombre: 'Tortas fritas', tipo: 'postre', modo: 'olla', porciones: 40, ingredientes: [], precio_venta_cent: null })
    expect((await uno<{ activo: boolean }>(`select activo from productos_venta where id=$1`, [prod.id])).activo).toBe(false)
  })

  it('el ayudante no puede editar recetas', async () => {
    await expect(guardarReceta(ayudante, { nombre: 'X', tipo: 'plato', ingredientes: [] })).rejects.toThrow('Solo la dueña')
  })
})

describe('precio del menú', () => {
  it('fija y cambia el precio del menú en la lista General', async () => {
    await db.como(duena, () => db.query(`select fijar_precio_menu($1, 26000)`, [cantina]))
    const p = await uno<{ p: string }>(`select precio_vigente((select id from productos_venta where cantina_id=$1 and tipo='menu'), lista_default($1)) p`, [cantina])
    expect(Number(p.p)).toBe(26000)
    await expect(db.como(ayudante, () => db.query(`select fijar_precio_menu($1, 1)`, [cantina]))).rejects.toThrow('Solo la dueña')
  })
})
