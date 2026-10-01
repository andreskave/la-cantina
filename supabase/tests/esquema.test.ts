import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { crearDb, type Db } from './db'

let db: Db
let admin: string, duenaA: string, ayudanteA: string, duenaB: string
let cantinaA: string, cantinaB: string
let menuA: string // producto "Menú del día" de la cantina A
let listaA: string

const uno = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]
const filas = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows

/** Promesa que tiene que fallar con un mensaje que contenga `texto`. */
async function falla(p: Promise<unknown>, texto: string | RegExp) {
  await expect(p).rejects.toThrow(texto)
}

beforeAll(async () => {
  db = await crearDb()
  admin = await db.crearUsuario('Admin', { admin: true })
  duenaA = await db.crearUsuario('DuenaA')
  ayudanteA = await db.crearUsuario('AyudanteA')
  duenaB = await db.crearUsuario('DuenaB')

  // El Administrador crea las cantinas desde su sesión.
  await db.como(admin, async () => {
    cantinaA = (await uno<{ id: string }>(`insert into cantinas (nombre) values ('La Cantina') returning id`)).id
    cantinaB = (await uno<{ id: string }>(`insert into cantinas (nombre) values ('Otra Cantina') returning id`)).id
    await db.query(`insert into miembros (cantina_id, user_id, rol) values ($1,$2,'duena'),($1,$3,'ayudante'),($4,$5,'duena')`,
      [cantinaA, duenaA, ayudanteA, cantinaB, duenaB])
  })
  menuA = (await uno<{ id: string }>(`select id from productos_venta where cantina_id=$1 and tipo='menu'`, [cantinaA])).id
  listaA = (await uno<{ id: string }>(`select id from listas_precio where cantina_id=$1 and es_default`, [cantinaA])).id
})

describe('alta de cantina', () => {
  it('crea la lista General y el producto Menú del día', async () => {
    expect(menuA).toBeTruthy()
    const l = await uno<{ nombre: string }>(`select nombre from listas_precio where id=$1`, [listaA])
    expect(l.nombre).toBe('General')
  })

  it('arranca con caja encendida y los módulos ocultos apagados', async () => {
    const c = await uno<{ modulos: Record<string, boolean> }>(`select modulos from cantinas where id=$1`, [cantinaA])
    expect(c.modulos.caja).toBe(true)
    for (const m of ['listas_precio', 'medio_pago', 'dias_fijos', 'terminos', 'precio_por_plato', 'cierre_dia'])
      expect(c.modulos[m]).toBe(false)
  })

  it('crea el perfil con el nombre del usuario', async () => {
    const p = await uno<{ nombre: string; es_admin_global: boolean }>(`select nombre, es_admin_global from perfiles where user_id=$1`, [duenaA])
    expect(p).toEqual({ nombre: 'DuenaA', es_admin_global: false })
  })
})

