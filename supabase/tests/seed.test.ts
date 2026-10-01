import { describe, expect, it } from 'vitest'
import { crearDb } from './db'
import { datosDemo } from '../../src/demo/datosDemo'
import { sqlDemo } from '../../src/demo/sqlDemo'
import { partidasAbiertas, saldo } from '../../src/lib/cuentas'

describe('seed de demostración', () => {
  it('carga los datos de ejemplo en una cantina existente', async () => {
    const db = await crearDb()
    const admin = await db.crearUsuario('Admin', { admin: true })
    await db.como(admin, () => db.query(`insert into cantinas (nombre) values ('La Cantina')`))
    const d = datosDemo()
    await db.exec(sqlDemo(d))
    const n = async (t: string) => Number((await db.query<{ n: string }>(`select count(*) n from ${t}`)).rows[0].n)
    expect(await n('insumos')).toBe(d.insumos.length)
    expect(await n('recetas')).toBe(d.recetas.length)
    expect(await n('receta_ingredientes')).toBe(d.recetas.reduce((a, r) => a + r.ingredientes.length, 0))
    expect(await n('insumo_precios')).toBe(d.precios.length)
    expect(await n('productos_venta')).toBe(3)
    expect(await n('menu_dias')).toBe(d.menu.length)
    expect(await n('cuenta_movimientos')).toBe(d.movimientos.length)

    // La imputación de la base (reimputar_alumno) y la de TypeScript dan lo mismo.
    for (const a of d.alumnos) {
      const movs = d.movimientos.filter((m) => m.alumno_id === a.id)
      const enBase = await db.query<{ cargo_id: string; p: string }>(
        `select cargo_id, pendiente_cent p from partidas_abiertas where alumno_id=$1 order by fecha, cargado_at, cargo_id`, [a.id])
      expect(enBase.rows.map((r) => [r.cargo_id, Number(r.p)]), a.nombre)
        .toEqual(partidasAbiertas(movs).map((p) => [p.cargo.id, p.pendiente_cent]))
      const s = await db.query<{ s: string }>(`select saldo_cent s from cuenta_saldos where alumno_id=$1`, [a.id])
      expect(Number(s.rows[0].s), a.nombre).toBe(saldo(movs))
    }
    // Cada pago generó su cobro en caja.
    expect(await n(`caja_movimientos where tipo='cobro_cuenta'`)).toBe(d.movimientos.filter((m) => m.tipo === 'pago').length)
    expect(await n('caja_movimientos')).toBe(d.caja.length)
    const precioMenu = await db.query<{ p: string }>(
      `select precio_vigente(id, lista_default(cantina_id)) p from productos_venta where tipo='menu'`)
    expect(Number(precioMenu.rows[0].p)).toBe(26000)
  })
})
