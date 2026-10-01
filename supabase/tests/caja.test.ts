import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { crearDb, type Db } from './db'

let db: Db
let admin: string, duena: string, ayudante: string, cantina: string, menu: string
const alumnos: string[] = []

const uno = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]
const filas = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows

beforeAll(async () => {
  db = await crearDb()
  admin = await db.crearUsuario('Admin', { admin: true })
  duena = await db.crearUsuario('Duena')
  ayudante = await db.crearUsuario('Ayudante')
  await db.como(admin, async () => {
    cantina = (await uno<{ id: string }>(`insert into cantinas (nombre) values ('La Cantina') returning id`)).id
    await db.query(`insert into miembros (cantina_id, user_id, rol) values ($1,$2,'duena'),($1,$3,'ayudante')`, [cantina, duena, ayudante])
  })
  menu = (await uno<{ id: string }>(`select id from productos_venta where cantina_id=$1 and tipo='menu'`, [cantina])).id
  await db.como(duena, async () => {
    await db.query(`select fijar_precio_menu($1, 26000)`, [cantina])
    await db.query(`update precios_venta set vigente_desde = '2026-01-01' where producto_id = $1`, [menu])
    await db.query(`insert into menu_dias (cantina_id, fecha, plato_texto, pedidos) values ($1,'2026-10-07','Guiso',60)`, [cantina])
    for (let i = 0; i < 10; i++) {
      const a = (await uno<{ id: string }>(`insert into alumnos (cantina_id, nombre) values ($1,$2) returning id`, [cantina, `Alumno ${i}`])).id
      alumnos.push(a)
      await db.query(`select anotar_consumo($1,$2,$3,1,'2026-10-07')`, [randomUUID(), a, menu])
    }
  })
})

describe('cierre del día', () => {
  it('cuenta los menús anotados en cuentas ese día (sin anulados)', async () => {
    const n = await db.como(duena, () => uno<{ n: string }>(`select menus_en_cuentas($1,'2026-10-07') n`, [cantina]))
    expect(Number(n.n)).toBe(10)
  })

  it('sin el módulo cierre_dia no se puede cerrar', async () => {
    await expect(db.como(duena, () => db.query(`select guardar_cierre_dia($1,'2026-10-07',1300000,50)`, [cantina])))
      .rejects.toThrow('no está activado')
  })

  it('60 pedidos, 10 en cuentas, $ 260 → $ 13.000 de menús al contado; repetirlo reemplaza el cierre', async () => {
    await db.como(admin, () => db.query(`update cantinas set modulos = modulos || '{"cierre_dia": true}' where id=$1`, [cantina]))
    // La propuesta la calcula la app: (60 − 10) × 260 = 13.000; acá se guarda lo que confirma la Dueña.
    await db.como(duena, () => db.query(`select guardar_cierre_dia($1,'2026-10-07',1300000,50,250000)`, [cantina]))
    let c = await filas<{ concepto: string; importe_cent: string }>(`select concepto, importe_cent from caja_movimientos where origen='cierre_dia' order by concepto`)
    expect(c.map((x) => [x.concepto, Number(x.importe_cent)])).toEqual([['Kiosco al contado', 250000], ['Menús al contado (50)', 1300000]])
    await db.como(duena, () => db.query(`select guardar_cierre_dia($1,'2026-10-07',1250000,48,0)`, [cantina]))
    c = await filas(`select concepto, importe_cent from caja_movimientos where origen='cierre_dia'`)
    expect(c.map((x) => [x.concepto, Number(x.importe_cent)])).toEqual([['Menús al contado (48)', 1250000]])
  })

  it('el ayudante no puede cerrar el día', async () => {
    await expect(db.como(ayudante, () => db.query(`select guardar_cierre_dia($1,'2026-10-07',1,1)`, [cantina]))).rejects.toThrow('Solo la dueña')
  })
})

describe('deuda de cuentas a una fecha', () => {
  it('suma lo que debe cada alumno hasta ese día; los saldos a favor no restan', async () => {
    await db.como(duena, async () => {
      await db.query(`select registrar_pago($1,$2,26000,'2026-10-08')`, [randomUUID(), alumnos[0]])   // queda al día
      await db.query(`select registrar_pago($1,$2,50000,'2026-10-08')`, [randomUUID(), alumnos[1]])   // queda $240 a favor
    })
    const al = (f: string) => db.como(duena, async () => Number((await uno<{ d: string }>(`select deuda_cuentas_al($1,$2) d`, [cantina, f])).d))
    expect(await al('2026-10-07')).toBe(10 * 26000)
    expect(await al('2026-10-08')).toBe(8 * 26000)
    expect(await al('2026-10-06')).toBe(0)
  })
})