describe('permisos de usuarios y cantinas', () => {
  it('solo el Administrador crea cantinas', async () => {
    await db.como(duenaA, () => falla(db.query(`insert into cantinas (nombre) values ('Pirata')`), /row-level security/))
  })

  it('la Dueña edita su cantina pero no los módulos ni los términos', async () => {
    await db.como(duenaA, async () => {
      await db.query(`update cantinas set pedidos_por_defecto = 60 where id=$1`, [cantinaA])
      await falla(db.query(`update cantinas set modulos = modulos || '{"cierre_dia": true}' where id=$1`, [cantinaA]),
        'Solo el administrador')
      await falla(db.query(`update cantinas set terminos = '{"alumno":"Cliente"}' where id=$1`, [cantinaA]),
        'Solo el administrador')
    })
    expect((await uno<{ p: number }>(`select pedidos_por_defecto p from cantinas where id=$1`, [cantinaA])).p).toBe(60)
  })

  it('el Administrador cambia módulos', async () => {
    await db.como(admin, () => db.query(`update cantinas set modulos = modulos || '{"dias_fijos": true}' where id=$1`, [cantinaB]))
    const c = await uno<{ v: boolean }>(`select (modulos->>'dias_fijos')::boolean v from cantinas where id=$1`, [cantinaB])
    expect(c.v).toBe(true)
  })

  it('nadie se hace administrador a sí mismo', async () => {
    await db.como(duenaA, () =>
      falla(db.query(`update perfiles set es_admin_global = true where user_id=$1`, [duenaA]), /permission denied/))
  })

  it('cada uno cambia solo su propio nombre', async () => {
    await db.como(duenaA, async () => {
      await db.query(`update perfiles set nombre = 'Marta' where user_id=$1`, [duenaA])
      const r = await db.query(`update perfiles set nombre = 'X' where user_id=$1`, [ayudanteA])
      expect(r.affectedRows).toBe(0)
    })
  })

  it('el ayudante no ve las membresías de los demás; la Dueña sí', async () => {
    const delAyudante = await db.como(ayudanteA, () => filas(`select user_id from miembros`))
    expect(delAyudante).toHaveLength(1)
    const deLaDuena = await db.como(duenaA, () => filas(`select user_id from miembros`))
    expect(deLaDuena).toHaveLength(2)
  })

  it('el Administrador ve todas las cantinas', async () => {
    expect(await db.como(admin, () => filas(`select id from cantinas`))).toHaveLength(2)
    expect(await db.como(duenaA, () => filas(`select id from cantinas`))).toHaveLength(1)
  })

  it('sin sesión (anon) no se lee nada', async () => {
    await db.exec('set role anon')
    try {
      await falla(db.query(`select * from cantinas`), /permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })
})

describe('catálogo y datos sensibles', () => {
  let tallarines: string
  beforeAll(async () => {
    await db.como(duenaA, async () => {
      tallarines = (await uno<{ id: string }>(
        `insert into insumos (cantina_id, nombre, categoria, cantidad_compra, unidad_compra) values ($1,'Tallarines','Almacén',1,'kg') returning id`,
        [cantinaA])).id
      await db.query(`insert into insumo_precios (cantina_id, insumo_id, cantidad, unidad, precio_cent) values ($1,$2,1,'kg',30000)`, [cantinaA, tallarines])
    })
  })

  it('el ayudante lee insumos pero 0 filas de insumo_precios', async () => {
    await db.como(ayudanteA, async () => {
      expect(await filas(`select * from insumos`)).toHaveLength(1)
      expect(await filas(`select * from insumo_precios`)).toHaveLength(0)
      expect(await filas(`select * from insumo_precio_vigente`)).toHaveLength(0)
    })
  })

  it('el ayudante no puede cargar insumos ni precios', async () => {
    await db.como(ayudanteA, async () => {
      await falla(db.query(`insert into insumos (cantina_id, nombre, cantidad_compra, unidad_compra) values ($1,'Arroz',1,'kg')`, [cantinaA]),
        /row-level security/)
      await falla(db.query(`insert into insumo_precios (cantina_id, insumo_id, cantidad, unidad, precio_cent) values ($1,$2,1,'kg',1)`, [cantinaA, tallarines]),
        /row-level security/)
    })
  })

  it('un usuario de la cantina B no ve nada de la cantina A', async () => {
    await db.como(duenaB, async () => {
      for (const t of ['insumos', 'insumo_precios', 'listas_precio', 'productos_venta', 'precios_venta', 'recetas', 'alumnos', 'cuenta_movimientos', 'caja_movimientos']) {
        const r = await filas(`select 1 from ${t} where cantina_id = $1`, [cantinaA])
        expect(r, t).toHaveLength(0)
      }
    })
  })

  it('no se pueden mezclar filas de cantinas distintas (FK compuesta)', async () => {
    // Aun siendo superusuario: un precio de la cantina B que apunta a un insumo de la A.
    await falla(db.query(`insert into insumo_precios (cantina_id, insumo_id, fecha, cantidad, unidad, precio_cent) values ($1,$2,'2026-01-01',1,'kg',1)`, [cantinaB, tallarines]),
      /foreign key/)
  })

  it('detecta ciclos entre preparaciones y no los guarda', async () => {
    await db.como(duenaA, async () => {
      const a = (await uno<{ id: string }>(`insert into recetas (cantina_id, nombre, tipo) values ($1,'Prep A','preparacion') returning id`, [cantinaA])).id
      const b = (await uno<{ id: string }>(`insert into recetas (cantina_id, nombre, tipo) values ($1,'Prep B','preparacion') returning id`, [cantinaA])).id
      const c = (await uno<{ id: string }>(`insert into recetas (cantina_id, nombre, tipo) values ($1,'Prep C','preparacion') returning id`, [cantinaA])).id
      await db.query(`insert into receta_ingredientes (cantina_id, receta_id, preparacion_id, cantidad, unidad) values ($1,$2,$3,1,'ml')`, [cantinaA, a, b])
      await db.query(`insert into receta_ingredientes (cantina_id, receta_id, preparacion_id, cantidad, unidad) values ($1,$2,$3,1,'ml')`, [cantinaA, b, c])
      await falla(db.query(`insert into receta_ingredientes (cantina_id, receta_id, preparacion_id, cantidad, unidad) values ($1,$2,$3,1,'ml')`, [cantinaA, c, a]),
        'círculo')
      await falla(db.query(`insert into receta_ingredientes (cantina_id, receta_id, preparacion_id, cantidad, unidad) values ($1,$2,$2,1,'ml')`, [cantinaA, a]),
        'círculo')
    })
  })

  it('solo preparaciones como sub-receta', async () => {
    await db.como(duenaA, async () => {
      const plato = (await uno<{ id: string }>(`insert into recetas (cantina_id, nombre, tipo, modo) values ($1,'Tallarines con tuco','plato','porcion') returning id`, [cantinaA])).id
      const postre = (await uno<{ id: string }>(`insert into recetas (cantina_id, nombre, tipo, modo) values ($1,'Flan','postre','porcion') returning id`, [cantinaA])).id
      await falla(db.query(`insert into receta_ingredientes (cantina_id, receta_id, preparacion_id, cantidad, unidad) values ($1,$2,$3,1,'u')`, [cantinaA, plato, postre]),
        'Solo se pueden usar preparaciones')
    })
  })
})

describe('cuentas corrientes', () => {
  let juan: string, carlos: string, alfajor: string

  const consumo = (user: string, args: { alumno: string; producto?: string | null; fecha?: string; concepto?: string; importe?: number; uuid?: string }) =>
    db.como(user, async () => (await uno<{ id: string }>(
      `select anotar_consumo($1, $2, $3, 1, $4::date, $5, $6) as id`,
      [args.uuid ?? randomUUID(), args.alumno, args.producto ?? null, args.fecha ?? null, args.concepto ?? null, args.importe ?? null])).id)

  const pago = (user: string, alumno: string, importe: number, fecha?: string, uuid = randomUUID()) =>
    db.como(user, async () => (await uno<{ id: string }>(
      `select registrar_pago($1, $2, $3, $4::date) as id`, [uuid, alumno, importe, fecha ?? null])).id)

  const pendientes = async (alumno: string) =>
    (await filas(`select fecha::text, pendiente_cent::int from partidas_abiertas where alumno_id=$1 order by fecha`, [alumno])) as { fecha: string; pendiente_cent: number }[]

  const saldo = async (alumno: string) =>
    Number((await uno<{ s: string }>(`select saldo_cent s from cuenta_saldos where alumno_id=$1`, [alumno])).s)

  beforeAll(async () => {
    await db.como(duenaA, async () => {
      juan = (await uno<{ id: string }>(`insert into alumnos (cantina_id, nombre) values ($1,'Juan Pérez') returning id`, [cantinaA])).id
      carlos = (await uno<{ id: string }>(`insert into alumnos (cantina_id, nombre) values ($1,'Carlos') returning id`, [cantinaA])).id
      const ins = (await uno<{ id: string }>(`insert into insumos (cantina_id, nombre, cantidad_compra, unidad_compra, es_reventa) values ($1,'Alfajor',1,'u',true) returning id`, [cantinaA])).id
      alfajor = (await uno<{ id: string }>(`insert into productos_venta (cantina_id, tipo, insumo_id, nombre) values ($1,'insumo_reventa',$2,'Alfajor') returning id`, [cantinaA, ins])).id
      await db.query(`insert into precios_venta (cantina_id, producto_id, lista_id, precio_cent, vigente_desde) values ($1,$2,$3,25000,'2026-01-01'),($1,$4,$3,9000,'2026-01-01')`,
        [cantinaA, menuA, listaA, alfajor])
    })
  })

  it('pago de $400 sobre $250 + $250 + $90: día 1 pagado, día 2 con $100, día 3 completo', async () => {
    await consumo(duenaA, { alumno: juan, producto: menuA, fecha: '2026-10-01' })
    await consumo(duenaA, { alumno: juan, producto: menuA, fecha: '2026-10-02' })
    await consumo(duenaA, { alumno: juan, producto: alfajor, fecha: '2026-10-03' })
    await pago(duenaA, juan, 40000, '2026-10-03')
    expect(await pendientes(juan)).toEqual([
      { fecha: '2026-10-02', pendiente_cent: 10000 },
      { fecha: '2026-10-03', pendiente_cent: 9000 },
    ])
    expect(await saldo(juan)).toBe(19000)
  })

  it('anular el cargo del día 1 reimputa el pago a los días 2 y 3', async () => {
    const dia1 = (await uno<{ id: string }>(`select id from cuenta_movimientos where alumno_id=$1 and fecha='2026-10-01'`, [juan])).id
    await db.como(duenaA, () => db.query(`select anular_movimiento($1, 'Faltó ese día')`, [dia1]))
    // $400 cubren día 2 ($250) y día 3 ($90): sobran $60 a favor.
    expect(await pendientes(juan)).toEqual([])
    expect(await saldo(juan)).toBe(-6000)
  })

  it('pago de $1.000 con deuda de $590 deja $410 a favor; un cargo nuevo de $250 queda pagado solo', async () => {
    await consumo(duenaA, { alumno: carlos, producto: menuA, fecha: '2026-10-01' })
    await consumo(duenaA, { alumno: carlos, producto: menuA, fecha: '2026-10-02' })
    await consumo(duenaA, { alumno: carlos, producto: alfajor, fecha: '2026-10-03' })
    await pago(duenaA, carlos, 100000, '2026-10-03')
    expect(await saldo(carlos)).toBe(-41000)
    await consumo(duenaA, { alumno: carlos, producto: menuA, fecha: '2026-10-05' })
    expect(await pendientes(carlos)).toEqual([])
    expect(await saldo(carlos)).toBe(-16000)
  })

  it('mismo client_uuid enviado dos veces → un solo movimiento', async () => {
    const u = randomUUID()
    const a = await consumo(ayudanteA, { alumno: juan, producto: alfajor, uuid: u })
    const b = await consumo(ayudanteA, { alumno: juan, producto: alfajor, uuid: u })
    expect(a).toBe(b)
    expect(await filas(`select 1 from cuenta_movimientos where client_uuid=$1`, [u])).toHaveLength(1)
    const pu = randomUUID()
    await pago(duenaA, juan, 100, undefined, pu)
    await pago(duenaA, juan, 100, undefined, pu)
    expect(await filas(`select 1 from cuenta_movimientos where client_uuid=$1`, [pu])).toHaveLength(1)
  })

  it('el ayudante anota productos con el precio que pone el servidor', async () => {
    const id = await consumo(ayudanteA, { alumno: juan, producto: menuA, concepto: 'Gratis', importe: 1 })
    const m = await uno<{ importe_cent: string; concepto: string }>(`select importe_cent, concepto from cuenta_movimientos where id=$1`, [id])
    expect(Number(m.importe_cent)).toBe(25000)
    expect(m.concepto).toBe('Menú del día')
  })

  it('el consumo de menú queda con el plato de ese día', async () => {
    await db.como(duenaA, async () => {
      const r = (await uno<{ id: string }>(`insert into recetas (cantina_id, nombre, tipo, modo) values ($1,'Milanesa con puré','plato','porcion') returning id`, [cantinaA])).id
      await db.query(`insert into menu_dias (cantina_id, fecha, plato_receta_id) values ($1,'2026-10-20',$2)`, [cantinaA, r])
      await db.query(`insert into menu_dias (cantina_id, fecha, plato_texto) values ($1,'2026-10-21','Guiso de lentejas')`, [cantinaA])
    })
    const conceptoDe = async (id: string) => (await uno<{ c: string }>(`select concepto c from cuenta_movimientos where id=$1`, [id])).c
    expect(await conceptoDe(await consumo(ayudanteA, { alumno: carlos, producto: menuA, fecha: '2026-10-20' }))).toBe('Menú: Milanesa con puré')
    expect(await conceptoDe(await consumo(ayudanteA, { alumno: carlos, producto: menuA, fecha: '2026-10-21' }))).toBe('Menú: Guiso de lentejas')
    // La Dueña puede poner su propio concepto y se respeta.
    expect(await conceptoDe(await consumo(duenaA, { alumno: carlos, producto: menuA, fecha: '2026-10-20', concepto: 'Menú (doble porción)' })))
      .toBe('Menú (doble porción)')
  })

  it('el ayudante no registra pagos, ni consumos "Otro", ni anula', async () => {
    await falla(pago(ayudanteA, juan, 1000), 'Solo la dueña puede registrar pagos')
    await falla(consumo(ayudanteA, { alumno: juan, concepto: 'Torta', importe: 5000 }), 'Solo la dueña')
    const id = (await uno<{ id: string }>(`select id from cuenta_movimientos where alumno_id=$1 limit 1`, [juan])).id
    await db.como(ayudanteA, () => falla(db.query(`select anular_movimiento($1,'x')`, [id]), 'Solo la dueña'))
  })

  it('nadie inserta, modifica ni borra movimientos directo', async () => {
    await db.como(duenaA, async () => {
      await falla(db.query(`insert into cuenta_movimientos (cantina_id, alumno_id, tipo, concepto, importe_cent, client_uuid) values ($1,$2,'pago','x',1,gen_random_uuid())`, [cantinaA, juan]),
        /permission denied/)
      await falla(db.query(`update cuenta_movimientos set importe_cent = 1`), /permission denied/)
      await falla(db.query(`delete from cuenta_movimientos`), /permission denied/)
    })
  })

  it('el ayudante ve los saldos', async () => {
    const r = await db.como(ayudanteA, () => filas(`select * from cuenta_saldos`))
    expect(r.length).toBe(2)
  })

  it('la Dueña de otra cantina no puede anotar en esta cuenta', async () => {
    await falla(consumo(duenaB, { alumno: juan, producto: menuA }), 'No encontramos esa cuenta')
  })
})

describe('caja', () => {
  let ana: string
  beforeAll(async () => {
    ana = await db.como(duenaA, async () =>
      (await uno<{ id: string }>(`insert into alumnos (cantina_id, nombre) values ($1,'Ana') returning id`, [cantinaA])).id)
  })

  it('con caja apagada, un pago en cuenta igual genera su cobro_cuenta; al anularlo se anula', async () => {
    await db.como(admin, () => db.query(`update cantinas set modulos = modulos || '{"caja": false}' where id=$1`, [cantinaA]))
    const id = await db.como(duenaA, async () =>
      (await uno<{ id: string }>(`select registrar_pago(gen_random_uuid(), $1, 50000) id`, [ana])).id)
    const cobro = await uno<{ tipo: string; importe_cent: string; concepto: string; anulado: boolean }>(
      `select tipo, importe_cent, concepto, anulado from caja_movimientos where ref_id=$1`, [id])
    expect(cobro).toMatchObject({ tipo: 'cobro_cuenta', concepto: 'Cobro: Ana', anulado: false })
    expect(Number(cobro.importe_cent)).toBe(50000)
    await db.como(duenaA, () => db.query(`select anular_movimiento($1,'Error de carga')`, [id]))
    expect((await uno<{ anulado: boolean }>(`select anulado from caja_movimientos where ref_id=$1`, [id])).anulado).toBe(true)
  })

  it('el ayudante no ve caja_movimientos ni menu_dia_costos', async () => {
    await db.como(duenaA, async () => {
      await db.query(`insert into caja_movimientos (cantina_id, tipo, subcategoria, concepto, importe_cent) values ($1,'gasto_fijo','Gas','Garrafa',120000)`, [cantinaA])
      await db.query(`insert into menu_dias (cantina_id, fecha, plato_texto) values ($1,'2026-09-30','Milanesa')`, [cantinaA])
      await db.query(`insert into menu_dia_costos (cantina_id, fecha, costo_total_cent) values ($1,'2026-09-30',9000)`, [cantinaA])
    })
    await db.como(ayudanteA, async () => {
      expect(await filas(`select * from caja_movimientos`)).toHaveLength(0)
      expect(await filas(`select * from menu_dia_costos`)).toHaveLength(0)
      expect(await filas(`select * from menu_dias where fecha = '2026-09-30'`)).toHaveLength(1)
    })
  })

  it('los cobros automáticos no se editan a mano', async () => {
    await db.como(duenaA, async () => {
      const r = await db.query(`update caja_movimientos set importe_cent = 1 where origen='cuenta_corriente'`)
      expect(r.affectedRows).toBe(0)
      await falla(db.query(`insert into caja_movimientos (cantina_id, tipo, origen, importe_cent) values ($1,'cobro_cuenta','cuenta_corriente',1)`, [cantinaA]),
        /row-level security/)
    })
  })

  it('movimiento manual con el mismo client_uuid no se duplica', async () => {
    const u = randomUUID()
    await db.como(duenaA, async () => {
      for (let i = 0; i < 2; i++)
        await db.query(`insert into caja_movimientos (cantina_id, tipo, concepto, importe_cent, client_uuid) values ($1,'otro_ingreso','Rifa',1000,$2) on conflict (client_uuid) do nothing`, [cantinaA, u])
    })
    expect(await filas(`select 1 from caja_movimientos where client_uuid=$1`, [u])).toHaveLength(1)
  })
})
