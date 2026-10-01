import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { crearDb, type Db } from './db'

let db: Db
let admin: string, duena: string, ayudante: string, otraDuena: string
let cantina: string, otra: string, menu: string, general: string, grandes: string, alfajor: string, milanesa: string

const uno = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]
const num = async (sql: string, params: unknown[] = []) => Number(Object.values((await db.query<Record<string, unknown>>(sql, params)).rows[0])[0])
const modulos = (m: Record<string, boolean>) => db.como(admin, () => db.query(`update cantinas set modulos = modulos || $2::jsonb where id=$1`, [cantina, JSON.stringify(m)]))
const nuevoAlumno = (nombre: string, lista: string | null = null) =>
  db.como(duena, async () => (await uno<{ id: string }>(`insert into alumnos (cantina_id, nombre, lista_id) values ($1,$2,$3) returning id`, [cantina, nombre, lista])).id)
const consumo = (alumno: string, producto: string, fecha: string) =>
  db.como(duena, async () => (await uno<{ id: string }>(`select anotar_consumo($1,$2,$3,1,$4::date) id`, [randomUUID(), alumno, producto, fecha])).id)
const importe = async (id: string) => num(`select importe_cent from cuenta_movimientos where id=$1`, [id])

beforeAll(async () => {
  db = await crearDb()
  admin = await db.crearUsuario('Admin', { admin: true })
  duena = await db.crearUsuario('Duena')
  ayudante = await db.crearUsuario('Ayudante')
  otraDuena = await db.crearUsuario('OtraDuena')
  await db.como(admin, async () => {
    cantina = (await uno<{ id: string }>(`insert into cantinas (nombre) values ('La Cantina') returning id`)).id
    otra = (await uno<{ id: string }>(`insert into cantinas (nombre) values ('Otra') returning id`)).id
    await db.query(`insert into miembros (cantina_id, user_id, rol) values ($1,$2,'duena'),($1,$3,'ayudante'),($4,$5,'duena')`, [cantina, duena, ayudante, otra, otraDuena])
  })
  menu = (await uno<{ id: string }>(`select id from productos_venta where cantina_id=$1 and tipo='menu'`, [cantina])).id
  general = (await uno<{ id: string }>(`select lista_default($1) id`, [cantina])).id
  await db.como(duena, async () => {
    grandes = (await uno<{ id: string }>(`insert into listas_precio (cantina_id, nombre, factor_porcion) values ($1,'Grandes',1.3) returning id`, [cantina])).id
    const ins = (await uno<{ id: string }>(`insert into insumos (cantina_id, nombre, cantidad_compra, unidad_compra, es_reventa) values ($1,'Alfajor',1,'u',true) returning id`, [cantina])).id
    alfajor = (await uno<{ id: string }>(`insert into productos_venta (cantina_id, tipo, insumo_id, nombre) values ($1,'insumo_reventa',$2,'Alfajor') returning id`, [cantina, ins])).id
    milanesa = (await uno<{ id: string }>(`insert into recetas (cantina_id, nombre, tipo, modo) values ($1,'Milanesa','plato','porcion') returning id`, [cantina])).id
    await db.query(`select guardar_receta($1::jsonb)`, [JSON.stringify({ id: milanesa, cantina_id: cantina, nombre: 'Milanesa', tipo: 'plato', modo: 'porcion', ingredientes: [], precio_venta_cent: 30000 })])
    await db.query(`insert into precios_venta (cantina_id, producto_id, lista_id, precio_cent, vigente_desde) values
      ($1,$2,$3,26000,'2026-01-01'), ($1,$2,$4,32000,'2026-01-01'), ($1,$5,$3,6000,'2026-01-01')`, [cantina, menu, general, grandes, alfajor])
    await db.query(`update precios_venta set vigente_desde='2026-01-01' where cantina_id=$1`, [cantina])
    await db.query(`insert into menu_dias (cantina_id, fecha, plato_receta_id, pedidos) values ($1,'2026-10-07',$2,60)`, [cantina, milanesa])
    await db.query(`insert into menu_dias (cantina_id, fecha, plato_texto) values ($1,'2026-10-08','Guiso')`, [cantina])
    await db.query(`insert into menu_dias (cantina_id, fecha, sin_cocina, motivo) values ($1,'2026-10-12',true,'Feriado')`, [cantina])
  })
})

describe('listas de precio', () => {
  it('con el módulo apagado todos pagan la lista General', async () => {
    const a = await nuevoAlumno('Grande sin módulo', grandes)
    expect(await importe(await consumo(a, menu, '2026-10-08'))).toBe(26000)
  })
  it('con el módulo prendido se cobra la lista del alumno; sin precio en su lista, el de General', async () => {
    await modulos({ listas_precio: true })
    const a = await nuevoAlumno('Grande', grandes)
    expect(await importe(await consumo(a, menu, '2026-10-08'))).toBe(32000)
    expect(await importe(await consumo(a, alfajor, '2026-10-08'))).toBe(6000)
    const m = await uno<{ lista_id: string }>(`select lista_id from cuenta_movimientos where alumno_id=$1 limit 1`, [a])
    expect(m.lista_id).toBe(grandes)
  })
  it('menús en cuentas por lista (para el cierre del día)', async () => {
    const filas = await db.como(duena, async () => (await db.query<{ lista_id: string; cantidad: string }>(
      `select * from menus_en_cuentas_por_lista($1,'2026-10-08')`, [cantina])).rows)
    const porLista = Object.fromEntries(filas.map((f) => [f.lista_id, Number(f.cantidad)]))
    expect(porLista).toEqual({ [grandes]: 1, [general]: 1 })
  })
})

describe('precio por plato', () => {
  it('con el módulo, el menú se cobra al precio del plato del día; si el plato no tiene precio, al del menú', async () => {
    await modulos({ listas_precio: false, precio_por_plato: true })
    const a = await nuevoAlumno('Plato')
    expect(await importe(await consumo(a, menu, '2026-10-07'))).toBe(30000)   // Milanesa tiene precio propio
    expect(await importe(await consumo(a, menu, '2026-10-08'))).toBe(26000)   // Guiso a mano: precio del menú
    await modulos({ precio_por_plato: false })
    expect(await importe(await consumo(a, menu, '2026-10-07'))).toBe(26000)
  })

  it('con listas también: si el plato no tiene precio en la lista, vale el precio del menú de esa lista', async () => {
    await modulos({ listas_precio: true, precio_por_plato: true })
    const general = await nuevoAlumno('Plato General')
    const grande = await nuevoAlumno('Plato Grande', grandes)
    expect(await importe(await consumo(general, menu, '2026-10-07'))).toBe(30000)   // plato en General
    expect(await importe(await consumo(grande, menu, '2026-10-07'))).toBe(32000)    // menú de Grandes, no el plato General
    // Si el plato tiene precio propio en Grandes, vale ese.
    const prodMila = (await uno<{ id: string }>(`select id from productos_venta where receta_id=$1`, [milanesa])).id
    await db.como(duena, () => db.query(`insert into precios_venta (cantina_id, producto_id, lista_id, precio_cent, vigente_desde) values ($1,$2,$3,35000,'2026-01-01')`, [cantina, prodMila, grandes]))
    expect(await importe(await consumo(grande, menu, '2026-10-07'))).toBe(35000)
    await modulos({ listas_precio: false, precio_por_plato: false })
  })
})

describe('días fijos', () => {
  let lunes: string, miercoles: string
  beforeAll(async () => {
    lunes = await nuevoAlumno('Fijo lunes')
    miercoles = await nuevoAlumno('Fijo miércoles')
    await db.como(duena, () => db.query(`insert into alumno_dias_fijos (cantina_id, alumno_id, dia_semana) values ($1,$2,1),($1,$3,3)`, [cantina, lunes, miercoles]))
  })
  const menusDe = (a: string) => num(`select count(*) from cuenta_movimientos where alumno_id=$1 and producto_id=$2 and not anulado`, [a, menu])

  it('con el módulo apagado no hace nada', async () => {
    expect(await db.como(duena, () => num(`select anotar_dias_fijos($1,'2026-10-07')`, [cantina]))).toBe(0)
  })
  it('anota el menú a los de ese día, una sola vez, con el plato del día', async () => {
    await modulos({ dias_fijos: true })
    expect(await db.como(duena, () => num(`select anotar_dias_fijos($1,'2026-10-07')`, [cantina]))).toBe(1)   // miércoles 7
    expect(await db.como(duena, () => num(`select anotar_dias_fijos($1,'2026-10-07')`, [cantina]))).toBe(0)   // repetir no duplica
    expect(await menusDe(miercoles)).toBe(1)
    expect(await menusDe(lunes)).toBe(0)
    const c = await uno<{ concepto: string }>(`select concepto from cuenta_movimientos where alumno_id=$1`, [miercoles])
    expect(c.concepto).toBe('Menú: Milanesa')
  })
  it('no anota si ese día no se cocina o si ya tenía el menú anotado a mano', async () => {
    expect(await db.como(duena, () => num(`select anotar_dias_fijos($1,'2026-10-12')`, [cantina]))).toBe(0)   // lunes feriado
    await consumo(miercoles, menu, '2026-10-14')
    await db.como(duena, () => db.query(`insert into menu_dias (cantina_id, fecha, plato_texto) values ($1,'2026-10-14','Tarta')`, [cantina]))
    expect(await db.como(duena, () => num(`select anotar_dias_fijos($1,'2026-10-14')`, [cantina]))).toBe(0)
  })
  it('el ayudante no lo puede correr; el cron (dueño de la base) sí, para todas las cantinas', async () => {
    await expect(db.como(ayudante, () => db.query(`select anotar_dias_fijos($1,'2026-10-07')`, [cantina]))).rejects.toThrow('Solo la dueña')
    await db.como(duena, () => db.query(`insert into menu_dias (cantina_id, fecha, plato_texto) values ($1,'2026-10-19','Pizza')`, [cantina]))
    expect(await num(`select anotar_dias_fijos_todas('2026-10-19')`)).toBe(1)   // lunes 19
  })
})

describe('borrado general', () => {
  it('solo el Administrador vacía o borra', async () => {
    await expect(db.como(duena, () => db.query(`select vaciar_cantina($1)`, [cantina]))).rejects.toThrow('Solo el administrador')
    await expect(db.como(duena, () => db.query(`select borrar_cantina($1)`, [cantina]))).rejects.toThrow('Solo el administrador')
  })
  it('vaciar deja la cantina, sus usuarios y listas, sin datos', async () => {
    await db.como(admin, () => db.query(`select vaciar_cantina($1)`, [cantina]))
    for (const t of ['alumnos', 'cuenta_movimientos', 'insumos', 'recetas', 'menu_dias', 'caja_movimientos'])
      expect(await num(`select count(*) from ${t} where cantina_id=$1`, [cantina]), t).toBe(0)
    expect(await num(`select count(*) from miembros where cantina_id=$1`, [cantina])).toBe(2)
    expect(await num(`select count(*) from listas_precio where cantina_id=$1`, [cantina])).toBe(2)
    expect(await num(`select count(*) from productos_venta where cantina_id=$1 and tipo='menu'`, [cantina])).toBe(1)
  })
  it('borrar elimina la cantina con todo (aunque tenga movimientos de cuenta)', async () => {
    const a = await db.como(otraDuena, async () => (await uno<{ id: string }>(`insert into alumnos (cantina_id, nombre) values ($1,'X') returning id`, [otra])).id)
    await db.como(otraDuena, () => db.query(`select registrar_pago($1,$2,1000)`, [randomUUID(), a]))
    await db.como(admin, () => db.query(`select borrar_cantina($1)`, [otra]))
    expect(await num(`select count(*) from cantinas where id=$1`, [otra])).toBe(0)
    expect(await num(`select count(*) from cuenta_movimientos where cantina_id=$1`, [otra])).toBe(0)
  })
})
